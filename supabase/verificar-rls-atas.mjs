#!/usr/bin/env node
// ============================================================================
// Prova que o Livro de Atas respeita as duas camadas de acesso — leitura ampla
// (todo confrade ativo lê e exporta) e escrita restrita (só secretário,
// presidente, vice ou administrador, via pode_redigir_ata()) — e, sobretudo,
// que a TRAVA DA ATA APROVADA é do banco e não da tela.
//
// A trava é a razão de ser deste script. Ata aprovada é documento lido em
// reunião e assinado pelos presentes; se ela pudesse ser reescrita depois, o
// livro não valeria nada. A tela desabilita os campos, mas tela não é
// fronteira — quem recusa tem que ser a policy.
//
// Uso:
//   node supabase/verificar-rls-atas.mjs
//
// Variáveis (ou preencha app/assets/supabase-client.js, lido por padrão):
//   SUPABASE_URL, SUPABASE_ANON_KEY       endereço e chave pública do projeto
//   SECRETARIO_EMAIL, SECRETARIO_SENHA    confrade de teste com papel
//                                         'secretario' (ou presidente/vice/
//                                         administrador) — lavra a ata
//   CONFRADE_EMAIL, CONFRADE_SENHA        confrade de teste com papel comum
//                                         (ex.: 'vicentino') — lê mas não lavra
//   NAO_CONFRADE_EMAIL, NAO_CONFRADE_SENHA
//                                         conta authenticated de teste, SEM
//                                         linha em confrades (descartável)
//   SUPABASE_SERVICE_ROLE_KEY             OPCIONAL, só para a limpeza do
//                                         final — ver "Resíduo", abaixo
//
// Resíduo: `atas` não tem grant de DELETE (livro institucional pede trilha,
// não apagamento), então as atas criadas aqui NÃO somem sozinhas. Elas usam
// numero >= 990000, faixa que nenhuma reunião real alcança. Com a
// service_role key o script limpa no fim; sem ela, imprime o SQL para colar
// no SQL Editor. Ler o aviso do final — ata de teste esquecida aparece no
// histórico da ferramenta.
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
const SECRETARIO_EMAIL = process.env.SECRETARIO_EMAIL || "";
const SECRETARIO_SENHA = process.env.SECRETARIO_SENHA || "";
const CONFRADE_EMAIL = process.env.CONFRADE_EMAIL || "";
const CONFRADE_SENHA = process.env.CONFRADE_SENHA || "";
const NAO_CONFRADE_EMAIL = process.env.NAO_CONFRADE_EMAIL || "";
const NAO_CONFRADE_SENHA = process.env.NAO_CONFRADE_SENHA || "";
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!URL_BASE || !ANON || URL_BASE.includes("SEU-PROJETO") || ANON.startsWith("COLE_AQUI")) {
  console.error("Configure SUPABASE_URL e SUPABASE_ANON_KEY (ou preencha app/assets/supabase-client.js).");
  process.exit(2);
}

const REST = `${URL_BASE}/rest/v1`;
let passou = 0, falhou = 0;

function relatar(ok, titulo, detalhe = "") {
  if (ok) { passou++; console.log(`  OK    ${titulo}`); }
  else { falhou++; console.log(`  FALHA ${titulo}${detalhe ? "\n        " + detalhe : ""}`); }
}

async function chamar(caminho, { token = ANON, metodo = "GET", corpo, extra = {}, chave = ANON } = {}) {
  const temCorpo = corpo !== undefined;
  const r = await fetch(`${REST}${caminho}`, {
    method: metodo,
    headers: {
      apikey: chave,
      Authorization: `Bearer ${token}`,
      ...(temCorpo ? { "content-type": "application/json" } : {}),
      ...extra,
    },
    body: temCorpo ? JSON.stringify(corpo) : undefined,
  });
  let dados = null;
  const texto = await r.text();
  try { dados = texto ? JSON.parse(texto) : null; } catch { dados = texto; }
  return { status: r.status, dados };
}

async function login(email, senha) {
  const r = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "content-type": "application/json" },
    body: JSON.stringify({ email, password: senha }),
  });
  return r.json();
}

const negado = (r) => r.status >= 400 && r.status < 500;

const TABELAS = ["atas", "atas_presencas"];

// Faixa reservada: nenhuma reunião real chega a 990000. O sufixo aleatório
// evita colisão se o script for rodado duas vezes sem a limpeza do fim.
const NUMERO_BASE = 990000 + Math.floor(Math.random() * 9000);

function ataDeTeste(numero) {
  return {
    numero,
    data_reuniao: "2026-01-07",
    tipo: "ordinaria",
    presidida_por: "verificar-rls-atas.mjs",
    local: "ata descartável de verificação",
  };
}

