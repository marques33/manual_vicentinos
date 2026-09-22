// ============================================================================
// Conferência estática do Movimento de Caixa — roda sem banco e sem navegador.
//
//   node supabase/verificar-movimento-caixa.mjs
//
// Responde quatro perguntas que teste de tela não responde barato:
//
//   1. toda coluna da migração 025 existe no módulo, e todo campo do módulo
//      existe na migração — um nome trocado aqui grava número na coluna errada,
//      em silêncio, e só aparece quando o Conselho conferir a folha;
//   2. as 36 linhas estão completas, em ordem, e as de conta são as sete certas;
//   3. a tela e o documento consomem a mesma lista;
//   4. a aritmética reproduz a folha de papel de 22/08/2026 (Ata 240) — a
//      única prova de que as fórmulas do impresso foram lidas certo.
//
// Diferente de verificar-rls-atas.mjs, este não precisa de conta de teste nem
// de rede: é leitura de arquivo e conta. Roda em qualquer máquina, sempre.
// ============================================================================

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const ler = (p) => readFileSync(join(raiz, p), 'utf8');

const {
  LINHAS, LINHAS_DIGITADAS, LINHAS_CALCULADAS, CONTADORES_ASSISTENCIA,
  calcularMovimento, derivarCaixaDaMinuta, conferirBalanco, decimaEsperada,
  movimentoPreenchido, contarPresencas,
} = await import('../app/assets/ata-movimento-caixa.js');

let falhas = 0;
const erro = (msg) => { falhas++; console.log('  FALHA  ' + msg); };
const secao = (t) => console.log('\n' + t);

// ---------------------------------------------------------------------------
secao('1 · Colunas da migração 025 x campos do módulo');

const sqlMovimento = ler('supabase/migrations/20260922140000_atas_movimento_caixa.sql');
const colunasSql = new Set(
  [...sqlMovimento.matchAll(/add column if not exists\s+(\w+)/g)].map(m => m[1]));

const camposModulo = new Set();
for (const l of LINHAS) {
  camposModulo.add(l.campo);
  if (l.rotuloCampo) camposModulo.add(l.rotuloCampo);
}
for (const c of CONTADORES_ASSISTENCIA) camposModulo.add(c.campo);
camposModulo.add('visitantes_qtd');

for (const campo of camposModulo) {
  if (!colunasSql.has(campo)) erro('o modulo usa "' + campo + '", que a migracao nao cria');
}
for (const coluna of colunasSql) {
  if (!camposModulo.has(coluna)) erro('a migracao cria "' + coluna + '", que o modulo nao usa');
}
console.log('  ' + colunasSql.size + ' colunas na migração, ' + camposModulo.size + ' campos no módulo');

// ---------------------------------------------------------------------------
secao('2 · Numeração e blocos');

const numeros = LINHAS.map(l => l.n);
for (let n = 1; n <= 36; n++) {
  if (!numeros.includes(n)) erro('falta a linha ' + n + ' do impresso');
}
if (numeros.length !== 36) erro(numeros.length + ' linhas definidas, o impresso tem 36');
if (new Set(numeros).size !== numeros.length) erro('há número de linha repetido');
if (numeros.some((n, i) => i && n < numeros[i - 1])) erro('as linhas estão fora de ordem');

const calculadas = LINHAS_CALCULADAS.map(l => l.n).join(',');
if (calculadas !== '6,13,15,28,29,30,36') erro('linhas de conta inesperadas: ' + calculadas);
console.log('  36 linhas: ' + LINHAS_DIGITADAS.length + ' digitadas, '
  + LINHAS_CALCULADAS.length + ' de conta (' + calculadas + ')');

// ---------------------------------------------------------------------------
secao('3 · O formulário de ata.html cobre a folha');

