-- ============================================================================
-- 014 · Controle Orçamentário — categorias financeiras
-- ----------------------------------------------------------------------------
-- Fase 3 de 3 (perfis de acesso → dashboard de efetividade → controle
-- orçamentário). Categorias abertas: tesoureiro/administrador cadastra pela
-- UI, sem migration nova por categoria — só a estrutura nasce aqui.
-- ============================================================================

create table if not exists public.categorias_financeiras (
  id         uuid primary key default gen_random_uuid(),
  tipo       text not null check (tipo in ('entrada','saida')),
  nome       text not null check (char_length(btrim(nome)) between 2 and 80),
  ativa      boolean not null default true,
  criado_em  timestamptz not null default now(),

  constraint categorias_financeiras_tipo_nome_unico unique (tipo, nome)
);

comment on table public.categorias_financeiras is
  'Categorias de entrada e saída do controle orçamentário. Cadastro aberto pela UI (tesoureiro/administrador).';

alter table public.categorias_financeiras enable row level security;

revoke all on public.categorias_financeiras from anon, authenticated;
grant select, insert, update on public.categorias_financeiras to authenticated;
-- Sem DELETE: categoria usada por um lançamento não pode desaparecer
-- (lancamentos_financeiros.categoria_id é ON DELETE RESTRICT) — desativar
-- (ativa = false) é o jeito de "remover" uma categoria da UI sem quebrar
-- histórico.

drop policy if exists "confrade ativo lê categorias_financeiras" on public.categorias_financeiras;
create policy "confrade ativo lê categorias_financeiras"
  on public.categorias_financeiras
  for select
  to authenticated
  using (public.is_confrade_ativo());

drop policy if exists "tesoureiro/admin insere categorias_financeiras" on public.categorias_financeiras;
create policy "tesoureiro/admin insere categorias_financeiras"
  on public.categorias_financeiras
  for insert
  to authenticated
  with check (public.pode_lancar_financeiro());

drop policy if exists "tesoureiro/admin atualiza categorias_financeiras" on public.categorias_financeiras;
create policy "tesoureiro/admin atualiza categorias_financeiras"
  on public.categorias_financeiras
  for update
  to authenticated
  using (public.pode_lancar_financeiro())
  with check (public.pode_lancar_financeiro());

-- ----------------------------------------------------------------------------
-- pode_lancar_financeiro() — quem lança/edita dado financeiro.
--
-- Diferente de is_admin() (moderação do site) — confrades.papel foi desenhada
-- desde a Fase 1 do Prontuário justamente para RBAC fino como este. Fica
-- nesta migração (a primeira do módulo financeiro a precisar dela) para não
-- abrir uma migração só de função.
-- ----------------------------------------------------------------------------
create or replace function public.pode_lancar_financeiro()
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
       and papel in ('tesoureiro', 'administrador')
  );
$$;

comment on function public.pode_lancar_financeiro() is
  'True se o usuário autenticado atual é confrade ativo com papel tesoureiro ou administrador — quem pode lançar/editar o controle orçamentário.';

revoke all on function public.pode_lancar_financeiro() from public, anon;
grant execute on function public.pode_lancar_financeiro() to authenticated;

-- Seed inicial — editável depois pela UI, sem migration nova.
insert into public.categorias_financeiras (tipo, nome) values
  ('entrada', 'Coleta em reunião'),
  ('entrada', 'Doação avulsa'),
  ('entrada', 'Doação PIX do site'),
  ('entrada', 'Repasse recebido'),
  ('saida',   'Ajuda a família'),
  ('saida',   'Despesa administrativa'),
  ('saida',   'Repasse ao Conselho Particular'),
  ('saida',   'Outra')
on conflict (tipo, nome) do nothing;
