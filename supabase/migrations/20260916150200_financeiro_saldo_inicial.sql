-- ============================================================================
-- 016 · Controle Orçamentário — saldo inicial
-- ----------------------------------------------------------------------------
-- A conta poupança BRB já tinha saldo antes deste sistema existir. Linha
-- única (singleton): "id boolean" com CHECK(id) só aceita o valor `true` e,
-- sendo chave primária, só pode haver uma linha. O tesoureiro faz upsert por
-- id=true, nunca insert solto.
-- ============================================================================

create table if not exists public.saldo_inicial_financeiro (
  id              boolean primary key default true,
  valor           numeric(10,2) not null default 0,
  data_referencia date not null default current_date,
  observacoes     text,
  atualizado_por  uuid references auth.users(id) on delete set null,
  atualizado_em   timestamptz not null default now(),

  constraint saldo_inicial_financeiro_singleton check (id)
);

comment on table public.saldo_inicial_financeiro is
  'Linha única: saldo da conta BRB na data em que o controle orçamentário passou a valer. Ponto de partida do saldo corrente (vw_saldo_financeiro, migração 017).';

alter table public.saldo_inicial_financeiro enable row level security;

revoke all on public.saldo_inicial_financeiro from anon, authenticated;
grant select, insert, update on public.saldo_inicial_financeiro to authenticated;

drop policy if exists "confrade ativo lê saldo_inicial_financeiro" on public.saldo_inicial_financeiro;
create policy "confrade ativo lê saldo_inicial_financeiro"
  on public.saldo_inicial_financeiro
  for select
  to authenticated
  using (public.is_confrade_ativo());

drop policy if exists "tesoureiro/admin insere saldo_inicial_financeiro" on public.saldo_inicial_financeiro;
create policy "tesoureiro/admin insere saldo_inicial_financeiro"
  on public.saldo_inicial_financeiro
  for insert
  to authenticated
  with check (public.pode_lancar_financeiro());

drop policy if exists "tesoureiro/admin atualiza saldo_inicial_financeiro" on public.saldo_inicial_financeiro;
create policy "tesoureiro/admin atualiza saldo_inicial_financeiro"
  on public.saldo_inicial_financeiro
  for update
  to authenticated
  using (public.pode_lancar_financeiro())
  with check (public.pode_lancar_financeiro());

drop trigger if exists saldo_inicial_financeiro_atualizado_em on public.saldo_inicial_financeiro;
create trigger saldo_inicial_financeiro_atualizado_em
  before update on public.saldo_inicial_financeiro
  for each row execute function public.tocar_atualizado_em();