const html = ler('app/ata.html');
for (const marca of ['mc-blocos', 'mc-assistencia', 'mc-presenca', 'mc-visitantes_qtd',
                     'caixa-derivado-aviso', 'mc-conferencia']) {
  if (!html.includes(marca)) erro('ata.html nao tem o elemento "' + marca + '"');
}
for (const fn of ['montarMovimento', 'folhaDaTela', 'recalcularMovimento',
                  'aplicarCaixaDerivado', 'atualizarContadoresPresenca']) {
  if (!html.includes(fn)) erro('ata.html nao define ' + fn + '()');
}
// Nenhum campo pode ficar de fora do que é salvo. A prova não é listar campo a
// campo: é que ataDaTela() ESPALHE a folha em vez de enumerar colunas à mão —
// enumeração é o que esquece a coluna nova daqui a seis meses.
if (!html.includes('...folha,')) erro('ataDaTela() nao espalha a folha');
if (!html.includes('...calcularMovimento(folha),')) erro('ataDaTela() nao grava as linhas de conta');
if (!html.includes('...caixa,')) erro('ataDaTela() nao grava os nove campos da minuta');
console.log('  elementos, funções e gravação presentes');

// ---------------------------------------------------------------------------
secao('4 · O documento imprime a folha');

const doc = ler('app/assets/ata-documento.js');
if (!doc.includes('ata-movimento-caixa.js')) erro('ata-documento.js nao le o modulo da folha');
if (!doc.includes('tabela')) erro('ata-documento.js nao tem o bloco de tabela');
const odt = ler('app/assets/ata-odt.js');
if (!odt.includes('table:table')) erro('ata-odt.js nao gera tabela ODF');
console.log('  documento e ODT ligados à folha');

// ---------------------------------------------------------------------------
secao('5 · Aritmética x a folha de papel de 22/08/2026 (Ata 240)');

const folha = {
  rec_coleta_reuniao: 7.00,            // linha 1
  rec_outras_doacoes: 100.00,          // linha 3
  rec_saldo_semana_anterior: 6339.70,  // linha 14
  des_moradia_assistidos: 500.00,      // linha 17
  des_decima_conselho: 10.70,          // linha 24 — 10% da linha 6
};
const esperado = {
  rec_subtotal_base_decima: 107.00, rec_soma_semana: 107.00, rec_balanco: 6446.70,
  des_soma_semana: 510.70, des_saldo_semana_atual: 5936.00, des_balanco: 6446.70,
  res_total_tesouraria: 5936.00,
};
const calc = calcularMovimento(folha);
for (const [k, v] of Object.entries(esperado)) {
  if (calc[k] !== v) erro(k + ': obtido ' + calc[k] + ', o papel diz ' + v);
}
if (decimaEsperada(folha) !== 10.70) {
  erro('décima esperada ' + decimaEsperada(folha) + ', o papel diz 10,70');
}
if (!conferirBalanco(folha)?.bate) erro('linha 15 nao bate com a linha 30 na folha do papel');
console.log('  7 linhas de conta, a décima e o balanço conferem com o papel');

// ---------------------------------------------------------------------------
secao('6 · Derivação dos nove campos da minuta');

const caixa = derivarCaixaDaMinuta(folha);
const esperadoCaixa = {
  saldo_anterior: 6339.70, coleta: 7, outras_fontes: 100, soma_receita: 107,
  auxilio_assistidos: 500, despesas_diversas: null, decima: 10.70,
  soma_despesa: 510.70, saldo_atual: 5936,
};
for (const [k, v] of Object.entries(esperadoCaixa)) {
  if (caixa[k] !== v) erro('minuta.' + k + ': obtido ' + caixa[k] + ', esperado ' + v);
}
// Os nove têm que FECHAR com as 36 — é o que prova que nenhuma linha ficou de
// fora do mapa da migração 025 e que nenhuma foi contada duas vezes.
const somaDespesa = (caixa.auxilio_assistidos ?? 0) + (caixa.despesas_diversas ?? 0)
  + (caixa.decima ?? 0);
if (Math.abs(somaDespesa - calc.des_soma_semana) > 0.005) {
  erro('os tres campos de despesa da minuta somam ' + somaDespesa
    + ', a linha 28 diz ' + calc.des_soma_semana);
}
const somaReceita = (caixa.coleta ?? 0) + (caixa.outras_fontes ?? 0);
if (Math.abs(somaReceita - calc.rec_soma_semana) > 0.005) {
  erro('coleta + outras fontes = ' + somaReceita + ', a linha 13 diz ' + calc.rec_soma_semana);
}

