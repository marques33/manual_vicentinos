-- ============================================================================
-- 007 · Prontuário — famílias e pessoas
-- ----------------------------------------------------------------------------
-- Núcleo do prontuário de atendimento. Dado sensível (LGPD): diferente do
-- mural e dos pedidos de oração, NENHUMA linha aqui é pública — toda
-- leitura/escrita exige um confrade ativo autenticado.
-- ============================================================================

create table if not exists public.familias (
  id                     uuid primary key default gen_random_uuid(),

  codigo                 text unique,
  endereco_logradouro    text,
  endereco_numero        text,
  endereco_complemento   text,
  endereco_bairro        text,
  endereco_cidade        text not null default 'Brasília',
  endereco_cep           text check (endereco_cep is null or endereco_cep ~ '^\d{5}-?\d{3}$'),

  -- Para endereço informal, comum em ocupações/áreas sem numeração regular.
  referencia_localizacao text,

  telefone_contato       text,

  status                 text not null default 'ativa'
                            check (status in ('ativa','inativa','em_avaliacao','encerrada')),
  observacoes            text,

  criado_em              timestamptz not null default now(),
  atualizado_em          timestamptz not null default now(),
  criado_por             uuid references auth.users(id) on delete set null
);

comment on table public.familias is
  'Famílias assistidas pela Conferência. Nenhuma leitura pública.';
comment on column public.familias.codigo is
  'Identificador legado/opcional do caderno físico, ex. "F-2026-014".';

create table if not exists public.pessoas (
  id                       uuid primary key default gen_random_uuid(),
  familia_id               uuid not null references public.familias(id) on delete cascade,

  nome_completo            text not null check (char_length(btrim(nome_completo)) between 3 and 150),

  -- Obrigatória: é a base do cálculo de idade usado na elegibilidade ao
  -- BPC/LOAS (idade >= 65). Sem data, essa checagem fica indisponível.
  data_nascimento          date not null,

  -- Opcional de propósito (minimização de dado sensível — LGPD): não barra
  -- o cadastro de quem não tem documento à mão no momento da visita.
  cpf                      text check (cpf is null or cpf ~ '^\d{11}$'),

  sexo                     text check (sexo in ('feminino','masculino','outro','nao_informado')),

  parentesco_familiar      text not null check (parentesco_familiar in (
                              'responsavel','conjuge','filho','filha','neto','neta',
                              'pai','mae','irmao','irma','outro')),

  pcd                      boolean not null default false,
  pcd_detalhe              text,

  -- Regra do BPC/LOAS, art. 20 §10 da Lei 8.742/93.
  impedimento_longo_prazo  boolean not null default false,
  situacao_rua             boolean not null default false,

  -- Não apaga histórico ao sair da família (mudou-se, faleceu etc.).
  ativo                    boolean not null default true,
  observacoes              text,

  criado_em                timestamptz not null default now(),
  atualizado_em            timestamptz not null default now(),
  criado_por               uuid references auth.users(id) on delete set null
);

comment on table public.pessoas is
  'Pessoas que compõem cada família assistida. Idade não é armazenada — sempre calculada a partir de data_nascimento.';
comment on column public.pessoas.impedimento_longo_prazo is
  'Impedimento de longo prazo (>= 2 anos) para fins de elegibilidade ao BPC/LOAS por deficiência.';

-- Adicionada depois de `pessoas` existir por causa da referência cruzada.
alter table public.familias
  add column if not exists responsavel_pessoa_id uuid references public.pessoas(id) on delete set null;

create index if not exists pessoas_familia_idx on public.pessoas (familia_id) where ativo;

-- ----------------------------------------------------------------------------
-- RLS — nenhuma exceção para `anon` em nenhuma tabela do prontuário.
-- ----------------------------------------------------------------------------
alter table public.familias enable row level security;
alter table public.pessoas enable row level security;

revoke all on public.familias from anon, authenticated;
grant select, insert, update, delete on public.familias to authenticated;

drop policy if exists "confrade ativo gerencia familias" on public.familias;
create policy "confrade ativo gerencia familias"
  on public.familias
  for all
  to authenticated
  using (public.is_confrade_ativo())
  with check (public.is_confrade_ativo());

revoke all on public.pessoas from anon, authenticated;
grant select, insert, update, delete on public.pessoas to authenticated;

drop policy if exists "confrade ativo gerencia pessoas" on public.pessoas;
create policy "confrade ativo gerencia pessoas"
  on public.pessoas
  for all
  to authenticated
  using (public.is_confrade_ativo())
  with check (public.is_confrade_ativo());

-- ----------------------------------------------------------------------------
-- atualizado_em automático — reaproveita a função já criada em
-- 20260802120100_mural_posts.sql.
-- ----------------------------------------------------------------------------
drop trigger if exists familias_atualizado_em on public.familias;
create trigger familias_atualizado_em
  before update on public.familias
  for each row execute function public.tocar_atualizado_em();

drop trigger if exists pessoas_atualizado_em on public.pessoas;
create trigger pessoas_atualizado_em
  before update on public.pessoas
  for each row execute function public.tocar_atualizado_em();
