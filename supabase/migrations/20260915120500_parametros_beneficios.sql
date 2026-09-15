-- ============================================================================
-- 011 · Parâmetros de benefícios e cálculo de elegibilidade
-- ----------------------------------------------------------------------------
-- Os valores/frações abaixo mudam por decreto (o Cartão Prato Cheio, por
-- exemplo, já mudou de R$280 para R$250 por decreto distrital). Ficam numa
-- tabela versionada por vigência — não hardcoded em HTML/JS — para que:
--   1. atualizar a legislação seja um UPDATE + INSERT, sem deploy;
--   2. um atendimento antigo continue referenciando a regra vigente na
--      época em que foi calculado, não a regra de hoje.
--
-- IMPORTANTE: o resultado de calcular_elegibilidade_pessoa() é uma
-- ESTIMATIVA DE TRIAGEM para orientar o vicentino, não uma decisão
-- automática de benefício — a elegibilidade real depende de avaliação
-- social e critérios que a função não modela (ex.: a "prioridade" do Plano
-- DF Social é qualitativa, não um corte numérico). A UI deve deixar isso
-- explícito ao lado de qualquer selo de elegibilidade.
-- ============================================================================

create table if not exists public.parametros_beneficios (
  id                                uuid primary key default gen_random_uuid(),

  salario_minimo                    numeric(10,2) not null check (salario_minimo > 0),

  -- BPC/LOAS: 1/4 do salário mínimo é o limite padrão (art. 20 §3º Lei
  -- 8.742/93); até 1/2 é a faixa ampliada por vulnerabilidade.
  bpc_loas_fracao_limite            numeric(4,3) not null default 0.250,
  bpc_loas_fracao_vulnerabilidade   numeric(4,3) not null default 0.500,
  bpc_loas_idade_minima             integer not null default 65,

  -- Plano DF Social (Lei Distrital 7.008/2021).
  df_social_extrema_pobreza_limite  numeric(10,2) not null default 100.00,
  df_social_pobreza_limite          numeric(10,2) not null default 200.00,
  df_social_baixa_renda_fracao_sm   numeric(4,3) not null default 0.500,

  -- Cartão Prato Cheio (Decreto 42.873/2021, atualizado pelo Decreto
  -- 48.095/2025).
  prato_cheio_valor_parcela         numeric(10,2) not null default 250.00,

  decreto_referencia                text,
  vigente_desde                     date not null default current_date,
  vigente_ate                       date,

  criado_em                         timestamptz not null default now(),
  criado_por                        uuid references auth.users(id) on delete set null
);

comment on table public.parametros_beneficios is
  'Parâmetros numéricos de elegibilidade a benefícios, versionados por vigência. Atualizar legislação = fechar a linha vigente (vigente_ate) e inserir uma nova.';

-- Só pode haver UMA linha "vigente" (vigente_ate is null) por vez.
create unique index if not exists parametros_beneficios_vigente_unico
  on public.parametros_beneficios ((true)) where vigente_ate is null;

alter table public.parametros_beneficios enable row level security;

revoke all on public.parametros_beneficios from anon, authenticated;
grant select, insert, update on public.parametros_beneficios to authenticated;
-- Sem DELETE: histórico de vigência não se apaga.

drop policy if exists "confrade ativo gerencia parametros_beneficios" on public.parametros_beneficios;
create policy "confrade ativo gerencia parametros_beneficios"
  on public.parametros_beneficios
  for all
  to authenticated
  using (public.is_confrade_ativo())
  with check (public.is_confrade_ativo());

-- Seed inicial. Salário mínimo e valores conforme levantado na pesquisa que
-- fundamentou este módulo (2026); ajustar via UPDATE + INSERT quando sair
-- novo decreto (ver instruções no README).
insert into public.parametros_beneficios (salario_minimo, decreto_referencia)
select 1412.00, 'Lei Distrital 7.008/2021; Decreto 42.873/2021 atualizado por Decreto 48.095/2025'
where not exists (select 1 from public.parametros_beneficios where vigente_ate is null);

-- ----------------------------------------------------------------------------
-- calcular_elegibilidade_pessoa() — roda com os direitos de quem chama (não
-- SECURITY DEFINER): qualquer confrade ativo já tem SELECT nas tabelas
-- envolvidas via RLS, então elevar privilégio aqui não traria benefício,
-- só ampliaria a superfície de risco à toa.
-- ----------------------------------------------------------------------------
create or replace function public.calcular_elegibilidade_pessoa(p_pessoa_id uuid)
  returns jsonb
  language plpgsql
  stable
  set search_path = public, pg_temp
