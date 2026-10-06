// ============================================================================
// A ata como arquivo ODT (OpenDocument Text).
//
// Um .odt não é um formato de texto: é um ZIP com estes membros —
//
//   mimetype                   (a string do tipo, sem compressão, PRIMEIRO)
//   META-INF/manifest.xml      (o índice do pacote)
//   content.xml                (o texto)
//   styles.xml                 (a página, a fonte e os estilos "Ata …")
//   meta.xml                   (título e autor, opcional — vai junto)
//   Pictures/bandeira-brasil.png  (a bandeira do cabeçalho)
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
//      sem isso, as notícias das famílias sairiam grudadas numa linha só.
//
// O LEIAUTE é o da minuta impressa, o mesmo do PDF (ver ata-documento.css):
// bandeira e Conselho no topo, frente e verso em páginas separadas, campos
// pontilhados, verso pautado. Nos dois, a régua do verso é a borda de baixo
// do parágrafo: uma notícia comprida que quebra em duas linhas tem régua só
// debaixo da segunda. ODF não tem "fundo pautado" que acompanhe a entrelinha,
// e o fundo em gradiente do navegador saía serrilhado no PDF — a borda é
// linha de verdade nos dois formatos.
//
// Por que fflate e não JSZip: são ~8 KB contra ~100 KB, e fflate é ESM nativo
// — este projeto não tem bundler, cada `<script type="module">` importa a
// biblioteca direto. `esm.sh` é o mesmo CDN de onde supabase-client.js já
// carrega o supabase-js, então não entra origem nova no site.
// ============================================================================

import { zipSync, strToU8 } from 'https://esm.sh/fflate@0.8.2';
import { blocosDaAta, nomeDoArquivo, CONFERENCIA, URL_BANDEIRA } from './ata-documento.js';

const MIME = 'application/vnd.oasis.opendocument.text';
const CAMINHO_BANDEIRA = 'Pictures/bandeira-brasil.png';

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
// Cada tipo de bloco de ata-documento.js tem um estilo de parágrafo aqui. Eles
// moram em styles.xml como estilos COMUNS (não automáticos): é o que faz "Ata
// Corpo" aparecer na lista de estilos do LibreOffice, para quem abrir o
// arquivo mudar a ata inteira de uma vez. Estilo automático não aparece lá.
// ---------------------------------------------------------------------------
const ESTILO_POR_TIPO = {
  cabecalho: 'AtaCabecalho',
  titulo:    'AtaTitulo',
  subtitulo: 'AtaSubtitulo',
  corpo:     'AtaCorpo',
  secao:     'AtaSecao',
  pauta:     'AtaPauta',
  item:      'AtaItem',
  fecho:     'AtaFecho',
};

const NS = [
  'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"',
  'xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"',
  'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"',
  'xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"',
  'xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"',
  // O Movimento de Caixa sai como tabela ODF e a bandeira como desenho — sem
  // estes namespaces o LibreOffice recusa o ARQUIVO INTEIRO, não só a parte.
  'xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"',
  'xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"',
  'xmlns:xlink="http://www.w3.org/1999/xlink"',
].join(' ');

/** Um <style:style> de parágrafo, com as propriedades que interessam. */
function estilo(nome, rotulo, { alinhar = 'start', tamanho = '12pt', negrito = false,
  italico = false, sublinhado = false, antes = '0cm', depois = '0cm',
  entrelinha = null, extra = '' } = {}) {
  const texto =
    `<style:text-properties fo:font-size="${tamanho}"` +
    (negrito ? ' fo:font-weight="bold"' : '') +
    (italico ? ' fo:font-style="italic"' : '') +
    (sublinhado ? ' style:text-underline-style="solid" style:text-underline-width="auto" style:text-underline-color="font-color"' : '') +
    '/>';
  return `<style:style style:name="${nome}" style:display-name="${rotulo}" ` +
    `style:family="paragraph" style:parent-style-name="Standard">` +
    `<style:paragraph-properties fo:text-align="${alinhar}" fo:margin-top="${antes}" fo:margin-bottom="${depois}"` +
    (entrelinha ? ` fo:line-height="${entrelinha}"` : '') + `${extra}/>` +
    texto +
    `</style:style>`;
}

