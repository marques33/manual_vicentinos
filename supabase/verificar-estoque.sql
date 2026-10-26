-- ============================================================================
-- Prova que a Despensa (migrações 028–030) respeita as camadas de acesso e
-- as regras de saldo — SEM deixar rastro no banco.
--
-- Diferente dos verificar-rls-*.mjs, não precisa de contas de teste: roda
-- como postgres, troca de papel com `set local role` e simula cada perfil
-- pelo `request.jwt.claims` (é o que o PostgREST faz por baixo). Usa um
-- gestor (tesoureiro/administrador) e um confrade comum REAIS só como
-- identidade; tudo o que cria morre no fim, porque o último comando levanta
-- um erro de propósito e a transação inteira é desfeita. O relatório vem
-- dentro da mensagem desse erro.
--
-- Uso (banco já com as migrações aplicadas):
--   supabase db query --linked -f supabase/verificar-estoque.sql
-- Antes do push, para provar as migrações sem aplicá-las, concatene:
--   begin; + 028 + 029 + 030 + 030 (de novo: prova a reaplicação) + este arquivo
--
-- Leitura do resultado: "RESULTADO n/n OK" na primeira linha; cada FALHA
-- traz o esperado e o obtido.
-- ============================================================================

begin;

create schema teste_estoque;
grant usage on schema teste_estoque to anon, authenticated;
create table teste_estoque.resultados (n serial, caso text, esperado text, obtido text);
create table teste_estoque.ctx (k text primary key, v uuid);
grant all on teste_estoque.resultados, teste_estoque.ctx to anon, authenticated;
grant usage on sequence teste_estoque.resultados_n_seq to anon, authenticated;

-- Executa p_sql e registra o resultado: o valor devolvido (se houver), 'ok'
-- se não devolver nada, ou "SQLSTATE mensagem" se falhar. Passa quando o
-- obtido CONTÉM p_esperado.
create function teste_estoque.caso(p_caso text, p_esperado text, p_sql text) returns void
language plpgsql as $f$
declare v text;
begin
  begin
    -- INTO só vale para SELECT; em INSERT/UPDATE/DELETE sem RETURNING é erro.
    if p_sql ~* '^\s*select' then
      execute p_sql into v;
    else
      execute p_sql;
    end if;
    v := coalesce(v, 'ok');
  exception when others then
    v := sqlstate || ' ' || sqlerrm;
  end;
  insert into teste_estoque.resultados (caso, esperado, obtido) values (p_caso, p_esperado, v);
end $f$;

-- Assume a identidade de um usuário (como o PostgREST faria com o JWT).
create function teste_estoque.como(p_user uuid) returns void
language sql as $f$
  select set_config('request.jwt.claims',
                    json_build_object('sub', p_user, 'role', 'authenticated')::text, true),
         set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), true);
$f$;
grant execute on all functions in schema teste_estoque to anon, authenticated;

insert into teste_estoque.ctx
select 'gestor', user_id from public.confrades
 where ativo and papel in ('tesoureiro', 'administrador') order by criado_em limit 1;
insert into teste_estoque.ctx
select 'comum', user_id from public.confrades
 where ativo and papel = 'vicentino' order by criado_em limit 1;
insert into teste_estoque.ctx
select 'outro_gestor', user_id from public.confrades
 where ativo and papel in ('tesoureiro', 'administrador')
   and user_id <> (select v from teste_estoque.ctx where k = 'gestor')
 order by criado_em limit 1;
insert into teste_estoque.ctx select 'familia', id from public.familias limit 1;

-- ----------------------------------------------------------------------------
-- Carga inicial (030) — conferida pelos movimentos carga_inicial, que são
-- imutáveis: continua valendo depois que a despensa estiver em uso.
-- ----------------------------------------------------------------------------
select teste_estoque.caso('C01 itens da planilha', '42',
  $q$select count(*)::text from public.estoque_itens where origem_ref like 'inventario-2026-10-26#%'$q$);
select teste_estoque.caso('C02 movimentos carga_inicial (Arroz 1 kg nasce com 0)', '41',
  $q$select count(*)::text from public.estoque_movimentos where tipo = 'carga_inicial' and removido_em is null$q$);
select teste_estoque.caso('C03 cestas na carga', '27',
  $q$select sum(m.quantidade)::int::text from public.estoque_movimentos m
       join public.estoque_itens i on i.id = m.item_id
      where m.tipo = 'carga_inicial' and i.unidade = 'cesta'$q$);
