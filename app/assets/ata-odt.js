// ============================================================================
// A ata como arquivo ODT (OpenDocument Text).
//
// Um .odt não é um formato de texto: é um ZIP com quatro membros —
//
//   mimetype                 (a string do tipo, sem compressão, PRIMEIRO)
//   META-INF/manifest.xml    (o índice do pacote)
//   content.xml              (o texto)
//   styles.xml               (a página e as fontes)
//   meta.xml                 (título e autor, opcional — vai junto)
//
// Duas armadilhas do formato, que produzem um arquivo que o LibreOffice
// RECUSA a abrir e que nenhum teste de status HTTP pegaria:
//
//   1. `mimetype` tem que ser o PRIMEIRO membro do zip e estar ARMAZENADO,
//      não comprimido. É assim que um leitor identifica o arquivo lendo os
//      primeiros bytes, sem descompactar nada. `zipSync` preserva a ordem de
//      inserção das chaves, e o membro recebe `{ level: 0 }`.
//
//   2. `content.xml` é XML, não HTML. "\n" no meio de um `<text:p>` não quebra
//      parágrafo — vira espaço. Por isso os campos de texto livre chegam aqui
//      já partidos em um bloco por linha (emParagrafos(), em ata-documento.js);
//      sem isso, as três notícias das famílias sairiam grudadas numa linha só.
//
// Por que fflate e não JSZip: são ~8 KB contra ~100 KB, e fflate é ESM nativo
// — este projeto não tem bundler, cada `<script type="module">` importa a
// biblioteca direto. `esm.sh` é o mesmo CDN de onde supabase-client.js já
// carrega o supabase-js, então não entra origem nova no site.
//
// Limitação conhecida e deliberada: o cabeçalho sai em TEXTO, sem a bandeira
// que aparece na tela e na impressão. Embutir imagem em ODF exige um membro
// binário em Pictures/, entrada própria no manifesto e um <draw:frame> — custo
// que não se paga aqui, já que o ODT existe justamente para ser aberto e
// ajustado no LibreOffice. Registrado em tasks/todo.md.
// ============================================================================

import { zipSync, strToU8 } from 'https://esm.sh/fflate@0.8.2';
import { blocosDaAta, nomeDoArquivo, CONFERENCIA } from './ata-documento.js';

const MIME = 'application/vnd.oasis.opendocument.text';

/**
 * Escapa texto para dentro de um nó XML.
 *
 * Não reaproveita `escapar()` do supabase-client: aquela é para HTML, e ainda
 * que o resultado dela seja XML válido, este módulo precisa de algo que ela
 * não faz — remover os caracteres de controle que o XML 1.0 PROÍBE. Um \v ou
 * um \x01 colado de outro programa dentro de um campo de texto livre passaria
 * pela `escapar()` intacto e faria o LibreOffice recusar o arquivo inteiro com
 * "erro de formato", sem dizer onde.
 *
 * Permitidos pelo XML 1.0: \t, \n, \r e tudo de 0x20 para cima.
 */