// ---------------------------------------------------------------------------
// Porta de entrada: a chave é sequer aceita?
//
// Sem isto, um projeto com chave errada devolveria 401 em tudo e o script
// anunciaria uma dúzia de "OK" que são, na verdade, "negado por chave ruim" —
// exatamente o defeito descrito no topo de app/assets/supabase-client.js.
// ---------------------------------------------------------------------------
const testeChave = await chamar("/rpc/is_confrade_ativo", { metodo: "POST", corpo: {} });
if (testeChave.status === 401 && /invalid/i.test(JSON.stringify(testeChave.dados))) {
  console.error("\nA chave anon foi RECUSADA pelo projeto — nada abaixo teria sentido.");
  console.error(`  ${JSON.stringify(testeChave.dados)}`);
  process.exit(2);
}

console.log(`\nProjeto: ${URL_BASE}`);
console.log(`Atas de teste usarão numero a partir de ${NUMERO_BASE}.`);

// ---------------------------------------------------------------------------
// 1. anon — o visitante não toca no livro
// ---------------------------------------------------------------------------
console.log("\n=== 1. anon: nenhuma leitura nem escrita no livro de atas ===");

for (const tabela of TABELAS) {
  const leitura = await chamar(`/${tabela}?select=*&limit=1`);
  const vazou = leitura.status === 200 && Array.isArray(leitura.dados) && leitura.dados.length > 0;
  relatar(!vazou && negado(leitura), `anon NÃO lê ${tabela}`,
    `status ${leitura.status}: ${JSON.stringify(leitura.dados).slice(0, 160)}`);
}

const insertAnon = await chamar("/atas", { metodo: "POST", corpo: ataDeTeste(NUMERO_BASE + 1) });
relatar(negado(insertAnon), "anon NÃO consegue INSERT em atas",
  `status ${insertAnon.status}: ${JSON.stringify(insertAnon.dados).slice(0, 160)}`);

for (const rpc of ["pode_redigir_ata", "pode_reabrir_ata", "ata_aberta_para_edicao"]) {
  const corpo = rpc === "ata_aberta_para_edicao"
    ? { p_ata_id: "00000000-0000-0000-0000-000000000000" } : {};
  const r = await chamar(`/rpc/${rpc}`, { metodo: "POST", corpo });
  relatar(negado(r), `anon NÃO executa ${rpc}()`,
    `status ${r.status}: ${JSON.stringify(r.dados).slice(0, 160)}`);
}

// ---------------------------------------------------------------------------
// 2. authenticated sem linha em confrades — logado não é o mesmo que membro
// ---------------------------------------------------------------------------
if (NAO_CONFRADE_EMAIL && NAO_CONFRADE_SENHA) {
  console.log("\n=== 2. conta authenticated SEM linha em confrades ===");
  const sessao = await login(NAO_CONFRADE_EMAIL, NAO_CONFRADE_SENHA);
  if (!sessao.access_token) {
    relatar(false, "login da conta não-confrade de teste", JSON.stringify(sessao).slice(0, 200));
  } else {
    const jwt = sessao.access_token;
    relatar(true, "conta não-confrade autenticou");

    for (const tabela of TABELAS) {
      const leitura = await chamar(`/${tabela}?select=*&limit=1`, { token: jwt });
      const vazou = leitura.status === 200 && Array.isArray(leitura.dados) && leitura.dados.length > 0;
      relatar(!vazou, `não-confrade NÃO lê ${tabela}`,
        `status ${leitura.status}: ${JSON.stringify(leitura.dados).slice(0, 160)}`);
    }

    const insert = await chamar("/atas", { token: jwt, metodo: "POST", corpo: ataDeTeste(NUMERO_BASE + 2) });
    relatar(negado(insert), "não-confrade NÃO consegue INSERT em atas",
      `status ${insert.status}: ${JSON.stringify(insert.dados).slice(0, 160)}`);
  }
} else {
  console.log("\n=== 2. (pulado) — defina NAO_CONFRADE_EMAIL/NAO_CONFRADE_SENHA ===");
}

