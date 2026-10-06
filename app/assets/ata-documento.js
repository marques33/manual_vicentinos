// ============================================================================
// A ata como documento — a fonte única do texto da minuta.
//
// A ata sai por três portas: a visualização na tela, a impressão em PDF e o
// arquivo ODT. As três precisam dizer EXATAMENTE a mesma coisa, e é por isso
// que o texto mora aqui e não em cada uma delas. Três cópias da mesma frase
// divergem — é o motivo registrado no topo de `ui-comum.js` para aquele módulo
// existir, e vale igual aqui.
//
// A divisão de trabalho é a seguinte, e convém não misturá-la:
//
//   blocosDaAta()  decide O QUE o documento diz — devolve texto PURO, sem
//                  escape de nenhuma linguagem.
//   htmlDocumento()   escapa para HTML   (usa escapar(), do supabase-client)
//   ata-odt.js        escapa para XML    (escape próprio, lá)
//
// Blocos em texto puro é o que permite dois renderizadores sem escape duplo:
// se este módulo já devolvesse HTML, o ODT receberia `&amp;` dentro de um
// `<text:p>` e o LibreOffice mostraria "&amp;" na tela, literalmente.
//
// O LEIAUTE é o da minuta impressa (fotos `ata- frente.jpeg` e `ata- verso.jpeg`
// na raiz do repositório): frente e verso em páginas separadas, o valor de cada
// campo escrito em cima do pontilhado, o verso em linhas pautadas. Por isso o
// parágrafo não é uma string só — é uma lista de `partes` (texto impresso x
// campo preenchido), e cada renderizador desenha o campo do jeito do seu
// formato. O PONTILHADO, porém, já sai pronto daqui: é texto, e texto é deste
// módulo — assim o PDF e o ODT têm os mesmos pontos no mesmo lugar.
//
// Este módulo não toca no DOM nem no Supabase de propósito — recebe a linha da
// tabela e a lista de presenças, e devolve dados. É o que o torna testável sem
// navegador.
// ============================================================================

import { escapar } from './supabase-client.js';
import {
  LINHAS, TITULO_BLOCO, CONTADORES_ASSISTENCIA, CATEGORIA_ROTULO,
  movimentoPreenchido, contarPresencas,
} from './ata-movimento-caixa.js';

// ---------------------------------------------------------------------------
// O que é fixo na minuta impressa da Conferência.
//
// Estes valores estão no formulário de papel, já impressos — não são campos
// que a secretária preenche. Se a Conferência mudar de Conselho Particular,
// muda aqui, num lugar só.
// ---------------------------------------------------------------------------
export const CONFERENCIA = {
  conselhoMetropolitano: 'Conselho Metropolitano de Brasília',
  titulo: 'MINUTA DA ATA DA CONFERÊNCIA',
  nome: 'Sociedade São Vicente de Paulo - Conferência Nossa Senhora do Carmo PP',
  fundacao: '23/03/1992',
  agregacao: '14/06/1999',
  conselhoParticular: 'Conselho Particular Nossa Senhora de Fátima – PP',
};

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho',
  'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/**
 * O traço que os auxiliares de formatação devolvem para "não informado".
 *
 * Continua existindo porque formatarMoeda() e companhia servem também à tela
 * (ata.html) e às células do Movimento de Caixa. Dentro do texto da minuta ele
 * NÃO aparece: lá o campo vazio é o pontilhado do impresso — ver semLacuna().
 */
const LACUNA = '____________';

/** Desfaz a lacuna dos auxiliares: na minuta, campo vazio é pontilhado. */
const semLacuna = (v) => (v === LACUNA ? '' : String(v ?? '').trim());

// ---------------------------------------------------------------------------
// As partes de um parágrafo
//
// Três tipos, que são as três coisas que existem na folha impressa:
//
//   texto   o que vem impresso no formulário ("Aos", "dias do mês de")
//   campo   o pontilhado da frente, com o valor escrito em cima dele
//   linha   o traço contínuo do verso ("Eu ______ lavrei a presente ata")
//
// Cada parte leva `texto` já pronto para ser posto na página; o renderizador só
// escapa e, no caso de `linha`, sublinha. `valor` vai junto, cru, para os testes.
// ---------------------------------------------------------------------------

