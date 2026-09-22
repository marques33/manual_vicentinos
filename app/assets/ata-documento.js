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
// Este módulo não toca no DOM nem no Supabase de propósito — recebe a linha da
// tabela e a lista de presenças, e devolve dados. É o que o torna testável sem
// navegador.
// ============================================================================

import { escapar } from './supabase-client.js';

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

/** O traço que ocupa, no documento, o lugar de um campo não preenchido. */
const LACUNA = '____________';

/** Valor, ou a lacuna — para que a ata impressa mostre onde falta algo. */
function ou(valor, lacuna = LACUNA) {
  const texto = String(valor ?? '').trim();
  return texto || lacuna;
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
 * Tipos de bloco:
 *   cabecalho   — o Conselho Metropolitano (na tela vem com a bandeira)
 *   titulo      — "MINUTA DA ATA DA CONFERÊNCIA"
 *   subtitulo   — o nome da Conferência
 *   corpo       — parágrafo corrido do texto da minuta
 *   secao       — título em negrito do verso ("Notícias das famílias…")
 *   nota        — a instrução impressa em letra miúda do formulário
 *   livre       — uma linha de campo de texto livre preenchido
 *   vazio       — campo livre sem conteúdo (vira a lacuna pontilhada)
 *   fecho       — as duas frases finais
 *
 * @param {object} ata        linha de public.atas
 * @param {Array}  presencas  linhas de public.atas_presencas desta ata
 * @returns {Array<{tipo: string, texto: string}>}
 */
export function blocosDaAta(ata = {}, presencas = []) {
  const b = [];
  const { dia, mes } = diaEMes(ata.data_reuniao);
  const presentes = nomesPorSituacao(presencas, 'presente');
  const justificados = nomesPorSituacao(presencas, 'justificado');

  b.push({ tipo: 'cabecalho', texto: CONFERENCIA.conselhoMetropolitano });
  b.push({ tipo: 'titulo', texto: CONFERENCIA.titulo });
  b.push({ tipo: 'subtitulo', texto: CONFERENCIA.nome });

  // --- Abertura: um parágrafo só, como no papel ----------------------------
  // "Justificativas" reúne o texto livre do campo e os nomes marcados como
  // justificados na lista de presença — no papel é uma linha só, e quem lê a
  // ata quer os dois na mesma frase.
  const justificativas = [
    justificados.join(', '),
    String(ata.justificativas ?? '').trim(),
  ].filter(Boolean).join('. ');

  const tipoReuniao = ata.tipo === 'extraordinaria' ? 'extraordinária' : 'ordinária';

  b.push({
    tipo: 'corpo',
    texto:
      `Fundada em ${CONFERENCIA.fundacao} e agregada em ${CONFERENCIA.agregacao}. ` +
      `Vinculada ao ${CONFERENCIA.conselhoParticular}. ` +
      `Ata da reunião ${tipoReuniao} de número ${ou(ata.numero)}. ` +
      `Louvado Seja Nosso Senhor Jesus Cristo! ` +
      `Aos ${dia} dias do mês de ${mes} às ${horaPorExtenso(ata.hora)} horas, ` +
      `na sala ${ou(ata.local)} iniciou-se mais uma reunião dessa Conferência, ` +
      `presidida pela (confrade ou consócia) ${ou(ata.presidida_por)}. ` +
      `Com a presença dos seguintes associados: ${ou(presentes.join(', '))}. ` +
      `Visitantes: ${ou(ata.visitantes)}. ` +
      `Justificativas: ${ou(justificativas)}.`,
  });

  // --- Leitura espiritual e caixa ------------------------------------------
  b.push({
    tipo: 'corpo',
    texto:
      `Aberta a reunião com as orações tradicionais, em seguida foi feita a leitura ` +
      `${ou(ata.leitura_obra)} retirada: ${ou(ata.leitura_trecho)} ` +
      `a qual foi comentada pelos presentes. Em seguida foi feita a leitura da Ata ` +
      `da reunião anterior, a mesma foi posta em discussão, sendo aprovada sem ` +
      `ressalvas. A tesoureira apresentou o estado do caixa, que foi o seguinte: ` +
      `saldo anterior ${formatarMoeda(ata.saldo_anterior)}, ` +
      `coleta ${formatarMoeda(ata.coleta)}, ` +
      `outras fontes ${formatarMoeda(ata.outras_fontes)}, ` +
      `soma da receita ${formatarMoeda(ata.soma_receita)}, ` +
      `auxílio financeiro aos assistidos ${formatarMoeda(ata.auxilio_assistidos)}, ` +
      `despesas diversas ${formatarMoeda(ata.despesas_diversas)}, ` +
      `décima ${formatarMoeda(ata.decima)}, ` +
      `soma da despesa ${formatarMoeda(ata.soma_despesa)}, ` +
      `saldo atual ${formatarMoeda(ata.saldo_atual)}.`,
  });

  // --- Verso ---------------------------------------------------------------
  b.push({ tipo: 'secao', texto: 'Notícias das famílias e outras notícias:' });
  empurrarLivre(b, ata.noticias_familias);

  b.push({ tipo: 'secao', texto: 'Expediente da Conferência' });
  // A instrução impressa no formulário. O papel traz "esse foi aprovada ou
  // não", que é erro de digitação do impresso — a leitura correta é "e se foi
  // aprovada ou não", e é ela que vai para o documento gerado.
  b.push({
    tipo: 'nota',
    texto:
      '(resumo das notícias dos Conselhos e fatos ocorridos e decididos na ' +
      'Conferência). Quando houver sindicância, não deixar de anotar o nome, ' +
      'endereço, e se foi aprovada ou não.',
  });
  empurrarLivre(b, ata.expediente);

  b.push({ tipo: 'secao', texto: 'Escalas de visitas às famílias:' });
  empurrarLivre(b, ata.escala_visitas);

  b.push({ tipo: 'secao', texto: 'Privilegiados da semana:' });
  empurrarLivre(b, ata.privilegiados);

  b.push({ tipo: 'fecho', texto: 'Nada mais havendo a tratar, a reunião foi encerrada com as orações.' });
  b.push({
    tipo: 'fecho',
    texto: `Eu ${ou(ata.redigida_por)} lavrei a presente ata, que após lida e ` +
      `aprovada, será assinada pelos presentes.`,
  });

  return b;
}

/** Campo de texto livre: uma linha por parágrafo, ou a lacuna se vier vazio. */
function empurrarLivre(blocos, texto) {
  const paragrafos = emParagrafos(texto);
  if (!paragrafos.length) {
    blocos.push({ tipo: 'vazio', texto: LACUNA });
    return;
  }
  for (const p of paragrafos) blocos.push({ tipo: 'livre', texto: p });
}

// ---------------------------------------------------------------------------
// Renderização em HTML — usada na visualização E na impressão em PDF
// ---------------------------------------------------------------------------

/**
 * O documento como HTML.
 *
 * O mesmo HTML serve a tela e o papel: `ata-documento.css` tem um bloco
 * `@media print` que esconde tudo em volta e deixa só `.ata-documento`. Por
 * isso o PDF nunca diverge do que se vê — é literalmente o mesmo DOM, e não um
 * segundo layout desenhado numa API de PDF, que seria a segunda fonte de
 * verdade que este módulo existe para evitar.
 *
 * Todo texto passa por escapar(): ele vem do banco, digitado por uma pessoa,
 * e a regra do projeto não tem exceção.
 */
export function htmlDocumento(ata = {}, presencas = []) {
  const partes = blocosDaAta(ata, presencas).map(bloco => {
    const t = escapar(bloco.texto);
    switch (bloco.tipo) {
      case 'cabecalho':
        // A bandeira só existe na tela e no papel; o ODT leva o cabeçalho em
        // texto (embutir imagem em ODF exigiria membro binário no pacote).
        //
        // `div`, e não `header`: várias páginas deste site trazem um <style>
        // grande com regra para o seletor de elemento `header` (em
        // area-vicentino.html ele é fixo no topo, com fundo vinho). Um
        // documento que se deforma conforme a página que o exibe não serve —
        // e a classe já diz o que o bloco é.
        return `<div class="ata-cabecalho">` +
          `<span class="ata-bandeira" aria-hidden="true"></span>` +
          `<span class="ata-conselho">${t}</span></div>`;
      case 'titulo':     return `<h1 class="ata-titulo">${t}</h1>`;
      case 'subtitulo':  return `<p class="ata-subtitulo">${t}</p>`;
      case 'corpo':      return `<p class="ata-corpo">${t}</p>`;
      case 'secao':      return `<h2 class="ata-secao">${t}</h2>`;
      case 'nota':       return `<p class="ata-nota">${t}</p>`;
      case 'livre':      return `<p class="ata-livre">${t}</p>`;
      case 'vazio':      return `<p class="ata-livre ata-lacuna">${t}</p>`;
      case 'fecho':      return `<p class="ata-fecho">${t}</p>`;
      default:           return `<p>${t}</p>`;
    }
  });

  return `<article class="ata-documento">${partes.join('')}</article>`;
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