// ---------------------------------------------------------------------------
// 3. confrade comum — lê o livro inteiro, não escreve uma linha
// ---------------------------------------------------------------------------
if (CONFRADE_EMAIL && CONFRADE_SENHA) {
  console.log("\n=== 3. confrade comum: LÊ as atas, mas não lavra ===");
  const sessao = await login(CONFRADE_EMAIL, CONFRADE_SENHA);
  if (!sessao.access_token) {
    relatar(false, "login do confrade comum de teste", JSON.stringify(sessao).slice(0, 200));
  } else {
    const jwt = sessao.access_token;
    relatar(true, "confrade comum autenticou");

    const souRedator = await chamar("/rpc/pode_redigir_ata", { token: jwt, metodo: "POST", corpo: {} });
    relatar(souRedator.status === 200 && souRedator.dados === false,
      "pode_redigir_ata() devolve falso para confrade comum",
      `status ${souRedator.status}: ${JSON.stringify(souRedator.dados)}`);

    for (const tabela of TABELAS) {
      const leitura = await chamar(`/${tabela}?select=*&limit=1`, { token: jwt });
      relatar(leitura.status === 200, `confrade comum LÊ ${tabela}`,
        `status ${leitura.status}: ${JSON.stringify(leitura.dados).slice(0, 160)}`);
    }

    const insert = await chamar("/atas", { token: jwt, metodo: "POST", corpo: ataDeTeste(NUMERO_BASE + 3) });
    relatar(negado(insert), "confrade comum NÃO consegue INSERT em atas",
      `status ${insert.status}: ${JSON.stringify(insert.dados).slice(0, 160)}`);
  }
} else {
  console.log("\n=== 3. (pulado) — defina CONFRADE_EMAIL/CONFRADE_SENHA (papel comum, ex.: 'vicentino') ===");
}

// ---------------------------------------------------------------------------
// 4. secretário — lavra, corrige, aprova… e então não mexe mais
// ---------------------------------------------------------------------------
let idParaLimpar = [];

