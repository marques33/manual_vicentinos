-- ============================================================================
-- 029 · Despensa — movimentos, saldo e conferência física
-- ----------------------------------------------------------------------------
-- Cada mudança de quantidade de um item é uma linha aqui: entrada (doação ou
-- compra), saída (para família, outra, descarte) ou ajuste de conferência.
-- Saldo = soma de quantidade dos movimentos não removidos; a quantidade já
-- vem com sinal (saída negativa), então a soma basta.
--
-- Movimento não se edita: lançou errado, remove (lógico) e lança de novo. O
-- grant de UPDATE é só das colunas de remoção — trava por COLUNA, que a
-- policy (trava por LINHA) não substitui. Ver tasks/lessons.md, 22/09.
-- ============================================================================

create table if not exists public.estoque_movimentos (
  id              uuid primary key default gen_random_uuid(),

  item_id         uuid not null references public.estoque_itens(id) on delete restrict,
  tipo            text not null
                    check (tipo in ('carga_inicial','entrada_doacao','entrada_compra',
                                    'saida_familia','saida_outra','descarte',
                                    'ajuste_conferencia')),
  quantidade      numeric(10,2) not null,
  data_movimento  date not null default current_date,
  observacao      text,

  -- Preenchido só na saída para uma família do Prontuário — liga a cesta
  -- entregue a quem recebeu, sem copiar dado da família para cá.
  familia_id      uuid references public.familias(id) on delete set null,

  criado_por      uuid not null default auth.uid() references auth.users(id) on delete restrict,
  criado_em       timestamptz not null default now(),

  removido_por    uuid references auth.users(id) on delete set null,
  removido_em     timestamptz,

  -- O sinal tem que concordar com o tipo: é ele que faz a soma dar o saldo.
  constraint estoque_movimentos_sinal_check check (
    case
      when tipo in ('carga_inicial','entrada_doacao','entrada_compra') then quantidade > 0
      when tipo in ('saida_familia','saida_outra','descarte')          then quantidade < 0
      else quantidade <> 0
    end
  ),
  constraint estoque_movimentos_familia_check check (
    familia_id is null or tipo = 'saida_familia'
  )
);

comment on table public.estoque_movimentos is
  'Entradas, saídas e ajustes da despensa. quantidade com sinal (saída < 0); saldo do item = soma dos não removidos. Imutável: só removido_em/removido_por mudam.';

create index if not exists estoque_movimentos_item_idx
  on public.estoque_movimentos (item_id, data_movimento desc)
  where removido_em is null;

alter table public.estoque_movimentos enable row level security;

revoke all on public.estoque_movimentos from anon, authenticated;
grant select, insert on public.estoque_movimentos to authenticated;
grant update (removido_em, removido_por) on public.estoque_movimentos to authenticated;
-- Sem DELETE e sem UPDATE de quantidade/tipo/item: correção = remover + relançar.

drop policy if exists "confrade ativo lê estoque_movimentos" on public.estoque_movimentos;
create policy "confrade ativo lê estoque_movimentos"
  on public.estoque_movimentos
  for select
  to authenticated
  using (public.is_confrade_ativo());

drop policy if exists "tesoureiro/admin insere estoque_movimentos" on public.estoque_movimentos;
create policy "tesoureiro/admin insere estoque_movimentos"
  on public.estoque_movimentos
  for insert
  to authenticated
  with check (public.pode_gerir_estoque() and criado_por = auth.uid());

drop policy if exists "tesoureiro/admin remove estoque_movimentos" on public.estoque_movimentos;
create policy "tesoureiro/admin remove estoque_movimentos"
  on public.estoque_movimentos
  for update
  to authenticated
  using (public.pode_gerir_estoque())
  with check (public.pode_gerir_estoque());

-- ----------------------------------------------------------------------------
-- Saldo nunca negativo — nem por saída grande demais, nem por remover uma
-- entrada da qual saídas já dependem. CHECK não enxerga outras linhas, por
-- isso gatilho.
--
-- security definer: a soma precisa ver TODOS os movimentos do item, não só os
-- que a RLS de quem grava mostraria. O `for update` no item serializa dois
-- movimentos simultâneos do mesmo item (sem ele, duas saídas de 1 cesta com
-- saldo 1 passariam as duas).
-- ----------------------------------------------------------------------------
create or replace function public.verificar_saldo_estoque()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_removido_item timestamptz;
  v_saldo         numeric;
