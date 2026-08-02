-- ============================================================================
-- 004 · Limite de envios por IP + retenção de dados (LGPD)
-- ----------------------------------------------------------------------------
-- O schema `private` fica FORA dos schemas expostos pela API do Supabase
-- (Settings → API → Exposed schemas = public, graphql_public). O PostgREST não
-- o enxerga; a única porta é a função SECURITY DEFINER em `public`, cuja
-- execução é concedida apenas ao service_role da Edge Function.
-- ============================================================================

create schema if not exists private;
revoke all on schema private from anon, authenticated, public;
grant usage on schema private to service_role;

-- ----------------------------------------------------------------------------
-- Log de tentativas. Janela deslizante — mais honesto que balde fixo, que
-- deixaria passar o dobro do limite na virada da hora.
-- ----------------------------------------------------------------------------
create table if not exists private.rate_limit (
  id        bigint generated always as identity primary key,
  ip_hash   text not null check (char_length(ip_hash) = 64),
  criado_em timestamptz not null default now()
);

create index if not exists rate_limit_busca_idx
  on private.rate_limit (ip_hash, criado_em desc);

revoke all on private.rate_limit from anon, authenticated, public;
grant select, insert, delete on private.rate_limit to service_role;

-- ----------------------------------------------------------------------------
-- registrar_tentativa() — conta e registra numa tacada só.
-- Retorna {permitido, motivo}. Chamada por RPC pela Edge Function.
-- ----------------------------------------------------------------------------
create or replace function public.registrar_tentativa(
  p_ip_hash  text,
  p_max_hora integer default 3,
  p_max_dia  integer default 8
)
  returns jsonb
  language plpgsql
  security definer
  set search_path = private, public, pg_temp
as $$
declare
  v_hora integer;
  v_dia  integer;
begin
  -- Só aceita SHA-256 em hexadecimal: sem hash não há como limitar, e deixar
  -- passar "sem IP" seria o buraco por onde tudo escaparia.
  if p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('permitido', false, 'motivo', 'origem_invalida');
  end if;

  select count(*) filter (where criado_em > now() - interval '1 hour'),
         count(*)
    into v_hora, v_dia
    from private.rate_limit
   where ip_hash = p_ip_hash
     and criado_em > now() - interval '1 day';

  if v_hora >= p_max_hora then
    return jsonb_build_object('permitido', false, 'motivo', 'limite_hora');
  end if;

  if v_dia >= p_max_dia then
    return jsonb_build_object('permitido', false, 'motivo', 'limite_dia');
  end if;

  insert into private.rate_limit (ip_hash) values (p_ip_hash);

  return jsonb_build_object('permitido', true,
                            'restante_hora', p_max_hora - v_hora - 1);
end;
$$;

comment on function public.registrar_tentativa(text, integer, integer) is
  'Limite deslizante de envios por hash de IP. Só a Edge Function pode executar.';

revoke all on function public.registrar_tentativa(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.registrar_tentativa(text, integer, integer)
  to service_role;

-- ----------------------------------------------------------------------------
-- purgar_dados_antigos() — minimização e retenção (LGPD, art. 15 e 16).
-- Separada do agendamento para poder ser executada à mão na verificação.
-- ----------------------------------------------------------------------------
create or replace function private.purgar_dados_antigos()
  returns jsonb
  language plpgsql
  security definer
  set search_path = private, public, pg_temp
as $$
declare
  v_pedidos integer;
  v_anonim  integer;
  v_limite  integer;
begin
  -- Expirados (com 30 dias de folga para o moderador reverter) e rejeitados.
  delete from public.pedidos_oracao
   where expira_em < current_date - 30
      or (status = 'rejeitado' and criado_em < now() - interval '7 days');
  get diagnostics v_pedidos = row_count;

  -- Passados 30 dias o hash de IP já não serve para nada: some.
  update public.pedidos_oracao
     set ip_hash = null, user_agent = null
   where criado_em < now() - interval '30 days'
     and (ip_hash is not null or user_agent is not null);
  get diagnostics v_anonim = row_count;

  delete from private.rate_limit
   where criado_em < now() - interval '2 days';
  get diagnostics v_limite = row_count;

  return jsonb_build_object('pedidos_apagados', v_pedidos,
                            'pedidos_anonimizados', v_anonim,
                            'tentativas_apagadas', v_limite);
end;
$$;

revoke all on function private.purgar_dados_antigos() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- Agendamento diário, 03:15.
-- Se o CREATE EXTENSION falhar por permissão, habilite pg_cron em
-- Dashboard → Database → Extensions e rode este arquivo de novo.
-- ----------------------------------------------------------------------------
create extension if not exists pg_cron;

select cron.unschedule('purga-oracoes')
 where exists (select 1 from cron.job where jobname = 'purga-oracoes');

select cron.schedule(
  'purga-oracoes',
  '15 3 * * *',
  $$ select private.purgar_dados_antigos(); $$
);