// As medidas espelham ata-documento.css (entrelinha 2 na frente, pauta de
// 1,05 cm no verso, títulos em 12 pt) — PDF e ODT têm de sair parecidos.
const ESTILOS_PARAGRAFO = [
  estilo('AtaCabecalho', 'Ata Cabeçalho'),
  estilo('AtaTitulo', 'Ata Título', { italico: true, sublinhado: true, entrelinha: '200%', antes: '0.25cm', depois: '0.4cm' }),
  estilo('AtaSubtitulo', 'Ata Subtítulo', { entrelinha: '200%', depois: '0.25cm' }),
  estilo('AtaCorpo', 'Ata Corpo', { entrelinha: '200%', depois: '0.3cm' }),
  estilo('AtaSecao', 'Ata Seção', { entrelinha: '160%', antes: '0.9cm', depois: '0.1cm',
    // Título de seção não fica sozinho no pé da página.
    extra: ' fo:keep-with-next="always"' }),
  // A linha pautada: a régua é a borda de baixo, e o vão até a régua de cima
  // fica TODO em cima do texto (padding-top), para a letra assentar na régua
  // — a mesma conta de .ata-pauta no CSS (1,05 cm = 150% de 12 pt + vão).
  // `join-border="false"` é indispensável: sem ele o LibreOffice funde as
  // bordas de parágrafos vizinhos de mesmo estilo e só a ÚLTIMA pauta da
  // seção ganha régua.
  estilo('AtaPauta', 'Ata Pauta', { entrelinha: '150%',
    extra: ' fo:padding-top="0.34cm" fo:padding-bottom="0.07cm" ' +
      'fo:border-bottom="0.6pt solid #333333" style:join-border="false"' }),
  estilo('AtaItem', 'Ata Item', { entrelinha: '180%', antes: '0.7cm' }),
  estilo('AtaFecho', 'Ata Fecho', { entrelinha: '180%', antes: '0.6cm' }),
  // Parágrafos DENTRO das células da folha: menores que o corpo, porque a
  // grade tem 36 linhas e precisa caber sem estourar a página.
  estilo('AtaCelula', 'Ata Célula', { tamanho: '9pt' }),
  estilo('AtaCelulaNum', 'Ata Célula Número', { alinhar: 'end', tamanho: '9pt' }),
  estilo('AtaCelulaCab', 'Ata Célula Cabeçalho', { tamanho: '9pt', negrito: true }),
  estilo('AtaLegenda', 'Ata Legenda da Grade', { tamanho: '10pt', negrito: true, antes: '0.3cm',
    extra: ' fo:keep-with-next="always"' }),
].join('');

/** Estilos de trecho: o negrito do verso e o traço de "Eu ____ lavrei". */
const ESTILOS_TRECHO = [
  `<style:style style:name="AtaNegrito" style:family="text">` +
    `<style:text-properties fo:font-weight="bold"/></style:style>`,
  `<style:style style:name="AtaSublinhado" style:family="text">` +
    `<style:text-properties style:text-underline-style="solid" ` +
    `style:text-underline-width="auto" style:text-underline-color="font-color"/></style:style>`,
].join('');

/**
 * A bandeira "como caractere": ela entra na linha do Conselho como uma letra
 * muito alta, com o pé na linha de base — e o texto que vem depois dela
 * assenta no pé da bandeira, como no impresso.
 */