as $$
declare
  v_pessoa            public.pessoas%rowtype;
  v_familia_id        uuid;
  v_qtd_pessoas       integer;
  v_renda_total_geral numeric;
  v_renda_total_bpc   numeric;
  v_per_capita_geral  numeric;
  v_per_capita_bpc    numeric;
  v_idade             integer;
  v_param             public.parametros_beneficios%rowtype;
  v_resultado         jsonb;
begin
  select * into v_pessoa from public.pessoas where id = p_pessoa_id;
  if not found then
    return jsonb_build_object('erro', 'pessoa_nao_encontrada');
  end if;

  select * into v_param from public.parametros_beneficios where vigente_ate is null;
  if not found then
    return jsonb_build_object('erro', 'parametros_beneficios_nao_configurados');
  end if;

  v_familia_id := v_pessoa.familia_id;
  v_idade := extract(year from age(current_date, v_pessoa.data_nascimento))::integer;

  select count(*) into v_qtd_pessoas
    from public.pessoas
   where familia_id = v_familia_id and ativo;

  select coalesce(sum(fr.valor_mensal), 0) into v_renda_total_geral
    from public.fontes_renda fr
    join public.pessoas p on p.id = fr.pessoa_id
   where p.familia_id = v_familia_id and p.ativo and fr.ativa;

  -- Regra específica do BPC: renda de BPC recebida por OUTRO membro da
  -- família não entra nesta soma (renda de um BPC não computa para a
  -- elegibilidade de outro BPC na mesma família).
  select coalesce(sum(fr.valor_mensal), 0) into v_renda_total_bpc
    from public.fontes_renda fr
    join public.pessoas p on p.id = fr.pessoa_id
   where p.familia_id = v_familia_id and p.ativo and fr.ativa
     and not (fr.tipo = 'bpc_loas' and fr.pessoa_id <> p_pessoa_id);

  v_per_capita_geral := case when v_qtd_pessoas > 0 then round(v_renda_total_geral / v_qtd_pessoas, 2) else null end;
  v_per_capita_bpc    := case when v_qtd_pessoas > 0 then round(v_renda_total_bpc / v_qtd_pessoas, 2) else null end;

  v_resultado := jsonb_build_object(
    'renda_per_capita_geral', v_per_capita_geral,
    'renda_per_capita_bpc', v_per_capita_bpc,
    'idade', v_idade,
    'qtd_pessoas_familia', v_qtd_pessoas,
    'bpc_loas', jsonb_build_object(
      'elegivel_padrao',
        (v_idade >= v_param.bpc_loas_idade_minima or (v_pessoa.pcd and v_pessoa.impedimento_longo_prazo))
        and v_per_capita_bpc is not null
        and v_per_capita_bpc <= round(v_param.salario_minimo * v_param.bpc_loas_fracao_limite, 2),
      'elegivel_faixa_ampliada',
        (v_idade >= v_param.bpc_loas_idade_minima or (v_pessoa.pcd and v_pessoa.impedimento_longo_prazo))
        and v_per_capita_bpc is not null
        and v_per_capita_bpc <= round(v_param.salario_minimo * v_param.bpc_loas_fracao_vulnerabilidade, 2)
        and v_per_capita_bpc > round(v_param.salario_minimo * v_param.bpc_loas_fracao_limite, 2)
    ),
    'df_social', jsonb_build_object(
      'faixa', case
        when v_per_capita_geral is null then null
        when v_per_capita_geral <= v_param.df_social_extrema_pobreza_limite then 'extrema_pobreza'
        when v_per_capita_geral <= v_param.df_social_pobreza_limite then 'pobreza'
        when v_per_capita_geral <= round(v_param.salario_minimo * v_param.df_social_baixa_renda_fracao_sm, 2) then 'baixa_renda'
        else 'acima_do_limite'
      end
    ),
    'prato_cheio', jsonb_build_object(
      'elegivel_provavel', v_per_capita_geral is not null and v_per_capita_geral <= v_param.df_social_pobreza_limite
    ),
    'parametros_usados', jsonb_build_object(
      'decreto_referencia', v_param.decreto_referencia,
      'vigente_desde', v_param.vigente_desde,
      'salario_minimo', v_param.salario_minimo
    ),
    'aviso', 'Estimativa de triagem para orientar o vicentino — não é decisão automática de benefício.'
  );

  return v_resultado;
end;
$$;

comment on function public.calcular_elegibilidade_pessoa(uuid) is
  'Estimativa de triagem de elegibilidade a benefícios (BPC/LOAS, Plano DF Social, Prato Cheio) a partir da renda per capita familiar vigente. Não é decisão automática.';

revoke all on function public.calcular_elegibilidade_pessoa(uuid) from public, anon;
grant execute on function public.calcular_elegibilidade_pessoa(uuid) to authenticated;
