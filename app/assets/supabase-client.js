// ============================================================================
// Ligação do site com o Supabase.
//
// Um único lugar com a configuração, para que mural.html, oracoes.html e
// admin.html não carreguem três cópias que um dia divergem.
//
// A chave `anon` abaixo é PÚBLICA por definição — ela vai no HTML e qualquer
// visitante a lê. Isso é o previsto pelo Supabase: quem protege o banco é a
// política de RLS, não o sigilo da chave. Ela só tem SELECT, em colunas
// nomeadas, de linhas já moderadas.
//
// A chave `service_role` NUNCA entra aqui. Ela existe só dentro da Edge
// Function, como segredo do projeto.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

// ---------------------------------------------------------------------------
// FALTA PREENCHER a chave: Dashboard → Settings → API → "anon public".
// (Só a chave "anon". Nunca a "service_role" — essa dá acesso irrestrito e vive
//  apenas como segredo da Edge Function.)
// ---------------------------------------------------------------------------
export const SUPABASE_URL = "https://nvnaxawszomhjqrmziqi.supabase.co";
export const SUPABASE_ANON_KEY = "COLE_AQUI_A_CHAVE_ANON";

export const URL_ENVIAR_PEDIDO = `${SUPABASE_URL}/functions/v1/enviar-pedido`;

/** Falso enquanto os dois valores acima forem os do exemplo. */
export const CONFIGURADO = !SUPABASE_URL.includes("SEU-PROJETO") &&
  !SUPABASE_ANON_KEY.startsWith("COLE_AQUI");

/**
 * Cliente das páginas públicas.
 *
 * `persistSession: false` é deliberado e importante: sem isso, um moderador que
 * tivesse acabado de usar o painel continuaria autenticado ao abrir
 * oracoes.html — e, pela política de admin, veria os pedidos ainda PENDENTES
 * misturados aos aprovados, numa página pública. Aqui a leitura é sempre como
 * visitante anônimo.
 */
export function clientePublico() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/** Cliente do painel: mantém a sessão do moderador entre recarregamentos. */
export function clienteAdmin() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: "vicentinos-painel",
    },
  });
}

// ---------------------------------------------------------------------------
// Auxiliares compartilhados pelas páginas
// ---------------------------------------------------------------------------

/**
 * Escapa texto para inserção em HTML.
 *
 * Todo conteúdo daqui vem do banco — inclusive texto escrito por desconhecidos
 * e aprovado por um moderador que olhou o sentido, não o HTML. Nada é inserido
 * sem passar por esta função.
 */
export function escapar(texto) {
  return String(texto ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * Data por extenso, curta: "2 de agosto de 2026".
 *
 * Uma data pura do Postgres ("2026-08-02") é interpretada pelo JavaScript como
 * meia-noite UTC — que em Brasília (UTC-3) é o dia ANTERIOR. Ancorar ao meio-dia
 * evita esse erro de um dia, que apareceria justamente em campos de validade.
 */
export function formatarData(iso) {
  if (!iso) return "";
  const texto = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T12:00:00` : iso;
  const d = new Date(texto);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });
}

/** Só aceita http(s) — barra javascript: e data: antes de virar href. */
export function linkSeguro(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch {
    return null;
  }
}
