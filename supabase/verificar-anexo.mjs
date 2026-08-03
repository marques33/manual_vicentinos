#!/usr/bin/env node
// ============================================================================
// Prova o CHECK de `mural_posts.anexo_url` / `anexo_rotulo` (migração 005).
//
// Por que não dá para usar a chave `anon` aqui, como faz verificar-rls.mjs: a
// RLS nega a escrita ANTES de o Postgres avaliar o CHECK. A negativa viria de
// qualquer jeito e não provaria nada sobre a restrição. Então este script
// escreve com a chave de serviço — que ignora RLS — e o que sobra a ser
// testado é exatamente o CHECK.
//
// A chave de serviço NÃO fica em arquivo nem em variável exportada: o script a
// pede à CLI, já autenticada nesta máquina, e a mantém só em memória.
//
// As linhas de teste nascem com `publicado = false` (o default da tabela). Se
// este script morrer no meio, o lixo que ele deixar continua invisível para o
// público — a política de leitura anônima exige `publicado`. A faxina no fim
// roda mesmo assim, no finally.
//
// Uso:
//   node supabase/verificar-anexo.mjs
// ============================================================================

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const aqui = dirname(fileURLToPath(import.meta.url));
const REF = "cqkymbseyrebmsufimni";
const MARCA = "ZZ-TESTE-ANEXO-005";

function daConfiguracao(nome) {
  const fonte = readFileSync(join(aqui, "..", "app", "assets", "supabase-client.js"), "utf8");
  return fonte.match(new RegExp(`${nome}\\s*=\\s*"([^"]+)"`))?.[1] ?? null;
}

const URL_BASE = process.env.SUPABASE_URL || daConfiguracao("SUPABASE_URL");
const ANON = process.env.SUPABASE_ANON_KEY || daConfiguracao("SUPABASE_ANON_KEY");

/** Chave de serviço direto da CLI — nunca impressa, nunca gravada. */
function chaveDeServico() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bruto = execFileSync(
    "supabase",
    ["projects", "api-keys", "--project-ref", REF, "--reveal", "--output", "json"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
  );
  const chaves = JSON.parse(bruto);
  const achada = chaves.find((k) => k.name === "service_role" || k.type === "secret");
  if (!achada?.api_key) throw new Error("não encontrei a chave de serviço na saída da CLI");
  return achada.api_key;
}

const SERVICO = chaveDeServico();
const REST = `${URL_BASE}/rest/v1`;

let passou = 0, falhou = 0;
function relatar(ok, titulo, detalhe = "") {
  if (ok) { passou++; console.log(`  OK    ${titulo}`); }
  else { falhou++; console.log(`  FALHA ${titulo}${detalhe ? "\n        " + detalhe : ""}`); }
}

