#!/usr/bin/env node
// ============================================================================
// Exercita a Edge Function `enviar-pedido` — a única porta de escrita pública.
//
// Roda contra a função JÁ IMPLANTADA. Envia um pedido legítimo e depois tenta,
// uma a uma, as formas de abusar dela. O último bloco estoura o limite por IP
// de propósito: rode com calma, porque depois disso o seu IP fica de castigo
// por uma hora (é justamente o que se quer provar).
//
// Uso:
//   node supabase/verificar-funcao.mjs
//   node supabase/verificar-funcao.mjs --sem-limite   (pula o teste de flood)
//
// Variáveis: SUPABASE_URL (ou app/assets/supabase-client.js) e, se a origem
// permitida for outra, ORIGEM.
// ============================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const aqui = dirname(fileURLToPath(import.meta.url));
const config = (nome) => {
  try {
    const f = readFileSync(join(aqui, "..", "app", "assets", "supabase-client.js"), "utf8");
    return f.match(new RegExp(`${nome}\\s*=\\s*"([^"]+)"`))?.[1] ?? null;
  } catch { return null; }
};

const URL_BASE = process.env.SUPABASE_URL || config("SUPABASE_URL");
const ORIGEM = process.env.ORIGEM || "https://manual-vicentinos.vercel.app";
const PULAR_LIMITE = process.argv.includes("--sem-limite");

if (!URL_BASE || URL_BASE.includes("SEU-PROJETO")) {
  console.error("Configure SUPABASE_URL (ou preencha app/assets/supabase-client.js).");
  process.exit(2);
}

const ALVO = `${URL_BASE}/functions/v1/enviar-pedido`;
let passou = 0, falhou = 0;

function relatar(ok, titulo, detalhe = "") {
  if (ok) { passou++; console.log(`  OK    ${titulo}`); }
  else { falhou++; console.log(`  FALHA ${titulo}${detalhe ? "\n        " + detalhe : ""}`); }
}

async function enviar(corpo, { origem = ORIGEM, metodo = "POST" } = {}) {
  const r = await fetch(ALVO, {
    method: metodo,
    headers: { "content-type": "application/json", Origin: origem },
    body: metodo === "POST" ? JSON.stringify(corpo) : undefined,
  });
  let dados = null;
  const t = await r.text();
  try { dados = t ? JSON.parse(t) : null; } catch { dados = t; }
  return { status: r.status, dados };
}

const valido = (extra = {}) => ({
  nome: "Teste",
  intencao: "Pela saúde de quem cuida das famílias acompanhadas pela Conferência.",
  contato: "",
  consentimento: true,
  assunto: "",
  tempoMs: 9000,
  ...extra,
});

// ---------------------------------------------------------------------------
console.log("\n=== 1. Caminho legítimo ===");
const bom = await enviar(valido());
relatar(bom.status === 200 && bom.dados?.ok === true,
  "pedido válido é aceito (e entra como PENDENTE)",
  `status ${bom.status}: ${JSON.stringify(bom.dados).slice(0, 200)}`);
console.log("        → confira no painel: deve estar na fila, não na página pública.");

// ---------------------------------------------------------------------------
console.log("\n=== 2. Armadilha e ritmo ===");

const isca = await enviar(valido({ assunto: "sou um robô" }));
relatar(isca.status === 200 && isca.dados?.ok === true,
  "honeypot responde SUCESSO falso (não ensina o robô qual foi a barreira)",
  `status ${isca.status}: ${JSON.stringify(isca.dados).slice(0, 160)}`);
console.log("        → e no painel NÃO pode haver pedido com o texto acima.");

const rapido = await enviar(valido({ tempoMs: 500 }));
relatar(rapido.status === 400 && rapido.dados?.erro === "rapido_demais",
  "envio instantâneo é recusado",
  `status ${rapido.status}: ${JSON.stringify(rapido.dados).slice(0, 160)}`);

const velho = await enviar(valido({ tempoMs: 8 * 60 * 60 * 1000 }));
relatar(velho.status === 400 && velho.dados?.erro === "pagina_antiga",
  "página aberta há horas é recusada com pedido de recarga",
  `status ${velho.status}: ${JSON.stringify(velho.dados).slice(0, 160)}`);

