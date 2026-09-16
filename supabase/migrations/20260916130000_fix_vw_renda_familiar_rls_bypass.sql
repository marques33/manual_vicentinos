-- ============================================================================
-- 014 · Prontuário — fecha bypass de RLS em vw_renda_familiar
-- ----------------------------------------------------------------------------
-- Achado fora de escopo durante a revisão da Task 4 da Fase 3 (controle
-- orçamentário): vw_renda_familiar (migração 008,
-- 20260915120200_prontuario_rendas.sql) foi criada como view simples, sem
-- `security_invoker` e sem revoke/grant próprio — diferente de toda tabela
-- do projeto, que sempre revoga de anon/authenticated e regrante
-- explicitamente.
--
-- Sem `security_invoker = true` (Postgres 15+), a checagem de RLS das
-- tabelas referenciadas por uma view roda com os direitos do DONO da view
-- (o role que rodou a migração, que não está sujeito à própria RLS), não do
-- usuário que consulta — logo a policy "confrade ativo gerencia
-- pessoas/familias" nunca era avaliada para quem lia por meio da view. O
-- comentário original da view ("roda com os direitos de quem consulta,
-- protegida pela RLS... por baixo") descrevia o oposto do que o Postgres
-- realmente faz.
--
-- Confirmado ao vivo (sonda read-only com a chave anon pública, sem ação
-- destrutiva): GET .../fontes_renda e .../confrades (ambas revogadas de
-- anon) devolvem 401; GET .../vw_renda_familiar devolvia 200 (array vazio
-- só porque não havia dado batendo, não porque o acesso estivesse negado).
-- ============================================================================

alter view public.vw_renda_familiar set (security_invoker = true);

revoke all on public.vw_renda_familiar from anon, authenticated;
grant select on public.vw_renda_familiar to authenticated;

comment on view public.vw_renda_familiar is
  'Renda total e renda per capita por família, considerando só pessoas e fontes de renda ativas. security_invoker = true: a RLS de pessoas/familias/fontes_renda (is_confrade_ativo()) é avaliada com os direitos de quem consulta, não do dono da view.';
