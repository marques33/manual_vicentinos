-- ============================================================================
-- 015 · Controle Orçamentário — lançamentos
-- ----------------------------------------------------------------------------
-- Entradas e saídas da conta da Conferência (coletas, doações, ajuda a
-- famílias, despesas administrativas, repasses). Soft delete: nunca há
-- DELETE de verdade, só UPDATE marcando removido_em/removido_por — dado
-- financeiro institucional pede trilha, não apagamento (diferente do resto
-- do site).
-- ============================================================================

create table if not exists public.lancamentos_financeiros (
  id             uuid primary key default gen_random_uuid(),

  tipo           text not null check (tipo in ('entrada','saida')),
  valor          numeric(10,2) not null check (valor > 0),
  data_movimento date not null,
  categoria_id   uuid not null references public.categorias_financeiras(id) on delete restrict,
  descricao      text,

  -- Preenchido só quando a saída é ajuda a família já registrada no
  -- Prontuário — evita duplicar o mesmo dado em duas tabelas. Nulo pra
  -- qualquer outro tipo de lançamento.
  intervencao_id uuid references public.intervencoes(id) on delete set null,

  -- Caminho no bucket privado comprovantes-financeiros (migração 018).
  -- Nulo = sem comprovante anexado.
  comprovante_path text,

  criado_por     uuid not null references auth.users(id) on delete restrict,
  criado_em      timestamptz not null default now(),
  atualizado_por uuid references auth.users(id) on delete set null,
  atualizado_em  timestamptz not null default now(),

  removido_por   uuid references auth.users(id) on delete set null,
  removido_em    timestamptz
);

comment on table public.lancamentos_financeiros is
  'Entradas e saídas do controle orçamentário. removido_em preenchido = soft delete, some do extrato/saldo mas fica no banco.';

create index if not exists lancamentos_financeiros_ativos_idx
  on public.lancamentos_financeiros (data_movimento desc)
  where removido_em is null;

alter table public.lancamentos_financeiros enable row level security;

revoke all on public.lancamentos_financeiros from anon, authenticated;
grant select, insert, update on public.lancamentos_financeiros to authenticated;
-- Sem DELETE: soft delete é UPDATE (removido_em/removido_por).

drop policy if exists "confrade ativo lê lancamentos_financeiros" on public.lancamentos_financeiros;
create policy "confrade ativo lê lancamentos_financeiros"
  on public.lancamentos_financeiros
  for select
  to authenticated
  using (public.is_confrade_ativo());

drop policy if exists "tesoureiro/admin insere lancamentos_financeiros" on public.lancamentos_financeiros;
create policy "tesoureiro/admin insere lancamentos_financeiros"
  on public.lancamentos_financeiros
  for insert
  to authenticated
  with check (public.pode_lancar_financeiro());

drop policy if exists "tesoureiro/admin atualiza lancamentos_financeiros" on public.lancamentos_financeiros;
create policy "tesoureiro/admin atualiza lancamentos_financeiros"
  on public.lancamentos_financeiros
  for update
  to authenticated
  using (public.pode_lancar_financeiro())
  with check (public.pode_lancar_financeiro());

drop trigger if exists lancamentos_financeiros_atualizado_em on public.lancamentos_financeiros;
create trigger lancamentos_financeiros_atualizado_em
  before update on public.lancamentos_financeiros
  for each row execute function public.tocar_atualizado_em();

-- ----------------------------------------------------------------------------
-- Consistência que um CHECK não resolve sozinho (CHECK não pode consultar
-- outra tabela em Postgres): a categoria tem que ser do mesmo tipo do
-- lançamento, e só uma SAÍDA pode referenciar uma intervenção.
-- ----------------------------------------------------------------------------
create or replace function public.verificar_consistencia_lancamento()
  returns trigger
  language plpgsql
  set search_path = public, pg_temp
as $$
declare
  v_tipo_categoria text;
begin
  select tipo into v_tipo_categoria
    from public.categorias_financeiras where id = new.categoria_id;

  if v_tipo_categoria is distinct from new.tipo then
    raise exception 'categoria % não é do tipo %', new.categoria_id, new.tipo;
  end if;

  if new.intervencao_id is not null and new.tipo <> 'saida' then
    raise exception 'lançamento vinculado a uma intervenção precisa ser do tipo saida';
  end if;

  return new;
end;
$$;

drop trigger if exists lancamentos_financeiros_consistencia on public.lancamentos_financeiros;
create trigger lancamentos_financeiros_consistencia
  before insert or update on public.lancamentos_financeiros
  for each row execute function public.verificar_consistencia_lancamento();
