// ============================================================================
// enviar-pedido — única porta de escrita pública do banco.
// ----------------------------------------------------------------------------
// O navegador NUNCA escreve direto no Postgres: a chave `anon` distribuída no
// site só tem SELECT, em colunas nomeadas, de linhas já moderadas. Toda
// intenção enviada pela comunidade passa por aqui, é conferida, contabilizada
// contra o limite por IP e gravada como 'pendente' com service_role.
//
// Segredos necessários (Dashboard → Edge Functions → Secrets):
//   IP_PEPPER            obrigatório · segredo longo e aleatório para o hash do IP
//   ORIGENS_PERMITIDAS   opcional   · lista separada por vírgula; há um padrão abaixo
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são injetados pela plataforma.
//
// Implantação:  npx supabase functions deploy enviar-pedido
// ============================================================================

import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { marcacoesDeConteudo, normalizar, verificarBloqueio } from "./filtros.ts";

const ORIGENS_PADRAO = [
  "https://manual-vicentinos.vercel.app",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
];

const LIMITE_CORPO = 4096; // bytes
const TEMPO_MINIMO = 4_000; // ms — abaixo disso não houve leitura, houve robô
const TEMPO_MAXIMO = 6 * 60 * 60 * 1000; // ms — página esquecida aberta

const origensPermitidas = (Deno.env.get("ORIGENS_PERMITIDAS") ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const ORIGENS = origensPermitidas.length ? origensPermitidas : ORIGENS_PADRAO;

function cabecalhosCors(origem: string | null): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origem && ORIGENS.includes(origem) ? origem : ORIGENS[0],
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function responder(
  corpo: Record<string, unknown>,
  status: number,
  origem: string | null,
): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...cabecalhosCors(origem), "content-type": "application/json; charset=utf-8" },
  });
}