// A prova forte: uma folha com TODAS as linhas digitadas preenchidas tem que
// fechar igual. Assim nenhuma linha nova pode entrar em LINHAS sem entrar
// também no mapa da derivação.
const cheia = {};
let passo = 1;
for (const l of LINHAS_DIGITADAS) cheia[l.campo] = passo++;
const calcCheia = calcularMovimento(cheia);
const caixaCheia = derivarCaixaDaMinuta(cheia);
const despesaCheia = (caixaCheia.auxilio_assistidos ?? 0)
  + (caixaCheia.despesas_diversas ?? 0) + (caixaCheia.decima ?? 0);
if (Math.abs(despesaCheia - calcCheia.des_soma_semana) > 0.005) {
  erro('folha cheia: despesas da minuta somam ' + despesaCheia
    + ' e a linha 28 diz ' + calcCheia.des_soma_semana
    + ' — alguma linha de despesa ficou fora da derivacao');
}
const receitaCheia = (caixaCheia.coleta ?? 0) + (caixaCheia.outras_fontes ?? 0);
if (Math.abs(receitaCheia - calcCheia.rec_soma_semana) > 0.005) {
  erro('folha cheia: receita da minuta soma ' + receitaCheia
    + ' e a linha 13 diz ' + calcCheia.rec_soma_semana);
}
console.log('  os nove saem da folha e fecham com as linhas 13 e 28, inclusive com a folha cheia');

// ---------------------------------------------------------------------------
secao('7 · Ata anterior à folha continua digitada');

if (movimentoPreenchido({ coleta: 7, saldo_atual: 100 })) {
  erro('ata so com os nove campos foi tomada por folha preenchida — derivar apagaria o caixa dela');
}
if (Object.values(calcularMovimento({})).some(v => v !== null)) {
  erro('folha em branco produziu zero em vez de "nao informado"');
}
console.log('  folha em branco não deriva e não vira zero');

// ---------------------------------------------------------------------------
secao('8 · Contadores de presença');

// O cabeçalho da folha de 22/08/2026: 8 presentes, 7 consócias, 1 aspirante.
const c = contarPresencas([
  ...Array(7).fill({ situacao: 'presente', categoria: 'consocia' }),
  { situacao: 'presente', categoria: 'aspirante' },
  { situacao: 'justificado', categoria: 'consocia' },
  { situacao: 'ausente', categoria: 'confrade' },
]);
if (c.presentes !== 8 || c.consocia !== 7 || c.aspirante !== 1 || c.confrade !== 0) {
  erro('contagem ' + JSON.stringify(c) + ' — o papel diz 8 presentes, 7 consocias, 1 aspirante');
}
if (contarPresencas([{ situacao: 'presente', categoria: null }]).confrade !== 1) {
  erro('presenca anterior a migracao 026 nao caiu no default confrade');
}
console.log('  contagem reproduz o cabeçalho da folha; presença sem categoria vira confrade');

// ---------------------------------------------------------------------------
secao('9 · Centavos');

if (calcularMovimento({ rec_coleta_reuniao: 0.1, rec_subscritores_benfeitores: 0.2 })
      .rec_subtotal_base_decima !== 0.3) {
  erro('0,10 + 0,20 nao deu 0,30 — residuo de float escapando para numeric(10,2)');
}
console.log('  0,10 + 0,20 = 0,30');

// ---------------------------------------------------------------------------
secao('10 · Categoria do associado (migração 026)');

const sqlCategoria = ler('supabase/migrations/20260922140100_confrades_categoria.sql');
for (const marca of ['confrades', 'atas_presencas', 'categoria',
                     'confrade', 'consocia', 'aspirante']) {
  if (!sqlCategoria.includes(marca)) erro('a migracao 026 nao menciona "' + marca + '"');
}
if (!html.includes('data-categoria=')) erro('ata.html nao copia a categoria na linha de presenca');
if (!html.includes("categoria: linha.dataset.categoria")) {
  erro('presencasDaTela() nao grava a categoria congelada');
}
console.log('  categoria criada, copiada na presença e gravada');

console.log(falhas ? '\n' + falhas + ' FALHA(S)' : '\nTudo conferido.');
process.exit(falhas ? 1 : 0);
