-- ============================================================================
-- 017 · Controle Orçamentário — conciliações e saldo corrente
-- ----------------------------------------------------------------------------
-- Registro periódico "o extrato do BRB mostrava R$X em tal data" comparado
-- ao que o sistema calcula — pega lançamento esquecido/errado. A diferença
-- fica CONGELADA no momento do registro (não recalcula depois, ao contrário
-- da view de saldo corrente, que é sempre "agora").
-- ============================================================================

create table if not exists public.conciliacoes_financeiras (
  id              uuid primary key default gen_random_uuid(),
  data_referencia date not null,
  saldo_extrato   numeric(10,2) not null,
  saldo_sistema   numeric(10,2) not null,
  diferenca       numeric(10,2) generated always as (saldo_extrato - saldo_sistema) stored,
  observacoes     text,
  conciliado_por  uuid not null references auth.users(id) on delete restrict,
  criado_em       timestamptz not null default now()
);

comment on table public.conciliacoes_financeiras is
  'Conferência periódica do saldo calculado contra o extrato real do BRB. saldo_sistema é congelado no momento do registro.';

create index if not exists conciliacoes_financeiras_data_idx
  on public.conciliacoes_financeiras (data_referencia desc);

alter table public.conciliacoes_financeiras enable row level security;

revoke all on public.conciliacoes_financeiras from anon, authenticated;
grant select, insert on public.conciliacoes_financeiras to authenticated;
-- Sem UPDATE/DELETE: uma conciliação registrada é histórico — se foi
-- lançada errada, registra-se uma nova, não se corrige a antiga.

drop policy if exists "confrade ativo lê conciliacoes_financeiras" on public.conciliacoes_financeiras;
create policy "confrade ativo lê conciliacoes_financeiras"
  on public.conciliacoes_financeiras
  for select
  to authenticated
  using (public.is_confrade_ativo());

drop policy if exists "tesoureiro/admin registra conciliacoes_financeiras" on public.conciliacoes_financeiras;
create policy "tesoureiro/admin registra conciliacoes_financeiras"
  on public.conciliacoes_financeiras
  for insert
  to authenticated
  with check (public.pode_lancar_financeiro());

-- ----------------------------------------------------------------------------
-- vw_saldo_financeiro — saldo corrente = saldo inicial + entradas − saídas
-- (só lançamentos não removidos, desde a data_referencia do saldo inicial).
--
-- View com security_invoker = true: roda com os direitos de quem consulta
-- (não do dono da view), então a RLS de lancamentos_financeiros/
-- saldo_inicial_financeiro é avaliada normalmente por baixo — sem isso, uma
-- "create or replace view" comum roda como o dono (postgres), ignorando RLS.
-- Sempre devolve exatamente uma linha (a CTE `base` não depende de FROM).
-- ----------------------------------------------------------------------------
create or replace view public.vw_saldo_financeiro
  with (security_invoker = true) as
with base as (
  select
    coalesce((select valor from public.saldo_inicial_financeiro limit 1), 0) as saldo_inicial,
    coalesce((select data_referencia from public.saldo_inicial_financeiro limit 1), '1900-01-01'::date) as data_referencia_inicial
)
select
  base.saldo_inicial,
  base.data_referencia_inicial,
  coalesce((
    select sum(l.valor) from public.lancamentos_financeiros l
     where l.tipo = 'entrada' and l.removido_em is null
       and l.data_movimento >= base.data_referencia_inicial
  ), 0) as total_entradas,
  coalesce((
    select sum(l.valor) from public.lancamentos_financeiros l
     where l.tipo = 'saida' and l.removido_em is null
       and l.data_movimento >= base.data_referencia_inicial
  ), 0) as total_saidas,
  base.saldo_inicial
    + coalesce((
        select sum(l.valor) from public.lancamentos_financeiros l
         where l.tipo = 'entrada' and l.removido_em is null
           and l.data_movimento >= base.data_referencia_inicial
      ), 0)
    - coalesce((
        select sum(l.valor) from public.lancamentos_financeiros l
         where l.tipo = 'saida' and l.removido_em is null
           and l.data_movimento >= base.data_referencia_inicial
      ), 0) as saldo_atual
from base;

revoke all on public.vw_saldo_financeiro from anon, authenticated;
grant select on public.vw_saldo_financeiro to authenticated;

comment on view public.vw_saldo_financeiro is
  'Saldo corrente único (uma linha): saldo inicial + entradas − saídas não removidas desde a data do saldo inicial. security_invoker = true garante que a RLS de lancamentos_financeiros/saldo_inicial_financeiro seja avaliada como o usuário que consulta, não como o dono da view.';
