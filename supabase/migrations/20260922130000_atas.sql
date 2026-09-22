-- ============================================================================
-- 022 · Livro de Atas — a ata da reunião da Conferência
-- ----------------------------------------------------------------------------
-- A Conferência escreve a ata à mão, num formulário impresso frente-e-verso
-- ("MINUTA DA ATA DA CONFERENCIA"), num livro sequencial — a última ata em
-- papel é a de número 243. O rito é fixo: a ata é lavrada pela secretária, e
-- na reunião SEGUINTE ela é lida, posta em discussão e aprovada.
--
-- Esta tabela é o livro. Uma linha por reunião, com todos os campos da minuta,
-- na ordem em que aparecem no papel.
--
-- Duas decisões que valem ser lidas antes de mexer aqui:
--
-- 1. `numero` é UNIQUE, e não uma sequence. O livro de papel continua: a
--    primeira ata do sistema recebe o número à mão (244, ou o que for) e segue
--    dali. Uma sequence começaria no 1 e brigaria com o livro.
--
-- 2. Os nove valores da tesouraria ficam GRAVADOS aqui, não são calculados na
--    leitura. A tela sugere os números a partir de lancamentos_financeiros,
--    mas depois de salvos eles são o registro do que foi dito em reunião.
--    Se fossem calculados ao vivo, corrigir um lançamento em dezembro
--    reescreveria a ata de setembro que já foi lida, aprovada e assinada.
-- ============================================================================

create table if not exists public.atas (
  id             uuid primary key default gen_random_uuid(),

  -- ----- Identificação da reunião ------------------------------------------
  -- "Ata da reunião ordinária de número ___"
  numero         integer not null unique check (numero > 0),
  data_reuniao   date not null,
  hora           time,
  local          text,
  tipo           text not null default 'ordinaria'
                   check (tipo in ('ordinaria','extraordinaria')),

  -- ----- Abertura ----------------------------------------------------------
  -- "presidida pela (confrade ou consocia) ___"
  --
  -- Texto livre, e não uma referência a confrades: quem preside pode ser um
  -- visitante do Conselho Particular ou do Metropolitano, que não tem conta
  -- no sistema. A lista de presentes (atas_presencas) é que é estruturada.
  presidida_por  text,
  visitantes     text,
  justificativas text,

  -- ----- Leitura espiritual ------------------------------------------------
  -- "foi feita a leitura ___ retirada: ___"
  leitura_obra   text,
  leitura_trecho text,

  -- ----- Tesouraria --------------------------------------------------------
  -- Os nove campos do bloco do caixa, na ordem do formulário. numeric(10,2)
  -- é o mesmo tipo de lancamentos_financeiros.valor — nunca float, que não
  -- representa centavo exato.
  --
  -- Sem NOT NULL: a ata pode ser salva como rascunho no meio da reunião, antes
  -- de a tesoureira apresentar o caixa. Nulo é "ainda não informado", que é
  -- diferente de zero.
  saldo_anterior     numeric(10,2),
  coleta             numeric(10,2),
  outras_fontes      numeric(10,2),
  soma_receita       numeric(10,2),
  auxilio_assistidos numeric(10,2),
  despesas_diversas  numeric(10,2),
  decima             numeric(10,2),
  soma_despesa       numeric(10,2),
  saldo_atual        numeric(10,2),

  -- ----- Verso do formulário -----------------------------------------------
  noticias_familias text,
  expediente        text,
  escala_visitas    text,
  privilegiados     text,
  -- "Eu ___ lavrei a presente ata"
  redigida_por      text,

  -- ----- Ciclo de vida -----------------------------------------------------
  -- 'rascunho' enquanto a ata não foi lida e aprovada na reunião seguinte;
  -- 'aprovada' depois disso — e aí ela trava (ver a policy de UPDATE abaixo).
  status        text not null default 'rascunho'
                  check (status in ('rascunho','aprovada')),
  aprovada_em   timestamptz,
  aprovada_por  uuid references auth.users(id) on delete set null,

  -- ----- Trilha ------------------------------------------------------------
  criado_por     uuid not null references auth.users(id) on delete restrict,
  criado_em      timestamptz not null default now(),
  atualizado_por uuid references auth.users(id) on delete set null,
  atualizado_em  timestamptz not null default now(),

  -- Os dois lados da aprovação andam juntos: não existe ata aprovada sem data
  -- de aprovação, nem data de aprovação em ata que ainda é rascunho. Mesmo
  -- molde de pedidos_oracao_aprovacao_coerente (migração 003).
  constraint atas_aprovacao_coerente
    check ((status = 'aprovada') = (aprovada_em is not null))
);