// ---------------------------------------------------------------------------
console.log("\n=== 3. Consentimento e formato ===");

const semAceite = await enviar(valido({ consentimento: false }));
relatar(semAceite.status === 400 && semAceite.dados?.erro === "sem_consentimento",
  "sem consentimento não se publica nada",
  `status ${semAceite.status}: ${JSON.stringify(semAceite.dados).slice(0, 160)}`);

const curto = await enviar(valido({ intencao: "reze" }));
relatar(curto.status === 400 && curto.dados?.erro === "intencao_curta",
  "intenção curta demais é recusada",
  `status ${curto.status}: ${JSON.stringify(curto.dados).slice(0, 160)}`);

const nomeCheio = await enviar(valido({ nome: "Maria Aparecida da Silva Souza" }));
relatar(nomeCheio.status === 400 && nomeCheio.dados?.erro === "nome_completo",
  "nome completo é recusado (só o primeiro é publicado)",
  `status ${nomeCheio.status}: ${JSON.stringify(nomeCheio.dados).slice(0, 160)}`);

const nomeEstranho = await enviar(valido({ nome: "Maria123" }));
relatar(nomeEstranho.status === 400 && nomeEstranho.dados?.erro === "nome_invalido",
  "nome com número é recusado",
  `status ${nomeEstranho.status}: ${JSON.stringify(nomeEstranho.dados).slice(0, 160)}`);

// ---------------------------------------------------------------------------
console.log("\n=== 4. Conteúdo ===");

const casos = [
  ["link", "Reze por mim e veja https://exemplo.com/oferta", "com_link"],
  ["e-mail", "Me escreva em fulano@exemplo.com para orarmos juntos", "com_email"],
  ["telefone", "Meu contato para oração é (61) 99999-8888", "com_telefone"],
  ["caixa alta", "REZEM POR MIM URGENTEMENTE AGORA MESMO POR FAVOR", "muito_caixa_alta"],
];
for (const [nome, intencao, erro] of casos) {
  const r = await enviar(valido({ intencao }));
  relatar(r.status === 400 && r.dados?.erro === erro,
    `intenção com ${nome} é recusada`,
    `status ${r.status}: ${JSON.stringify(r.dados).slice(0, 160)}`);
}

// ---------------------------------------------------------------------------
console.log("\n=== 5. Origem ===");

const outraOrigem = await enviar(valido(), { origem: "https://site-invasor.example" });
relatar(outraOrigem.status === 403,
  "origem desconhecida é barrada",
  `status ${outraOrigem.status}: ${JSON.stringify(outraOrigem.dados).slice(0, 160)}`);

const semMetodo = await enviar(null, { metodo: "GET" });
relatar(semMetodo.status === 405 || semMetodo.status === 403,
  "GET não é aceito",
  `status ${semMetodo.status}: ${JSON.stringify(semMetodo.dados).slice(0, 160)}`);

// ---------------------------------------------------------------------------
if (PULAR_LIMITE) {
  console.log("\n=== 6. (pulado com --sem-limite) ===");
} else {
  console.log("\n=== 6. Limite por IP (deixa o seu IP de castigo por 1 hora) ===");
  let bateu = null;
  for (let i = 0; i < 5 && bateu === null; i++) {
    const r = await enviar(valido({ intencao: `Teste de limite número ${i} pela paz nas famílias.` }));
    if (r.status === 429) bateu = { tentativa: i + 1, ...r };
  }
  relatar(bateu !== null,
    "o limite por IP dispara antes da 5ª tentativa na mesma hora",
    "nenhuma tentativa devolveu 429 — confira IP_PEPPER e registrar_tentativa()");
  if (bateu) {
    console.log(`        → 429 na tentativa ${bateu.tentativa}: ${JSON.stringify(bateu.dados).slice(0, 140)}`);
  }
}

// ---------------------------------------------------------------------------
console.log(`\n${passou} verificação(ões) passaram, ${falhou} falharam.`);
console.log("Lembre-se de apagar os pedidos de teste no painel antes de divulgar a página.");
process.exit(falhou ? 1 : 0);
