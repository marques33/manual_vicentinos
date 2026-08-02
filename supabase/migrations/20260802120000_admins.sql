-- ============================================================================
-- 001 · Administradores da Conferência
-- ----------------------------------------------------------------------------
-- Quem modera o mural e a fila de pedidos de oração.
--
-- Os usuários NÃO são criados aqui: crie-os no Dashboard
--   Authentication → Users → Add user  (e-mail + senha)
-- e depois insira o `user_id` nesta tabela. E, no mesmo Dashboard,
--   Authentication → Providers → Email → "Enable sign ups" = OFF
-- sem isso qualquer visitante cria a própria conta.
-- ============================================================================

create table if not exists public.admins (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  nome      text,
  criado_em timestamptz not null default now()
);

comment on table public.admins is
  'Usuários autorizados a moderar o mural e os pedidos de oração.';

alter table public.admins enable row level security;

-- ----------------------------------------------------------------------------
-- is_admin() — usada por todas as políticas de moderação.
--
-- SECURITY DEFINER de propósito: roda como dono da função, portanto ignora a
-- RLS de public.admins. Sem isso a política de leitura de `admins` chamaria uma
-- função que lê `admins`, e a política recursionaria.
-- `search_path` fixo fecha o vetor clássico de sequestro de schema em funções
-- SECURITY DEFINER.
-- ----------------------------------------------------------------------------
create or replace function public.is_admin()
  returns boolean
  language sql
  security definer
  stable
  set search_path = public, pg_temp
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

comment on function public.is_admin() is
  'True se o usuário autenticado atual está em public.admins.';

-- Só quem já é admin enxerga a lista de admins.
drop policy if exists "admin lê admins" on public.admins;
create policy "admin lê admins"
  on public.admins
  for select
  to authenticated
  using (public.is_admin());

-- A tabela não existe para o público. Alterar a lista de admins é operação
-- de Dashboard/SQL, nunca pela API.
revoke all on public.admins from anon, authenticated;
grant select on public.admins to authenticated;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;
