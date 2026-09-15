#!/usr/bin/env node
// ============================================================================
// Prova que o Prontuário de Atendimento não vaza para ninguém fora dele.
//
// Diferente de verificar-rls.mjs (mural/oração, que têm leitura pública),
// NENHUMA tabela do prontuário tem política para `anon`. Este script prova
// três coisas, na ordem:
//   1. A chave anon não lê/escreve nada em nenhuma tabela nova, nem executa
//      as RPCs de elegibilidade.
//   2. Um `authenticated` que NÃO está em `confrades` também é barrado —
//      autenticação sozinha não basta, é preciso estar na tabela.
//   3. Um confrade ativo de teste CONSEGUE tudo — sem esse par positivo, um
//      "tudo negado" não distingue "protegido" de "tudo quebrado" (mesma
//      lição do verificar-rls.mjs original).
//
// Uso:
//   node supabase/verificar-rls-prontuario.mjs
//
// Variáveis (ou preencha app/assets/supabase-client.js, lido por padrão):
//   SUPABASE_URL, SUPABASE_ANON_KEY   endereço e chave pública do projeto
//   CONFRADE_EMAIL, CONFRADE_SENHA    conta de teste já inserida em confrades
//   NAO_CONFRADE_EMAIL, NAO_CONFRADE_SENHA
//                                     conta authenticated de teste, SEM linha
//                                     em confrades (descartável, só p/ este teste)
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
const CONFRADE_EMAIL = process.env.CONFRADE_EMAIL || "";
const CONFRADE_SENHA = process.env.CONFRADE_SENHA || "";
const NAO_CONFRADE_EMAIL = process.env.NAO_CONFRADE_EMAIL || "";
const NAO_CONFRADE_SENHA = process.env.NAO_CONFRADE_SENHA || "";

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

