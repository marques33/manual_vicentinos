-- ============================================================================
-- 008 · Prontuário — fontes de renda e renda per capita
-- ----------------------------------------------------------------------------
-- Uma pessoa pode ter mais de uma fonte de renda (salário + Bolsa Família,
-- por exemplo) — por isso é tabela própria, não coluna em `pessoas`.
-- ============================================================================

create table if not exists public.fontes_renda (
  id            uuid primary key default gen_random_uuid(),
  pessoa_id     uuid not null references public.pessoas(id) on delete cascade,

  tipo          text not null check (tipo in (
                  'salario','autonomo_informal','bolsa_familia','bpc_loas',
                  'aposentadoria','pensao','auxilio_outro','prato_cheio',
                  'df_social','outro')),
  descricao     text,
  valor_mensal  numeric(10,2) not null check (valor_mensal >= 0),
  ativa         boolean not null default true,

  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

comment on table public.fontes_renda is
  'Fontes de renda por pessoa. Uma pessoa pode ter várias linhas ativas simultaneamente.';

create index if not exists fontes_renda_pessoa_idx on public.fontes_renda (pessoa_id) where ativa;

alter table public.fontes_renda enable row level security;

revoke all on public.fontes_renda from anon, authenticated;
grant select, insert, update, delete on public.fontes_renda to authenticated;

drop policy if exists "confrade ativo gerencia fontes_renda" on public.fontes_renda;
create policy "confrade ativo gerencia fontes_renda"
  on public.fontes_renda
  for all
  to authenticated
  using (public.is_confrade_ativo())
  with check (public.is_confrade_ativo());

drop trigger if exists fontes_renda_atualizado_em on public.fontes_renda;
create trigger fontes_renda_atualizado_em
  before update on public.fontes_renda
  for each row execute function public.tocar_atualizado_em();

-- ----------------------------------------------------------------------------
-- vw_renda_familiar — soma a renda ativa de todos os membros ativos de cada
-- família e calcula a renda per capita (renda total ÷ pessoas ativas).
--
-- É uma view simples (roda com os direitos de quem consulta, protegida pela
-- RLS de `pessoas`/`fontes_renda` por baixo) — não uma function, porque não
-- há regra de negócio aqui além de soma e divisão; a elegibilidade a
-- benefício, que tem regra de negócio real, é a function
-- calcular_elegibilidade_pessoa() na migração 010.
-- ----------------------------------------------------------------------------
create or replace view public.vw_renda_familiar as
select
  f.id as familia_id,
  count(p.id) filter (where p.ativo) as qtd_pessoas_ativas,
  coalesce(sum(fr.valor_mensal) filter (where fr.ativa), 0) as renda_total_mensal,
  case when count(p.id) filter (where p.ativo) > 0
    then round(coalesce(sum(fr.valor_mensal) filter (where fr.ativa), 0)
               / count(p.id) filter (where p.ativo), 2)
    else null
  end as renda_per_capita
from public.familias f
left join public.pessoas p on p.familia_id = f.id
left join public.fontes_renda fr on fr.pessoa_id = p.id
group by f.id;

comment on view public.vw_renda_familiar is
  'Renda total e renda per capita por família, considerando só pessoas e fontes de renda ativas.';
