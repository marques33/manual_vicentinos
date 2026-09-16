-- ============================================================================
-- 019 · Controle Orçamentário — revoke em verificar_consistencia_lancamento()
-- ----------------------------------------------------------------------------
-- Fecha uma lacuna da migração 015: pode_lancar_financeiro() e
-- tocar_atualizado_em() já tinham o revoke de convenção deste módulo
-- (ninguém chama função de trigger via /rpc/, mas o revoke documenta a
-- intenção e mantém as três funções consistentes); esta é a única que
-- faltava. Achado em revisão final.
-- ============================================================================

revoke all on function public.verificar_consistencia_lancamento() from public, anon;
