-- ============================================================================
-- 012 · Confrades — papel "administrador"
-- ----------------------------------------------------------------------------
-- O check original só previa papéis de hierarquia da SSVP (vicentino,
-- presidente, tesoureiro etc.). Faltava a categoria de quem mantém o site e
-- o banco (não é vicentino fazendo visita, é responsável técnico) — sem
-- esse valor, essa pessoa seria forçada a um papel que não reflete a
-- realidade institucional, o que contaminaria qualquer relatório futuro que
-- use esta coluna.
-- ============================================================================

alter table public.confrades drop constraint if exists confrades_papel_check;
alter table public.confrades add constraint confrades_papel_check
  check (papel in ('vicentino','presidente','vice_presidente',
                    'tesoureiro','secretario','confrade_espiritual','administrador'));
