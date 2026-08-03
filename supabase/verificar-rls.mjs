#!/usr/bin/env node
// ============================================================================
// Prova que a chave pública do site não consegue fazer estrago.
//
// Este script é a verificação que precede a subida do mural e dos pedidos de
// oração. Ele não confia no que está escrito nas migrações: conversa com o
// PostgREST usando a MESMA chave `anon` que vai no HTML e confere, uma a uma,
// as coisas que ela NÃO pode fazer.
//
// Um teste que só mostra o que é negado não prova nada — poderia estar tudo
// quebrado. Por isso, informando um moderador, cada negativa é repetida com o
// JWT dele para confirmar que aí a operação PASSA.
//
// Uso:
//   node supabase/verificar-rls.mjs
//
// Variáveis (ou preencha app/assets/supabase-client.js, que é lido por padrão):
//   SUPABASE_URL, SUPABASE_ANON_KEY   endereço e chave pública do projeto
//   ADMIN_EMAIL, ADMIN_SENHA          opcionais, para o par negado/permitido
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
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "";
const ADMIN_SENHA = process.env.ADMIN_SENHA || "";

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

const negado = (r) => r.status === 401 || r.status === 403 || r.status === 404 ||
  (r.status >= 400 && r.status < 500);

// ---------------------------------------------------------------------------
// Porta de entrada: a chave é sequer aceita?
//
// Sem esta conferência, uma chave inválida faz TODO o restante do script passar
// — cada operação proibida seria recusada, sim, mas por causa da chave e não da
// RLS. É o modo de falha mais perigoso que um teste de segurança pode ter: ele
// diz "protegido" quando o certo seria dizer "não sei". Já aconteceu aqui.
// ---------------------------------------------------------------------------
const porta = await chamar("/mural_posts?select=id&limit=1");
if (porta.status === 401) {
  console.error("\nA chave anon foi RECUSADA pelo projeto — nada abaixo teria sentido.");
  console.error(`  ${JSON.stringify(porta.dados)}`);
  console.error("\n  Confira em app/assets/supabase-client.js se a chave está completa e");
  console.error("  se o `ref` dentro dela é o mesmo da SUPABASE_URL.");
  process.exit(2);
}

// ---------------------------------------------------------------------------
console.log("\n=== 1. Leitura pública: só o que já foi moderado ===");

const aprovados = await chamar(
  "/pedidos_oracao?select=id,nome,intencao,privilegiado_semana,aprovado_em&limit=100");
relatar(aprovados.status === 200,
  "anon lê as colunas públicas de pedidos_oracao",
  `status ${aprovados.status}: ${JSON.stringify(aprovados.dados).slice(0, 200)}`);

if (aprovados.status === 200 && Array.isArray(aprovados.dados)) {
  const chaves = new Set(aprovados.dados.flatMap((o) => Object.keys(o)));
  const proibidas = ["contato", "ip_hash", "user_agent", "status", "motivo_flag", "expira_em"]
    .filter((c) => chaves.has(c));
  relatar(proibidas.length === 0,
    "nenhuma coluna interna veio junto na resposta",
    `vazaram: ${proibidas.join(", ")}`);
}

// ---------------------------------------------------------------------------
console.log("\n=== 2. Colunas internas: inalcançáveis pela chave pública ===");

for (const coluna of ["ip_hash", "contato", "user_agent", "motivo_flag"]) {
  const r = await chamar(`/pedidos_oracao?select=${coluna}&limit=1`);
  const vazou = r.status === 200 && Array.isArray(r.dados) && r.dados.length > 0;
  relatar(!vazou, `anon NÃO lê a coluna ${coluna}`,
    `status ${r.status}: ${JSON.stringify(r.dados).slice(0, 160)}`);
}

const estrela = await chamar("/pedidos_oracao?select=*&limit=1");
const estrelaVazou = estrela.status === 200 && Array.isArray(estrela.dados) &&
  estrela.dados.some((o) => "ip_hash" in o || "contato" in o);
relatar(!estrelaVazou, "anon NÃO obtém colunas internas via select=*",
  `status ${estrela.status}: ${JSON.stringify(estrela.dados).slice(0, 160)}`);

// ---------------------------------------------------------------------------
console.log("\n=== 3. Escrita pública: não existe ===");

const idFalso = "00000000-0000-0000-0000-000000000000";