export function escaparXml(texto) {
  return String(texto ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

// ---------------------------------------------------------------------------
// Estilos
//
// Cada tipo de bloco de ata-documento.js tem um estilo de parágrafo aqui. Os
// nomes viajam para dentro do arquivo: quem abrir no LibreOffice vê "Ata
// Corpo" na lista de estilos e consegue mudar a ata inteira de uma vez.
// ---------------------------------------------------------------------------
const ESTILO_POR_TIPO = {
  cabecalho: 'AtaCabecalho',
  titulo:    'AtaTitulo',
  subtitulo: 'AtaSubtitulo',
  corpo:     'AtaCorpo',
  secao:     'AtaSecao',
  nota:      'AtaNota',
  livre:     'AtaLivre',
  vazio:     'AtaLivre',
  fecho:     'AtaFecho',
};

const NS = [
  'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"',
  'xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"',
  'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"',
  'xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"',
  'xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"',
  // O Movimento de Caixa sai como tabela ODF — sem este namespace o
  // LibreOffice recusa o ARQUIVO INTEIRO, não só a tabela.
  'xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"',
].join(' ');

/** Um <style:style> de parágrafo, com as propriedades que interessam. */
function estilo(nome, { alinhar = 'justify', tamanho = '12pt', negrito = false,
  italico = false, sublinhado = false, antes = '0cm', depois = '0.25cm' } = {}) {
  const texto =
    `<style:text-properties fo:font-size="${tamanho}"` +
    (negrito ? ' fo:font-weight="bold"' : '') +
    (italico ? ' fo:font-style="italic"' : '') +
    (sublinhado ? ' style:text-underline-style="solid" style:text-underline-width="auto"' : '') +
    '/>';
  return `<style:style style:name="${nome}" style:family="paragraph" style:parent-style-name="Standard">` +
    `<style:paragraph-properties fo:text-align="${alinhar}" fo:margin-top="${antes}" fo:margin-bottom="${depois}"/>` +
    texto +
    `</style:style>`;
}

const ESTILOS = [
  estilo('AtaCabecalho', { alinhar: 'center', negrito: true, tamanho: '13pt', depois: '0.1cm' }),
  estilo('AtaTitulo', { alinhar: 'center', negrito: true, italico: true, sublinhado: true, tamanho: '14pt', antes: '0.2cm', depois: '0.2cm' }),
  estilo('AtaSubtitulo', { alinhar: 'center', tamanho: '12pt', depois: '0.5cm' }),
  estilo('AtaCorpo', { alinhar: 'justify', depois: '0.4cm' }),
  estilo('AtaSecao', { alinhar: 'left', negrito: true, antes: '0.5cm', depois: '0.2cm' }),
  estilo('AtaNota', { alinhar: 'justify', italico: true, tamanho: '10pt', depois: '0.2cm' }),
  estilo('AtaLivre', { alinhar: 'justify', depois: '0.15cm' }),
  estilo('AtaFecho', { alinhar: 'justify', antes: '0.5cm', depois: '0.3cm' }),
  // Parágrafos DENTRO das células da folha: menores que o corpo, porque a
  // grade tem 36 linhas e precisa caber sem estourar a página.
  estilo('AtaCelula', { alinhar: 'left', tamanho: '9pt', depois: '0cm' }),
  estilo('AtaCelulaNum', { alinhar: 'right', tamanho: '9pt', depois: '0cm' }),
  estilo('AtaCelulaCab', { alinhar: 'left', tamanho: '9pt', negrito: true, depois: '0cm' }),
].join('');

// ---------------------------------------------------------------------------
// A tabela — o Movimento de Caixa
//
// ODF não tem "largura automática de coluna": cada coluna carrega um estilo
// próprio, com a medida em centímetros. A soma tem que dar 17 cm, que é o A4
// menos as duas margens de 2 cm definidas em stylesXml() — passar disso faz o
// LibreOffice empurrar a tabela para fora da mancha de texto, sem avisar.
// ---------------------------------------------------------------------------
const coluna = (nome, largura) =>
  `<style:style style:name="${nome}" style:family="table-column">` +
  `<style:table-column-properties style:column-width="${largura}"/></style:style>`;

const celula = (nome, { fundo = null } = {}) =>
  `<style:style style:name="${nome}" style:family="table-cell">` +
  `<style:table-cell-properties fo:border="0.05pt solid #000000" fo:padding="0.08cm"` +
  `${fundo ? ` fo:background-color="${fundo}"` : ''}/></style:style>`;

const ESTILOS_TABELA = [
  `<style:style style:name="TabMC" style:family="table">` +
    `<style:table-properties style:width="17cm" table:align="margins" ` +
      `fo:margin-top="0.2cm" fo:margin-bottom="0.4cm"/></style:style>`,
  coluna('ColNum', '1.2cm'),   // o número da linha do impresso
  coluna('ColDesc', '12.3cm'), // a discriminação
  coluna('ColVal', '3.5cm'),   // o valor
  coluna('ColRot', '6.3cm'),   // cabeçalho de contadores: rótulo…
  coluna('ColQtd', '2.2cm'),   // …e o número, duas vezes lado a lado
  celula('CelMC'),
  celula('CelMCCab', { fundo: '#e8e8e8' }),
].join('');

/**
 * As larguras de coluna, pela FORMA da tabela.
 *
 * Três colunas é a grade das 36 linhas; quatro é o cabeçalho de contadores, que
 * o impresso traz em duas colunas de rótulo + número lado a lado.
 */
const COLUNAS_POR_FORMA = {
  3: ['ColNum', 'ColDesc', 'ColVal'],
  4: ['ColRot', 'ColQtd', 'ColRot', 'ColQtd'],
};

/** Um bloco `tabela` de ata-documento.js como <table:table>. */
function tabelaOdf(bloco, indice) {
  const { cabecalho = [], linhas = [] } = bloco.tabela || {};
  const forma = cabecalho.length || linhas[0]?.length || 3;
  const colunas = COLUNAS_POR_FORMA[forma]
    // Forma inesperada não pode derrubar a exportação inteira: divide o espaço
    // e segue. Uma ata sem ODT por causa de uma coluna a mais seria troca ruim.
    || Array.from({ length: forma }, () => 'ColDesc');

  // A coluna é "de número" quando o cabeçalho dela diz que é — o mesmo critério
  // de htmlTabela(), para que o ODT e o PDF alinhem igual.
  const numerica = cabecalho.map(c => c === 'Nº' || c === 'Valor (R$)' || c === 'Quantidade');

  const celulaXml = (texto, { ehCabecalho = false, direita = false } = {}) => {
    const estiloP = ehCabecalho ? 'AtaCelulaCab' : (direita ? 'AtaCelulaNum' : 'AtaCelula');
    return `<table:table-cell table:style-name="${ehCabecalho ? 'CelMCCab' : 'CelMC'}" ` +
      `office:value-type="string">` +
      `<text:p text:style-name="${estiloP}">${escaparXml(texto)}</text:p>` +
      `</table:table-cell>`;
  };

  const linhaXml = (celulas, ehCabecalho) =>
    `<table:table-row>` +
    celulas.map((c, i) => celulaXml(c, { ehCabecalho, direita: !!numerica[i] })).join('') +
    `</table:table-row>`;

  // `table:table-header-rows` faz o LibreOffice repetir o cabeçalho quando a
  // grade quebra de página — e a grade das despesas quebra.
  const thead = cabecalho.length
    ? `<table:table-header-rows>${linhaXml(cabecalho, true)}</table:table-header-rows>`
    : '';

  return `<text:p text:style-name="AtaSecao">${escaparXml(bloco.texto)}</text:p>` +
    `<table:table table:name="MovimentoCaixa${indice}" table:style-name="TabMC">` +
    colunas.map(c => `<table:table-column table:style-name="${c}"/>`).join('') +
    thead +
    linhas.map(l => linhaXml(l, false)).join('') +
    `</table:table>`;
}

// ---------------------------------------------------------------------------
// Os quatro (cinco) membros do pacote
// ---------------------------------------------------------------------------

function contentXml(ata, presencas) {
  let tabelas = 0;
  const paragrafos = blocosDaAta(ata, presencas).map(bloco => {
    // Uma tabela NÃO é um parágrafo: em ODF ela é irmã dele dentro de
    // <office:text>, e um <table:table> dentro de um <text:p> é justamente o
    // tipo de XML que o LibreOffice recusa sem dizer onde.
    if (bloco.tipo === 'tabela') return tabelaOdf(bloco, ++tabelas);
    const nome = ESTILO_POR_TIPO[bloco.tipo] || 'AtaCorpo';
    return `<text:p text:style-name="${nome}">${escaparXml(bloco.texto)}</text:p>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<office:document-content ${NS} office:version="1.2">` +
      `<office:automatic-styles>${ESTILOS}${ESTILOS_TABELA}</office:automatic-styles>` +
      `<office:body><office:text>${paragrafos}</office:text></office:body>` +
    `</office:document-content>`;
}

function stylesXml() {
  // A4 retrato com margem de 2 cm — a mesma medida do @media print de
  // ata-documento.css, para que o ODT impresso e o PDF do navegador saiam com
  // a mesma mancha de texto.
  return `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<office:document-styles ${NS} office:version="1.2">` +
      `<office:styles>` +
        `<style:default-style style:family="paragraph">` +
          `<style:text-properties style:font-name="Liberation Serif" fo:font-size="12pt" ` +
            `fo:language="pt" fo:country="BR"/>` +
        `</style:default-style>` +
        `<style:style style:name="Standard" style:family="paragraph" style:class="text"/>` +
      `</office:styles>` +
      `<office:automatic-styles>` +
        `<style:page-layout style:name="pm1">` +
          `<style:page-layout-properties fo:page-width="21cm" fo:page-height="29.7cm" ` +
            `style:print-orientation="portrait" fo:margin-top="2cm" fo:margin-bottom="2cm" ` +
            `fo:margin-left="2cm" fo:margin-right="2cm"/>` +
        `</style:page-layout>` +
      `</office:automatic-styles>` +
      `<office:master-styles>` +
        `<style:master-page style:name="Standard" style:page-layout-name="pm1"/>` +
      `</office:master-styles>` +
    `</office:document-styles>`;
}

function metaXml(ata) {
  const titulo = `Ata ${ata.numero ?? ''} — ${CONFERENCIA.nome}`.trim();
  return `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<office:document-meta ${NS} ` +
      `xmlns:dc="http://purl.org/dc/elements/1.1/" ` +
      `xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0" office:version="1.2">` +
      `<office:meta>` +
        `<meta:generator>Area do Vicentino - Livro de Atas</meta:generator>` +
        `<dc:title>${escaparXml(titulo)}</dc:title>` +
        `<dc:date>${new Date().toISOString().slice(0, 19)}</dc:date>` +
      `</office:meta>` +
    `</office:document-meta>`;
}

function manifestXml() {
  const entrada = (caminho, tipo) =>
    `<manifest:file-entry manifest:full-path="${caminho}" manifest:media-type="${tipo}"/>`;
  return `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<manifest:manifest ` +
      `xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" ` +
      `manifest:version="1.2">` +
      entrada('/', MIME) +
      entrada('content.xml', 'text/xml') +
      entrada('styles.xml', 'text/xml') +
      entrada('meta.xml', 'text/xml') +
    `</manifest:manifest>`;
}

// ---------------------------------------------------------------------------
// Montagem e download
// ---------------------------------------------------------------------------

/**
 * O arquivo .odt da ata, pronto para download.
 *
 * A ORDEM das chaves abaixo é parte do formato, não estilo: `mimetype` precisa
 * ser o primeiro membro do zip. `zipSync` respeita a ordem de inserção do
 * objeto — não reordenar.
 *
 * @returns {Blob}
 */
export function odtDaAta(ata = {}, presencas = []) {
  const zip = zipSync({
    // level 0 = armazenado, sem compressão. Exigência do OpenDocument.
    'mimetype': [strToU8(MIME), { level: 0 }],
    'META-INF/manifest.xml': strToU8(manifestXml()),
    'content.xml': strToU8(contentXml(ata, presencas)),
    'styles.xml': strToU8(stylesXml()),
    'meta.xml': strToU8(metaXml(ata)),
  });
  return new Blob([zip], { type: MIME });
}

/**
 * Gera o .odt e entrega ao navegador.
 *
 * `revokeObjectURL` no fim não é zelo: sem ele o Blob fica preso na memória da
 * aba até o recarregamento, e a ata é um documento que a secretária exporta
 * várias vezes seguidas enquanto ajusta o texto.
 */
export function baixarOdt(ata = {}, presencas = []) {
  const blob = odtDaAta(ata, presencas);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${nomeDoArquivo(ata)}.odt`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