/** SHA-256 de (pepper + IP). O IP em claro nunca sai daqui nem é gravado. */
async function hashDoIp(ip: string, pepper: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${pepper}:${ip}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function ipDaRequisicao(req: Request): string | null {
  const encaminhado = req.headers.get("x-forwarded-for");
  if (encaminhado) {
    const primeiro = encaminhado.split(",")[0].trim();
    if (primeiro) return primeiro;
  }
  return req.headers.get("x-real-ip")?.trim() || null;
}

const MENSAGEM_SUCESSO =
  "Recebemos seu pedido. Ele será lido por um de nós antes de aparecer na página, " +
  "e a Conferência já o leva às reuniões de terça e sábado.";

Deno.serve(async (req: Request) => {
  const origem = req.headers.get("origin");

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cabecalhosCors(origem) });
  }

  if (req.method !== "POST") {
    return responder({ ok: false, erro: "metodo" }, 405, origem);
  }

  // 1 · Origem. Requisição de navegador sem Origin conhecida não passa.
  if (!origem || !ORIGENS.includes(origem)) {
    return responder({ ok: false, erro: "origem_nao_autorizada" }, 403, origem);
  }

  const pepper = Deno.env.get("IP_PEPPER");
  if (!pepper || pepper.length < 16) {
    // Falha fechada: sem pepper não há limite por IP confiável, e seguir sem ele
    // seria abrir a porta em silêncio.
    console.error("IP_PEPPER ausente ou curto demais — recusando envios.");
    return responder(
      { ok: false, erro: "indisponivel", mensagem: "Serviço temporariamente indisponível." },
      503,
      origem,
    );
  }

  // 2 · Tamanho e formato do corpo.
  const bruto = await req.text();
  if (bruto.length > LIMITE_CORPO) {
    return responder({ ok: false, erro: "corpo_grande" }, 413, origem);
  }

  let dados: Record<string, unknown>;
  try {
    dados = JSON.parse(bruto || "{}");
  } catch {
    return responder({ ok: false, erro: "json_invalido" }, 400, origem);
  }

  // 3 · Honeypot. Campo escondido por CSS: humano nunca preenche.
  // Responde sucesso para não ensinar ao robô qual foi a barreira.
  if (typeof dados.assunto === "string" && dados.assunto.trim() !== "") {
    return responder({ ok: true, mensagem: MENSAGEM_SUCESSO }, 200, origem);
  }

  // 4 · Tempo de preenchimento. O front manda o intervalo medido na própria
  // máquina, não um horário absoluto — assim relógio desajustado não derruba
  // ninguém.
  const tempo = Number(dados.tempoMs);
  if (!Number.isFinite(tempo) || tempo < TEMPO_MINIMO) {
    return responder(
      {
        ok: false,
        erro: "rapido_demais",
        mensagem: "Aguarde um instante antes de enviar e tente de novo.",
      },
      400,
      origem,
    );
  }
  if (tempo > TEMPO_MAXIMO) {
    return responder(
      {
        ok: false,
        erro: "pagina_antiga",
        mensagem: "Esta página está aberta há muito tempo. Recarregue e envie novamente.",
      },
      400,
      origem,
    );
  }

  // 5 · Consentimento. Sem aceite explícito não se publica dado de ninguém.
  if (dados.consentimento !== true) {
    return responder(
      {
        ok: false,
        erro: "sem_consentimento",
        mensagem: "É preciso concordar com a publicação da intenção para enviar.",
      },
      400,
      origem,
    );
  }

  // 6 · Normalização e formato dos campos.
  const intencao = normalizar(dados.intencao, 280);
  const nome = normalizar(dados.nome, 40);
  const contato = normalizar(dados.contato, 120);

  if (intencao.length < 10) {
    return responder(
      {
        ok: false,
        erro: "intencao_curta",
        mensagem: "Escreva um pouco mais sobre a intenção (ao menos 10 caracteres).",
      },
      400,
      origem,
    );
  }

  if (nome && !/^\p{L}[\p{L}\s'-]{1,39}$/u.test(nome)) {
    return responder(
      {
        ok: false,
        erro: "nome_invalido",
        mensagem: "Use apenas o primeiro nome, sem números nem símbolos.",
      },
      400,
      origem,
    );
  }
  if (nome && nome.split(" ").filter(Boolean).length > 2) {
    return responder(
      {
        ok: false,
        erro: "nome_completo",
        mensagem: "Informe apenas o primeiro nome — é assim que ele aparecerá na página.",
      },
      400,
      origem,
    );
  }

  // 7 · Regras de conteúdo. Vêm ANTES do limite por IP de propósito: nada aqui
  // chega a ser gravado, então nada consome a cota de quem escreveu. Quem cola
  // um telefone sem pensar recebe o aviso e corrige na hora, em vez de ficar
  // uma hora de castigo por um engano. O teto de estrago não muda — o limite
  // continua guardando o que de fato importa, que é a fila do moderador.
  const bloqueio = verificarBloqueio(intencao);
  if (bloqueio) {
    return responder({ ok: false, erro: bloqueio.erro, mensagem: bloqueio.mensagem }, 400, origem);
  }

  // 8 · Limite por IP, já sabendo que este pedido é gravável.
  const ip = ipDaRequisicao(req);
  if (!ip) {
    return responder({ ok: false, erro: "origem_invalida" }, 400, origem);
  }
  const ipHash = await hashDoIp(ip, pepper);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data: limite, error: erroLimite } = await supabase.rpc("registrar_tentativa", {
    p_ip_hash: ipHash,
  });

  if (erroLimite) {
    console.error("registrar_tentativa falhou:", erroLimite.message);
    return responder(
      { ok: false, erro: "indisponivel", mensagem: "Não foi possível registrar agora. Tente mais tarde." },
      503,
      origem,
    );
  }

  if (!limite?.permitido) {
    const mensagem = limite?.motivo === "limite_dia"
      ? "Você já enviou vários pedidos hoje. Continuamos rezando por eles — volte amanhã."
      : "Recebemos seus pedidos recentes. Aguarde um pouco antes de enviar outro.";
    return responder({ ok: false, erro: "limite", mensagem }, 429, origem);
  }

  // 9 · Marcação para o moderador — sinaliza, não derruba.
  const marcacao = marcacoesDeConteudo(`${nome} ${intencao}`);

  // 10 · Grava sempre como pendente. Não existe caminho que publique daqui.
  const { error: erroInsert } = await supabase.from("pedidos_oracao").insert({
    nome: nome || null,
    intencao,
    contato: contato || null,
    consentimento: true,
    status: "pendente",
    ip_hash: ipHash,
    user_agent: (req.headers.get("user-agent") ?? "").slice(0, 300) || null,
    motivo_flag: marcacao,
  });

  if (erroInsert) {
    console.error("insert em pedidos_oracao falhou:", erroInsert.message);
    return responder(
      { ok: false, erro: "indisponivel", mensagem: "Não foi possível registrar agora. Tente mais tarde." },
      503,
      origem,
    );
  }

  return responder({ ok: true, mensagem: MENSAGEM_SUCESSO }, 200, origem);
});
