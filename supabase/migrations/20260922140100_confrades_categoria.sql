-- ============================================================================
-- 026 · Categoria do associado — confrade, consócia, aspirante
-- ----------------------------------------------------------------------------
-- O cabeçalho do "Movimento de Caixa" (migração 025) pede a presença ABERTA
-- por categoria:
--
--     Presentes na reunião ... Nº 08
--     Confrades ............. Nº  —
--     Consócias ............. Nº 07
--     Aspirantes ............ Nº 01
--     Visitantes ............ Nº  —
--
-- `atas_presencas` (023) já sabe QUEM esteve presente, uma linha por pessoa.
-- O que falta é O QUE cada pessoa é — e `confrades` não guardava isso.
--
-- Por que categoria não é papel:
--
--   `papel` é FUNÇÃO na Conferência (presidente, tesoureiro, secretário) —
--   muda a cada eleição e governa permissão. `categoria` é o ESTADO do
--   associado na Sociedade: aspirante é quem ainda não foi efetivado, e
--   confrade/consócia é a mesma condição nos dois gêneros, que o impresso
--   conta em linhas separadas. Uma consócia tesoureira tem as duas coisas.
--   Espremer as duas numa coluna só obrigaria a escolher qual delas perder.
-- ============================================================================

alter table public.confrades
  add column if not exists categoria text not null default 'confrade';

-- `add constraint` não aceita `if not exists`; o par drop/add torna a migração
-- repetível, que é o molde já usado na 012 para o papel 'administrador'.
alter table public.confrades drop constraint if exists confrades_categoria_check;
alter table public.confrades add constraint confrades_categoria_check
  check (categoria in ('confrade', 'consocia', 'aspirante'));

comment on column public.confrades.categoria is
  'Condição do associado na Sociedade: confrade, consocia ou aspirante. Diferente de `papel`, que é a função na Conferência. Alimenta os contadores do cabeçalho do Movimento de Caixa.';

-- O default 'confrade' é o que o Postgres precisa para preencher as linhas que
-- já existem — não é um palpite sobre elas. O cadastro de cada associado
-- precisa ser revisto na tela de administração depois desta migração; até lá
-- os contadores somam todo mundo na primeira linha.

-- ----------------------------------------------------------------------------
-- A cópia congelada na presença
--
-- Mesmo raciocínio — e o mesmo risco — de `atas_presencas.nome` (023): sem
-- copiar, uma aspirante efetivada em dezembro viraria consócia retroativamente
-- em toda ata de que participou como aspirante, incluindo as já lidas,
-- aprovadas e assinadas. E aqui o estrago é aritmético, não só textual: os
-- contadores do Movimento de Caixa de agosto passariam a somar diferente do
-- que a folha enviada ao Conselho Particular dizia.
--
-- Anulável, ao contrário de `nome`: as presenças gravadas ANTES desta migração
-- não têm como saber a categoria do dia. Nulo aqui é "a ata é anterior ao
-- controle de categoria", e a tela conta essas linhas como confrade, que é o
-- mesmo default do cadastro.
-- ----------------------------------------------------------------------------
alter table public.atas_presencas
  add column if not exists categoria text;

alter table public.atas_presencas drop constraint if exists atas_presencas_categoria_check;
alter table public.atas_presencas add constraint atas_presencas_categoria_check
  check (categoria is null or categoria in ('confrade', 'consocia', 'aspirante'));

comment on column public.atas_presencas.categoria is
  'Categoria COPIADA do cadastro no momento em que a presença foi marcada, para que efetivar um aspirante não reescreva os contadores de ata já aprovada. Nulo em presenças gravadas antes da migração 026 — a tela as conta como confrade.';

-- ----------------------------------------------------------------------------
-- Nenhuma policy nova.
--
-- `confrades` tem grant de SELECT apenas (011) e é escrita só pela Edge
-- Function `gerenciar-usuarios`, que passa pelo service client depois de
-- conferir is_admin(). Abrir UPDATE de `confrades` ao cliente para editar uma
-- coluna daria de brinde a edição de `papel` — que é justamente o que decide
-- quem lavra ata e quem lança dinheiro. A categoria é editada pela mesma
-- porta que já existe, com uma ação nova na Function.
--
-- `atas_presencas` já tem as policies de escrita da 023, e elas são por linha:
-- a coluna nova entra no mesmo INSERT/UPDATE que a tela já fazia.
-- ----------------------------------------------------------------------------