/** Espaço de largura zero: deixa a linha quebrar no meio do pontilhado. */
const ZWSP = '​';
/** Espaço que não quebra — e que, ao contrário do espaço comum, se sublinha. */
const NBSP = ' ';

/**
 * O pontilhado de um campo da frente, com o valor no meio: "...243...".
 *
 * Vazio, vira uma fileira de pontos do tamanho que o campo tem no papel, com
 * uma oportunidade de quebra a cada cinco — sem isso a fileira inteira seria
 * uma "palavra" só, empurrada inteira para a linha de baixo, e o pontilhado não
 * correria até a margem como corre no impresso.
 */
export function pontilhado(valor, tamanho = 12) {
  const v = String(valor ?? '').trim();
  if (v) return `${ZWSP}...${v}...${ZWSP}`;
  let pontos = '';
  for (let i = 0; i < tamanho; i++) pontos += (i % 5 === 0 ? ZWSP : '') + '.';
  return pontos + ZWSP;
}

/** O traço do verso: o valor sublinhado, ou espaços sublinhados se vazio. */
export function sublinhado(valor, tamanho = 40) {
  const v = String(valor ?? '').trim();
  return v ? `${NBSP}${v}${NBSP}` : NBSP.repeat(tamanho);
}

const impresso = (t, extra = {}) => ({ tipo: 'texto', texto: t, ...extra });
const campo = (valor, tamanho) => ({ tipo: 'campo', valor: String(valor ?? '').trim(), texto: pontilhado(valor, tamanho) });
const linha = (valor, tamanho) => ({ tipo: 'linha', valor: String(valor ?? '').trim(), texto: sublinhado(valor, tamanho) });

/** Um bloco de parágrafo a partir das partes; `texto` é a versão corrida. */
function paragrafo(tipo, partes) {
  return { tipo, partes, texto: partes.map(p => p.texto).join('') };
}

/**
 * Dia e mês separados, porque a minuta diz "Aos ___ dias do mês de ___".
 *
 * Ancorada ao meio-dia pelo mesmo motivo de `formatarData()` em
 * supabase-client.js: uma data pura do Postgres ("2026-09-19") é lida pelo
 * JavaScript como meia-noite UTC, que em Brasília é o dia ANTERIOR — e aqui
 * isso escreveria a data errada dentro de um documento assinado.
 */
