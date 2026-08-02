-- ============================================================================
-- 002 · Mural da Comunidade
-- ----------------------------------------------------------------------------
-- Divulgações de outros grupos, pastorais e movimentos.
-- Só a Conferência publica: não existe formulário público e não existe
-- política de escrita para `anon`.
-- ============================================================================

create table if not exists public.mural_posts (
  id           uuid primary key default gen_random_uuid(),

  titulo       text not null check (char_length(btrim(titulo)) between 3 and 120),
  organizacao  text not null check (char_length(btrim(organizacao)) between 2 and 120),
  resumo       text not null check (char_length(btrim(resumo)) between 20 and 800),

  -- "Início em fevereiro e agosto", "Todo 1º sábado do mês", etc.
  periodo      text check (periodo is null or char_length(periodo) <= 120),
  contato_nome text check (contato_nome is null or char_length(contato_nome) <= 80),
  contato_fone text check (contato_fone is null or char_length(contato_fone) <= 30),

  -- Só https. Fecha javascript: e data: no banco, antes de qualquer
  -- cuidado que o front venha (ou não) a tomar.
  link_externo text check (link_externo is null or link_externo ~ '^https://[^[:space:]]{4,300}$'),

  categoria    text not null default 'movimento'
                 check (categoria in ('movimento','pastoral','curso','campanha','outro')),

  publicado    boolean not null default false,
  destaque     boolean not null default false,
  ordem        integer not null default 0,
  expira_em    date,

  publicado_em timestamptz,
  criado_em    timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  criado_por   uuid references auth.users(id) on delete set null
);

comment on table public.mural_posts is
  'Cartazes do mural. Publicação exclusiva da Conferência, pelo painel.';
comment on column public.mural_posts.expira_em is
  'Última data em que o cartaz aparece. NULL = sem validade definida.';

alter table public.mural_posts enable row level security;

-- ----------------------------------------------------------------------------
-- Políticas
-- ----------------------------------------------------------------------------

-- Público: só o que está publicado e dentro da validade.
drop policy if exists "leitura pública do mural" on public.mural_posts;
create policy "leitura pública do mural"
  on public.mural_posts
  for select
  to anon
  using (publicado and (expira_em is null or expira_em >= current_date));

-- Moderação: só admin, e o WITH CHECK impede que ele crie linha que depois
-- não poderia enxergar.
drop policy if exists "admin gerencia mural" on public.mural_posts;
create policy "admin gerencia mural"
  on public.mural_posts
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Nenhuma escrita pública. Sem política de INSERT/UPDATE/DELETE para `anon`,
-- a RLS já nega; os grants abaixo tornam a negativa explícita.
revoke all on public.mural_posts from anon, authenticated;
grant select on public.mural_posts to anon;
grant select, insert, update, delete on public.mural_posts to authenticated;

create index if not exists mural_posts_publicos_idx
  on public.mural_posts (destaque desc, ordem, publicado_em desc nulls last)
  where publicado;

-- ----------------------------------------------------------------------------
-- atualizado_em automático
-- ----------------------------------------------------------------------------
create or replace function public.tocar_atualizado_em()
  returns trigger
  language plpgsql
  set search_path = public, pg_temp
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

drop trigger if exists mural_posts_atualizado_em on public.mural_posts;
create trigger mural_posts_atualizado_em
  before update on public.mural_posts
  for each row execute function public.tocar_atualizado_em();

revoke all on function public.tocar_atualizado_em() from public, anon;
