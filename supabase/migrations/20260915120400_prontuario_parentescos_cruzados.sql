-- ============================================================================
-- 010 · Prontuário — parentesco entre famílias diferentes
-- ----------------------------------------------------------------------------
-- Vínculo de parentesco entre pessoas de FAMÍLIAS DIFERENTES já cadastradas
-- (ex.: uma pessoa da Família A é irmã de alguém na Família B). O vínculo
-- dentro da própria família já existe naturalmente pela FK
-- pessoas.familia_id — esta tabela não duplica isso.
-- ============================================================================

create table if not exists public.parentescos_cruzados (
  id            uuid primary key default gen_random_uuid(),
  pessoa_id_1   uuid not null references public.pessoas(id) on delete cascade,
  pessoa_id_2   uuid not null references public.pessoas(id) on delete cascade,
  tipo_relacao  text not null check (tipo_relacao in (
                  'irmao_irma','pai_mae_filho','avo_neto','tio_sobrinho',
                  'primo','ex_conjuge','outro')),
  observacoes   text,

  criado_em     timestamptz not null default now(),
  criado_por    uuid references auth.users(id) on delete set null,

  constraint parentescos_sem_auto_relacao check (pessoa_id_1 <> pessoa_id_2)
);

comment on table public.parentescos_cruzados is
  'Parentesco entre pessoas de famílias diferentes já cadastradas. Vínculo dentro da mesma família não precisa desta tabela.';

alter table public.parentescos_cruzados enable row level security;

-- ----------------------------------------------------------------------------
-- Normaliza a ordem dos dois UUIDs antes de gravar: quem chama a API não
-- precisa saber qual dos dois é "menor" — a trigger resolve, e o índice
-- único abaixo é quem de fato impede o par duplicado em qualquer ordem de
-- entrada (A,B) ou (B,A).
-- ----------------------------------------------------------------------------
create or replace function public.normalizar_ordem_parentesco()
  returns trigger
  language plpgsql
  set search_path = public, pg_temp
as $$
declare
  v_tmp uuid;
begin
  if new.pessoa_id_1 > new.pessoa_id_2 then
    v_tmp := new.pessoa_id_1;
    new.pessoa_id_1 := new.pessoa_id_2;
    new.pessoa_id_2 := v_tmp;
  end if;
  return new;
end;
$$;

drop trigger if exists parentescos_normaliza_ordem on public.parentescos_cruzados;
create trigger parentescos_normaliza_ordem
  before insert or update on public.parentescos_cruzados
  for each row execute function public.normalizar_ordem_parentesco();

-- Inclui tipo_relacao para, em tese, permitir mais de um tipo de vínculo
-- registrado entre o mesmo par (raro, mas não custa nada permitir).
create unique index if not exists parentescos_par_tipo_unico
  on public.parentescos_cruzados (pessoa_id_1, pessoa_id_2, tipo_relacao);

revoke all on public.parentescos_cruzados from anon, authenticated;
grant select, insert, update, delete on public.parentescos_cruzados to authenticated;

drop policy if exists "confrade ativo gerencia parentescos_cruzados" on public.parentescos_cruzados;
create policy "confrade ativo gerencia parentescos_cruzados"
  on public.parentescos_cruzados
  for all
  to authenticated
  using (public.is_confrade_ativo())
  with check (public.is_confrade_ativo());
