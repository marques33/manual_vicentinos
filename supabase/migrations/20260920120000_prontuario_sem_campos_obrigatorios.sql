-- ============================================================================
-- 021 · Prontuário sem campos de preenchimento obrigatório
--
-- A Conferência está começando a cadastrar as famílias que já atende e, na
-- maioria das visitas, ainda não tem os dados completos do assistido — data de
-- nascimento, sobretudo. Com as colunas NOT NULL, o vicentino que não sabia a
-- data simplesmente não conseguia registrar a pessoa, e o atendimento ficava
-- sem prontuário nenhum. Meio cadastro vale mais do que cadastro nenhum: o que
-- falta se completa na visita seguinte.
--
-- As restrições de FORMATO continuam valendo. Um CHECK é satisfeito quando o
-- valor é NULL, então `nome_completo` segue tendo que ter de 3 a 150
-- caracteres *quando preenchido*, `cpf` segue exigindo 11 dígitos *quando
-- preenchido*, e assim por diante. O que muda é só a exigência de existir.
--
-- Permanecem NOT NULL as colunas que o sistema preenche sozinho e que, sem
-- valor, deixariam a linha órfã ou sem trilha de auditoria: as chaves
-- estrangeiras (`familia_id`, `pessoa_id`), os campos com default (`status`,
-- `ativo`, `pcd`, `urgencia`, `identificada_em`, `data_ocorrencia`,
-- `criado_em`) e `intervencoes.realizado_por`, que responde "quem fez".
-- ============================================================================

alter table public.pessoas alter column nome_completo        drop not null;
alter table public.pessoas alter column data_nascimento      drop not null;
alter table public.pessoas alter column parentesco_familiar  drop not null;

alter table public.fontes_renda alter column valor_mensal drop not null;

alter table public.necessidades alter column descricao drop not null;
alter table public.intervencoes alter column descricao drop not null;

comment on column public.pessoas.data_nascimento is
  'Opcional desde 20/09/2026. Sem ela, calcular_elegibilidade_pessoa() não '
  'consegue avaliar as regras que dependem de idade e devolve '
  'idade_conhecida = false — a tela precisa dizer "não dá para estimar", '
  'nunca "improvável".';

-- ---------------------------------------------------------------------------
-- Elegibilidade com idade desconhecida
--
-- `extract(year from age(current_date, null))` devolve NULL, e daí em diante a
-- lógica de três valores do SQL já fazia a coisa quase certa sozinha:
-- `null >= 65` é NULL, e `NULL and <algo>` é NULL — ou seja, "não sei".
--
-- O problema não era o cálculo, era a leitura. O front trata qualquer valor
-- falso como "improvável", e NULL é falso em JavaScript. Uma pessoa sem data
-- de nascimento apareceria como "BPC/LOAS — improvável" para o vicentino, que
-- é uma afirmação — e possivelmente uma afirmação errada — no lugar de uma
-- lacuna. Alguém poderia deixar de encaminhar um idoso ao benefício por causa
-- disso.
--
-- Por isso a função passa a dizer explicitamente que a idade é desconhecida,
-- em vez de deixar a ausência viajar disfarçada de negativa.
-- ---------------------------------------------------------------------------
create or replace function public.calcular_elegibilidade_pessoa(p_pessoa_id uuid)
  returns jsonb
  language plpgsql
  security invoker
  stable
  set search_path = public, pg_temp
as $$
declare
  v_pessoa            public.pessoas%rowtype;
  v_familia_id        uuid;
  v_qtd_pessoas       integer;
  v_renda_total_geral numeric(12,2);
  v_renda_total_bpc   numeric(12,2);
  v_per_capita_geral  numeric(12,2);
  v_per_capita_bpc    numeric(12,2);
  v_idade             integer;
  v_idade_conhecida   boolean;
  v_criterio_etario   boolean;
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

  v_idade_conhecida := v_pessoa.data_nascimento is not null;
  v_idade := case
               when v_idade_conhecida
                 then extract(year from age(current_date, v_pessoa.data_nascimento))::integer
               else null
             end;

  -- A porta de entrada do BPC é "idoso OU deficiência de longo prazo". Quando
  -- a deficiência já basta, a idade deixa de importar e a resposta é TRUE
  -- mesmo sem data de nascimento; fora disso, sem idade não há resposta.
  v_criterio_etario := case
                         when v_pessoa.pcd and v_pessoa.impedimento_longo_prazo then true
                         when not v_idade_conhecida then null
                         else v_idade >= v_param.bpc_loas_idade_minima
                       end;

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
    'idade_conhecida', v_idade_conhecida,
    'qtd_pessoas_familia', v_qtd_pessoas,
    'bpc_loas', jsonb_build_object(
      -- NULL aqui significa "não dá para estimar", e é diferente de false.
      'criterio_etario_ou_deficiencia', v_criterio_etario,
      'elegivel_padrao',
        v_criterio_etario
        and v_per_capita_bpc is not null
        and v_per_capita_bpc <= round(v_param.salario_minimo * v_param.bpc_loas_fracao_limite, 2),
      'elegivel_faixa_ampliada',
        v_criterio_etario
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
  'Estimativa de triagem de elegibilidade a benefícios (BPC/LOAS, Plano DF '
  'Social, Prato Cheio) a partir da renda per capita familiar vigente. Não é '
  'decisão automática. Campos do BPC vêm NULL quando a pessoa está sem data '
  'de nascimento e a deficiência não basta sozinha: NULL é "não dá para '
  'estimar", não "não tem direito".';