const escritas = [
  ["INSERT em pedidos_oracao", "/pedidos_oracao", "POST",
    { intencao: "tentativa de escrita direta pelo cliente", consentimento: true }],
  ["UPDATE em pedidos_oracao", `/pedidos_oracao?id=eq.${idFalso}`, "PATCH",
    { status: "aprovado" }],
  ["DELETE em pedidos_oracao", `/pedidos_oracao?id=eq.${idFalso}`, "DELETE", undefined],
  ["INSERT em mural_posts", "/mural_posts", "POST",
    { titulo: "invasao", organizacao: "invasor", resumo: "x".repeat(30) }],
  ["UPDATE em mural_posts", `/mural_posts?id=eq.${idFalso}`, "PATCH", { publicado: true }],
  ["DELETE em mural_posts", `/mural_posts?id=eq.${idFalso}`, "DELETE", undefined],
];

for (const [titulo, caminho, metodo, corpo] of escritas) {
  const r = await chamar(caminho, { metodo, corpo });
  relatar(negado(r), `anon NÃO consegue ${titulo}`,
    `status ${r.status}: ${JSON.stringify(r.dados).slice(0, 160)}`);
}

// ---------------------------------------------------------------------------
console.log("\n=== 4. Mural: só o publicado e no prazo ===");

const mural = await chamar("/mural_posts?select=id,titulo,publicado,expira_em&limit=100");
relatar(mural.status === 200, "anon lê o mural",
  `status ${mural.status}: ${JSON.stringify(mural.dados).slice(0, 160)}`);
if (mural.status === 200 && Array.isArray(mural.dados)) {
  const hoje = new Date().toISOString().slice(0, 10);
  const indevidos = mural.dados.filter((m) => !m.publicado || (m.expira_em && m.expira_em < hoje));
  relatar(indevidos.length === 0,
    "nenhum rascunho nem cartaz vencido aparece para o público",
    `vazaram ${indevidos.length}: ${JSON.stringify(indevidos.slice(0, 3))}`);
}

// ---------------------------------------------------------------------------
console.log("\n=== 5. Tabelas e funções internas ===");

const adm = await chamar("/admins?select=user_id&limit=1");
relatar(negado(adm) || (Array.isArray(adm.dados) && adm.dados.length === 0),
  "anon NÃO lê a lista de administradores",
  `status ${adm.status}: ${JSON.stringify(adm.dados).slice(0, 160)}`);

const limite = await chamar("/rpc/registrar_tentativa", {
  metodo: "POST", corpo: { p_ip_hash: "a".repeat(64) },
});
relatar(negado(limite), "anon NÃO executa registrar_tentativa (burlaria o limite por IP)",
  `status ${limite.status}: ${JSON.stringify(limite.dados).slice(0, 160)}`);

const privado = await chamar("/rate_limit?select=ip_hash&limit=1");
relatar(negado(privado), "o log de tentativas não está exposto na API",
  `status ${privado.status}: ${JSON.stringify(privado.dados).slice(0, 160)}`);

// ---------------------------------------------------------------------------
if (ADMIN_EMAIL && ADMIN_SENHA) {
  console.log("\n=== 6. O outro lado do par: com moderador, PASSA ===");

  const entrada = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "content-type": "application/json" },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_SENHA }),
  });
  const sessao = await entrada.json();

  if (!sessao.access_token) {
    relatar(false, "login do moderador", JSON.stringify(sessao).slice(0, 200));
  } else {
    const jwt = sessao.access_token;
    relatar(true, "moderador autenticou");

    const ehAdmin = await chamar("/rpc/is_admin", { token: jwt, metodo: "POST", corpo: {} });
    relatar(ehAdmin.status === 200 && ehAdmin.dados === true,
      "is_admin() devolve verdadeiro para o moderador",
      `status ${ehAdmin.status}: ${JSON.stringify(ehAdmin.dados)}`);

    const fila = await chamar("/pedidos_oracao?select=id,status,contato,ip_hash&limit=5",
      { token: jwt });
    relatar(fila.status === 200,
      "moderador lê a fila COM as colunas internas (o que anon não conseguiu)",
      `status ${fila.status}: ${JSON.stringify(fila.dados).slice(0, 200)}`);

    const rascunhos = await chamar("/mural_posts?select=id,publicado&publicado=is.false&limit=5",
      { token: jwt });
    relatar(rascunhos.status === 200,
      "moderador enxerga rascunhos do mural",
      `status ${rascunhos.status}: ${JSON.stringify(rascunhos.dados).slice(0, 160)}`);
  }
} else {
  console.log("\n=== 6. (pulado) ===");
  console.log("  Defina ADMIN_EMAIL e ADMIN_SENHA para provar também que o moderador");
  console.log("  CONSEGUE o que foi negado ao público. Sem esse par, o teste acima");
  console.log("  não distingue 'bem protegido' de 'tudo quebrado'.");
}

// ---------------------------------------------------------------------------
console.log(`\n${passou} verificação(ões) passaram, ${falhou} falharam.`);
if (falhou) {
  console.log("NÃO publique o site enquanto houver falha aqui.");
}
process.exit(falhou ? 1 : 0);
