// ============================================================================
// O Movimento de Caixa — as 36 linhas do formulário do Conselho Metropolitano.
//
// Este módulo é a definição da folha: quais são as linhas, em que ordem, com
// que rótulo, quais são digitadas e quais são conta. Tudo o mais lê daqui.
//
//   ata.html            monta o formulário e recalcula a partir de LINHAS
//   ata-documento.js    monta a tabela do documento a partir de LINHAS
//   ata-odt.js          recebe a tabela pronta, já montada
//
// É o mesmo motivo pelo qual `ata-documento.js` existe, e está escrito no topo
// dele: três cópias da mesma frase divergem. Aqui seria pior que divergir —
// uma linha com rótulo diferente no formulário e no documento faria a folha
// enviada ao Conselho Particular dizer outra coisa do que a tesoureira
// digitou.
//
// Este módulo não toca no DOM nem no Supabase: recebe um objeto com os campos
// e devolve dados. É o que o torna testável sem navegador.
// ============================================================================

/**
 * As 36 linhas, na ordem do impresso.
 *
 * Cada descritor:
 *   n            número da linha no formulário — é como o Conselho a chama
 *   bloco        'receita' | 'despesa' | 'bens' | 'resumo'
 *   campo        coluna de public.atas que guarda o VALOR
 *   rotulo       o texto impresso na linha ('' nas linhas em branco)
 *   rotuloCampo  coluna de texto, nas linhas que o impresso deixa em aberto
 *   calculado    de onde sai a conta — presente ⇒ a linha é readonly
 *   nota         a orientação impressa entre parênteses no papel
 *   unidade      'kg' | 'un' nas linhas de bens (as demais são em R$)
 */