if (SECRETARIO_EMAIL && SECRETARIO_SENHA) {
  console.log("\n=== 4. secretário: lavra e corrige o rascunho ===");
  const sessao = await login(SECRETARIO_EMAIL, SECRETARIO_SENHA);
  if (!sessao.access_token) {
    relatar(false, "login do secretário de teste", JSON.stringify(sessao).slice(0, 200));
  } else {
    const jwt = sessao.access_token;
    const meuId = sessao.user?.id;
    relatar(true, "secretário autenticou");

    const souRedator = await chamar("/rpc/pode_redigir_ata", { token: jwt, metodo: "POST", corpo: {} });
    relatar(souRedator.status === 200 && souRedator.dados === true,
      "pode_redigir_ata() devolve verdadeiro para o secretário",
      `status ${souRedator.status}: ${JSON.stringify(souRedator.dados)}`);

    const criada = await chamar("/atas", {
      token: jwt, metodo: "POST",
      corpo: { ...ataDeTeste(NUMERO_BASE), criado_por: meuId },
      extra: { Prefer: "return=representation" },
    });
    const ata = Array.isArray(criada.dados) ? criada.dados[0] : null;
    relatar(criada.status === 201 && !!ata, "secretário CRIA ata (rascunho)",
      `status ${criada.status}: ${JSON.stringify(criada.dados).slice(0, 200)}`);

    if (ata) {
      idParaLimpar.push(ata.id);

      relatar(ata.status === "rascunho", "ata nasce com status 'rascunho'",
        `status gravado: ${ata.status}`);

      // --- número duplicado -------------------------------------------------
      const duplicada = await chamar("/atas", {
        token: jwt, metodo: "POST",
        corpo: { ...ataDeTeste(NUMERO_BASE), criado_por: meuId },
      });
      relatar(duplicada.status === 409 ||
        JSON.stringify(duplicada.dados).includes("atas_numero_key"),
        "número de ata repetido é RECUSADO pela chave única",
        `status ${duplicada.status}: ${JSON.stringify(duplicada.dados).slice(0, 200)}`);

      // --- edição do rascunho ----------------------------------------------
      const editada = await chamar(`/atas?id=eq.${ata.id}`, {
        token: jwt, metodo: "PATCH", corpo: { coleta: 28.00 },
      });
      relatar(editada.status === 204 || editada.status === 200,
        "secretário EDITA ata em rascunho",
        `status ${editada.status}: ${JSON.stringify(editada.dados).slice(0, 160)}`);

      // --- presença ---------------------------------------------------------
      const presenca = await chamar("/atas_presencas", {
        token: jwt, metodo: "POST",
        corpo: { ata_id: ata.id, confrade_id: meuId, nome: "Secretário de teste", situacao: "presente" },
      });
      relatar(presenca.status === 201, "secretário MARCA presença em ata em rascunho",
        `status ${presenca.status}: ${JSON.stringify(presenca.dados).slice(0, 200)}`);

      // --- aprovação: a partir daqui a ata é documento ----------------------
      console.log("\n=== 4b. A TRAVA: depois de aprovada, ninguém reescreve ===");

      const aprovada = await chamar(`/atas?id=eq.${ata.id}`, {
        token: jwt, metodo: "PATCH",
        corpo: { status: "aprovada", aprovada_em: new Date().toISOString(), aprovada_por: meuId },
      });
      relatar(aprovada.status === 204 || aprovada.status === 200,
        "secretário APROVA a ata (rascunho → aprovada)",
        `status ${aprovada.status}: ${JSON.stringify(aprovada.dados).slice(0, 160)}`);

      // Um PATCH que a RLS recusa devolve 204 com ZERO linhas afetadas, não um
      // erro — a policy filtra a linha, não rejeita o comando. Por isso o teste
      // pede a representação de volta: lista vazia é a prova de que nada foi
      // tocado. Conferir só o status daria "OK" para uma trava inexistente.
      const tentativa = await chamar(`/atas?id=eq.${ata.id}`, {
        token: jwt, metodo: "PATCH", corpo: { coleta: 999.99 },
        extra: { Prefer: "return=representation" },
      });
      const alterou = Array.isArray(tentativa.dados) && tentativa.dados.length > 0;
      relatar(!alterou, "ata APROVADA não aceita mais UPDATE (nenhuma linha alterada)",
        `status ${tentativa.status}: ${JSON.stringify(tentativa.dados).slice(0, 200)}`);

      const conferir = await chamar(`/atas?id=eq.${ata.id}&select=coleta,status`, { token: jwt });
      const valor = Array.isArray(conferir.dados) ? conferir.dados[0] : null;
      relatar(valor && Number(valor.coleta) === 28,
        "o valor da ata aprovada continua o de antes da tentativa",
        `lido do banco: ${JSON.stringify(conferir.dados).slice(0, 160)}`);

      const presencaDepois = await chamar("/atas_presencas", {
        token: jwt, metodo: "POST",
        corpo: { ata_id: ata.id, confrade_id: meuId, nome: "Intruso", situacao: "ausente" },
      });
      relatar(negado(presencaDepois),
        "ata APROVADA não aceita mudança na lista de presentes (a trava não tem porta dos fundos)",
        `status ${presencaDepois.status}: ${JSON.stringify(presencaDepois.dados).slice(0, 200)}`);

      // --- reabertura (migração 024) ---------------------------------------
      // A 022 tinha `pode_redigir_ata() and (status='rascunho' or is_admin())`
      // e, com o `and` por fora, ninguém reabria: os dois cadastros são
      // independentes. Aqui se confere que a regra virou de fato duas —
      // quem LAVRA não destrava, quem REABRE destrava.
      const souReabridor = await chamar("/rpc/pode_reabrir_ata", { token: jwt, metodo: "POST", corpo: {} });
      relatar(souReabridor.status === 200 && typeof souReabridor.dados === "boolean",
        "pode_reabrir_ata() responde para o usuário autenticado",
        `status ${souReabridor.status}: ${JSON.stringify(souReabridor.dados)}`);

      const reabrir = await chamar(`/atas?id=eq.${ata.id}`, {
        token: jwt, metodo: "PATCH",
        corpo: { status: "rascunho", aprovada_em: null, aprovada_por: null },
        extra: { Prefer: "return=representation" },
      });
      const reabriu = Array.isArray(reabrir.dados) && reabrir.dados.length > 0;

      if (souReabridor.dados === true) {
        relatar(reabriu, "administrador REABRE a ata aprovada (era o bug da 022)",
          `status ${reabrir.status}: ${JSON.stringify(reabrir.dados).slice(0, 200)}`);
      } else {
        relatar(!reabriu,
          "quem só lavra NÃO reabre ata aprovada (precisa ser administrador)",
          `status ${reabrir.status}: ${JSON.stringify(reabrir.dados).slice(0, 200)}`);
        console.log("        (para exercitar a reabertura, rode com uma conta de papel 'administrador')");
      }
    }
  }
} else {
  console.log("\n=== 4. (pulado) — defina SECRETARIO_EMAIL/SECRETARIO_SENHA (papel 'secretario') ===");
}

// ---------------------------------------------------------------------------
// Limpeza — ver "Resíduo" no cabeçalho
// ---------------------------------------------------------------------------
if (idParaLimpar.length) {
  if (SERVICE_ROLE) {
    const r = await chamar(`/atas?numero=gte.990000`, {
      metodo: "DELETE", token: SERVICE_ROLE, chave: SERVICE_ROLE,
    });
    relatar(r.status === 204 || r.status === 200, "atas de teste removidas (service_role)",
      `status ${r.status}: ${JSON.stringify(r.dados).slice(0, 160)}`);
  } else {
    console.log("\n--- LIMPEZA PENDENTE ------------------------------------------");
    console.log("Este script criou ata(s) de teste que o próprio banco não deixa");
    console.log("apagar pela API (atas não tem grant de DELETE, de propósito).");
    console.log("Elas apareceriam no histórico da ferramenta. Cole no SQL Editor:\n");
    console.log("  delete from public.atas where numero >= 990000;\n");
    console.log("---------------------------------------------------------------");
  }
}

console.log(`\n${passou} verificações OK, ${falhou} falha(s).`);
process.exit(falhou === 0 ? 0 : 1);
