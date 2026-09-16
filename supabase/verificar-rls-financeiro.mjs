#!/usr/bin/env node
// ============================================================================
// Prova que o Controle Orçamentário respeita as duas camadas de acesso:
// leitura ampla (todo confrade ativo) e escrita restrita (só tesoureiro ou
// administrador, via pode_lancar_financeiro()) — e que o comprovante no
// Storage é AINDA mais restrito que o extrato (só quem lança abre o arquivo).
//
// Uso:
//   node supabase/verificar-rls-financeiro.mjs
//
// Variáveis (ou preencha app/assets/supabase-client.js, lido por padrão):
//   SUPABASE_URL, SUPABASE_ANON_KEY       endereço e chave pública do projeto
//   TESOUREIRO_EMAIL, TESOUREIRO_SENHA    confrade de teste com papel
//                                         'tesoureiro' ou 'administrador'
//   CONFRADE_EMAIL, CONFRADE_SENHA        confrade de teste com papel comum
//                                         (ex.: 'vicentino') — lê mas não lança
//   NAO_CONFRADE_EMAIL, NAO_CONFRADE_SENHA
//                                         conta authenticated de teste, SEM
//                                         linha em confrades (descartável)
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
const TESOUREIRO_EMAIL = process.env.TESOUREIRO_EMAIL || "";
const TESOUREIRO_SENHA = process.env.TESOUREIRO_SENHA || "";
const CONFRADE_EMAIL = process.env.CONFRADE_EMAIL || "";
const CONFRADE_SENHA = process.env.CONFRADE_SENHA || "";
const NAO_CONFRADE_EMAIL = process.env.NAO_CONFRADE_EMAIL || "";
const NAO_CONFRADE_SENHA = process.env.NAO_CONFRADE_SENHA || "";

if (!URL_BASE || !ANON || URL_BASE.includes("SEU-PROJETO") || ANON.startsWith("COLE_AQUI")) {
  console.error("Configure SUPABASE_URL e SUPABASE_ANON_KEY (ou preencha app/assets/supabase-client.js).");
  process.exit(2);
}

const REST = `${URL_BASE}/rest/v1`;
const STORAGE = `${URL_BASE}/storage/v1`;
let passou = 0, falhou = 0;

function relatar(ok, titulo, detalhe = "") {
  if (ok) { passou++; console.log(`  OK    ${titulo}`); }
  else { falhou++; console.log(`  FALHA ${titulo}${detalhe ? "\n        " + detalhe : ""}`); }
}