export const LINHAS = [
  // ---- RECEITAS (Recebimentos e arrecadações diversas) --------------------
  { n: 1,  bloco: 'receita', campo: 'rec_coleta_reuniao',
    rotulo: 'Coleta na reunião' },
  { n: 2,  bloco: 'receita', campo: 'rec_subscritores_benfeitores',
    rotulo: 'Subscritores e benfeitores' },
  { n: 3,  bloco: 'receita', campo: 'rec_outras_doacoes',
    rotulo: 'Outras doações recebidas (exclusivamente em R$)' },
  { n: 4,  bloco: 'receita', campo: 'rec_liquido_eventos',
    rotulo: 'Resultado líquido c/ realização de evento (rifa, bazar, almoços etc)' },
  { n: 5,  bloco: 'receita', campo: 'rec_outras_sujeitas_decima',
    rotulo: 'Outras receitas sujeitas a Décimas' },
  { n: 6,  bloco: 'receita', campo: 'rec_subtotal_base_decima',
    rotulo: 'Subtotal (valor base de cálculo da décima do dia)', calculado: 'linhas 1 a 5' },
  { n: 7,  bloco: 'receita', campo: 'rec_subvencao_publica',
    rotulo: 'Subvenção oficial dos Poderes Públicos' },
  { n: 8,  bloco: 'receita', campo: 'rec_solidariedade_ozanam',
    rotulo: 'Contribuição da Solidariedade e Coleta de Ozanam' },
  { n: 9,  bloco: 'receita', campo: 'rec_uniao_fraternal',
    rotulo: 'União Fraternal' },
  { n: 10, bloco: 'receita', campo: 'rec_livre_1_valor', rotuloCampo: 'rec_livre_1_rotulo',
    rotulo: '' },
  { n: 11, bloco: 'receita', campo: 'rec_livre_2_valor', rotuloCampo: 'rec_livre_2_rotulo',
    rotulo: '' },
  { n: 12, bloco: 'receita', campo: 'rec_para_repasses',
    rotulo: 'Recebimentos para repasses (exclusivamente em R$)' },
  { n: 13, bloco: 'receita', campo: 'rec_soma_semana',
    rotulo: 'Soma da Receita da semana', calculado: 'linhas 6 a 12' },
  { n: 14, bloco: 'receita', campo: 'rec_saldo_semana_anterior',
    rotulo: 'Saldo final da semana anterior' },
  { n: 15, bloco: 'receita', campo: 'rec_balanco',
    rotulo: 'Balanço', calculado: 'linhas 13 + 14' },

  // ---- DESPESAS (Pagamento, investimentos sociais e repasses diversos) ----
  { n: 16, bloco: 'despesa', campo: 'des_cestas_basicas',
    rotulo: 'Despesas com cestas básicas (alimentos, produtos de higiene e limpeza etc)' },
  { n: 17, bloco: 'despesa', campo: 'des_moradia_assistidos',
    rotulo: 'Despesas com moradia dos Assistidos' },
  { n: 18, bloco: 'despesa', campo: 'des_contas_assistidos',
    rotulo: 'Pagamentos de contas dos assistidos' },
  { n: 19, bloco: 'despesa', campo: 'des_obras_especiais',
    rotulo: 'Obras Especiais' },
  { n: 20, bloco: 'despesa', campo: 'des_uniao_fraternal',
    rotulo: 'União Fraternal' },
  { n: 21, bloco: 'despesa', campo: 'des_livre_1_valor', rotuloCampo: 'des_livre_1_rotulo',
    rotulo: '' },
  { n: 22, bloco: 'despesa', campo: 'des_livre_2_valor', rotuloCampo: 'des_livre_2_rotulo',
    rotulo: '' },
  { n: 23, bloco: 'despesa', campo: 'des_administrativas',
    rotulo: 'Despesas administrativas e de consumo da Conferência' },
  { n: 24, bloco: 'despesa', campo: 'des_decima_conselho',
    rotulo: 'Décimas pagas ao Conselho Particular', nota: '10% da linha 6' },
  { n: 25, bloco: 'despesa', campo: 'des_livre_3_valor', rotuloCampo: 'des_livre_3_rotulo',
    rotulo: '' },
  { n: 26, bloco: 'despesa', campo: 'des_repasse_solidariedade',
    rotulo: 'Repasses da Contribuição da Solidariedade e da Coleta de Ozanam',
    nota: 'linha 8' },
  { n: 27, bloco: 'despesa', campo: 'des_repasse_recebidos',
    rotulo: 'Repasses referentes à linha 12', nota: 'linha 12' },
  { n: 28, bloco: 'despesa', campo: 'des_soma_semana',
    rotulo: 'Soma das despesas da semana', calculado: 'linhas 16 a 27' },
  { n: 29, bloco: 'despesa', campo: 'des_saldo_semana_atual',
    rotulo: 'Saldo final da semana atual', calculado: 'linha 15 menos a 28' },
  { n: 30, bloco: 'despesa', campo: 'des_balanco',
    rotulo: 'Balanço', calculado: 'linhas 28 + 29' },

  // ---- CONTROLE DA DISTRIBUIÇÃO DE BENS MATERIAIS ------------------------
  { n: 31, bloco: 'bens', campo: 'bens_cestas_kg', unidade: 'kg',
    rotulo: 'Cestas básicas (alimentos, produtos de higiene e limpeza) — em Kg' },
  { n: 32, bloco: 'bens', campo: 'bens_roupas_calcados', unidade: 'un',
    rotulo: 'Roupas, calçados — em unidades' },
  { n: 33, bloco: 'bens', campo: 'bens_outros_qtd', rotuloCampo: 'bens_outros_rotulo',
    unidade: 'un', rotulo: 'Outros' },

  // ---- RESUMO DA SITUAÇÃO DO CAIXA ---------------------------------------
  { n: 34, bloco: 'resumo', campo: 'res_decimas_a_enviar',
    rotulo: 'Décimas a serem enviadas ao Conselho Particular' },
  { n: 35, bloco: 'resumo', campo: 'res_outras_a_enviar',
    rotulo: 'Outras contribuições a enviar ao Conselho Particular (Coleta de Ozanam, Contribuição da Solidariedade)' },
  { n: 36, bloco: 'resumo', campo: 'res_total_tesouraria',
    rotulo: 'Total de recursos com a Tesouraria', calculado: 'linhas 29, 34 e 35' },
];

/** Os títulos impressos de cada bloco, como aparecem no formulário. */
export const TITULO_BLOCO = {
  receita: 'RECEITAS (Recebimentos e arrecadações diversas)',
  despesa: 'DESPESAS (Pagamento, investimentos sociais e repasses diversos)',
  bens:    'CONTROLE DA DISTRIBUIÇÃO DE BENS MATERIAIS',
  resumo:  'RESUMO DA SITUAÇÃO DO CAIXA',
};

/** Os quatro contadores de assistência do cabeçalho, na ordem do impresso. */
export const CONTADORES_ASSISTENCIA = [
  { campo: 'familias_assistidas',       rotulo: 'Total de famílias assistidas' },
  { campo: 'pessoas_atendidas',         rotulo: 'Nº de pessoas atendidas nessas famílias' },
  { campo: 'familias_ajuda_material',   rotulo: 'Famílias assistidas com ajuda material' },
  { campo: 'familias_ajuda_espiritual', rotulo: 'Famílias assistidas com ajuda espiritual (ou não material)' },
];

/** Só as linhas que a tesoureira digita — as demais saem de conta. */
export const LINHAS_DIGITADAS = LINHAS.filter(l => !l.calculado);

/** Só as linhas de conta, na ordem em que precisam ser resolvidas. */
export const LINHAS_CALCULADAS = LINHAS.filter(l => l.calculado);