async function chamar(caminho, { token = ANON, metodo = "GET", corpo, extra = {} } = {}) {
  const r = await fetch(`${REST}${caminho}`, {
    method: metodo,
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...extra,
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
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

const negado = (r) => r.status === 401 || r.status === 403 || r.status === 404 ||
  (r.status >= 400 && r.status < 500);

const TABELAS = ["confrades", "familias", "pessoas", "fontes_renda",
  "necessidades", "intervencoes", "parentescos_cruzados", "parametros_beneficios"];
const idFalso = "00000000-0000-0000-0000-000000000000";

// ---------------------------------------------------------------------------
// Porta de entrada: a chave é sequer aceita? (mesma âncora do verificador
// original — sem ela, chave inválida faria tudo abaixo "passar" por engano)
// ---------------------------------------------------------------------------
const porta = await chamar("/familias?select=id&limit=1");
if (porta.status === 401 && !porta.dados?.message) {
  // status 401 aqui é o esperado (anon barrado) — mas confirmamos que é a
  // RLS/GRANT negando, não a chave sendo rejeitada pelo projeto.
}
const testeChave = await chamar("/rpc/is_admin", { metodo: "POST", corpo: {} });
if (testeChave.status === 401 && /invalid/i.test(JSON.stringify(testeChave.dados))) {
  console.error("\nA chave anon foi RECUSADA pelo projeto — nada abaixo teria sentido.");
  console.error(`  ${JSON.stringify(testeChave.dados)}`);
  process.exit(2);
}

// ---------------------------------------------------------------------------
console.log("\n=== 1. anon: nenhuma leitura em nenhuma tabela do prontuário ===");

for (const tabela of TABELAS) {
  const r = await chamar(`/${tabela}?select=*&limit=1`);
  const vazou = r.status === 200 && Array.isArray(r.dados) && r.dados.length > 0;
  relatar(!vazou && negado(r), `anon NÃO lê ${tabela}`,
    `status ${r.status}: ${JSON.stringify(r.dados).slice(0, 160)}`);
}

// ---------------------------------------------------------------------------
console.log("\n=== 2. anon: nenhuma escrita em nenhuma tabela do prontuário ===");

for (const tabela of TABELAS) {
  const insert = await chamar(`/${tabela}`, { metodo: "POST", corpo: {} });
  relatar(negado(insert), `anon NÃO consegue INSERT em ${tabela}`,
    `status ${insert.status}: ${JSON.stringify(insert.dados).slice(0, 160)}`);

  const update = await chamar(`/${tabela}?id=eq.${idFalso}`, { metodo: "PATCH", corpo: {} });
  relatar(negado(update), `anon NÃO consegue UPDATE em ${tabela}`,
    `status ${update.status}: ${JSON.stringify(update.dados).slice(0, 160)}`);

  const del = await chamar(`/${tabela}?id=eq.${idFalso}`, { metodo: "DELETE" });
  relatar(negado(del), `anon NÃO consegue DELETE em ${tabela}`,
    `status ${del.status}: ${JSON.stringify(del.dados).slice(0, 160)}`);
}

// ---------------------------------------------------------------------------
console.log("\n=== 3. anon: nenhuma RPC de elegibilidade/autorização do prontuário ===");

const rpcElegibilidade = await chamar("/rpc/calcular_elegibilidade_pessoa",
  { metodo: "POST", corpo: { p_pessoa_id: idFalso } });
relatar(negado(rpcElegibilidade), "anon NÃO executa calcular_elegibilidade_pessoa",
  `status ${rpcElegibilidade.status}: ${JSON.stringify(rpcElegibilidade.dados).slice(0, 160)}`);

const rpcConfrade = await chamar("/rpc/is_confrade_ativo", { metodo: "POST", corpo: {} });
relatar(negado(rpcConfrade), "anon NÃO executa is_confrade_ativo",
  `status ${rpcConfrade.status}: ${JSON.stringify(rpcConfrade.dados).slice(0, 160)}`);

// ---------------------------------------------------------------------------
if (NAO_CONFRADE_EMAIL && NAO_CONFRADE_SENHA) {
  console.log("\n=== 4. authenticated sem linha em confrades: também barrado ===");

  const sessao = await login(NAO_CONFRADE_EMAIL, NAO_CONFRADE_SENHA);
  if (!sessao.access_token) {
    relatar(false, "login do usuário de teste (não confrade)", JSON.stringify(sessao).slice(0, 200));
  } else {
    const jwt = sessao.access_token;
    relatar(true, "usuário de teste autenticou");

    const ehConfrade = await chamar("/rpc/is_confrade_ativo", { token: jwt, metodo: "POST", corpo: {} });
    relatar(ehConfrade.status === 200 && ehConfrade.dados === false,
      "is_confrade_ativo() devolve falso para quem não está em confrades",
      `status ${ehConfrade.status}: ${JSON.stringify(ehConfrade.dados)}`);

    for (const tabela of TABELAS) {
      const r = await chamar(`/${tabela}?select=*&limit=1`, { token: jwt });
      const vazou = r.status === 200 && Array.isArray(r.dados) && r.dados.length > 0;
      relatar(!vazou, `authenticated não-confrade NÃO lê ${tabela}`,
        `status ${r.status}: ${JSON.stringify(r.dados).slice(0, 160)}`);
    }
  }
} else {
  console.log("\n=== 4. (pulado) ===");
  console.log("  Defina NAO_CONFRADE_EMAIL e NAO_CONFRADE_SENHA (usuário authenticated");
  console.log("  descartável, sem linha em public.confrades) para provar que autenticação");
  console.log("  sozinha não basta.");
}

// ---------------------------------------------------------------------------
if (CONFRADE_EMAIL && CONFRADE_SENHA) {
  console.log("\n=== 5. O outro lado do par: confrade ativo CONSEGUE ===");

  const sessao = await login(CONFRADE_EMAIL, CONFRADE_SENHA);
  if (!sessao.access_token) {
    relatar(false, "login do confrade de teste", JSON.stringify(sessao).slice(0, 200));
  } else {
    const jwt = sessao.access_token;
    relatar(true, "confrade autenticou");

    const ehConfrade = await chamar("/rpc/is_confrade_ativo", { token: jwt, metodo: "POST", corpo: {} });
    relatar(ehConfrade.status === 200 && ehConfrade.dados === true,
      "is_confrade_ativo() devolve verdadeiro para o confrade de teste",
      `status ${ehConfrade.status}: ${JSON.stringify(ehConfrade.dados)}`);

    const familias = await chamar("/familias?select=id&limit=5", { token: jwt });
    relatar(familias.status === 200, "confrade lê familias",
      `status ${familias.status}: ${JSON.stringify(familias.dados).slice(0, 160)}`);

    const params = await chamar("/parametros_beneficios?select=*&vigente_ate=is.null", { token: jwt });
    relatar(params.status === 200 && Array.isArray(params.dados) && params.dados.length === 1,
      "confrade lê parametros_beneficios e há exatamente 1 linha vigente",
      `status ${params.status}: ${JSON.stringify(params.dados).slice(0, 200)}`);

    // Cria e apaga uma família de teste, provando o par insert/delete
    // permitido (não só o negado, provado nas seções acima).
    const criar = await chamar("/familias", {
      token: jwt, metodo: "POST",
      corpo: { endereco_bairro: "Bairro de teste — verificar-rls-prontuario.mjs" },
      extra: { Prefer: "return=representation" },
    });
    const criouOk = criar.status === 201 && Array.isArray(criar.dados) && criar.dados[0]?.id;
    relatar(criouOk, "confrade consegue INSERT em familias",
      `status ${criar.status}: ${JSON.stringify(criar.dados).slice(0, 200)}`);

    if (criouOk) {
      const idTeste = criar.dados[0].id;
      const apagar = await chamar(`/familias?id=eq.${idTeste}`, { token: jwt, metodo: "DELETE" });
      relatar(apagar.status === 204 || apagar.status === 200,
        "confrade consegue DELETE da família de teste (limpeza)",
        `status ${apagar.status}: ${JSON.stringify(apagar.dados).slice(0, 160)}`);
    }
  }
} else {
  console.log("\n=== 5. (pulado) ===");
  console.log("  Defina CONFRADE_EMAIL e CONFRADE_SENHA (conta já inserida em");
  console.log("  public.confrades, ativo = true) para provar também o lado positivo.");
  console.log("  Sem esse par, 'tudo negado' não distingue 'protegido' de 'tudo quebrado'.");
}

// ---------------------------------------------------------------------------
console.log(`\n${passou} verificação(ões) passaram, ${falhou} falharam.`);
if (falhou) {
  console.log("NÃO publique o prontuário enquanto houver falha aqui.");
}
process.exit(falhou ? 1 : 0);