const ESTILO_BANDEIRA =
  `<style:style style:name="frBandeira" style:family="graphic">` +
    `<style:graphic-properties style:vertical-pos="top" style:vertical-rel="baseline" ` +
    `fo:border="none" fo:padding="0cm"/></style:style>`;

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
function tabelaOdf(bloco, indice, paragrafo) {
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

  // A legenda tem estilo próprio, e não `AtaSecao`: a margem de 0,9 cm do
  // verso, repetida entre as cinco grades, empurraria o anexo para outra página.
  return paragrafo('AtaLegenda', escaparXml(bloco.texto)) +
    `<table:table table:name="MovimentoCaixa${indice}" table:style-name="TabMC">` +
    colunas.map(c => `<table:table-column table:style-name="${c}"/>`).join('') +
    thead +
    linhas.map(l => linhaXml(l, false)).join('') +
    `</table:table>`;
}

// ---------------------------------------------------------------------------
// Os membros do pacote
// ---------------------------------------------------------------------------

/** As partes de um parágrafo (ver ata-documento.js) como conteúdo de <text:p>. */
function partesXml(partes = []) {
  return partes.map(p => {
    const t = escaparXml(p.texto);
    if (p.tipo === 'linha') return `<text:span text:style-name="AtaSublinhado">${t}</text:span>`;
    if (p.negrito) return `<text:span text:style-name="AtaNegrito">${t}</text:span>`;
    return t;
  }).join('');
}

/** O cabeçalho: a bandeira (se veio) e o Conselho em negrito colado nela. */
function cabecalhoXml(bloco, comBandeira) {
  const bandeira = comBandeira
    ? `<draw:frame draw:style-name="frBandeira" draw:name="Bandeira" ` +
        `text:anchor-type="as-char" svg:width="4cm" svg:height="2.8cm" draw:z-index="0">` +
        `<draw:image xlink:href="${CAMINHO_BANDEIRA}" xlink:type="simple" ` +
          `xlink:show="embed" xlink:actuate="onLoad"/>` +
      `</draw:frame>`
    : '';
  return bandeira + `<text:span text:style-name="AtaNegrito">${escaparXml(bloco.texto)}</text:span>`;
}