export function diaEMes(iso) {
  if (!iso) return { dia: LACUNA, mes: LACUNA, ano: LACUNA };
  const texto = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T12:00:00` : iso;
  const d = new Date(texto);
  if (Number.isNaN(d.getTime())) return { dia: LACUNA, mes: LACUNA, ano: LACUNA };
  return { dia: String(d.getDate()), mes: MESES[d.getMonth()], ano: String(d.getFullYear()) };
}

/** "17:00:00" → "17"; "17:30:00" → "17h30". A minuta diz "às ___ horas". */
export function horaPorExtenso(hora) {
  if (!hora) return LACUNA;
  const [h, m] = String(hora).split(':');
  if (h === undefined) return LACUNA;
  return Number(m) ? `${Number(h)}h${m}` : String(Number(h));
}

/** Valor em reais, ou a lacuna quando a tesoureira ainda não informou. */
export function formatarMoeda(valor) {
  if (valor === null || valor === undefined || valor === '') return LACUNA;
  const n = Number(valor);
  if (!Number.isFinite(n)) return LACUNA;
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Os nomes de quem esteve presente, na ordem em que a lista veio.
 *
 * Lê `nome` da própria linha de presença, e não de `confrades`: a coluna é
 * uma cópia feita no dia da reunião, justamente para que renomear alguém no
 * cadastro não reescreva ata antiga (ver a migração 023).
 */
export function nomesPorSituacao(presencas, situacao) {
  return (presencas || [])
    .filter(p => p.situacao === situacao)
    .map(p => String(p.nome || '').trim())
    .filter(Boolean);
}

/**
 * Texto livre de várias linhas → um parágrafo por linha.
 *
 * Existe porque ODF não quebra parágrafo em "\n": cada linha precisa virar um
 * `<text:p>` próprio. Devolver a lista já partida deixa os dois renderizadores
 * com a mesma contagem de parágrafos — e sem isso o ODT sairia com as três
 * notícias das famílias grudadas numa linha só.
 */
export function emParagrafos(texto) {
  const linhas = String(texto ?? '')
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);
  return linhas.length ? linhas : [];
}

// ---------------------------------------------------------------------------
// O documento
// ---------------------------------------------------------------------------

/**
 * A ata inteira como uma lista de blocos, na ordem do formulário impresso.
 *
 * Tipos de bloco (os de parágrafo trazem `partes`; todos trazem `texto`):
 *   cabecalho   — a bandeira e o Conselho Metropolitano
 *   titulo      — "MINUTA DA ATA DA CONFERÊNCIA", itálico sublinhado
 *   subtitulo   — o nome da Conferência
 *   corpo       — parágrafo corrido da frente, com os campos pontilhados
 *   pagina      — quebra de página: a frente acaba, começa o verso
 *   secao       — título em negrito do verso (pode seguir texto comum)
 *   pauta       — uma linha pautada do verso, escrita ou em branco
 *   item        — "Escalas de visitas…: ____", "Privilegiados…: ____"
 *   fecho       — as duas frases finais
 *   tabela      — a grade do Movimento de Caixa (anexo, página própria)
 *
 * @param {object} ata        linha de public.atas
 * @param {Array}  presencas  linhas de public.atas_presencas desta ata
 * @returns {Array<{tipo: string, texto: string, partes?: Array}>}
 */
export function blocosDaAta(ata = {}, presencas = []) {
  const b = [];
  const { dia, mes } = diaEMes(ata.data_reuniao);
  const presentes = nomesPorSituacao(presencas, 'presente');
  const justificados = nomesPorSituacao(presencas, 'justificado');
  const moeda = (v) => campo(semLacuna(formatarMoeda(v)), 14);

  // ========================== FRENTE ======================================
  b.push({ tipo: 'cabecalho', texto: CONFERENCIA.conselhoMetropolitano });
  b.push({ tipo: 'titulo', texto: CONFERENCIA.titulo });
  b.push({ tipo: 'subtitulo', texto: CONFERENCIA.nome });

  // "Justificativas" reúne o texto livre do campo e os nomes marcados como
  // justificados na lista de presença — no papel é um pontilhado só, e quem lê
  // a ata quer os dois no mesmo lugar.
  const justificativas = [
    justificados.join(', '),
    String(ata.justificativas ?? '').trim(),
  ].filter(Boolean).join('. ');

  const tipoReuniao = ata.tipo === 'extraordinaria' ? 'extraordinária' : 'ordinária';

  // O texto abaixo é o do impresso, palavra por palavra, inclusive onde ele
  // cola o campo na palavra seguinte ("número....Louvado"). As únicas emendas
  // são de ortografia ("consócia", "seguintes", "auxílio"), na mesma linha da
  // correção de "esse foi aprovada" no verso.
  b.push(paragrafo('corpo', [
    impresso(`Fundada em ${CONFERENCIA.fundacao} e agregada em ${CONFERENCIA.agregacao}. ` +
      `Vinculada ao ${CONFERENCIA.conselhoParticular}. ` +
      `Ata da reunião ${tipoReuniao} de número`),
    campo(ata.numero, 10),
    impresso('Louvado Seja Nosso Senhor Jesus Cristo! Aos'),
    campo(semLacuna(dia), 6),
    impresso(' dias do mês de '),
    campo(semLacuna(mes), 12),
    impresso('às '),
    campo(semLacuna(horaPorExtenso(ata.hora)), 5),
    impresso('horas, na sala'),
    campo(ata.local, 40),
    impresso(' iniciou-se mais uma reunião dessa Conferência, presidida pela ' +
      '(confrade ou consócia) '),
    campo(ata.presidida_por, 34),
    impresso(' Com a presença dos seguintes associados'),
    campo(presentes.join(', '), 90),
    impresso('Visitantes'),
    campo(ata.visitantes, 30),
    impresso('Justificativas:'),
    campo(justificativas, 70),
  ]));

  b.push(paragrafo('corpo', [
    impresso('Aberta a reunião com as orações tradicionais, em seguida foi feita a leitura '),
    campo(ata.leitura_obra, 60),
    impresso('retirada:'),
    campo(ata.leitura_trecho, 40),
    impresso('a qual foi comentada pelos presentes. Em seguida foi feita a leitura ' +
      'da Ata da reunião anterior, a mesma foi posta em discussão, sendo aprovada ' +
      'sem ressalvas. A tesoureira apresentou o estado do caixa, que foi o ' +
      'seguinte: saldo anterior '),
    moeda(ata.saldo_anterior),
    impresso(' coleta'), moeda(ata.coleta),
    impresso('outras fontes'), moeda(ata.outras_fontes),
    impresso('soma da receita'), moeda(ata.soma_receita),
    impresso('auxílio financeiro aos assistidos'), moeda(ata.auxilio_assistidos),
    impresso('despesas diversas'), moeda(ata.despesas_diversas),
    impresso('décima '), moeda(ata.decima),
    impresso(' soma da despesa:'), moeda(ata.soma_despesa),
    impresso('saldo atual'), moeda(ata.saldo_atual),
  ]));

  // =========================== VERSO ======================================
  b.push({ tipo: 'pagina', texto: '' });

  b.push(paragrafo('secao', [impresso('Notícias das famílias e outras notícias:', { negrito: true })]));
  empurrarPautas(b, ata.noticias_familias, 7);

  // A instrução impressa. O papel traz "esse foi aprovada ou não", que é erro de
  // digitação do impresso — a leitura correta é "e se foi aprovada ou não", e é
  // ela que vai para o documento gerado.
  b.push(paragrafo('secao', [
    impresso('Expediente da Conferência', { negrito: true }),
    impresso(' (resumo das notícias dos Conselhos e fatos ocorridos e decididos ' +
      'na Conferência). Quando houver sindicância, não deixar de anotar o nome, ' +
      'endereço, e se foi aprovada ou não.'),
  ]));
  empurrarPautas(b, ata.expediente, 3);

  empurrarItem(b, [impresso('Escalas de visitas às famílias: ')], ata.escala_visitas, 62);
  // Só "Privilegiados" em negrito: é como está no impresso.
  empurrarItem(b, [impresso('Privilegiados', { negrito: true }), impresso(' da semana: ')],
    ata.privilegiados, 70);

  b.push(paragrafo('fecho', [
    impresso('Nada mais havendo a tratar, a reunião foi encerrada com as orações.'),
  ]));
  b.push(paragrafo('fecho', [
    impresso('Eu '),
    linha(ata.redigida_por, 56),
    impresso('lavrei a presente ata, que após lida e aprovada, será assinada pelos presentes.'),
  ]));

  // ==================== ANEXO: Movimento de Caixa =========================
  // A folha da tesouraria que vai ao Conselho Particular NÃO faz parte da
  // minuta impressa — é outro formulário. Sai depois do verso, em página
  // própria, para a minuta ficar idêntica ao papel sem que a folha se perca.
  // E só quando há o que mostrar: ata lavrada antes desta folha existir tem os
  // nove campos da minuta (que a frente já recitou) e nenhuma das 36 linhas.
  if (movimentoPreenchido(ata)) {
    b.push({ tipo: 'pagina', texto: '' });
    empurrarMovimento(b, ata, presencas);
  }

  return b;
}

/**
 * As linhas pautadas do verso: uma por parágrafo do texto, e linhas em branco
 * até completar o mínimo que o impresso oferece — a ata impressa continua
 * servindo para acrescentar à mão, como o papel servia.
 */
function empurrarPautas(blocos, texto, minimo) {
  const linhas = emParagrafos(texto);
  for (const l of linhas) blocos.push({ tipo: 'pauta', texto: l });
  for (let i = linhas.length; i < minimo; i++) blocos.push({ tipo: 'pauta', texto: '' });
}

/**
 * "Rótulo: ______" do verso. A primeira linha do texto vai sobre o traço, ao
 * lado do rótulo; as seguintes descem para linhas pautadas — no papel, quem
 * escreve a escala de três duplas continua na linha de baixo.
 */
function empurrarItem(blocos, rotulo, texto, tamanho) {
  const [primeira = '', ...resto] = emParagrafos(texto);
  blocos.push(paragrafo('item', [...rotulo, linha(primeira, tamanho)]));
  for (const l of resto) blocos.push({ tipo: 'pauta', texto: l });
}

// ---------------------------------------------------------------------------
// O Movimento de Caixa dentro do documento
//
// Sai como TABELA, e não como prosa. O formulário do Conselho é uma grade
// numerada, e o número da linha é como ele é lido — "a linha 24 está em branco"
// é a frase que a tesoureira ouve do Conselho Particular. Uma versão em prosa
// perderia exatamente o que faz a folha ser conferível.
//
// O bloco `tabela` carrega a grade em `tabela: { cabecalho, linhas }`, ainda em
// TEXTO PURO — o escape é de quem renderiza, como todo o resto deste módulo.
// ---------------------------------------------------------------------------

/** Uma quantidade da folha (linhas 31 a 33), ou a lacuna. */
function formatarQuantidade(valor, unidade) {
  if (valor === null || valor === undefined || valor === '') return LACUNA;
  const n = Number(valor);
  if (!Number.isFinite(n)) return LACUNA;
  // Sem casa decimal quando é contagem redonda: "12 un", não "12,00 un".
  const texto = Number.isInteger(n) ? String(n) : n.toLocaleString('pt-BR', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
  return `${texto} ${unidade === 'kg' ? 'kg' : 'un'}`;
}

function empurrarMovimento(blocos, ata, presencas) {
  // Página solta precisa dizer de que ata é — o anexo pode ser grampeado ou
  // conferido separado da minuta.
  const titulo = `Anexo à ata nº ${ata.numero ?? '___'} — Movimento de Caixa`;
  blocos.push(paragrafo('secao', [impresso(titulo, { negrito: true })]));

  // --- O cabeçalho do impresso: assistência e presença --------------------
  const p = contarPresencas(presencas);
  blocos.push({
    tipo: 'tabela',
    texto: 'Assistência e presença na semana',
    tabela: {
      cabecalho: ['', 'Nº', '', 'Nº'],
      linhas: emPares(
        CONTADORES_ASSISTENCIA.map(c => [c.rotulo, contador(ata[c.campo])]),
        [
          ['Presentes na reunião', String(p.presentes)],
          [CATEGORIA_ROTULO.confrade, String(p.confrade)],
          [CATEGORIA_ROTULO.consocia, String(p.consocia)],
          [CATEGORIA_ROTULO.aspirante, String(p.aspirante)],
          ['Visitantes', contador(ata.visitantes_qtd)],
        ]),
    },
  });

  // --- As 36 linhas, um bloco por seção do impresso -----------------------
  for (const bloco of ['receita', 'despesa', 'bens', 'resumo']) {
    const linhas = LINHAS.filter(l => l.bloco === bloco)
      .filter(l => !linhaVazia(l, ata))
      .map(l => [
        String(l.n),
        l.rotuloCampo ? (String(ata[l.rotuloCampo] ?? '').trim() || l.rotulo || LACUNA) : l.rotulo,
        l.unidade ? formatarQuantidade(ata[l.campo], l.unidade) : formatarMoeda(ata[l.campo]),
      ]);
    if (!linhas.length) continue;
    blocos.push({
      tipo: 'tabela',
      texto: TITULO_BLOCO[bloco],
      tabela: {
        cabecalho: ['Nº', 'Discriminação', bloco === 'bens' ? 'Quantidade' : 'Valor (R$)'],
        linhas,
      },
    });
  }
}

/**
 * Linha em branco do impresso que ninguém usou.
 *
 * As linhas 10, 11, 21, 22 e 25 vêm sem rótulo no papel, para a Conferência
 * escrever o que precisar. Quando ficam em branco, some — ao contrário das
 * linhas com rótulo impresso, que aparecem com a lacuna porque o Conselho
 * espera vê-las. A 33 ("Outros") tem rótulo impresso e segue essa regra.
 */
function linhaVazia(l, ata) {
  if (!l.rotuloCampo || l.rotulo) return false;
  const valor = ata[l.campo];
  const rotulo = String(ata[l.rotuloCampo] ?? '').trim();
  return !rotulo && (valor === null || valor === undefined || valor === '');
}

/** Um contador do cabeçalho, ou a lacuna curta que o impresso traz. */
function contador(valor) {
  return valor === null || valor === undefined || valor === '' ? '—' : String(valor);
}

/**
 * Duas listas de pares lado a lado, como as duas colunas do cabeçalho impresso.
 *
 * A lista mais curta recebe células vazias no fim — uma tabela com linhas de
 * larguras diferentes quebraria o ODF, que exige o mesmo número de células em
 * toda linha da tabela.
 */
function emPares(esquerda, direita) {
  const total = Math.max(esquerda.length, direita.length);
  const linhas = [];
  for (let i = 0; i < total; i++) {
    linhas.push([...(esquerda[i] ?? ['', '']), ...(direita[i] ?? ['', ''])]);
  }
  return linhas;
}

// ---------------------------------------------------------------------------
// Renderização em HTML — usada na visualização E na impressão em PDF
// ---------------------------------------------------------------------------

/** A bandeira do cabeçalho — o mesmo PNG que o ODT embute em Pictures/. */
export const URL_BANDEIRA = new URL('./bandeira-brasil.png', import.meta.url).href;

/** As partes de um parágrafo como HTML (ver "As partes de um parágrafo"). */
function htmlPartes(partes = []) {
  return partes.map(p => {
    const t = escapar(p.texto);
    if (p.tipo === 'campo') return `<span class="ata-campo">${t}</span>`;
    if (p.tipo === 'linha') return `<span class="ata-linha">${t}</span>`;
    return p.negrito ? `<strong>${t}</strong>` : t;
  }).join('');
}

/**
 * O documento como HTML.
 *
 * O mesmo HTML serve a tela e o papel: `ata-documento.css` tem um bloco
 * `@media print` que esconde tudo em volta e deixa só `.ata-documento`. Por
 * isso o PDF nunca diverge do que se vê — é literalmente o mesmo DOM, e não um
 * segundo layout desenhado numa API de PDF, que seria a segunda fonte de
 * verdade que este módulo existe para evitar.
 *
 * Cada página do impresso (frente, verso e, se houver, o anexo) é uma
 * `.ata-folha`: na tela, folhas separadas; no papel, `break-before: page`.
 *
 * Todo texto passa por escapar(): ele vem do banco, digitado por uma pessoa,
 * e a regra do projeto não tem exceção.
 */
export function htmlDocumento(ata = {}, presencas = []) {
  const folhas = [[]];
  for (const bloco of blocosDaAta(ata, presencas)) {
    if (bloco.tipo === 'pagina') { folhas.push([]); continue; }
    folhas[folhas.length - 1].push(htmlBloco(bloco));
  }
  return `<article class="ata-documento">` +
    folhas.map(f => `<section class="ata-folha">${f.join('')}</section>`).join('') +
    `</article>`;
}

function htmlBloco(bloco) {
  const t = escapar(bloco.texto);
  switch (bloco.tipo) {
    case 'tabela':     return htmlTabela(bloco);
    case 'cabecalho':
      // `div`, e não `header`: várias páginas deste site trazem um <style>
      // grande com regra para o seletor de elemento `header` (em
      // area-vicentino.html ele é fixo no topo, com fundo vinho). Um
      // documento que se deforma conforme a página que o exibe não serve —
      // e a classe já diz o que o bloco é.
      //
      // <img> e não fundo CSS: imagem de conteúdo sai na impressão mesmo com
      // "Gráficos de segundo plano" desmarcado no diálogo do Chrome.
      return `<div class="ata-cabecalho">` +
        `<img class="ata-bandeira" src="${escapar(URL_BANDEIRA)}" alt="">` +
        `<span class="ata-conselho">${t}</span></div>`;
    case 'titulo':     return `<h1 class="ata-titulo">${t}</h1>`;
    case 'subtitulo':  return `<p class="ata-subtitulo">${t}</p>`;
    case 'corpo':      return `<p class="ata-corpo">${htmlPartes(bloco.partes)}</p>`;
    case 'secao':      return `<h2 class="ata-secao">${htmlPartes(bloco.partes)}</h2>`;
    // Linha em branco leva um espaço que não quebra: parágrafo vazio tem
    // altura zero, e a pauta sumiria.
    case 'pauta':      return `<p class="ata-pauta">${t || '&nbsp;'}</p>`;
    case 'item':       return `<p class="ata-item">${htmlPartes(bloco.partes)}</p>`;
    case 'fecho':      return `<p class="ata-fecho">${htmlPartes(bloco.partes)}</p>`;
    default:           return `<p>${t}</p>`;
  }
}

/**
 * Um bloco `tabela` como <table>.
 *
 * `<caption>` e não um parágrafo antes da tabela: o título PERTENCE à tabela, e
 * é assim que um leitor de tela o anuncia ao entrar nela. A célula de número da
 * linha é `<th scope="row">` pelo mesmo motivo — o número é o nome da linha no
 * formulário do Conselho, não um dado dela.
 *
 * Célula vazia (as do preenchimento de `emPares`) sai sem conteúdo em vez de
 * sumir: tabela com linhas de larguras diferentes não é tabela.
 */
function htmlTabela(bloco) {
  const { cabecalho = [], linhas = [] } = bloco.tabela || {};
  const temNumero = cabecalho[0] === 'Nº';

  const thead = cabecalho.length
    ? `<thead><tr>${cabecalho.map(c =>
        `<th scope="col">${escapar(c)}</th>`).join('')}</tr></thead>`
    : '';

  // Alinhar número à direita é o que deixa a coluna conferível de relance, que
  // é para o que a folha serve. A coluna é "de número" quando o cabeçalho dela
  // diz que é — no bloco de contadores há duas, e não só a última.
  const numerica = cabecalho.map(c => c === 'Nº' || c === 'Valor (R$)' || c === 'Quantidade');

  const tbody = linhas.map(linha => {
    const celulas = linha.map((celula, i) => {
      if (temNumero && i === 0) {
        return `<th scope="row" class="ata-tabela-numero">${escapar(celula)}</th>`;
      }
      const classe = numerica[i] ? ' class="ata-tabela-valor"' : '';
      return `<td${classe}>${escapar(celula)}</td>`;
    }).join('');
    return `<tr>${celulas}</tr>`;
  }).join('');

  return `<table class="ata-tabela">` +
    `<caption class="ata-tabela-titulo">${escapar(bloco.texto)}</caption>` +
    `${thead}<tbody>${tbody}</tbody></table>`;
}

/**
 * Nome de arquivo da exportação: "Ata-244-2026-09-19".
 *
 * Sem extensão — quem chama acrescenta. Só ASCII e hífen: acento e barra em
 * nome de arquivo baixado já quebraram download em Windows.
 */
export function nomeDoArquivo(ata = {}) {
  const numero = ata.numero ?? 'sem-numero';
  const data = /^\d{4}-\d{2}-\d{2}/.test(String(ata.data_reuniao ?? ''))
    ? String(ata.data_reuniao).slice(0, 10)
    : 'sem-data';
  return `Ata-${numero}-${data}`;
}
