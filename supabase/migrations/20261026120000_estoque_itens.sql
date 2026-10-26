-- ============================================================================
-- 028 · Despensa — itens do estoque de doações em espécie
-- ----------------------------------------------------------------------------
-- Cestas básicas, alimentos, higiene/limpeza e utensílios que a Conferência
-- recebe e repassa às famílias. É o par do Controle Orçamentário: lá o
-- dinheiro, aqui os bens. O saldo NÃO mora nesta tabela — é a soma dos
-- movimentos (migração 029), para que toda mudança de quantidade deixe trilha
-- de quem, quando e por quê.
--
-- Mesmo desenho de acesso do financeiro: todo confrade ativo lê, só quem tem
-- o papel grava, e não há DELETE (remoção lógica por removido_em).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- pode_gerir_estoque() — quem cadastra item e movimenta a despensa.
--
-- Hoje são os mesmos papéis de pode_lancar_financeiro(), mas é função própria
-- de propósito: se a despensa ganhar um responsável que não é o tesoureiro,
-- muda-se só esta função, sem abrir o dinheiro para ele.
-- ----------------------------------------------------------------------------
create or replace function public.pode_gerir_estoque()
  returns boolean
  language sql
  security definer
  stable
  set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.confrades
     where user_id = auth.uid()
       and ativo
       and papel in ('tesoureiro', 'administrador')
  );
$$;

comment on function public.pode_gerir_estoque() is
  'True se o usuário autenticado atual é confrade ativo com papel tesoureiro ou administrador — quem pode cadastrar itens e movimentar a despensa.';

revoke all on function public.pode_gerir_estoque() from public, anon;
grant execute on function public.pode_gerir_estoque() to authenticated;

create table if not exists public.estoque_itens (
  id                   uuid primary key default gen_random_uuid(),

  categoria            text not null
                         check (categoria in ('cestas','alimentos','higiene_limpeza','utensilios_outros')),
  nome                 text not null,
  marcas               text,
  -- Unidade em que o item é CONTADO. Não se soma unidade diferente: 4 cestas
  -- e 30 pacotes não são "34 volumes".
  unidade              text not null
                         check (unidade in ('cesta','pacote','fardo','caixa','garrafa','bandeja',
                                            'saco','lata','rolo','unidade','peca','volume','kg','litro')),
  -- O que vem dentro de uma unidade, quando ela é embalagem de outras
  -- ("20 × 500 g", "12 × 1 L"). Texto livre: só informa, não converte.
  conteudo_por_unidade text,
  local                text,
  perecivel            boolean not null default false,
  validade_proxima     date,
  observacoes          text,

  -- true enquanto a quantidade vier de estimativa (a carga inicial veio de
  -- fotos). A conferência física (conferir_item_estoque) desliga.
  estimado             boolean not null default false,
  conferido_por        uuid references auth.users(id) on delete set null,
  conferido_em         timestamptz,

  -- De onde o item veio quando não foi digitado na tela
  -- ('inventario-2026-10-26#8'). Torna a carga inicial reaplicável.
  origem_ref           text,

  criado_por           uuid not null default auth.uid() references auth.users(id) on delete restrict,
  criado_em            timestamptz not null default now(),
  atualizado_por       uuid references auth.users(id) on delete set null,
  atualizado_em        timestamptz not null default now(),

  removido_por         uuid references auth.users(id) on delete set null,
  removido_em          timestamptz,

  constraint estoque_itens_nome_check check (char_length(btrim(nome)) between 2 and 120)
);

comment on table public.estoque_itens is
  'Itens da despensa (doações em espécie). O saldo é a soma de estoque_movimentos — ver vw_estoque_saldos. removido_em preenchido = remoção lógica.';

create unique index if not exists estoque_itens_origem_ref_key
  on public.estoque_itens (origem_ref)
  where origem_ref is not null;

create index if not exists estoque_itens_ativos_idx
  on public.estoque_itens (categoria, nome)
  where removido_em is null;

alter table public.estoque_itens enable row level security;

revoke all on public.estoque_itens from anon, authenticated;
grant select, insert, update on public.estoque_itens to authenticated;
-- Sem DELETE: remoção lógica é UPDATE (removido_em/removido_por).

drop policy if exists "confrade ativo lê estoque_itens" on public.estoque_itens;
create policy "confrade ativo lê estoque_itens"
  on public.estoque_itens
  for select
  to authenticated
  using (public.is_confrade_ativo());

drop policy if exists "tesoureiro/admin insere estoque_itens" on public.estoque_itens;
create policy "tesoureiro/admin insere estoque_itens"
  on public.estoque_itens
  for insert
  to authenticated
  with check (public.pode_gerir_estoque() and criado_por = auth.uid());

drop policy if exists "tesoureiro/admin atualiza estoque_itens" on public.estoque_itens;
create policy "tesoureiro/admin atualiza estoque_itens"
  on public.estoque_itens
  for update
  to authenticated
  using (public.pode_gerir_estoque())
  with check (public.pode_gerir_estoque());

drop trigger if exists estoque_itens_atualizado_em on public.estoque_itens;
create trigger estoque_itens_atualizado_em
  before update on public.estoque_itens
  for each row execute function public.tocar_atualizado_em();