/** Índice campo → descritor, para quem tem a coluna e quer a linha. */
export const LINHA_POR_CAMPO = new Map(LINHAS.map(l => [l.campo, l]));

// ---------------------------------------------------------------------------
// Aritmética
// ---------------------------------------------------------------------------

/**
 * Centavos exatos.
 *
 * Somar dinheiro em float acumula resíduo (0.1 + 0.2 = 0.30000000000000004), e
 * numeric(10,2) no banco truncaria o resíduo sem avisar — a folha impressa
 * mostraria um centavo que a coluna não guardou. Arredondar a cada passo é o
 * que faz a tela e o banco dizerem o mesmo número.
 */
const centavos = (n) => Math.round(n * 100) / 100;

/** Valor vazio vira null, não 0: "não informado" ≠ "zero" (migração 022). */
function numero(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

/**
 * Soma que preserva o "não informado".
 *
 * Se TODA parcela estiver vazia o total também fica vazio — senão um rascunho
 * recém-criado já nasceria afirmando "soma da receita R$ 0,00", que é
 * diferente de não informado. Basta uma parcela preenchida para o total
 * existir, e aí as vazias contam como zero.
 */
function total(...partes) {
  return partes.every(p => p === null)
    ? null
    : centavos(partes.reduce((t, p) => t + (p ?? 0), 0));
}

/** Idem, para a subtração das linhas 29. */
function diferenca(a, b) {
  return (a === null && b === null) ? null : centavos((a ?? 0) - (b ?? 0));
}

/**
 * As sete linhas de conta, a partir das digitadas.
 *
 * A ordem importa: a 13 usa a 6, a 15 usa a 13, a 29 usa a 15 e a 28, a 30 e a
 * 36 usam a 29. Resolver fora de ordem daria null onde há número.
 *
 * @param {object} v  objeto com as colunas de `atas` (a linha, ou o formulário)
 * @returns {object}  só as sete colunas calculadas
 */
export function calcularMovimento(v = {}) {
  const c = (campo) => numero(v[campo]);

  // 6 · base de cálculo da décima — só as linhas 1 a 5 entram
  const l6 = total(c('rec_coleta_reuniao'), c('rec_subscritores_benfeitores'),
    c('rec_outras_doacoes'), c('rec_liquido_eventos'), c('rec_outras_sujeitas_decima'));

  // 13 · soma da receita da semana — linhas 6 a 12 (a 6 já contém 1 a 5)
  const l13 = total(l6, c('rec_subvencao_publica'), c('rec_solidariedade_ozanam'),
    c('rec_uniao_fraternal'), c('rec_livre_1_valor'), c('rec_livre_2_valor'),
    c('rec_para_repasses'));

  const l15 = total(l13, c('rec_saldo_semana_anterior'));

  // 28 · soma das despesas — linhas 16 a 27
  const l28 = total(c('des_cestas_basicas'), c('des_moradia_assistidos'),
    c('des_contas_assistidos'), c('des_obras_especiais'), c('des_uniao_fraternal'),
    c('des_livre_1_valor'), c('des_livre_2_valor'), c('des_administrativas'),
    c('des_decima_conselho'), c('des_livre_3_valor'), c('des_repasse_solidariedade'),
    c('des_repasse_recebidos'));

  const l29 = diferenca(l15, l28);
  const l30 = total(l28, l29);
  const l36 = total(l29, c('res_decimas_a_enviar'), c('res_outras_a_enviar'));

  return {
    rec_subtotal_base_decima: l6,
    rec_soma_semana:          l13,
    rec_balanco:              l15,
    des_soma_semana:          l28,
    des_saldo_semana_atual:   l29,
    des_balanco:              l30,
    res_total_tesouraria:     l36,
  };
}

/**
 * A décima que o impresso orienta na linha 24: 10% da linha 6.
 *
 * Devolve o valor ESPERADO, para a tela mostrar como dica. Não substitui a
 * linha 24, que é o que foi de fato pago — a diferença entre o devido e o pago
 * é justamente o que a linha 34 registra.
 */
export function decimaEsperada(v = {}) {
  const base = calcularMovimento(v).rec_subtotal_base_decima;
  return base === null ? null : centavos(base * 0.1);
}

/**
 * A conferência embutida no formulário: linha 15 tem que bater com a linha 30.
 *
 * É a checagem que a tesoureira faz de cabeça no papel. Na folha de
 * 22/08/2026: 15 = 107,00 + 6.339,70 = 6.446,70 e 30 = 510,70 + 5.936,00 =
 * 6.446,70.
 *
 * Aritmeticamente 30 só diverge de 15 por resíduo de arredondamento, já que
 * 29 = 15 − 28 e 30 = 28 + 29. A conferência continua valendo porque é ela que
 * pega o resíduo — e porque, se um dia a linha 29 virar campo digitado (o
 * papel a traz como conta, mas o Conselho já aceitou correção à mão), passa a
 * pegar erro de digitação também.
 *
 * @returns {null|{bate: boolean, balancoReceita: number, balancoDespesa: number}}
 *          null quando ainda não há os dois lados para comparar.
 */
export function conferirBalanco(v = {}) {
  const { rec_balanco: l15, des_balanco: l30 } = calcularMovimento(v);
  if (l15 === null || l30 === null) return null;
  return { bate: Math.abs(l15 - l30) < 0.005, balancoReceita: l15, balancoDespesa: l30 };
}

/**
 * A folha tem alguma coisa escrita?
 *
 * Guarda a derivação dos nove campos da minuta: numa ata lavrada antes desta
 * folha existir, derivar produziria nove nulos e APAGARIA o caixa que a
 * secretária digitou à mão. Enquanto o Movimento de Caixa estiver em branco,
 * os nove campos continuam sendo o que sempre foram — digitados.
 */
export function movimentoPreenchido(v = {}) {
  return LINHAS_DIGITADAS.some(l => numero(v[l.campo]) !== null);
}

/**
 * Os nove campos de caixa da minuta (migração 022), derivados das 36 linhas.
 *
 * A minuta recita o caixa em prosa — "saldo anterior …, coleta …, outras
 * fontes …" — e essa prosa continua sendo o texto da ata. O que muda é que a
 * tesoureira não digita mais os nove: eles saem da folha, que é mais fina.
 *
 * O mapa, linha a linha, está no cabeçalho da migração 025.
 */
export function derivarCaixaDaMinuta(v = {}) {
  const c = (campo) => numero(v[campo]);
  const calc = calcularMovimento(v);

  return {
    saldo_anterior: c('rec_saldo_semana_anterior'),
    coleta:         c('rec_coleta_reuniao'),
    // Tudo o que entrou na semana menos a coleta — é o que "outras fontes"
    // sempre quis dizer, agora com as dez origens discriminadas por trás.
    outras_fontes:  diferenca(calc.rec_soma_semana, c('rec_coleta_reuniao')),
    soma_receita:   calc.rec_soma_semana,
    // "Auxílio financeiro aos assistidos" = o que foi direto para a família:
    // cesta, moradia e conta paga. Obras Especiais (19) fica de fora — é
    // investimento social da Conferência, não auxílio a um assistido.
    auxilio_assistidos: total(c('des_cestas_basicas'), c('des_moradia_assistidos'),
      c('des_contas_assistidos')),
    despesas_diversas: total(c('des_obras_especiais'), c('des_uniao_fraternal'),
      c('des_livre_1_valor'), c('des_livre_2_valor'), c('des_administrativas'),
      c('des_livre_3_valor'), c('des_repasse_solidariedade'), c('des_repasse_recebidos')),
    decima:         c('des_decima_conselho'),
    soma_despesa:   calc.des_soma_semana,
    saldo_atual:    calc.des_saldo_semana_atual,
  };
}

// ---------------------------------------------------------------------------
// Contadores de presença
// ---------------------------------------------------------------------------

const CATEGORIAS = ['confrade', 'consocia', 'aspirante'];

/** Os rótulos das categorias, como o impresso os escreve. */
export const CATEGORIA_ROTULO = {
  confrade:  'Confrades',
  consocia:  'Consócias',
  aspirante: 'Aspirantes',
};

/**
 * O bloco da direita do cabeçalho, contado a partir da lista de presença.
 *
 * Conta quem está como 'presente' — justificado e ausente não estiveram na
 * reunião, e o impresso pergunta quem esteve.
 *
 * Presença sem categoria (gravada antes da migração 026) entra como confrade,
 * que é o mesmo default do cadastro. É o que mantém ata antiga somando o
 * total certo em "Presentes", ainda que a abertura por categoria fique
 * aproximada — e a ata antiga não tinha essa abertura de qualquer forma.
 *
 * `visitantes` NÃO sai daqui: visitante não tem cadastro, logo não tem linha
 * de presença. Vem de `atas.visitantes_qtd`.
 */
export function contarPresencas(presencas = []) {
  const contagem = { confrade: 0, consocia: 0, aspirante: 0 };
  for (const p of presencas) {
    if (p?.situacao !== 'presente') continue;
    const categoria = CATEGORIAS.includes(p.categoria) ? p.categoria : 'confrade';
    contagem[categoria] += 1;
  }
  return {
    ...contagem,
    presentes: contagem.confrade + contagem.consocia + contagem.aspirante,
  };
}