select teste_estoque.caso('C04 excluídos 42, 43 e 44 fora da carga', '0',
  $q$select count(*)::text from public.estoque_itens
      where origem_ref in ('inventario-2026-10-26#42','inventario-2026-10-26#43','inventario-2026-10-26#44')$q$);
select teste_estoque.caso('C05 view com security_invoker', 'security_invoker=true',
  $q$select reloptions::text from pg_class where relname = 'vw_estoque_saldos'$q$);

-- ----------------------------------------------------------------------------
-- Gestor (tesoureiro/administrador)
-- ----------------------------------------------------------------------------
set local role authenticated;
select teste_estoque.como((select v from teste_estoque.ctx where k = 'gestor'));

do $$
declare v_item uuid; v_ent uuid;
begin
  insert into public.estoque_itens (categoria, nome, unidade)
  values ('cestas', 'Cesta TESTE', 'cesta') returning id into v_item;
  insert into teste_estoque.ctx values ('item', v_item);
  insert into public.estoque_movimentos (item_id, tipo, quantidade)
  values (v_item, 'entrada_doacao', 3) returning id into v_ent;
  insert into teste_estoque.ctx values ('entrada', v_ent);
end $$;

select teste_estoque.caso('G01 pode_gerir_estoque', 'true', 'select public.pode_gerir_estoque()::text');
select teste_estoque.caso('G02 item assinado por outro usuário', '42501',
  $q$insert into public.estoque_itens (categoria, nome, unidade, criado_por)
     select 'cestas', 'X', 'cesta', v from teste_estoque.ctx where k = 'outro_gestor'$q$);
select teste_estoque.caso('G03 entrada negativa (saldo 3)', 'estoque_movimentos_sinal_check',
  $q$insert into public.estoque_movimentos (item_id, tipo, quantidade)
     select v, 'entrada_doacao', -1 from teste_estoque.ctx where k = 'item'$q$);
select teste_estoque.caso('G04 saída de 2 (saldo 3)', 'ok',
  $q$insert into public.estoque_movimentos (item_id, tipo, quantidade)
     select v, 'saida_outra', -2 from teste_estoque.ctx where k = 'item'$q$);
select teste_estoque.caso('G05 saída de 5 (saldo 1)', 'estoque_saldo_insuficiente',
  $q$insert into public.estoque_movimentos (item_id, tipo, quantidade)
     select v, 'saida_outra', -5 from teste_estoque.ctx where k = 'item'$q$);
select teste_estoque.caso('G06 saída para família', 'ok',
  $q$insert into public.estoque_movimentos (item_id, tipo, quantidade, familia_id)
     select (select v from teste_estoque.ctx where k = 'item'), 'saida_familia', -1,
            (select v from teste_estoque.ctx where k = 'familia')$q$);
select teste_estoque.caso('G07 família numa entrada', 'estoque_movimentos_familia_check',
  $q$insert into public.estoque_movimentos (item_id, tipo, quantidade, familia_id)
     select (select v from teste_estoque.ctx where k = 'item'), 'entrada_doacao', 1,
            (select v from teste_estoque.ctx where k = 'familia')$q$);
select teste_estoque.caso('G08 remover entrada de que as saídas dependem', 'estoque_saldo_insuficiente',
  $q$update public.estoque_movimentos set removido_em = now(), removido_por = auth.uid()
      where id = (select v from teste_estoque.ctx where k = 'entrada')$q$);
select teste_estoque.caso('G09 editar quantidade de movimento', '42501',
  $q$update public.estoque_movimentos set quantidade = 99
      where id = (select v from teste_estoque.ctx where k = 'entrada')$q$);
select teste_estoque.caso('G10 DELETE de movimento', '42501',
  $q$delete from public.estoque_movimentos where id = (select v from teste_estoque.ctx where k = 'entrada')$q$);
select teste_estoque.caso('G11 conferência contando 4 (saldo 0)', '4.00',
  $q$select public.conferir_item_estoque((select v from teste_estoque.ctx where k = 'item'), 4, date '2027-01-31')::text$q$);
select teste_estoque.caso('G12 view depois da conferência', '4.00|false|2027-01-31',
  $q$select saldo || '|' || estimado || '|' || validade_proxima from public.vw_estoque_saldos
      where id = (select v from teste_estoque.ctx where k = 'item')$q$);
select teste_estoque.caso('G13 conferência sem diferença não cria movimento', '0.00 movs=4',
  $q$select public.conferir_item_estoque((select v from teste_estoque.ctx where k = 'item'), 4)::text
            || ' movs=' || (select count(*) from public.estoque_movimentos
                             where item_id = (select v from teste_estoque.ctx where k = 'item'))$q$);
