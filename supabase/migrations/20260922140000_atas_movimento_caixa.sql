-- ============================================================================
-- 025 · Movimento de Caixa — as 36 linhas do formulário do Conselho
-- ----------------------------------------------------------------------------
-- A Conferência preenche à mão DOIS impressos por reunião:
--
--   1. a "MINUTA DA ATA DA CONFERENCIA" — a prosa, que virou `atas` na 022;
--   2. o "Movimento de Caixa" do Conselho Metropolitano de Brasília/DF — a
--      folha da tesouraria, 36 linhas numeradas, que é ENVIADA ao Conselho
--      Particular e que esta migração traz para o sistema.
--
-- A folha 2 traz "Ata Nº ___ / Semana do dia __/__/____" no cabeçalho: ela é
-- uma por reunião, amarrada à ata pelo número. Por isso as colunas nascem
-- aqui dentro de `atas`, e não numa tabela própria — é a mesma reunião, o
-- mesmo momento de gravação e o mesmo ciclo de aprovação. Uma tabela 1:1
-- separada só acrescentaria um join a toda leitura e um segundo lugar de onde
-- a trava da ata aprovada poderia escapar.
--
-- ----------------------------------------------------------------------------
-- O que esta migração NÃO faz: apagar os nove campos de caixa da 022.
--
-- `saldo_anterior`, `coleta`, `outras_fontes`, `soma_receita`,
-- `auxilio_assistidos`, `despesas_diversas`, `decima`, `soma_despesa` e
-- `saldo_atual` continuam. Eles são a COMPRESSÃO destas 36 linhas que a prosa
-- da minuta recita ("a tesoureira apresentou o estado do caixa, que foi o
-- seguinte: saldo anterior …, coleta …"). A partir daqui a tela os DERIVA das
-- linhas na hora de salvar, em vez de pedi-los à tesoureira:
--
--   saldo_anterior     = linha 14
--   coleta             = linha 1
--   outras_fontes      = linha 13 − linha 1
--   soma_receita       = linha 13
--   auxilio_assistidos = linhas 16 + 17 + 18
--   despesas_diversas  = linhas 19+20+21+22+23+25+26+27
--   decima             = linha 24
--   soma_despesa       = linha 28
--   saldo_atual        = linha 29
--
-- Mantê-los é o que deixa as atas já lavradas legíveis: elas têm os nove e não
-- têm as trinta e seis, e o documento tem que continuar saindo delas.
--
-- ----------------------------------------------------------------------------
-- Duas regras do papel que os nove campos não sabiam expressar:
--
--   • a LINHA 6 é a base de cálculo da décima, e só as linhas 1 a 5 entram
--     nela. Subvenção pública (7), Contribuição da Solidariedade (8) e União
--     Fraternal (9) ficam de fora de propósito — não se paga décima sobre
--     recurso que já vem carimbado. Antes disso, `decima` era um número
--     digitado solto, sem base declarada.
--
--   • a LINHA 30 (28+29) tem que bater com a LINHA 15 (13+14). É a
--     conferência embutida no formulário, e a tela avisa quando não fecha.
--     Na folha de 22/08/2026: 15 = 107,00 + 6.339,70 = 6.446,70;
--     30 = 510,70 + 5.936,00 = 6.446,70.
--
-- ----------------------------------------------------------------------------
-- Tipos e nulidade
--
-- `numeric(10,2)` em tudo que é dinheiro — o mesmo de
-- lancamentos_financeiros.valor e dos nove campos da 022. Nunca float, que não
-- representa centavo exato.
--
-- As quantidades das linhas 31–33 também são `numeric(10,2)`, e não integer:
-- a 31 é em QUILOS ("7,5 kg de cestas" é resposta legítima). As outras duas
-- são contagem, e uma contagem é um numeric terminado em ,00 — uniformizar o
-- tipo poupa três caminhos diferentes no recálculo da tela.
--
-- Nada é NOT NULL, pelo mesmo motivo dos nove campos da 022: a ata é salva
-- como rascunho no meio da reunião, antes de a tesoureira apresentar o caixa.
-- Nulo é "ainda não informado", que é diferente de zero.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- RECEITAS (Recebimentos e arrecadações diversas) — linhas 1 a 15
-- ----------------------------------------------------------------------------
alter table public.atas
  -- 1 · Coleta na reunião
  add column if not exists rec_coleta_reuniao            numeric(10,2),
  -- 2 · Subscritores e benfeitores
  add column if not exists rec_subscritores_benfeitores  numeric(10,2),
  -- 3 · Outras doações recebidas (exclusivamente em R$)
  add column if not exists rec_outras_doacoes            numeric(10,2),
  -- 4 · Resultado líquido c/ realização de evento (rifa, bazar, almoços etc)
  add column if not exists rec_liquido_eventos           numeric(10,2),
  -- 5 · Outras receitas sujeitas a Décimas
  add column if not exists rec_outras_sujeitas_decima    numeric(10,2),
  -- 6 · Subtotal (valor base de cálculo da décima do dia) — CALCULADO: 1 a 5
  add column if not exists rec_subtotal_base_decima      numeric(10,2),
  -- 7 · Subvenção oficial dos Poderes Públicos
  add column if not exists rec_subvencao_publica         numeric(10,2),
  -- 8 · Contribuição da Solidariedade e Coleta de Ozanam
  add column if not exists rec_solidariedade_ozanam      numeric(10,2),
  -- 9 · União Fraternal
  add column if not exists rec_uniao_fraternal           numeric(10,2),
  -- 10 e 11 · linhas em branco do impresso: a Conferência escreve o que for.
  --           Rótulo e valor andam juntos; sem o rótulo o número não se
  --           explica no documento nem na folha enviada ao Conselho.
  add column if not exists rec_livre_1_rotulo            text,
  add column if not exists rec_livre_1_valor             numeric(10,2),
  add column if not exists rec_livre_2_rotulo            text,
  add column if not exists rec_livre_2_valor             numeric(10,2),
  -- 12 · Recebimentos para repasses (exclusivamente em R$)
  add column if not exists rec_para_repasses             numeric(10,2),
  -- 13 · Soma da Receita da semana — CALCULADO: linhas 6 a 12
  add column if not exists rec_soma_semana               numeric(10,2),
  -- 14 · Saldo final da semana anterior
  add column if not exists rec_saldo_semana_anterior     numeric(10,2),
  -- 15 · Balanço — CALCULADO: linhas 13 + 14
  add column if not exists rec_balanco                   numeric(10,2);

-- ----------------------------------------------------------------------------
-- DESPESAS (Pagamento, investimentos sociais e repasses diversos) — 16 a 30
-- ----------------------------------------------------------------------------
alter table public.atas
  -- 16 · Despesas com cestas básicas (alimentos, higiene, limpeza etc)
  add column if not exists des_cestas_basicas            numeric(10,2),
  -- 17 · Despesas com moradia dos Assistidos
  add column if not exists des_moradia_assistidos        numeric(10,2),
  -- 18 · Pagamentos de contas dos assistidos
  add column if not exists des_contas_assistidos         numeric(10,2),
  -- 19 · Obras Especiais
  add column if not exists des_obras_especiais           numeric(10,2),
  -- 20 · União Fraternal
  add column if not exists des_uniao_fraternal           numeric(10,2),
  -- 21, 22 e 25 · linhas em branco do impresso (ver 10 e 11)
  add column if not exists des_livre_1_rotulo            text,
  add column if not exists des_livre_1_valor             numeric(10,2),
  add column if not exists des_livre_2_rotulo            text,
  add column if not exists des_livre_2_valor             numeric(10,2),
  -- 23 · Despesas administrativas e de consumo da Conferência
  add column if not exists des_administrativas           numeric(10,2),
  -- 24 · Décimas pagas ao Conselho Particular (o papel orienta: 10% da linha 6).
  --      DIGITADO, não calculado: é o que foi de fato pago. O que era devido e
  --      ainda não saiu do caixa mora na linha 34.
  add column if not exists des_decima_conselho           numeric(10,2),
  add column if not exists des_livre_3_rotulo            text,
  add column if not exists des_livre_3_valor             numeric(10,2),
  -- 26 · Repasses da Contribuição da Solidariedade e da Coleta de Ozanam
  --      (o papel orienta: linha 8). Digitado, mesmo motivo da 24.
  add column if not exists des_repasse_solidariedade     numeric(10,2),
  -- 27 · Repasses referentes à linha 12. Digitado, mesmo motivo.
  add column if not exists des_repasse_recebidos         numeric(10,2),
  -- 28 · Soma das despesas da semana — CALCULADO: linhas 16 a 27
  add column if not exists des_soma_semana               numeric(10,2),
  -- 29 · Saldo final da semana atual — CALCULADO: linha 15 − linha 28
  add column if not exists des_saldo_semana_atual        numeric(10,2),
  -- 30 · Balanço — CALCULADO: linhas 28 + 29. Tem que bater com a linha 15.
  add column if not exists des_balanco                   numeric(10,2);

-- ----------------------------------------------------------------------------
-- CONTROLE DA DISTRIBUIÇÃO DE BENS MATERIAIS — linhas 31 a 33
--
-- Quantidade, não dinheiro. É o que a Conferência entregou em espécie, e o
-- Conselho acompanha separado do caixa justamente porque uma cesta doada não
-- passa pela conta bancária.
-- ----------------------------------------------------------------------------
alter table public.atas
  -- 31 · Cestas básicas (alimentos, produtos de higiene e limpeza) — em Kg
  add column if not exists bens_cestas_kg                numeric(10,2),
  -- 32 · Roupas, calçados — em unidades
  add column if not exists bens_roupas_calcados          numeric(10,2),
  -- 33 · Outros (o impresso deixa a linha aberta)
  add column if not exists bens_outros_rotulo            text,
  add column if not exists bens_outros_qtd               numeric(10,2);

-- ----------------------------------------------------------------------------
-- RESUMO DA SITUAÇÃO DO CAIXA — linhas 34 a 36
--
-- Onde o formulário separa o que a Conferência TEM do que ela DEVE. A linha 29
-- é o saldo bruto; as linhas 34 e 35 são o dinheiro que já está prometido ao
-- Conselho Particular e só não saiu ainda. A linha 36 é a soma das três — o
-- total sob responsabilidade da tesouraria.
-- ----------------------------------------------------------------------------
alter table public.atas
  -- 34 · Décimas a serem enviadas ao Conselho Particular
  add column if not exists res_decimas_a_enviar          numeric(10,2),
  -- 35 · Outras contribuições a enviar ao Conselho Particular (Coleta de
  --      Ozanam, Contribuição da Solidariedade)
  add column if not exists res_outras_a_enviar           numeric(10,2),
  -- 36 · Total de recursos com a Tesouraria — CALCULADO: linhas 29 + 34 + 35
  add column if not exists res_total_tesouraria          numeric(10,2);

-- ----------------------------------------------------------------------------
-- Contadores do cabeçalho do formulário
--
-- O bloco da esquerda, de assistência, é contagem de gente e vem da boca da
-- Conferência na reunião — o Prontuário tem os dados, mas o que a folha
-- declara é o que foi dito no dia, e a folha é assinada.
--
-- `integer` aqui, e não numeric: meia família não existe. CHECK de não
-- negativo porque um contador negativo não é "não informado", é erro de
-- digitação — e nulo já cobre o não informado.
--
-- O bloco da direita (Presentes / Confrades / Consócias / Aspirantes) NÃO
-- vira coluna: sai contado de `atas_presencas`, que já tem uma linha por
-- pessoa, assim que a migração 026 acrescentar a categoria. Gravar o total
-- aqui seria um segundo número para a mesma pergunta, livre para divergir da
-- lista de nomes impressa logo acima dele na própria ata.
--
-- `visitantes_qtd` é a exceção, e por um motivo concreto: `atas.visitantes` é
-- texto livre com os nomes (migração 022) — visitante não tem cadastro, logo
-- não tem linha em `atas_presencas` para contar. Contar vírgulas no texto
-- seria adivinhação.
-- ----------------------------------------------------------------------------
alter table public.atas
  add column if not exists familias_assistidas        integer check (familias_assistidas >= 0),
  add column if not exists pessoas_atendidas          integer check (pessoas_atendidas >= 0),
  add column if not exists familias_ajuda_material    integer check (familias_ajuda_material >= 0),
  add column if not exists familias_ajuda_espiritual  integer check (familias_ajuda_espiritual >= 0),
  add column if not exists visitantes_qtd             integer check (visitantes_qtd >= 0);

-- ----------------------------------------------------------------------------
-- Comentários — os que não se deduzem do nome da coluna
-- ----------------------------------------------------------------------------
comment on column public.atas.rec_subtotal_base_decima is
  'Linha 6 do Movimento de Caixa. CALCULADO (linhas 1 a 5). É a base de cálculo da décima do dia: subvenção pública, Contribuição da Solidariedade e União Fraternal ficam fora de propósito.';

comment on column public.atas.rec_soma_semana is
  'Linha 13. CALCULADO: linhas 6 a 12 — a linha 6 já é o subtotal das linhas 1 a 5, que por isso não entram de novo.';

comment on column public.atas.rec_balanco is
  'Linha 15. CALCULADO: linhas 13 + 14. Tem que bater com a linha 30 — é a conferência embutida no formulário.';

comment on column public.atas.des_decima_conselho is
  'Linha 24. DIGITADO: a décima efetivamente paga. O impresso orienta 10% da linha 6, mas o devido e ainda não pago é a linha 34.';

comment on column public.atas.des_balanco is
  'Linha 30. CALCULADO: linhas 28 + 29. Tem que bater com a linha 15.';

comment on column public.atas.res_total_tesouraria is
  'Linha 36. CALCULADO: linhas 29 + 34 + 35 — o saldo mais o que já está prometido ao Conselho Particular e ainda não saiu.';

comment on column public.atas.bens_cestas_kg is
  'Linha 31, em QUILOS. numeric e não integer por isso.';

comment on column public.atas.visitantes_qtd is
  'Quantos visitantes estiveram na reunião. Coluna própria porque visitante não tem cadastro e, portanto, não tem linha em atas_presencas para contar — atas.visitantes guarda só os nomes, em texto livre.';

-- Nenhuma policy nova: as colunas nascem dentro de `atas`, e as policies da
-- migração 022 são por linha, não por coluna. Quem lavra a ata lavra o
-- Movimento de Caixa junto, e a ata aprovada tranca os dois ao mesmo tempo —
-- que é exatamente o comportamento do papel, onde as duas folhas são
-- assinadas na mesma reunião.
