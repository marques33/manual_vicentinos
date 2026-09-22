#!/usr/bin/env node
// ============================================================================
// Prova, contra o banco de verdade, as travas do autosserviço de cadastro
// (migração 027 + Edge Function gerenciar-usuarios):
//
//   1. o confrade corrige o PRÓPRIO nome — e SÓ o nome. Escrever `papel` na
//      própria linha tem que ser recusado pelo PRIVILÉGIO DE COLUNA, e não pela
//      boa vontade da tela. Sem essa trava, qualquer confrade se elege
//      administrador com uma linha de JavaScript no console do navegador.
//
//   2. `atualizar_meu_email` age sobre o dono do JWT, NUNCA sobre um `user_id`
//      vindo do corpo. O teste manda o corpo envenenado de propósito, apontando
//      para outro confrade, e exige que o e-mail do outro fique intacto. É a
//      diferença entre autosserviço e sequestro de conta.
//
// Cria as contas descartáveis de que precisa e as APAGA no fim — não depende de
// conta de teste versionada, ao contrário de verificar-rls-atas.mjs.
//
// `fetch` cru contra REST/auth/functions, sem SDK: é o padrão dos outros
// verificadores deste diretório e não traz dependência para rodar.
//
// Uso:
//   SUPABASE_SERVICE_ROLE_KEY=... node supabase/verificar-cadastro-confrades.mjs
//
// A service_role NUNCA é gravada em arquivo. Para obtê-la só na memória deste
// processo:  npx supabase projects api-keys --project-ref <ref>
// ============================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const aqui = dirname(fileURLToPath(import.meta.url));

function daConfiguracao(nome) {
  try {
    const fonte = readFileSync(join(aqui, "..", "app", "assets", "supabase-client.js"), "utf8");
    return fonte.match(new RegExp(`${nome}\\s*=\\s*"([^"]+)"`))?.[1] ?? null;
  } catch {
    return null;
  }
}

const URL_BASE = process.env.SUPABASE_URL || daConfiguracao("SUPABASE_URL");
const ANON = process.env.SUPABASE_ANON_KEY || daConfiguracao("SUPABASE_ANON_KEY");
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!URL_BASE || !ANON) {
  console.error("Faltam SUPABASE_URL / SUPABASE_ANON_KEY.");
  process.exit(2);
}
if (!SERVICE) {
  console.error("Falta SUPABASE_SERVICE_ROLE_KEY — este script cria e apaga contas de teste.");
  process.exit(2);
}

let falhas = 0;
const ok = (m) => console.log("  OK     " + m);
const erro = (m) => { falhas++; console.log("  FALHA  " + m); };
const secao = (t) => console.log("\n" + t);

// ---------------------------------------------------------------------------
// Transporte
// ---------------------------------------------------------------------------
async function chamar(caminho, { token = SERVICE, metodo = "GET", corpo, prefer } = {}) {
  const r = await fetch(`${URL_BASE}${caminho}`, {
    method: metodo,
    headers: {
      apikey: token === SERVICE ? SERVICE : ANON,
      Authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(prefer ? { Prefer: prefer } : {}),
    },
    ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
  });
  const texto = await r.text();
  let json = null;
  try { json = texto ? JSON.parse(texto) : null; } catch { /* corpo vazio ou não-JSON */ }
  return { status: r.status, json, texto };
}

const marca = Date.now();
const SENHA = `teste-${marca}-Aa1`;
const contas = [];

async function criarConfrade(apelido, papel = "vicentino") {
  const email = `teste-${apelido}-${marca}@exemplo-descartavel.test`;
  const criado = await chamar("/auth/v1/admin/users", {
    metodo: "POST",
    corpo: { email, password: SENHA, email_confirm: true },
  });
  if (!criado.json?.id) throw new Error(`não criou ${apelido}: ${criado.texto.slice(0, 200)}`);
  const user_id = criado.json.id;
  contas.push(user_id);

  const cadastrado = await chamar("/rest/v1/confrades", {
    metodo: "POST",
    corpo: {
      user_id, nome_completo: `Teste ${apelido} ${marca}`,
      papel, categoria: "confrade", ativo: true,
    },
  });
  if (cadastrado.status >= 300) {
    throw new Error(`não cadastrou ${apelido}: ${cadastrado.texto.slice(0, 200)}`);
  }
  return { user_id, email };
}

