-- ============================================================================
-- 003 · Pedidos de oração ("privilegiados da semana")
-- ----------------------------------------------------------------------------
-- Conteúdo enviado por desconhecidos e quase sempre contendo dado pessoal
-- sensível de TERCEIRO (saúde, situação familiar). Por isso:
--
--   * nada é público antes de um moderador aprovar (default 'pendente');
--   * a escrita pública NÃO passa por aqui — só a Edge Function `enviar-pedido`
--     escreve, com service_role (ver supabase/functions/);
--   * as colunas internas (contato, ip_hash, user_agent) são protegidas por
--     GRANT de coluna, porque RLS é por LINHA e não esconderia esses campos
--     de uma linha já aprovada;
--   * tudo expira sozinho (ver migração 004).
-- ============================================================================

create table if not exists public.pedidos_oracao (
  id        uuid primary key default gen_random_uuid(),

  -- Só primeiro nome. NULL = pedido anônimo.
  nome      text check (
              nome is null or
              nome ~ '^[[:alpha:]][[:alpha:][:space:]''-]{1,39}$'
            ),

  intencao  text not null check (char_length(btrim(intencao)) between 10 and 280),

  status    text not null default 'pendente'
              check (status in ('pendente','aprovado','rejeitado')),

  privilegiado_semana boolean not null default false,

  -- Aceite explícito de publicação. O CHECK impede gravar sem consentimento.
  consentimento boolean not null check (consentimento),

  expira_em   date not null default (current_date + 60),
  aprovado_em timestamptz,
  aprovado_por uuid references auth.users(id) on delete set null,
  criado_em   timestamptz not null default now(),

  -- ---- nunca públicos ------------------------------------------------------
  contato     text check (contato is null or char_length(contato) <= 120),
  ip_hash     text check (ip_hash is null or char_length(ip_hash) = 64),
  user_agent  text check (user_agent is null or char_length(user_agent) <= 300),
  motivo_flag text,

  -- Coerência: aprovado exige carimbo; pendente/rejeitado não pode ser destaque.
  constraint pedidos_oracao_aprovacao_coerente check (
    (status = 'aprovado' and aprovado_em is not null)
    or (status <> 'aprovado' and privilegiado_semana = false)
  )
);

comment on table public.pedidos_oracao is
  'Intenções enviadas pela comunidade. Só aparecem no site após aprovação.';
comment on column public.pedidos_oracao.ip_hash is
  'SHA-256 de (IP + pepper). Pseudonimizado: o IP em claro nunca é gravado.';
comment on column public.pedidos_oracao.contato is
  'Contato opcional para a Conferência retornar. Nunca exibido no site.';
comment on column public.pedidos_oracao.motivo_flag is
  'Marcação automática da Edge Function para o moderador olhar primeiro.';

alter table public.pedidos_oracao enable row level security;

-- ----------------------------------------------------------------------------
-- Privilégios — a parte que a RLS sozinha NÃO resolve
--
-- RLS filtra LINHAS. Sem os grants por coluna abaixo, uma intenção aprovada
-- entregaria `contato` e `ip_hash` para qualquer visitante com a chave anon.
-- Consequência desejada: `select *` como anon devolve ERRO. O front precisa
-- pedir as colunas nominalmente.
-- ----------------------------------------------------------------------------
revoke all on public.pedidos_oracao from anon, authenticated;

grant select (id, nome, intencao, privilegiado_semana, aprovado_em, criado_em)
  on public.pedidos_oracao to anon;

grant select, insert, update, delete on public.pedidos_oracao to authenticated;

-- ----------------------------------------------------------------------------
-- Políticas
-- ----------------------------------------------------------------------------

-- Público: só aprovado e ainda dentro do prazo.
-- (A expressão referencia `status` e `expira_em`, colunas que anon não pode
--  selecionar — e isso é permitido: a qualificação injetada pela RLS não passa
--  pelo ACL de coluna do chamador, só a consulta que ele escreveu passa.)
drop policy if exists "leitura pública de aprovados" on public.pedidos_oracao;
create policy "leitura pública de aprovados"
  on public.pedidos_oracao
  for select
  to anon
  using (status = 'aprovado' and expira_em >= current_date);

-- Moderação.
drop policy if exists "admin gerencia pedidos" on public.pedidos_oracao;
create policy "admin gerencia pedidos"
  on public.pedidos_oracao
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Deliberadamente ausente: qualquer política de INSERT para `anon`.
-- A única porta de escrita pública é a Edge Function.

create index if not exists pedidos_oracao_publicos_idx
  on public.pedidos_oracao (privilegiado_semana desc, aprovado_em desc nulls last)
  where status = 'aprovado';

create index if not exists pedidos_oracao_fila_idx
  on public.pedidos_oracao (status, criado_em desc);