async function chamar(caminho, { token = ANON, metodo = "GET", corpo, extra = {}, base = REST } = {}) {
  const r = await fetch(`${base}${caminho}`, {
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

const TABELAS = ["categorias_financeiras", "lancamentos_financeiros",
  "saldo_inicial_financeiro", "conciliacoes_financeiras"];
const idFalso = "00000000-0000-0000-0000-000000000000";
const CAMINHO_TESTE = "verificacao/arquivo-de-teste.pdf";
const CONTEUDO_TESTE = "arquivo descartável de verificar-rls-financeiro.mjs";

// ---------------------------------------------------------------------------
// Porta de entrada: a chave é sequer aceita?
// ---------------------------------------------------------------------------
const testeChave = await chamar("/rpc/is_confrade_ativo", { metodo: "POST", corpo: {} });
if (testeChave.status === 401 && /invalid/i.test(JSON.stringify(testeChave.dados))) {
  console.error("\nA chave anon foi RECUSADA pelo projeto — nada abaixo teria sentido.");
  console.error(`  ${JSON.stringify(testeChave.dados)}`);
  process.exit(2);
}

// ---------------------------------------------------------------------------
console.log("\n=== 1. anon: nenhuma leitura/escrita em nenhuma tabela do financeiro ===");

for (const tabela of TABELAS) {
  const leitura = await chamar(`/${tabela}?select=*&limit=1`);
  const vazou = leitura.status === 200 && Array.isArray(leitura.dados) && leitura.dados.length > 0;
  relatar(!vazou && negado(leitura), `anon NÃO lê ${tabela}`,
    `status ${leitura.status}: ${JSON.stringify(leitura.dados).slice(0, 160)}`);

  const insert = await chamar(`/${tabela}`, { metodo: "POST", corpo: {} });
  relatar(negado(insert), `anon NÃO consegue INSERT em ${tabela}`,
    `status ${insert.status}: ${JSON.stringify(insert.dados).slice(0, 160)}`);
}

const saldoAnon = await chamar("/vw_saldo_financeiro?select=*");
const saldoVazou = saldoAnon.status === 200 && Array.isArray(saldoAnon.dados) && saldoAnon.dados.length > 0;
relatar(!saldoVazou && negado(saldoAnon), "anon NÃO lê vw_saldo_financeiro",
  `status ${saldoAnon.status}: ${JSON.stringify(saldoAnon.dados).slice(0, 160)}`);

const rpcAnon = await chamar("/rpc/pode_lancar_financeiro", { metodo: "POST", corpo: {} });
relatar(negado(rpcAnon), "anon NÃO executa pode_lancar_financeiro",
  `status ${rpcAnon.status}: ${JSON.stringify(rpcAnon.dados).slice(0, 160)}`);

console.log("\n=== 2. anon: nenhum acesso ao bucket de comprovantes ===");

const uploadAnon = await chamar(`/object/comprovantes-financeiros/${CAMINHO_TESTE}`, {
  base: STORAGE, metodo: "POST", extra: { "content-type": "text/plain" }, corpo: null,
});
relatar(negado(uploadAnon), "anon NÃO consegue enviar arquivo ao bucket",
  `status ${uploadAnon.status}: ${JSON.stringify(uploadAnon.dados).slice(0, 160)}`);

const leituraAnon = await chamar(`/object/comprovantes-financeiros/${CAMINHO_TESTE}`, { base: STORAGE });
relatar(negado(leituraAnon), "anon NÃO consegue ler arquivo do bucket",
  `status ${leituraAnon.status}`);

// ---------------------------------------------------------------------------
if (NAO_CONFRADE_EMAIL && NAO_CONFRADE_SENHA) {
  console.log("\n=== 3. authenticated sem linha em confrades: também barrado ===");

  const sessao = await login(NAO_CONFRADE_EMAIL, NAO_CONFRADE_SENHA);
  if (!sessao.access_token) {
    relatar(false, "login do usuário de teste (não confrade)", JSON.stringify(sessao).slice(0, 200));
  } else {
    const jwt = sessao.access_token;
    relatar(true, "usuário de teste autenticou");

    for (const tabela of TABELAS) {
      const r = await chamar(`/${tabela}?select=*&limit=1`, { token: jwt });
      const vazou = r.status === 200 && Array.isArray(r.dados) && r.dados.length > 0;
      relatar(!vazou, `authenticated não-confrade NÃO lê ${tabela}`,
        `status ${r.status}: ${JSON.stringify(r.dados).slice(0, 160)}`);
    }
  }
} else {
  console.log("\n=== 3. (pulado) — defina NAO_CONFRADE_EMAIL/NAO_CONFRADE_SENHA ===");
}

// ---------------------------------------------------------------------------
if (CONFRADE_EMAIL && CONFRADE_SENHA) {
  console.log("\n=== 4. confrade comum: LÊ tudo, mas não lança nem abre comprovante ===");

  const sessao = await login(CONFRADE_EMAIL, CONFRADE_SENHA);
  if (!sessao.access_token) {
    relatar(false, "login do confrade comum de teste", JSON.stringify(sessao).slice(0, 200));
  } else {
    const jwt = sessao.access_token;
    relatar(true, "confrade comum autenticou");

    const souLancador = await chamar("/rpc/pode_lancar_financeiro", { token: jwt, metodo: "POST", corpo: {} });
    relatar(souLancador.status === 200 && souLancador.dados === false,
      "pode_lancar_financeiro() devolve falso para confrade comum",
      `status ${souLancador.status}: ${JSON.stringify(souLancador.dados)}`);

    const saldo = await chamar("/vw_saldo_financeiro?select=*", { token: jwt });
    relatar(saldo.status === 200 && Array.isArray(saldo.dados) && saldo.dados.length === 1,
      "confrade comum LÊ vw_saldo_financeiro (exatamente 1 linha)",
      `status ${saldo.status}: ${JSON.stringify(saldo.dados).slice(0, 200)}`);

    for (const tabela of TABELAS) {
      const leitura = await chamar(`/${tabela}?select=*&limit=1`, { token: jwt });
      relatar(leitura.status === 200, `confrade comum LÊ ${tabela}`,
        `status ${leitura.status}: ${JSON.stringify(leitura.dados).slice(0, 160)}`);

      const insert = await chamar(`/${tabela}`, { token: jwt, metodo: "POST", corpo: {} });
      relatar(negado(insert), `confrade comum NÃO consegue INSERT em ${tabela}`,
        `status ${insert.status}: ${JSON.stringify(insert.dados).slice(0, 160)}`);
    }

    const leituraArquivo = await chamar(`/object/comprovantes-financeiros/${CAMINHO_TESTE}`, { token: jwt, base: STORAGE });
    relatar(negado(leituraArquivo), "confrade comum NÃO consegue ler arquivo do bucket",
      `status ${leituraArquivo.status}`);
  }
} else {
  console.log("\n=== 4. (pulado) — defina CONFRADE_EMAIL/CONFRADE_SENHA (papel comum, ex.: 'vicentino') ===");
}

// ---------------------------------------------------------------------------
if (TESOUREIRO_EMAIL && TESOUREIRO_SENHA) {
  console.log("\n=== 5. tesoureiro/admin: consegue lançar, editar (soft delete) e usar o bucket ===");

  const sessao = await login(TESOUREIRO_EMAIL, TESOUREIRO_SENHA);
  if (!sessao.access_token) {
    relatar(false, "login do tesoureiro de teste", JSON.stringify(sessao).slice(0, 200));
  } else {
    const jwt = sessao.access_token;
    relatar(true, "tesoureiro autenticou");

    const souLancador = await chamar("/rpc/pode_lancar_financeiro", { token: jwt, metodo: "POST", corpo: {} });
    relatar(souLancador.status === 200 && souLancador.dados === true,
      "pode_lancar_financeiro() devolve verdadeiro para o tesoureiro",
      `status ${souLancador.status}: ${JSON.stringify(souLancador.dados)}`);

    const categoria = await chamar("/categorias_financeiras?select=id&tipo=eq.entrada&ativa=eq.true&limit=1", { token: jwt });
    const categoriaId = categoria.dados?.[0]?.id;
    relatar(!!categoriaId, "existe ao menos 1 categoria de entrada ativa (seed da Task 1)",
      JSON.stringify(categoria.dados).slice(0, 160));

    if (categoriaId) {
      const criar = await chamar("/lancamentos_financeiros", {
        token: jwt, metodo: "POST",
        corpo: {
          tipo: "entrada", valor: 1.23, data_movimento: "2026-01-01",
          categoria_id: categoriaId, descricao: "Lançamento de teste — verificar-rls-financeiro.mjs",
          criado_por: sessao.user.id,
        },
        extra: { Prefer: "return=representation" },
      });
      const criouOk = criar.status === 201 && Array.isArray(criar.dados) && criar.dados[0]?.id;
      relatar(criouOk, "tesoureiro consegue INSERT em lancamentos_financeiros",
        `status ${criar.status}: ${JSON.stringify(criar.dados).slice(0, 200)}`);

      if (criouOk) {
        const idTeste = criar.dados[0].id;

        const softDelete = await chamar(`/lancamentos_financeiros?id=eq.${idTeste}`, {
          token: jwt, metodo: "PATCH",
          corpo: { removido_em: new Date().toISOString(), removido_por: sessao.user.id },
        });
        relatar(softDelete.status === 204 || softDelete.status === 200,
          "tesoureiro consegue soft-delete (UPDATE removido_em) do lançamento de teste",
          `status ${softDelete.status}`);

        const conferirSumiu = await chamar(
          `/lancamentos_financeiros?id=eq.${idTeste}&removido_em=is.null&select=id`, { token: jwt });
        relatar(Array.isArray(conferirSumiu.dados) && conferirSumiu.dados.length === 0,
          "lançamento removido não aparece mais no filtro removido_em is null",
          JSON.stringify(conferirSumiu.dados));
      }
    }

    const upload = await chamar(`/object/comprovantes-financeiros/${CAMINHO_TESTE}`, {
      base: STORAGE, token: jwt, metodo: "POST",
      extra: { "content-type": "application/pdf" },
    });
    // upload via fetch simples de texto puro (sem multipart) — o endpoint
    // aceita o corpo bruto quando content-type não é multipart/form-data.
    relatar(upload.status === 200 || upload.status === 201,
      "tesoureiro consegue enviar arquivo ao bucket",
      `status ${upload.status}: ${JSON.stringify(upload.dados).slice(0, 160)}`);

    const leituraOk = await chamar(`/object/comprovantes-financeiros/${CAMINHO_TESTE}`, { token: jwt, base: STORAGE });
    relatar(leituraOk.status === 200, "tesoureiro consegue ler o arquivo que enviou",
      `status ${leituraOk.status}`);

    const apagar = await chamar(`/object/comprovantes-financeiros/${CAMINHO_TESTE}`, {
      token: jwt, metodo: "DELETE", base: STORAGE,
    });
    relatar(apagar.status === 200, "limpeza: arquivo de teste apagado do bucket",
      `status ${apagar.status}`);
  }
} else {
  console.log("\n=== 5. (pulado) — defina TESOUREIRO_EMAIL/TESOUREIRO_SENHA (papel 'tesoureiro' ou 'administrador') ===");
  console.log("  Sem esse par, 'tudo negado' não distingue 'protegido' de 'tudo quebrado'.");
}

// ---------------------------------------------------------------------------
console.log(`\n${passou} verificação(ões) passaram, ${falhou} falharam.`);
if (falhou) {
  console.log("NÃO publique o controle orçamentário enquanto houver falha aqui.");
}
process.exit(falhou ? 1 : 0);