begin
  select removido_em into v_removido_item
    from public.estoque_itens where id = new.item_id
     for update;

  if tg_op = 'INSERT' and v_removido_item is not null then
    raise exception using errcode = 'P0001', message = 'estoque_item_removido';
  end if;

  select coalesce(sum(quantidade), 0) into v_saldo
    from public.estoque_movimentos
   where item_id = new.item_id
     and removido_em is null
     and id <> new.id;

  if new.removido_em is null then
    v_saldo := v_saldo + new.quantidade;
  end if;

  if v_saldo < 0 then
    raise exception using
      errcode = 'P0001',
      message = 'estoque_saldo_insuficiente',
      detail  = format('O saldo do item ficaria em %s.', v_saldo);
  end if;

  return new;
end;
$$;

revoke all on function public.verificar_saldo_estoque() from public, anon;

drop trigger if exists estoque_movimentos_saldo on public.estoque_movimentos;
create trigger estoque_movimentos_saldo
  before insert or update on public.estoque_movimentos
  for each row execute function public.verificar_saldo_estoque();

-- ----------------------------------------------------------------------------
-- vw_estoque_saldos — cada item ativo com o saldo e a data do último
-- movimento. security_invoker = true: sem isso a view roda como o dono e fura
-- a RLS (foi exatamente o defeito da vw_renda_familiar, migração 014).
-- ----------------------------------------------------------------------------
create or replace view public.vw_estoque_saldos
  with (security_invoker = true) as
select
  i.id,
  i.categoria,
  i.nome,
  i.marcas,
  i.unidade,
  i.conteudo_por_unidade,
  i.local,
  i.perecivel,
  i.validade_proxima,
  i.observacoes,
  i.estimado,
  i.conferido_em,
  i.origem_ref,
  coalesce(sum(m.quantidade), 0)::numeric(10,2) as saldo,
  max(m.data_movimento)                         as ultimo_movimento
from public.estoque_itens i
left join public.estoque_movimentos m
       on m.item_id = i.id
      and m.removido_em is null
where i.removido_em is null
group by i.id;

revoke all on public.vw_estoque_saldos from anon, authenticated;
grant select on public.vw_estoque_saldos to authenticated;

comment on view public.vw_estoque_saldos is
  'Itens ativos da despensa com saldo (soma dos movimentos não removidos) e último movimento. security_invoker = true: a RLS de estoque_itens/estoque_movimentos vale para quem consulta.';

-- ----------------------------------------------------------------------------
-- conferir_item_estoque() — conferência física de um item.
--
-- Quem confere informa quanto CONTOU; o ajuste (contado − saldo) é calculado
-- aqui dentro, com o item travado, e não na tela — se outro movimento entrar
-- entre a leitura da tela e a gravação, o ajuste continua certo. No mesmo
-- passo o item deixa de ser "estimado" e pode receber a validade.
--
-- security invoker: roda com os direitos de quem chama, então a RLS e o
-- pode_gerir_estoque() das policies valem normalmente.
-- ----------------------------------------------------------------------------
create or replace function public.conferir_item_estoque(
  p_item_id    uuid,
  p_contado    numeric,
  p_validade   date default null,
  p_observacao text default null
)
  returns numeric
  language plpgsql
  security invoker
  set search_path = public, pg_temp
as $$
declare
  v_saldo  numeric;
  v_ajuste numeric;
begin
  if not public.pode_gerir_estoque() then
    raise exception using errcode = '42501', message = 'sem permissão para conferir a despensa';
  end if;

  if p_contado is null or p_contado < 0 then
    raise exception using errcode = 'P0001', message = 'estoque_contagem_invalida';
  end if;

  perform 1 from public.estoque_itens
   where id = p_item_id and removido_em is null
     for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'estoque_item_removido';
  end if;

  select coalesce(sum(quantidade), 0) into v_saldo
    from public.estoque_movimentos
   where item_id = p_item_id and removido_em is null;

  v_ajuste := p_contado - v_saldo;

  if v_ajuste <> 0 then
    insert into public.estoque_movimentos (item_id, tipo, quantidade, observacao, criado_por)
    values (p_item_id, 'ajuste_conferencia', v_ajuste,
            coalesce(nullif(btrim(p_observacao), ''), 'Conferência física'), auth.uid());
  end if;

  update public.estoque_itens
     set estimado         = false,
         conferido_por    = auth.uid(),
         conferido_em     = now(),
         validade_proxima = coalesce(p_validade, validade_proxima),
         atualizado_por   = auth.uid()
   where id = p_item_id;

  return v_ajuste;
end;
$$;

comment on function public.conferir_item_estoque(uuid, numeric, date, text) is
  'Conferência física: grava ajuste_conferencia = contado − saldo (se diferente de zero), desmarca estimado e opcionalmente atualiza a validade. Devolve o ajuste.';

revoke all on function public.conferir_item_estoque(uuid, numeric, date, text) from public, anon;
grant execute on function public.conferir_item_estoque(uuid, numeric, date, text) to authenticated;