comment on table public.atas is
  'Livro de atas da Conferência. Uma linha por reunião, com os campos da minuta impressa. Os valores da tesouraria são um retrato do que foi apresentado na reunião, não um cálculo ao vivo sobre lancamentos_financeiros.';

comment on column public.atas.numero is
  'Número da reunião no livro, contínuo com o livro de papel (a última ata manuscrita é a 243). UNIQUE, preenchido pela tela com max(numero)+1.';

comment on column public.atas.status is
  'rascunho até ser lida e aprovada na reunião seguinte; aprovada trava a linha (ver policy de UPDATE).';

-- O histórico é sempre lido do mais recente para o mais antigo.
create index if not exists atas_numero_desc_idx on public.atas (numero desc);
create index if not exists atas_data_reuniao_desc_idx on public.atas (data_reuniao desc);

-- ----------------------------------------------------------------------------
-- pode_redigir_ata() — quem lavra a ata.
--
-- Mesmo molde de pode_lancar_financeiro() (migração 014): SECURITY DEFINER
-- para poder ser chamada de dentro de uma policy sem depender da RLS do
-- chamador, e `search_path` fixo fechando o sequestro de schema.
--
-- O papel `secretario` existe em confrades desde a migração 006, e o
-- comentário de lá dizia textualmente que era "para os módulos futuros (atas,
-- financeiro)". Esta é a outra metade daquela frase.
--
-- Presidente e vice entram porque, na prática da Conferência, quem preside
-- assume a ata na ausência da secretária.
-- ----------------------------------------------------------------------------
create or replace function public.pode_redigir_ata()
  returns boolean
  language sql
  security definer
  stable
  set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.confrades
     where user_id = auth.uid()
       and ativo
       and papel in ('secretario', 'presidente', 'vice_presidente', 'administrador')
  );
$$;

comment on function public.pode_redigir_ata() is
  'True se o usuário autenticado atual é confrade ativo com papel secretario, presidente, vice_presidente ou administrador — quem pode lavrar e editar ata.';

revoke all on function public.pode_redigir_ata() from public, anon;
grant execute on function public.pode_redigir_ata() to authenticated;

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
alter table public.atas enable row level security;

revoke all on public.atas from anon, authenticated;
grant select, insert, update on public.atas to authenticated;
-- Sem DELETE, pelo mesmo motivo do financeiro: livro de atas é registro
-- institucional e pede trilha, não apagamento. Ata errada é corrigida por
-- outra ata, como no papel.

drop policy if exists "confrade ativo lê atas" on public.atas;
create policy "confrade ativo lê atas"
  on public.atas
  for select
  to authenticated
  using (public.is_confrade_ativo());

drop policy if exists "secretário/presidente cria atas" on public.atas;
create policy "secretário/presidente cria atas"
  on public.atas
  for insert
  to authenticated
  with check (public.pode_redigir_ata());

-- A trava da ata aprovada mora aqui, e não no front.
--
-- `using` avalia a linha COMO ELA ESTÁ no banco, antes do update. Então:
--   • linha em rascunho  → passa, e pode inclusive virar 'aprovada';
--   • linha já aprovada  → só é alcançável por is_admin(), que é o caminho
--                          de reabertura quando a Conferência decide corrigir.
--
-- O `with check` repete pode_redigir_ata() para que ninguém sem o papel
-- termine como autor da versão nova da linha.
drop policy if exists "secretário/presidente edita ata em rascunho" on public.atas;
create policy "secretário/presidente edita ata em rascunho"
  on public.atas
  for update
  to authenticated
  using (
    public.pode_redigir_ata()
    and (status = 'rascunho' or public.is_admin())
  )
  with check (public.pode_redigir_ata());

drop trigger if exists atas_atualizado_em on public.atas;
create trigger atas_atualizado_em
  before update on public.atas
  for each row execute function public.tocar_atualizado_em();
