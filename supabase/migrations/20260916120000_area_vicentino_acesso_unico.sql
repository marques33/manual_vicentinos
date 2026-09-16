-- ============================================================================
-- 013 · Área do Vicentino — uma única autorização para as três ferramentas
-- ----------------------------------------------------------------------------
-- Até aqui havia dois círculos independentes:
--
--   public.admins     → moderação do mural e dos pedidos de oração
--   public.confrades  → Prontuário de Atendimento
--
-- e o Manual de Direitos tinha um terceiro "acesso": usuário e senha fixos no
-- código do front, iguais para todo mundo. Três portas, três credenciais.
--
-- Decisão da Conferência (16/09/2026): a Área do Vicentino passa a ter UMA
-- porta. Quem é confrade ativo entra e usa as três ferramentas, moderação
-- inclusive.
--
-- O que isso muda de fato, dito sem eufemismo: o confrade que hoje só vê o
-- prontuário passará a ver também os pedidos de oração AINDA NÃO moderados —
-- texto escrito por gente da comunidade, com dado pessoal, antes de qualquer
-- triagem. Foi decisão explícita do usuário, tomada com essa consequência na
-- mesa. Se um dia a Conferência crescer a ponto de isso incomodar, o caminho
-- é reverter esta migração (voltar as políticas para is_admin()), não remendar
-- o front — o front nunca foi a fronteira.
--
-- `public.admins` continua existindo e valendo: é o que autoriza um moderador
-- que NÃO é vicentino de visita (responsável técnico do site, por exemplo).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- is_membro_area() — o conceito único de autorização da Área do Vicentino.
--
-- SECURITY DEFINER pelo mesmo motivo das duas funções que ela compõe: as
-- políticas de leitura de `admins` e de `confrades` chamam justamente essas
-- funções, e uma função sem definer recursionaria ao ler as tabelas. Aqui o
-- definer é, além disso, o que garante que ela funcione dentro de qualquer
-- política sem depender da RLS do chamador. `search_path` fixo fecha o vetor
-- de sequestro de schema.
-- ----------------------------------------------------------------------------
create or replace function public.is_membro_area()
  returns boolean
  language sql
  security definer
  stable
  set search_path = public, pg_temp
as $$
  select public.is_admin() or public.is_confrade_ativo();
$$;

comment on function public.is_membro_area() is
  'True se o usuário autenticado é moderador (public.admins) ou confrade ativo '
  '(public.confrades). Autorização única da Área do Vicentino: manual, '
  'prontuário e moderação.';

revoke all on function public.is_membro_area() from public, anon;
grant execute on function public.is_membro_area() to authenticated;

-- ----------------------------------------------------------------------------
-- Moderação do mural
--
-- Os dois `drop` são de propósito: o primeiro remove a política antiga pelo
-- nome antigo, o segundo torna a migração repetível sem erro.
-- ----------------------------------------------------------------------------
drop policy if exists "admin gerencia mural" on public.mural_posts;
drop policy if exists "membro da área gerencia mural" on public.mural_posts;
create policy "membro da área gerencia mural"
  on public.mural_posts
  for all
  to authenticated
  using (public.is_membro_area())
  with check (public.is_membro_area());

-- ----------------------------------------------------------------------------
-- Moderação dos pedidos de oração
-- ----------------------------------------------------------------------------
drop policy if exists "admin gerencia pedidos" on public.pedidos_oracao;
drop policy if exists "membro da área gerencia pedidos" on public.pedidos_oracao;
create policy "membro da área gerencia pedidos"
  on public.pedidos_oracao
  for all
  to authenticated
  using (public.is_membro_area())
  with check (public.is_membro_area());

-- ----------------------------------------------------------------------------
-- Deliberadamente NÃO alterado: a política de leitura de `public.admins`
-- continua exigindo is_admin(). Saber quem são os moderadores não faz parte do
-- que a Área do Vicentino precisa entregar, e alargar isso seria alargar por
-- inércia, não por pedido.
-- ----------------------------------------------------------------------------
