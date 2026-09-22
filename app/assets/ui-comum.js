// ============================================================================
// Navegação e notificação das páginas internas.
//
// As doze páginas do site são arquivos HTML soltos, sem build nem template —
// o único mecanismo de reúso do projeto é "extrai para assets/ e importa em
// cada página". É o que este módulo faz, pelo mesmo motivo registrado no topo
// de `prontuario.css`: duas cópias do mesmo bloco já divergiram antes.
//
// A navegação é montada em JS (e não copiada em seis HTMLs) justamente para
// que um destino novo entre em um lugar só.
// ============================================================================

import { escapar } from './supabase-client.js';

// ---------------------------------------------------------------------------
// Navegação
// ---------------------------------------------------------------------------

/**
 * Destinos internos, na ordem em que aparecem no hub.
 *
 * `somenteAdmin` espelha a regra que o hub já aplica ao cartão do Dashboard:
 * o item só é exibido para quem passa em `is_admin()`. Isso é conveniência de
 * interface, não proteção — quem guarda o Dashboard é a checagem da própria
 * página e a RLS do banco.
 */
const DESTINOS = [
  { href: 'prontuario.html', rotulo: 'Prontuário', icone: 'fa-clipboard-list' },
  { href: 'atas.html', rotulo: 'Atas', icone: 'fa-file-signature' },
  { href: 'financeiro.html', rotulo: 'Financeiro', icone: 'fa-sack-dollar' },
  { href: 'financeiro-relatorio.html', rotulo: 'Relatório', icone: 'fa-chart-line' },
  { href: 'admin.html', rotulo: 'Moderação', icone: 'fa-shield-halved' },
  { href: 'prontuario-dashboard.html', rotulo: 'Dashboard', icone: 'fa-chart-column', somenteAdmin: true },
  { href: 'manual.html', rotulo: 'Manual', icone: 'fa-book-open' },
];

const PAGINA_HUB = 'area-vicentino.html';

function paginaAtual() {
  const arquivo = window.location.pathname.split('/').pop();
  return arquivo || 'index.html';
}

/**
 * Monta a navegação dentro da barra `.topo` da página.
 *
 * Fica entre a marca e o bloco do usuário. Diferente de `#topo-usuario`, a
 * navegação **não** espera a sessão resolver: ela aparece de imediato, porque
 * seu propósito é justamente dar uma saída para quem chegou à página errada —
 * inclusive antes de a sessão carregar.
 *
 * @param {{ ehAdmin?: boolean }} opcoes
 */
export function montarNavegacao({ ehAdmin = false } = {}) {
  const barra = document.querySelector('.topo-inner');
  if (!barra || barra.querySelector('.vic-nav')) return;

  const atual = paginaAtual();
  // Páginas de detalhe não têm item próprio (só se chega nelas por um registro
  // da lista); o item da lista correspondente fica marcado para situar quem
  // está lá.
  const EQUIVALENTE = {
    'prontuario-familia.html': 'prontuario.html',
    'ata.html': 'atas.html',
  };
  const equivalente = EQUIVALENTE[atual] || atual;

  const itens = DESTINOS
    .filter(d => !d.somenteAdmin || ehAdmin)
    .map(d => {
      const ativo = d.href === equivalente ? ' aria-current="page"' : '';
      return `<a href="${d.href}"${ativo}><i class="fa-solid ${d.icone}" aria-hidden="true"></i> ${escapar(d.rotulo)}</a>`;
    })
    .join('');

  const caixa = document.createElement('div');
  caixa.className = 'vic-topo-nav';
  caixa.innerHTML =
    `<button type="button" class="vic-nav-toggle" id="vic-nav-toggle" aria-expanded="false" aria-controls="vic-nav">` +
      `<i class="fa-solid fa-bars" aria-hidden="true"></i> Menu</button>` +
    `<nav class="vic-nav" id="vic-nav" aria-label="Seções da Área do Vicentino">` +
      `<a href="${PAGINA_HUB}" class="vic-nav-hub">` +
        `<i class="fa-solid fa-arrow-left" aria-hidden="true"></i> Área do Vicentino</a>` +
      itens +
    `</nav>`;

  // Antes do bloco do usuário quando ele existe, senão ao fim da barra.
  const usuario = barra.querySelector('.topo-usuario');
  if (usuario) barra.insertBefore(caixa, usuario);
  else barra.appendChild(caixa);

  const botao = caixa.querySelector('#vic-nav-toggle');
  const nav = caixa.querySelector('#vic-nav');
  botao.addEventListener('click', () => {
    const aberta = nav.classList.toggle('vic-aberta');
    botao.setAttribute('aria-expanded', String(aberta));
  });
}

