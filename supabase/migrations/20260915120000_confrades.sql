-- ============================================================================
-- 006 · Confrades com acesso ao Prontuário de Atendimento
-- ----------------------------------------------------------------------------
-- Quem pode ver e editar o prontuário das famílias assistidas.
--
-- Diferente de `public.admins` (que autoriza moderação do mural e dos
-- pedidos de oração, um círculo pequeno), esta tabela representa a
-- associação institucional "é vicentino ativo da Conferência agora" — uma
-- população maior. As duas tabelas são independentes de propósito; quem
-- acumula os dois papéis (ex.: presidente que também modera o site) é
-- cadastrado manualmente nas duas.
--
-- Os usuários NÃO são criados aqui: crie-os no Dashboard
--   Authentication → Users → Add user  (e-mail + senha)
-- e depois insira o `user_id` nesta tabela.
-- ============================================================================

create table if not exists public.confrades (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  nome_completo text not null check (char_length(btrim(nome_completo)) between 3 and 150),

  -- Usado pelos módulos futuros (atas, financeiro) para RBAC mais fino.
  -- Nenhuma política desta migração distingue por papel ainda.
  papel         text not null default 'vicentino'
                  check (papel in ('vicentino','presidente','vice_presidente',
                                    'tesoureiro','secretario','confrade_espiritual')),

  ativo         boolean not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

comment on table public.confrades is
  'Vicentinos ativos da Conferência, com acesso ao Prontuário de Atendimento.';

alter table public.confrades enable row level security;

-- ----------------------------------------------------------------------------
-- is_confrade_ativo() — usada por todas as políticas do prontuário.
--
-- SECURITY DEFINER de propósito, mesmo motivo de is_admin(): sem isso, a
-- política de leitura de `confrades` chamaria uma função que lê `confrades`,
-- e a política recursionaria. `search_path` fixo fecha o vetor clássico de
-- sequestro de schema em funções SECURITY DEFINER.
-- ----------------------------------------------------------------------------
create or replace function public.is_confrade_ativo()
  returns boolean
  language sql
  security definer
  stable
  set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.confrades where user_id = auth.uid() and ativo
  );
$$;

comment on function public.is_confrade_ativo() is
  'True se o usuário autenticado atual está em public.confrades e está ativo.';

-- Qualquer confrade ativo vê a lista inteira (não só a própria linha) — é
-- assim que o prontuário mostra "atendido por Fulano" sem expor e-mail/senha,
-- só o nome. Mesmo padrão de is_admin() sobre public.admins.
drop policy if exists "confrade ativo lê confrades" on public.confrades;
create policy "confrade ativo lê confrades"
  on public.confrades
  for select
  to authenticated
  using (public.is_confrade_ativo());

-- A tabela não existe para o público. Alterar a lista de confrades é
-- operação de Dashboard/SQL, nunca pela API.
revoke all on public.confrades from anon, authenticated;
grant select on public.confrades to authenticated;

revoke all on function public.is_confrade_ativo() from public, anon;
grant execute on function public.is_confrade_ativo() to authenticated;