select teste_estoque.caso('G14 contagem negativa', 'estoque_contagem_invalida',
  $q$select public.conferir_item_estoque((select v from teste_estoque.ctx where k = 'item'), -1)$q$);
select teste_estoque.caso('G15 remoção lógica do item', 'ok',
  $q$update public.estoque_itens set removido_em = now(), removido_por = auth.uid()
      where id = (select v from teste_estoque.ctx where k = 'item')$q$);
select teste_estoque.caso('G16 movimento em item removido', 'estoque_item_removido',
  $q$insert into public.estoque_movimentos (item_id, tipo, quantidade)
     select v, 'entrada_doacao', 1 from teste_estoque.ctx where k = 'item'$q$);
select teste_estoque.caso('G17 item removido some da view', '0',
  $q$select count(*)::text from public.vw_estoque_saldos where id = (select v from teste_estoque.ctx where k = 'item')$q$);

-- O item volta a aparecer para os testes dos outros perfis.
reset role;
update public.estoque_itens set removido_em = null where id = (select v from teste_estoque.ctx where k = 'item');

-- ----------------------------------------------------------------------------
-- Confrade comum (papel vicentino): lê, não grava.
-- ----------------------------------------------------------------------------
set local role authenticated;
select teste_estoque.como((select v from teste_estoque.ctx where k = 'comum'));
select teste_estoque.caso('V01 pode_gerir_estoque', 'false', 'select public.pode_gerir_estoque()::text');
select teste_estoque.caso('V02 lê a view', '1',
  $q$select count(*)::text from public.vw_estoque_saldos where id = (select v from teste_estoque.ctx where k = 'item')$q$);
select teste_estoque.caso('V03 insere item', '42501',
  $q$insert into public.estoque_itens (categoria, nome, unidade) values ('cestas', 'X', 'cesta')$q$);
select teste_estoque.caso('V04 insere movimento', '42501',
  $q$insert into public.estoque_movimentos (item_id, tipo, quantidade)
     select v, 'entrada_doacao', 1 from teste_estoque.ctx where k = 'item'$q$);
select teste_estoque.caso('V05 confere', '42501',
  $q$select public.conferir_item_estoque((select v from teste_estoque.ctx where k = 'item'), 10)$q$);
select teste_estoque.caso('V06 atualiza item (a RLS filtra a linha)', 'ok',
  $q$update public.estoque_itens set nome = 'HACK' where id = (select v from teste_estoque.ctx where k = 'item')$q$);

-- ----------------------------------------------------------------------------
-- Autenticado sem linha em confrades, e anônimo.
-- ----------------------------------------------------------------------------
select teste_estoque.como('00000000-0000-0000-0000-000000000001');
select teste_estoque.caso('N01 não-confrade lê a view', '0', 'select count(*)::text from public.vw_estoque_saldos');
select teste_estoque.caso('N02 não-confrade lê movimentos', '0', 'select count(*)::text from public.estoque_movimentos');

reset role;
set local role anon;
select teste_estoque.como(null);
select teste_estoque.caso('A01 anon lê a view', '42501', 'select count(*)::text from public.vw_estoque_saldos');
select teste_estoque.caso('A02 anon lê itens', '42501', 'select count(*)::text from public.estoque_itens');
select teste_estoque.caso('A03 anon chama a conferência', '42501',
  $q$select public.conferir_item_estoque(gen_random_uuid(), 1)$q$);

reset role;
select teste_estoque.caso('P01 nome intacto depois de V06', 'Cesta TESTE',
  $q$select nome from public.estoque_itens where id = (select v from teste_estoque.ctx where k = 'item')$q$);

-- ----------------------------------------------------------------------------
-- Relatório + rollback proposital.
-- ----------------------------------------------------------------------------
do $$
declare v_total int; v_ok int; v_linhas text;
begin
  select count(*), count(*) filter (where position(esperado in obtido) > 0),
         string_agg(
           case when position(esperado in obtido) > 0 then 'OK    ' else 'FALHA ' end
           || caso
           || case when position(esperado in obtido) > 0 then ''
                   else ' | esperado: ' || esperado || ' | obtido: ' || obtido end,
           E'\n' order by n)
    into v_total, v_ok, v_linhas
    from teste_estoque.resultados;
  raise exception E'RESULTADO %/% OK (rollback proposital)\n%', v_ok, v_total, v_linhas;
end $$;