/**
 * Descobre se o usuário é admin e monta a navegação já com o item do Dashboard.
 *
 * O erro da RPC é tratado como "não é admin" — e de propósito: um item a menos
 * é uma falha segura, enquanto deixar a navegação inteira de fora por causa de
 * uma oscilação de rede tiraria a única saída da página.
 */
export async function montarNavegacaoComPapel(sb) {
  let ehAdmin = false;
  try {
    const { data } = await sb.rpc('is_admin');
    ehAdmin = data === true;
  } catch {
    ehAdmin = false;
  }
  montarNavegacao({ ehAdmin });
}

// ---------------------------------------------------------------------------
// Notificação
// ---------------------------------------------------------------------------

function areaDeToasts() {
  let area = document.getElementById('vic-toasts');
  if (!area) {
    area = document.createElement('div');
    area.id = 'vic-toasts';
    area.className = 'vic-toasts';
    // `polite` para o leitor de tela anunciar sem interromper o que o usuário
    // está digitando — a notificação confirma algo que ele acabou de fazer.
    area.setAttribute('aria-live', 'polite');
    area.setAttribute('aria-atomic', 'false');
    document.body.appendChild(area);
  }
  return area;
}

/**
 * Mostra uma notificação de canto.
 *
 * @param {string} texto  Mensagem já em português, pronta para ler.
 * @param {'ok'|'erro'} tipo
 * @param {{ duracao?: number }} opcoes  Erro fica até ser fechado por padrão.
 */
export function notificar(texto, tipo = 'ok', { duracao } = {}) {
  const area = areaDeToasts();

  const toast = document.createElement('div');
  toast.className = 'vic-toast' + (tipo === 'erro' ? ' vic-erro' : '');
  toast.setAttribute('role', tipo === 'erro' ? 'alert' : 'status');
  toast.innerHTML =
    `<i class="fa-solid ${tipo === 'erro' ? 'fa-circle-exclamation' : 'fa-circle-check'}" aria-hidden="true"></i>` +
    `<span class="vic-toast-texto">${escapar(texto)}</span>` +
    `<button type="button" class="vic-toast-fechar" aria-label="Fechar aviso">` +
      `<i class="fa-solid fa-xmark" aria-hidden="true"></i></button>`;

  const remover = () => {
    if (!toast.isConnected) return;
    toast.classList.add('vic-saindo');
    setTimeout(() => toast.remove(), 200);
  };

  toast.querySelector('.vic-toast-fechar').addEventListener('click', remover);
  area.appendChild(toast);

  // O sucesso some sozinho; o erro fica, porque ele costuma pedir uma ação e
  // sumir sozinho já foi o motivo de um problema passar despercebido.
  const tempo = duracao ?? (tipo === 'erro' ? 0 : 4000);
  if (tempo > 0) setTimeout(remover, tempo);

  return remover;
}

/** Atalho para o caso mais comum: sucesso. */
export function notificarOk(texto) {
  return notificar(texto, 'ok');
}

/** Atalho para o caso mais comum: falha. */
export function notificarErro(texto) {
  return notificar(texto, 'erro');
}
