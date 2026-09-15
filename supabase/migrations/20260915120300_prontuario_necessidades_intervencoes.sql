-- ============================================================================
-- 009 · Prontuário — necessidades e intervenções
-- ----------------------------------------------------------------------------
-- `necessidades` guarda o que a pessoa precisa; `intervencoes` guarda o que
-- foi feito a respeito. `intervencoes` é também o histórico de atendimento
-- (quem atendeu, qual família, quando) — não existe tabela separada para
-- isso, seria duplicar a mesma informação.
-- ============================================================================

create table if not exists public.necessidades (
  id               uuid primary key default gen_random_uuid(),
  pessoa_id        uuid not null references public.pessoas(id) on delete cascade,

  -- Denormalizado de propósito: evita um join extra em toda consulta/índice
  -- por família, e a necessidade nunca muda de família (só de pessoa dentro
  -- da mesma família, o que já seria uma correção manual rara).
  familia_id       uuid not null references public.familias(id) on delete cascade,

  tipo             text not null check (tipo in (
                     'financeira','material','saude','moradia','juridica','outra')),
  descricao        text not null check (char_length(btrim(descricao)) between 5 and 2000),
  urgencia         text not null default 'normal' check (urgencia in ('baixa','normal','alta','urgente')),
  status           text not null default 'aberta'
                      check (status in ('aberta','em_atendimento','atendida','encerrada_sem_atendimento')),

  identificada_em  date not null default current_date,
  identificada_por uuid references auth.users(id) on delete set null,

  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now()
);

comment on table public.necessidades is
  'O que cada pessoa assistida precisa — financeiro, material, saúde, moradia, jurídico.';

create table if not exists public.intervencoes (
  id              uuid primary key default gen_random_uuid(),

  -- Nulo = ação/visita geral, não ligada a uma necessidade específica.
  necessidade_id  uuid references public.necessidades(id) on delete set null,
  familia_id      uuid not null references public.familias(id) on delete cascade,
  pessoa_id       uuid references public.pessoas(id) on delete set null,

  tipo            text not null check (tipo in (
                    'visita','encaminhamento','doacao_financeira','doacao_material',
                    'orientacao','acompanhamento','outro')),
  descricao       text not null check (char_length(btrim(descricao)) between 5 and 2000),
  valor_doado     numeric(10,2) check (valor_doado is null or valor_doado >= 0),
  data_ocorrencia date not null default current_date,

  -- on delete restrict: histórico de "quem atendeu" não pode desaparecer se
  -- a conta do confrade for removida — força reatribuir antes de excluir.
  realizado_por   uuid not null references auth.users(id) on delete restrict,

  criado_em       timestamptz not null default now()
);

comment on table public.intervencoes is
  'O que foi feito por cada família/pessoa — é também o histórico de quem atendeu, quando, e onde.';

create index if not exists necessidades_familia_status_idx on public.necessidades (familia_id, status);
create index if not exists intervencoes_familia_data_idx on public.intervencoes (familia_id, data_ocorrencia desc);

alter table public.necessidades enable row level security;
alter table public.intervencoes enable row level security;

revoke all on public.necessidades from anon, authenticated;
grant select, insert, update, delete on public.necessidades to authenticated;

drop policy if exists "confrade ativo gerencia necessidades" on public.necessidades;
create policy "confrade ativo gerencia necessidades"
  on public.necessidades
  for all
  to authenticated
  using (public.is_confrade_ativo())
  with check (public.is_confrade_ativo());

revoke all on public.intervencoes from anon, authenticated;
grant select, insert, update, delete on public.intervencoes to authenticated;

drop policy if exists "confrade ativo gerencia intervencoes" on public.intervencoes;
create policy "confrade ativo gerencia intervencoes"
  on public.intervencoes
  for all
  to authenticated
  using (public.is_confrade_ativo())
  with check (public.is_confrade_ativo());

drop trigger if exists necessidades_atualizado_em on public.necessidades;
create trigger necessidades_atualizado_em
  before update on public.necessidades
  for each row execute function public.tocar_atualizado_em();

-- `intervencoes` não tem UPDATE previsto na UI (é lançamento de histórico,
-- corrigido por exclusão + novo lançamento se necessário) — sem coluna
-- atualizado_em, sem trigger.
