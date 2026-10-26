-- ============================================================================
-- 031 · Despensa — revoke de verificar_saldo_estoque() para authenticated
-- ----------------------------------------------------------------------------
-- A 029 fez `revoke ... from public, anon`, mas o Supabase concede EXECUTE em
-- função nova DIRETAMENTE a authenticated (default privileges do schema
-- public), não via public — então o revoke não a alcançou. O Security
-- Advisor apontou (authenticated_security_definer_function_executable).
--
-- Não havia brecha prática: o Postgres recusa chamar função de gatilho fora
-- de um gatilho. Mas é função security definer exposta em /rpc/, e o mesmo
-- tipo de lacuna a 019 fechou no financeiro. O gatilho continua funcionando:
-- EXECUTE só é conferido ao criar o gatilho, não a cada disparo.
--
-- pode_gerir_estoque() fica de fora de propósito: a página a chama para
-- decidir o que mostrar, igual a pode_lancar_financeiro() e as demais pode_*.
-- ============================================================================

revoke all on function public.verificar_saldo_estoque() from authenticated;