async function entrar(email) {
  const r = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "content-type": "application/json" },
    body: JSON.stringify({ email, password: SENHA }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error(`não entrou como ${email}: ${JSON.stringify(j).slice(0, 200)}`);
  return j.access_token;
}

/** PATCH em confrades com o token de um usuário comum (passa por RLS e grants). */
const patchConfrade = (token, userId, patch) =>
  chamar(`/rest/v1/confrades?user_id=eq.${userId}`, {
    token, metodo: "PATCH", corpo: patch, prefer: "return=representation",
  });

const lerConfrade = (userId, colunas) =>
  chamar(`/rest/v1/confrades?user_id=eq.${userId}&select=${colunas}`)
    .then((r) => r.json?.[0] ?? null);

const lerUsuario = (userId) =>
  chamar(`/auth/v1/admin/users/${userId}`).then((r) => r.json);

const invocar = (token, corpo) =>
  chamar("/functions/v1/gerenciar-usuarios", { token, metodo: "POST", corpo });

async function limpar() {
  for (const id of contas) {
    await chamar(`/rest/v1/confrades?user_id=eq.${id}`, { metodo: "DELETE" });
    await chamar(`/auth/v1/admin/users/${id}`, { metodo: "DELETE" });
  }
}

// ---------------------------------------------------------------------------
try {
  console.log(`Projeto: ${URL_BASE}`);
  const alice = await criarConfrade("alice");
  const bob = await criarConfrade("bob");
  const tokenAlice = await entrar(alice.email);
  console.log(`Contas descartáveis: alice=${alice.user_id.slice(0, 8)}… bob=${bob.user_id.slice(0, 8)}…`);

  // -------------------------------------------------------------------------
  secao("1 · O confrade corrige o próprio nome");

  const nomeNovo = `Alice Corrigida ${marca}`;
  const r1 = await patchConfrade(tokenAlice, alice.user_id, { nome_completo: nomeNovo });

  if (r1.status >= 300) {
    erro(`update do próprio nome recusado (${r1.status}): ${r1.texto.slice(0, 140)}`);
  } else {
    const linha = await lerConfrade(alice.user_id, "nome_completo,criado_em,atualizado_em");
    if (linha?.nome_completo === nomeNovo) ok("nome do próprio cadastro gravado");
    else erro(`nome não gravou: ficou "${linha?.nome_completo}"`);

    // O trigger da 027: atualizado_em tem que ter deslocado de criado_em.
    if (linha && new Date(linha.atualizado_em) > new Date(linha.criado_em)) {
      ok("atualizado_em carimbado pelo trigger da migração 027");
    } else {
      erro("atualizado_em não mudou — o trigger da migração 027 não disparou");
    }
  }

  // -------------------------------------------------------------------------
  secao("2 · A TRAVA: o confrade NÃO escala o próprio papel");

  const r2 = await patchConfrade(tokenAlice, alice.user_id, { papel: "administrador" });
  if (r2.status < 300) {
    erro("ESCALAÇÃO DE PRIVILÉGIO: gravou papel = administrador na própria linha");
  } else {
    ok(`update de papel recusado (${r2.status} · ${String(r2.json?.message ?? "").slice(0, 60)})`);
  }

  const aliceApos = await lerConfrade(alice.user_id, "papel,categoria,ativo");
  if (aliceApos?.papel === "vicentino") ok("papel intacto no banco: vicentino");
  else erro(`papel virou "${aliceApos?.papel}"`);

  for (const [coluna, valor] of [["categoria", "aspirante"], ["ativo", false]]) {
    const r = await patchConfrade(tokenAlice, alice.user_id, { [coluna]: valor });
    if (r.status < 300) erro(`o confrade escreveu "${coluna}" na própria linha`);
    else ok(`update de ${coluna} recusado (${r.status})`);
  }

  // A prova mais fina: o papel junto do nome, no MESMO comando. Se o Postgres
  // conferisse privilégio por linha e não por coluna, esta passaria — e seria a
  // porta dos fundos da trava acima.
  const r2b = await patchConfrade(tokenAlice, alice.user_id, {
    nome_completo: "Alice Esperta", papel: "administrador",
  });
  if (r2b.status < 300) erro("papel passou de carona junto com o nome, no mesmo UPDATE");
  else ok(`nome + papel no mesmo comando também recusado (${r2b.status})`);

  // -------------------------------------------------------------------------
  secao("3 · A TRAVA: o confrade não edita a linha de OUTRO");

  const r3 = await patchConfrade(tokenAlice, bob.user_id, { nome_completo: "Invadido" });
  if (r3.status >= 300) ok(`update da linha do outro recusado (${r3.status})`);
  else if (Array.isArray(r3.json) && r3.json.length === 0) {
    ok("update da linha do outro não alcançou nenhuma linha (policy)");
  } else erro("o confrade reescreveu o nome de OUTRO confrade");

  const bobAgora = await lerConfrade(bob.user_id, "nome_completo");
  if (String(bobAgora?.nome_completo).includes("bob")) ok("nome do outro intacto");
  else erro(`nome do outro virou "${bobAgora?.nome_completo}"`);

  // -------------------------------------------------------------------------
  secao("4 · atualizar_meu_email troca o e-mail do DONO do JWT");

  const emailNovo = `alice-novo-${marca}@exemplo-descartavel.test`;
  const r4 = await invocar(tokenAlice, { acao: "atualizar_meu_email", email: emailNovo });

  if (!r4.json?.ok) {
    erro(`a troca do próprio e-mail falhou (${r4.status}): ${r4.texto.slice(0, 160)}`);
  } else {
    const u = await lerUsuario(alice.user_id);
    if (u?.email === emailNovo) ok("e-mail do próprio usuário trocado");
    else erro(`e-mail não trocou: ficou ${u?.email}`);
    // Sem SMTP, o que importa é o endereço já NASCER confirmado — senão a conta
    // fica pendurada esperando uma mensagem que não chega.
    if (u?.email_confirmed_at) ok("novo e-mail já nasce confirmado (email_confirm: true)");
    else erro("novo e-mail ficou pendente de confirmação — sem SMTP, isso tranca a conta");
  }

  // Entrar com o e-mail novo é a prova de que o LOGIN acompanhou a troca.
  try {
    await entrar(emailNovo);
    ok("login pelo e-mail novo funciona");
  } catch (e) {
    erro("login pelo e-mail novo: " + e.message);
  }

  // -------------------------------------------------------------------------
  secao("5 · A TRAVA: user_id no corpo NÃO desvia o alvo");

  const emailEnvenenado = `sequestro-${marca}@exemplo-descartavel.test`;
  const bobAntes = await lerUsuario(bob.user_id);

  // O corpo aponta para o BOB de propósito. A function tem que ignorá-lo e agir
  // sobre o dono do JWT (a Alice).
  const r5 = await invocar(tokenAlice, {
    acao: "atualizar_meu_email", email: emailEnvenenado, user_id: bob.user_id,
  });

  const bobDepois = await lerUsuario(bob.user_id);
  if (bobDepois?.email !== bobAntes?.email) {
    erro("SEQUESTRO DE CONTA: o user_id do corpo desviou a troca para outro confrade");
  } else {
    ok("e-mail do outro confrade intacto — o corpo foi ignorado");
  }

  const aliceDepois = await lerUsuario(alice.user_id);
  if (r5.json?.ok && aliceDepois?.email === emailEnvenenado) {
    ok("a troca caiu sobre o dono do JWT, como manda a regra");
  } else if (!r5.json?.ok) {
    erro(`a chamada falhou (${r5.status}): ${r5.texto.slice(0, 160)}`);
  }

  // -------------------------------------------------------------------------
  secao("6 · A TRAVA: confrade comum não alcança as ações de administrador");

  for (const corpo of [
    { acao: "atualizar_confrade", user_id: bob.user_id, papel: "administrador" },
    { acao: "listar" },
    { acao: "criar_usuario", nome: "Intruso", email: `x${marca}@exemplo-descartavel.test`, senha: "12345678" },
    { acao: "redefinir_senha", user_id: bob.user_id, senha: "outrasenha123" },
    { acao: "acao_que_nao_existe" },
  ]) {
    const r = await invocar(tokenAlice, corpo);
    if (r.json?.ok) erro(`confrade comum executou "${corpo.acao}"`);
    else if (r.json?.erro === "acesso_negado") ok(`"${corpo.acao}" recusado: acesso_negado`);
    else erro(`"${corpo.acao}" respondeu inesperado (${r.status}): ${r.texto.slice(0, 120)}`);
  }

  const bobPapel = await lerConfrade(bob.user_id, "papel");
  if (bobPapel?.papel === "vicentino") ok("papel do outro intacto depois das tentativas");
  else erro(`papel do outro virou "${bobPapel?.papel}"`);

  // -------------------------------------------------------------------------
  secao("7 · O administrador edita o cadastro de terceiro");

  const chefe = await criarConfrade("chefe", "administrador");
  // `pode_...` do financeiro/atas olha confrades.papel, mas o portão da Edge
  // Function é is_admin(), que olha public.admins — são cadastros diferentes
  // (é o defeito que a migração 024 consertou nas atas). Por isso a conta de
  // teste precisa das duas pontas.
  await chamar("/rest/v1/admins", {
    metodo: "POST", corpo: { user_id: chefe.user_id, nome: `Teste chefe ${marca}` },
  });
  const tokenChefe = await entrar(chefe.email);

  const emailDoBob = `bob-novo-${marca}@exemplo-descartavel.test`;
  const r7 = await invocar(tokenChefe, {
    acao: "atualizar_confrade",
    user_id: bob.user_id,
    nome: `Bob Corrigido ${marca}`,
    email: emailDoBob,
    papel: "tesoureiro",
    categoria: "consocia",
  });

  if (!r7.json?.ok) {
    erro(`o administrador não conseguiu editar (${r7.status}): ${r7.texto.slice(0, 160)}`);
  } else {
    const linha = await lerConfrade(bob.user_id, "nome_completo,papel,categoria");
    const u = await lerUsuario(bob.user_id);
    if (linha?.papel === "tesoureiro") ok("papel alterado pelo administrador");
    else erro(`papel ficou "${linha?.papel}"`);
    if (linha?.categoria === "consocia") ok("categoria alterada pelo administrador");
    else erro(`categoria ficou "${linha?.categoria}"`);
    if (String(linha?.nome_completo).includes("Corrigido")) ok("nome alterado pelo administrador");
    else erro(`nome ficou "${linha?.nome_completo}"`);
    if (u?.email === emailDoBob) ok("e-mail alterado pelo administrador");
    else erro(`e-mail ficou "${u?.email}"`);
    try {
      await entrar(emailDoBob);
      ok("o confrade entra pelo e-mail que o administrador pôs");
    } catch (e) {
      erro("login pelo e-mail novo do administrador: " + e.message);
    }
  }

  // E-mail duplicado tem que ser recusado, e não gravar pela metade.
  const r7b = await invocar(tokenChefe, {
    acao: "atualizar_confrade", user_id: bob.user_id,
    email: aliceDepois?.email, nome: `Nao Deve Gravar ${marca}`,
  });
  if (r7b.json?.erro === "email_ja_cadastrado") ok("e-mail duplicado recusado (409)");
  else erro(`e-mail duplicado respondeu: ${JSON.stringify(r7b.json)}`);

  const bobFinal = await lerConfrade(bob.user_id, "nome_completo");
  if (!String(bobFinal?.nome_completo).includes("Nao Deve Gravar")) {
    ok("nome NÃO foi gravado quando o e-mail falhou — nada de cadastro meio salvo");
  } else {
    erro("o nome gravou mesmo com o e-mail recusado: cadastro ficou meio alterado");
  }

} catch (e) {
  falhas++;
  console.log("\n  ERRO   " + e.message);
} finally {
  secao("Limpeza");
  await limpar();
  console.log(`  ${contas.length} conta(s) de teste apagada(s)`);
}

console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTudo conferido.");
process.exit(falhas ? 1 : 0);