async function chamar(caminho, { chave = SERVICO, metodo = "GET", corpo, extra = {} } = {}) {
  const r = await fetch(`${REST}${caminho}`, {
    method: metodo,
    headers: {
      apikey: chave,
      Authorization: `Bearer ${chave}`,
      "Content-Type": "application/json",
      ...extra,
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const texto = await r.text();
  return { status: r.status, texto };
}

const base = () => ({
  titulo: MARCA,
  organizacao: "Verificação automática",
  resumo: "Linha criada por supabase/verificar-anexo.mjs para provar o CHECK do anexo.",
});

/** Tenta inserir com o anexo dado. Devolve true se o banco ACEITOU. */
async function tentar(campos) {
  const { status, texto } = await chamar("/mural_posts", {
    metodo: "POST",
    corpo: { ...base(), ...campos },
  });
  if (status === 201 || status === 200) return { aceito: true };
  // 23514 = check_violation. Qualquer outro erro é problema do teste, não do CHECK.
  const violou = texto.includes("23514") || texto.includes("_check");
  return { aceito: false, violou, status, texto: texto.slice(0, 160) };
}

async function deveAceitar(titulo, campos) {
  const r = await tentar(campos);
  relatar(r.aceito, titulo, r.aceito ? "" : `recusado (${r.status}) ${r.texto}`);
}

async function deveRecusar(titulo, campos) {
  const r = await tentar(campos);
  relatar(!r.aceito && r.violou, titulo,
    r.aceito ? "o banco ACEITOU" : `recusado, mas não pelo CHECK: (${r.status}) ${r.texto}`);
}

async function faxina() {
  const { status } = await chamar(`/mural_posts?titulo=eq.${encodeURIComponent(MARCA)}`, {
    metodo: "DELETE",
    extra: { Prefer: "return=minimal" },
  });
  const { texto } = await chamar(`/mural_posts?titulo=eq.${encodeURIComponent(MARCA)}&select=id`);
  const restou = JSON.parse(texto || "[]").length;
  relatar(status < 300 && restou === 0, "faxina: nenhuma linha de teste sobrou",
    `restaram ${restou}`);
}

try {
  console.log("\nanexo_url — o que o banco deve ACEITAR");
  await deveAceitar("caminho interno .pdf", { anexo_url: "/assets/folheto.pdf" });
  await deveAceitar("extensão em maiúscula (.PDF)", { anexo_url: "/assets/FOLHETO.PDF" });
  await deveAceitar("imagem interna .jpg", { anexo_url: "/assets/cartaz.jpg" });
  await deveAceitar("https de terceiro", { anexo_url: "https://exemplo.com.br/folheto.pdf" });
  await deveAceitar("sem anexo (null)", { anexo_url: null });

  console.log("\nanexo_url — o que o banco deve RECUSAR");
  await deveRecusar("javascript:", { anexo_url: "javascript:alert(1)" });
  await deveRecusar("data:", { anexo_url: "data:application/pdf;base64,AAAA" });
  await deveRecusar("http:// (sem s)", { anexo_url: "http://exemplo.com.br/folheto.pdf" });
  await deveRecusar("subida de pasta (..)", { anexo_url: "/assets/../admin.html" });
  await deveRecusar("caminho fora de /assets", { anexo_url: "/admin.html" });
  await deveRecusar("subpasta dentro de /assets", { anexo_url: "/assets/pasta/folheto.pdf" });
  await deveRecusar("extensão não prevista (.exe)", { anexo_url: "/assets/instalador.exe" });
  await deveRecusar("sem extensão", { anexo_url: "/assets/folheto" });
  await deveRecusar("espaço no meio", { anexo_url: "/assets/meu folheto.pdf" });
  await deveRecusar("acima de 300 caracteres", { anexo_url: "/assets/" + "a".repeat(300) + ".pdf" });

  console.log("\nanexo_rotulo");
  await deveAceitar("rótulo de tamanho normal",
    { anexo_url: "/assets/folheto.pdf", anexo_rotulo: "Folheto do 2º semestre (PDF, 2,6 MB)" });
  await deveRecusar("rótulo curto demais (2)",
    { anexo_url: "/assets/folheto.pdf", anexo_rotulo: "ok" });
  await deveRecusar("rótulo só de espaços",
    { anexo_url: "/assets/folheto.pdf", anexo_rotulo: "     " });
  await deveRecusar("rótulo acima de 60",
    { anexo_url: "/assets/folheto.pdf", anexo_rotulo: "a".repeat(61) });

  console.log("\nchave anon continua sem escrever, e agora enxerga as colunas novas");
  {
    const { status } = await chamar("/mural_posts", {
      chave: ANON, metodo: "POST", corpo: { ...base(), anexo_url: "/assets/x.pdf" },
    });
    relatar(status === 401 || status === 403, `anon não insere (status ${status})`);
  }
  {
    const { status, texto } = await chamar("/mural_posts?select=id,anexo_url,anexo_rotulo&limit=1",
      { chave: ANON });
    relatar(status === 200, `anon lê anexo_url/anexo_rotulo (status ${status})`, texto.slice(0, 120));
  }

  console.log("");
  await faxina();
} finally {
  // Rede de segurança: se algo estourou lá em cima, ainda assim não fica lixo.
  await chamar(`/mural_posts?titulo=eq.${encodeURIComponent(MARCA)}`, {
    metodo: "DELETE", extra: { Prefer: "return=minimal" },
  }).catch(() => {});
}

console.log(`\n${passou} passaram, ${falhou} falharam.`);
process.exit(falhou === 0 ? 0 : 1);