function contentXml(ata, presencas, comBandeira) {
  // Quebra de página em ODF não é elemento: é propriedade do parágrafo que
  // COMEÇA a página nova (fo:break-before). Um bloco `pagina` só arma a
  // quebra; quem a consome é o próximo parágrafo emitido, por um estilo
  // automático "Q_<estilo>" filho do estilo dele.
  let quebrar = false;
  const quebras = new Set();
  const paragrafo = (estiloNome, conteudo) => {
    let nome = estiloNome;
    if (quebrar) {
      nome = `Q_${estiloNome}`;
      quebras.add(estiloNome);
      quebrar = false;
    }
    return conteudo
      ? `<text:p text:style-name="${nome}">${conteudo}</text:p>`
      : `<text:p text:style-name="${nome}"/>`;
  };

  let tabelas = 0;
  const corpo = blocosDaAta(ata, presencas).map(bloco => {
    if (bloco.tipo === 'pagina') { quebrar = true; return ''; }
    // Uma tabela NÃO é um parágrafo: em ODF ela é irmã dele dentro de
    // <office:text>, e um <table:table> dentro de um <text:p> é justamente o
    // tipo de XML que o LibreOffice recusa sem dizer onde.
    if (bloco.tipo === 'tabela') return tabelaOdf(bloco, ++tabelas, paragrafo);
    const nome = ESTILO_POR_TIPO[bloco.tipo] || 'AtaCorpo';
    if (bloco.tipo === 'cabecalho') return paragrafo(nome, cabecalhoXml(bloco, comBandeira));
    return paragrafo(nome, bloco.partes ? partesXml(bloco.partes) : escaparXml(bloco.texto));
  }).join('');

  // A margem de cima some no topo da página nova: o verso começa rente à
  // margem, como a frente.
  const estilosQuebra = [...quebras].map(base =>
    `<style:style style:name="Q_${base}" style:family="paragraph" style:parent-style-name="${base}">` +
    `<style:paragraph-properties fo:break-before="page" fo:margin-top="0cm"/></style:style>`).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<office:document-content ${NS} office:version="1.2">` +
      `<office:automatic-styles>${estilosQuebra}${ESTILOS_TABELA}${ESTILO_BANDEIRA}</office:automatic-styles>` +
      `<office:body><office:text>${corpo}</office:text></office:body>` +
    `</office:document-content>`;
}

function stylesXml() {
  // A4 retrato com margem de 2 cm — a mesma medida do @media print de
  // ata-documento.css, para que o ODT impresso e o PDF do navegador saiam com
  // a mesma mancha de texto. DejaVu Serif é a letra do impresso; o LibreOffice
  // a traz junto na instalação, e o PDF a carrega de assets/fonts/.
  return `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<office:document-styles ${NS} office:version="1.2">` +
      `<office:font-face-decls>` +
        `<style:font-face style:name="DejaVu Serif" svg:font-family="'DejaVu Serif'" ` +
          `style:font-family-generic="roman" style:font-pitch="variable"/>` +
      `</office:font-face-decls>` +
      `<office:styles>` +
        `<style:default-style style:family="paragraph">` +
          // Viúva/órfã de 2: sem isto a última linha do fecho ("pelos
          // presentes.") podia ir sozinha para uma página nova.
          `<style:paragraph-properties fo:orphans="2" fo:widows="2"/>` +
          `<style:text-properties style:font-name="DejaVu Serif" fo:font-size="12pt" ` +
            `fo:language="pt" fo:country="BR"/>` +
        `</style:default-style>` +
        `<style:style style:name="Standard" style:family="paragraph" style:class="text"/>` +
        ESTILOS_PARAGRAFO +
        ESTILOS_TRECHO +
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

function manifestXml(comBandeira) {
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
      // Membro do zip fora do manifesto é motivo para o LibreOffice oferecer
      // "reparar o arquivo" — os dois andam juntos ou nenhum.
      (comBandeira ? entrada(CAMINHO_BANDEIRA, 'image/png') : '') +
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
 * @param {object} [opcoes]
 * @param {Uint8Array|null} [opcoes.bandeira]  bytes do PNG da bandeira; sem
 *   eles o cabeçalho sai só com o texto (ver baixarOdt()).
 * @returns {Blob}
 */
export function odtDaAta(ata = {}, presencas = [], { bandeira = null } = {}) {
  const comBandeira = bandeira instanceof Uint8Array && bandeira.length > 0;
  const membros = {
    // level 0 = armazenado, sem compressão. Exigência do OpenDocument.
    'mimetype': [strToU8(MIME), { level: 0 }],
    'META-INF/manifest.xml': strToU8(manifestXml(comBandeira)),
    'content.xml': strToU8(contentXml(ata, presencas, comBandeira)),
    'styles.xml': strToU8(stylesXml()),
    'meta.xml': strToU8(metaXml(ata)),
  };
  // PNG já é comprimido: comprimir de novo só gasta tempo.
  if (comBandeira) membros[CAMINHO_BANDEIRA] = [bandeira, { level: 0 }];
  return new Blob([zipSync(membros)], { type: MIME });
}

/**
 * Os bytes da bandeira, ou null.
 *
 * Falhar aqui não derruba a exportação: a bandeira é enfeite do cabeçalho, e
 * a ata é o texto. Sem rede no meio da reunião, sai o ODT sem a imagem.
 */
async function bytesDaBandeira() {
  try {
    const resposta = await fetch(URL_BANDEIRA);
    if (!resposta.ok) return null;
    return new Uint8Array(await resposta.arrayBuffer());
  } catch {
    return null;
  }
}

/**
 * Gera o .odt e entrega ao navegador.
 *
 * `revokeObjectURL` no fim não é zelo: sem ele o Blob fica preso na memória da
 * aba até o recarregamento, e a ata é um documento que a secretária exporta
 * várias vezes seguidas enquanto ajusta o texto.
 */
export async function baixarOdt(ata = {}, presencas = []) {
  const blob = odtDaAta(ata, presencas, { bandeira: await bytesDaBandeira() });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${nomeDoArquivo(ata)}.odt`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
