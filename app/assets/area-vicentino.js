// ============================================================================
// Sessão da Área do Vicentino — uma porta só.
//
// Antes deste arquivo, cada ferramenta interna pedia login por conta própria:
// prontuario.html, prontuario-familia.html e admin.html tinham cada um o seu
// formulário e a sua checagem, e o manual.html tinha usuário e senha fixos no
// código-fonte. Quatro caminhos para a mesma pergunta — "quem é você?" — e a
// resposta valia só na página onde foi dada.
//
// Aqui a pergunta é feita uma vez, em area-vicentino.html, e a resposta vale
// para as três ferramentas.
//
// Nada disto é a fronteira de segurança. O que protege os dados é a RLS do
// Postgres: `is_membro_area()` é consultada aqui só para decidir o que a tela
// mostra, e é a MESMA função que as políticas do banco aplicam do lado de lá.
// Um visitante que edite este arquivo no próprio navegador não ganha um byte.
// ============================================================================

import { clienteAdmin, CONFIGURADO } from './supabase-client.js';

export { CONFIGURADO };

/** A tela de login e o hub das ferramentas moram na mesma página. */
export const PAGINA_AREA = 'area-vicentino.html';

/**
 * O cliente da Área.
 *
 * `clienteAdmin()` guarda a sessão em `storageKey: "vicentinos-painel"` — o
 * mesmo nome de antes, de propósito: quem já estava logado no painel ou no
 * prontuário continua logado depois desta mudança, sem precisar entrar de novo.
 */
export const sb = clienteAdmin();

/**
 * Páginas para as quais o login pode devolver a pessoa depois de entrar.
 *
 * Existe para fechar o redirecionamento aberto: sem a lista, um link como
 * `area-vicentino.html?destino=https://site-falso/...` levaria o confrade
 * recém-autenticado para fora daqui, e a barra de endereço diria que ele veio
 * do site da Conferência. Só nome de arquivo desta pasta entra, e a query
 * string é aceita apenas na forma `?id=<uuid>` que o prontuário usa.
 */
const DESTINOS = new Set([
  'manual.html',
  'prontuario.html',
  'prontuario-familia.html',
  'admin.html',
]);

const QUERY_ACEITA = /^\?id=[0-9a-f-]{1,40}$/i;

/** Devolve o destino se for um dos internos conhecidos; senão, null. */
export function destinoSeguro(bruto) {
  if (!bruto) return null;
  const [arquivo, ...resto] = String(bruto).split('?');
  if (!DESTINOS.has(arquivo)) return null;
  if (!resto.length) return arquivo;
  const query = '?' + resto.join('?');
  return QUERY_ACEITA.test(query) ? arquivo + query : null;
}

/** O endereço atual, no formato que `destinoSeguro()` aceita de volta. */
function paginaAtual() {
  return window.location.pathname.split('/').pop() + window.location.search;
}

/**
 * Quem está logado, se é da Área e como se chama.
 *
 * Devolve `{ session, nome }` ou `null`. Estar autenticado no Supabase não
 * basta: a conta precisa estar em `confrades` (ativa) ou em `admins` — é o que
 * `is_membro_area()` responde.
 */
export async function sessaoDaArea() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return null;

  const { data: ehMembro, error } = await sb.rpc('is_membro_area');
  if (error || !ehMembro) {
    // Sessão válida numa conta sem acesso é pior que nenhuma sessão: a pessoa
    // ficaria presa numa tela vazia sem entender o motivo. Encerra-se aqui.
    await sb.auth.signOut();
    return null;
  }

  const { data: confrade } = await sb.from('confrades')
    .select('nome_completo').eq('user_id', session.user.id).maybeSingle();

  return { session, nome: confrade?.nome_completo || session.user.email };
}

/**
 * Porteiro das páginas internas.
 *
 * Sem acesso, manda para a tela de login guardando o destino, para que entrar
 * devolva a pessoa exatamente à página que ela tentou abrir — inclusive o
 * prontuário de uma família específica, com o `?id=` preservado.
 *
 * `location.replace` em vez de `location.href`: a página negada não fica no
 * histórico, senão o "voltar" do navegador cairia no gate de novo, em laço.
 */
export async function exigirAcesso() {
  const acesso = await sessaoDaArea();
  if (acesso) return acesso;
  window.location.replace(
    `${PAGINA_AREA}?destino=${encodeURIComponent(paginaAtual())}`);
  return null;
}

/** Encerra a sessão das três ferramentas de uma vez e volta para a Área. */
export async function sair() {
  await sb.auth.signOut();
  window.location.href = PAGINA_AREA;
}
