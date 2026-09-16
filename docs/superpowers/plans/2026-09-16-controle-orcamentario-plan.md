# Controle Orçamentário (Fase 3 de 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar à Conferência N. S. do Carmo um controle orçamentário (entradas, saídas, saldo da conta BRB, categorias, conciliação e comprovantes) dentro da Área do Vicentino já existente.

**Architecture:** Reaproveita 100% do padrão Supabase Auth + RLS por tabela já usado no Prontuário — sem Edge Function nova. Uma função nova, `pode_lancar_financeiro()`, decide quem lança (tesoureiro/administrador via `confrades.papel`); leitura (extrato/saldo/relatório) é liberada a todo confrade ativo via `is_confrade_ativo()`, já existente. Primeiro uso de Supabase Storage no projeto, num bucket privado, para os comprovantes.

**Tech Stack:** Postgres/Supabase (SQL puro, sem ORM), HTML/CSS/JS puro sem bundler (`app/` publicado estático na Vercel), `@supabase/supabase-js@2.45.4` via esm.sh (já em uso), `chart.js@4.4.4` via jsdelivr (já em uso na Fase 2), Node `.mjs` para o script de verificação (sem `package.json` no repo — todos os scripts já seguem esse padrão).

**Spec:** `docs/superpowers/specs/2026-09-16-controle-orcamentario-design.md`

## Global Constraints

- Nenhuma tabela/bucket novo tem grant ou policy para `anon` — dado financeiro nunca é público (mesma regra do Prontuário).
- Sem Edge Function nova: toda escrita é direto do client autenticado, protegida só por RLS (mesmo raciocínio do Prontuário — quem escreve é sempre um confrade identificável).
- `pode_lancar_financeiro()` = confrade ativo com `papel in ('tesoureiro','administrador')`; leitura ampla = `is_confrade_ativo()` (ambas já existem/serão criadas nas migrações abaixo — não reaproveitar `is_admin()`, que é sobre moderação do site, um conceito diferente).
- Soft delete apenas em `lancamentos_financeiros` (`removido_em`/`removido_por`); nunca `DELETE` de verdade nela. `conciliacoes_financeiras` não tem UPDATE/DELETE (histórico fechado). `categorias_financeiras`/`saldo_inicial_financeiro` têm UPDATE mas não DELETE.
- Todo valor monetário é `numeric(10,2)`.
- Migrações em `supabase/migrations/<timestamp>_<nome>.sql`, timestamps sequenciais a partir de `20260916150000` (a última existente é `20260916120000`), comentário de cabeçalho numerado (a última é "013" — as novas começam em "014").
- HTML novo carrega `app/assets/prontuario.css` (já tem `[hidden] { display: none !important; }`) — não criar CSS global novo, só um `<style>` local por página para o que for específico dela (mesmo padrão de `prontuario-dashboard.html`).
- Sem framework de teste local (não há `package.json`/Postgres local neste repo): a verificação segue o padrão já estabelecido nas fases anteriores — escrever a migração, aplicar com `supabase db push` (sempre `--dry-run` primeiro, lição de 03/08/2026), depois provar com um script `.mjs` contra o projeto real e com QA manual ao vivo. Task 6 e Task 8 são os pontos de verificação real deste plano.
- Projeto Supabase de produção: `zyzyttkayblvgnfqkapq` (URL/chave já em `app/assets/supabase-client.js` — não trocar).
- Toda conta de teste criada para verificação é descartável e apagada ao final da própria task que a criou (mesmo padrão das Fases 1 e 2).

---

### Task 1: Migração — categorias financeiras + `pode_lancar_financeiro()`

**Files:**
- Create: `supabase/migrations/20260916150000_financeiro_categorias.sql`

**Interfaces:**
- Produces: tabela `public.categorias_financeiras` (`id uuid`, `tipo text` — `'entrada'|'saida'`, `nome text`, `ativa boolean`, `criado_em timestamptz`); função `public.pode_lancar_financeiro() returns boolean` — usada por todas as tasks seguintes deste módulo.

- [ ] **Step 1: Escrever a migração**

```sql
-- ============================================================================
-- 014 · Controle Orçamentário — categorias financeiras
-- ----------------------------------------------------------------------------
-- Fase 3 de 3 (perfis de acesso → dashboard de efetividade → controle
-- orçamentário). Categorias abertas: tesoureiro/administrador cadastra pela
-- UI, sem migration nova por categoria — só a estrutura nasce aqui.
-- ============================================================================

create table if not exists public.categorias_financeiras (
  id         uuid primary key default gen_random_uuid(),
  tipo       text not null check (tipo in ('entrada','saida')),
  nome       text not null check (char_length(btrim(nome)) between 2 and 80),
  ativa      boolean not null default true,
  criado_em  timestamptz not null default now(),

  constraint categorias_financeiras_tipo_nome_unico unique (tipo, nome)
);

comment on table public.categorias_financeiras is
  'Categorias de entrada e saída do controle orçamentário. Cadastro aberto pela UI (tesoureiro/administrador).';

alter table public.categorias_financeiras enable row level security;

revoke all on public.categorias_financeiras from anon, authenticated;
grant select, insert, update on public.categorias_financeiras to authenticated;
-- Sem DELETE: categoria usada por um lançamento não pode desaparecer
-- (lancamentos_financeiros.categoria_id é ON DELETE RESTRICT) — desativar
-- (ativa = false) é o jeito de "remover" uma categoria da UI sem quebrar
-- histórico.

drop policy if exists "confrade ativo lê categorias_financeiras" on public.categorias_financeiras;
create policy "confrade ativo lê categorias_financeiras"
  on public.categorias_financeiras
  for select
  to authenticated
  using (public.is_confrade_ativo());

drop policy if exists "tesoureiro/admin insere categorias_financeiras" on public.categorias_financeiras;
create policy "tesoureiro/admin insere categorias_financeiras"
  on public.categorias_financeiras
  for insert
  to authenticated
  with check (public.pode_lancar_financeiro());

drop policy if exists "tesoureiro/admin atualiza categorias_financeiras" on public.categorias_financeiras;
create policy "tesoureiro/admin atualiza categorias_financeiras"
  on public.categorias_financeiras
  for update
  to authenticated
  using (public.pode_lancar_financeiro())
  with check (public.pode_lancar_financeiro());

-- ----------------------------------------------------------------------------
-- pode_lancar_financeiro() — quem lança/edita dado financeiro.
--
-- Diferente de is_admin() (moderação do site) — confrades.papel foi desenhada
-- desde a Fase 1 do Prontuário justamente para RBAC fino como este. Fica
-- nesta migração (a primeira do módulo financeiro a precisar dela) para não
-- abrir uma migração só de função.
-- ----------------------------------------------------------------------------
create or replace function public.pode_lancar_financeiro()
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

comment on function public.pode_lancar_financeiro() is
  'True se o usuário autenticado atual é confrade ativo com papel tesoureiro ou administrador — quem pode lançar/editar o controle orçamentário.';

revoke all on function public.pode_lancar_financeiro() from public, anon;
grant execute on function public.pode_lancar_financeiro() to authenticated;

-- Seed inicial — editável depois pela UI, sem migration nova.
insert into public.categorias_financeiras (tipo, nome) values
  ('entrada', 'Coleta em reunião'),
  ('entrada', 'Doação avulsa'),
  ('entrada', 'Doação PIX do site'),
  ('entrada', 'Repasse recebido'),
  ('saida',   'Ajuda a família'),
  ('saida',   'Despesa administrativa'),
  ('saida',   'Repasse ao Conselho Particular'),
  ('saida',   'Outra')
on conflict (tipo, nome) do nothing;
```

- [ ] **Step 2: Checklist de revisão do arquivo** (sem Postgres local — este é o gate desta task)

Conferir manualmente antes de seguir: nome do arquivo com timestamp maior que `20260916120000`; toda tabela tem `enable row level security` + `revoke all ... from anon, authenticated` seguido de `grant` explícito; toda `create policy` tem `drop policy if exists` antes (idempotência); função tem `security definer` + `set search_path = public, pg_temp` (mesmo padrão de `is_confrade_ativo()`); seed usa `on conflict do nothing` (idempotente).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260916150000_financeiro_categorias.sql
git commit -m "$(cat <<'EOF'
feat(financeiro): categorias financeiras e pode_lancar_financeiro()

Primeira migração da Fase 3 (controle orçamentário). Categorias
abertas (tesoureiro/admin cadastra pela UI) e a função de RBAC que
todas as próximas tabelas do módulo vão usar.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Migração — lançamentos financeiros

**Files:**
- Create: `supabase/migrations/20260916150100_financeiro_lancamentos.sql`

**Interfaces:**
- Consumes: `public.categorias_financeiras(id, tipo)` e `public.pode_lancar_financeiro()` (Task 1); `public.intervencoes(id)` (já existe, migração 009); `public.tocar_atualizado_em()` (já existe, migração 002).
- Produces: tabela `public.lancamentos_financeiros` (`id uuid`, `tipo text`, `valor numeric(10,2)`, `data_movimento date`, `categoria_id uuid`, `descricao text`, `intervencao_id uuid` nullable, `comprovante_path text` nullable, `criado_por uuid`, `criado_em`, `atualizado_por uuid` nullable, `atualizado_em`, `removido_por uuid` nullable, `removido_em timestamptz` nullable) — consumida por Task 4 (view de saldo) e pelas duas páginas HTML.

- [ ] **Step 1: Escrever a migração**

```sql
-- ============================================================================
-- 015 · Controle Orçamentário — lançamentos
-- ----------------------------------------------------------------------------
-- Entradas e saídas da conta da Conferência (coletas, doações, ajuda a
-- famílias, despesas administrativas, repasses). Soft delete: nunca há
-- DELETE de verdade, só UPDATE marcando removido_em/removido_por — dado
-- financeiro institucional pede trilha, não apagamento (diferente do resto
-- do site).
-- ============================================================================

create table if not exists public.lancamentos_financeiros (
  id             uuid primary key default gen_random_uuid(),

  tipo           text not null check (tipo in ('entrada','saida')),
  valor          numeric(10,2) not null check (valor > 0),
  data_movimento date not null,
  categoria_id   uuid not null references public.categorias_financeiras(id) on delete restrict,
  descricao      text,

  -- Preenchido só quando a saída é ajuda a família já registrada no
  -- Prontuário — evita duplicar o mesmo dado em duas tabelas. Nulo pra
  -- qualquer outro tipo de lançamento.
  intervencao_id uuid references public.intervencoes(id) on delete set null,

  -- Caminho no bucket privado comprovantes-financeiros (migração 018).
  -- Nulo = sem comprovante anexado.
  comprovante_path text,

  criado_por     uuid not null references auth.users(id) on delete restrict,
  criado_em      timestamptz not null default now(),
  atualizado_por uuid references auth.users(id) on delete set null,
  atualizado_em  timestamptz not null default now(),

  removido_por   uuid references auth.users(id) on delete set null,
  removido_em    timestamptz
);

comment on table public.lancamentos_financeiros is
  'Entradas e saídas do controle orçamentário. removido_em preenchido = soft delete, some do extrato/saldo mas fica no banco.';

create index if not exists lancamentos_financeiros_ativos_idx
  on public.lancamentos_financeiros (data_movimento desc)
  where removido_em is null;

alter table public.lancamentos_financeiros enable row level security;

revoke all on public.lancamentos_financeiros from anon, authenticated;
grant select, insert, update on public.lancamentos_financeiros to authenticated;
-- Sem DELETE: soft delete é UPDATE (removido_em/removido_por).

drop policy if exists "confrade ativo lê lancamentos_financeiros" on public.lancamentos_financeiros;
create policy "confrade ativo lê lancamentos_financeiros"
  on public.lancamentos_financeiros
  for select
  to authenticated
  using (public.is_confrade_ativo());

drop policy if exists "tesoureiro/admin insere lancamentos_financeiros" on public.lancamentos_financeiros;
create policy "tesoureiro/admin insere lancamentos_financeiros"
  on public.lancamentos_financeiros
  for insert
  to authenticated
  with check (public.pode_lancar_financeiro());

drop policy if exists "tesoureiro/admin atualiza lancamentos_financeiros" on public.lancamentos_financeiros;
create policy "tesoureiro/admin atualiza lancamentos_financeiros"
  on public.lancamentos_financeiros
  for update
  to authenticated
  using (public.pode_lancar_financeiro())
  with check (public.pode_lancar_financeiro());

drop trigger if exists lancamentos_financeiros_atualizado_em on public.lancamentos_financeiros;
create trigger lancamentos_financeiros_atualizado_em
  before update on public.lancamentos_financeiros
  for each row execute function public.tocar_atualizado_em();

-- ----------------------------------------------------------------------------
-- Consistência que um CHECK não resolve sozinho (CHECK não pode consultar
-- outra tabela em Postgres): a categoria tem que ser do mesmo tipo do
-- lançamento, e só uma SAÍDA pode referenciar uma intervenção.
-- ----------------------------------------------------------------------------
create or replace function public.verificar_consistencia_lancamento()
  returns trigger
  language plpgsql
  set search_path = public, pg_temp
as $$
declare
  v_tipo_categoria text;
begin
  select tipo into v_tipo_categoria
    from public.categorias_financeiras where id = new.categoria_id;

  if v_tipo_categoria is distinct from new.tipo then
    raise exception 'categoria % não é do tipo %', new.categoria_id, new.tipo;
  end if;

  if new.intervencao_id is not null and new.tipo <> 'saida' then
    raise exception 'lançamento vinculado a uma intervenção precisa ser do tipo saida';
  end if;

  return new;
end;
$$;

drop trigger if exists lancamentos_financeiros_consistencia on public.lancamentos_financeiros;
create trigger lancamentos_financeiros_consistencia
  before insert or update on public.lancamentos_financeiros
  for each row execute function public.verificar_consistencia_lancamento();
```

- [ ] **Step 2: Checklist de revisão** — mesmos pontos da Task 1, mais: os dois `references` novos (`categorias_financeiras`, `intervencoes`) apontam para tabelas que já existem nesta ordem de migração; o trigger de consistência roda `before insert or update` (cobre os dois casos); `criado_por` é `not null` (será preenchido pelo client, ver Task 9 — mesmo padrão de `intervencoes.realizado_por`, que também é preenchido pelo client e não por `default auth.uid()`, para consistência com o resto do repo).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260916150100_financeiro_lancamentos.sql
git commit -m "$(cat <<'EOF'
feat(financeiro): tabela de lançamentos com soft delete e vínculo opcional a intervenção

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Migração — saldo inicial

**Files:**
- Create: `supabase/migrations/20260916150200_financeiro_saldo_inicial.sql`

**Interfaces:**
- Consumes: `public.pode_lancar_financeiro()`, `public.tocar_atualizado_em()`.
- Produces: tabela singleton `public.saldo_inicial_financeiro` (`id boolean` fixo em `true`, `valor numeric(10,2)`, `data_referencia date`, `observacoes text`, `atualizado_por`, `atualizado_em`) — consumida por Task 4.

- [ ] **Step 1: Escrever a migração**

```sql
-- ============================================================================
-- 016 · Controle Orçamentário — saldo inicial
-- ----------------------------------------------------------------------------
-- A conta poupança BRB já tinha saldo antes deste sistema existir. Linha
-- única (singleton): "id boolean" com CHECK(id) só aceita o valor `true` e,
-- sendo chave primária, só pode haver uma linha. O tesoureiro faz upsert por
-- id=true, nunca insert solto.
-- ============================================================================

create table if not exists public.saldo_inicial_financeiro (
  id              boolean primary key default true,
  valor           numeric(10,2) not null default 0,
  data_referencia date not null default current_date,
  observacoes     text,
  atualizado_por  uuid references auth.users(id) on delete set null,
  atualizado_em   timestamptz not null default now(),

  constraint saldo_inicial_financeiro_singleton check (id)
);

comment on table public.saldo_inicial_financeiro is
  'Linha única: saldo da conta BRB na data em que o controle orçamentário passou a valer. Ponto de partida do saldo corrente (vw_saldo_financeiro, migração 017).';

alter table public.saldo_inicial_financeiro enable row level security;

revoke all on public.saldo_inicial_financeiro from anon, authenticated;
grant select, insert, update on public.saldo_inicial_financeiro to authenticated;

drop policy if exists "confrade ativo lê saldo_inicial_financeiro" on public.saldo_inicial_financeiro;
create policy "confrade ativo lê saldo_inicial_financeiro"
  on public.saldo_inicial_financeiro
  for select
  to authenticated
  using (public.is_confrade_ativo());

drop policy if exists "tesoureiro/admin insere saldo_inicial_financeiro" on public.saldo_inicial_financeiro;
create policy "tesoureiro/admin insere saldo_inicial_financeiro"
  on public.saldo_inicial_financeiro
  for insert
  to authenticated
  with check (public.pode_lancar_financeiro());

drop policy if exists "tesoureiro/admin atualiza saldo_inicial_financeiro" on public.saldo_inicial_financeiro;
create policy "tesoureiro/admin atualiza saldo_inicial_financeiro"
  on public.saldo_inicial_financeiro
  for update
  to authenticated
  using (public.pode_lancar_financeiro())
  with check (public.pode_lancar_financeiro());

drop trigger if exists saldo_inicial_financeiro_atualizado_em on public.saldo_inicial_financeiro;
create trigger saldo_inicial_financeiro_atualizado_em
  before update on public.saldo_inicial_financeiro
  for each row execute function public.tocar_atualizado_em();
```

- [ ] **Step 2: Checklist de revisão** — confirmar que `id boolean primary key default true` + `check (id)` realmente impede uma segunda linha (qualquer segunda linha teria que ter `id = true` de novo, o que colide com a PK — só `false` passaria o CHECK sozinho, mas `false` falha o `check (id)`; logo é impossível inserir uma segunda linha por qualquer caminho). Front-end vai usar `upsert({ id: true, ... })`, nunca `insert` solto (anotar para a Task 9).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260916150200_financeiro_saldo_inicial.sql
git commit -m "$(cat <<'EOF'
feat(financeiro): saldo inicial da conta BRB (linha única)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Migração — conciliações e saldo corrente

**Files:**
- Create: `supabase/migrations/20260916150300_financeiro_conciliacoes.sql`

**Interfaces:**
- Consumes: `public.pode_lancar_financeiro()`, `public.lancamentos_financeiros` (Task 2), `public.saldo_inicial_financeiro` (Task 3).
- Produces: tabela `public.conciliacoes_financeiras`; view `public.vw_saldo_financeiro` (colunas `saldo_inicial`, `data_referencia_inicial`, `total_entradas`, `total_saidas`, `saldo_atual`) — consumida pelas duas páginas HTML.

- [ ] **Step 1: Escrever a migração**

```sql
-- ============================================================================
-- 017 · Controle Orçamentário — conciliações e saldo corrente
-- ----------------------------------------------------------------------------
-- Registro periódico "o extrato do BRB mostrava R$X em tal data" comparado
-- ao que o sistema calcula — pega lançamento esquecido/errado. A diferença
-- fica CONGELADA no momento do registro (não recalcula depois, ao contrário
-- da view de saldo corrente, que é sempre "agora").
-- ============================================================================

create table if not exists public.conciliacoes_financeiras (
  id              uuid primary key default gen_random_uuid(),
  data_referencia date not null,
  saldo_extrato   numeric(10,2) not null,
  saldo_sistema   numeric(10,2) not null,
  diferenca       numeric(10,2) generated always as (saldo_extrato - saldo_sistema) stored,
  observacoes     text,
  conciliado_por  uuid not null references auth.users(id) on delete restrict,
  criado_em       timestamptz not null default now()
);

comment on table public.conciliacoes_financeiras is
  'Conferência periódica do saldo calculado contra o extrato real do BRB. saldo_sistema é congelado no momento do registro.';

create index if not exists conciliacoes_financeiras_data_idx
  on public.conciliacoes_financeiras (data_referencia desc);

alter table public.conciliacoes_financeiras enable row level security;

revoke all on public.conciliacoes_financeiras from anon, authenticated;
grant select, insert on public.conciliacoes_financeiras to authenticated;
-- Sem UPDATE/DELETE: uma conciliação registrada é histórico — se foi
-- lançada errada, registra-se uma nova, não se corrige a antiga.

drop policy if exists "confrade ativo lê conciliacoes_financeiras" on public.conciliacoes_financeiras;
create policy "confrade ativo lê conciliacoes_financeiras"
  on public.conciliacoes_financeiras
  for select
  to authenticated
  using (public.is_confrade_ativo());

drop policy if exists "tesoureiro/admin registra conciliacoes_financeiras" on public.conciliacoes_financeiras;
create policy "tesoureiro/admin registra conciliacoes_financeiras"
  on public.conciliacoes_financeiras
  for insert
  to authenticated
  with check (public.pode_lancar_financeiro());

-- ----------------------------------------------------------------------------
-- vw_saldo_financeiro — saldo corrente = saldo inicial + entradas − saídas
-- (só lançamentos não removidos, desde a data_referencia do saldo inicial).
--
-- View simples, sem SECURITY DEFINER: roda com os direitos de quem consulta,
-- protegida pela RLS de lancamentos_financeiros/saldo_inicial_financeiro por
-- baixo — mesmo padrão de vw_renda_familiar (migração 008). Sempre devolve
-- exatamente uma linha (a CTE `base` não depende de FROM).
-- ----------------------------------------------------------------------------
create or replace view public.vw_saldo_financeiro as
with base as (
  select
    coalesce((select valor from public.saldo_inicial_financeiro limit 1), 0) as saldo_inicial,
    coalesce((select data_referencia from public.saldo_inicial_financeiro limit 1), '1900-01-01'::date) as data_referencia_inicial
)
select
  base.saldo_inicial,
  base.data_referencia_inicial,
  coalesce((
    select sum(l.valor) from public.lancamentos_financeiros l
     where l.tipo = 'entrada' and l.removido_em is null
       and l.data_movimento >= base.data_referencia_inicial
  ), 0) as total_entradas,
  coalesce((
    select sum(l.valor) from public.lancamentos_financeiros l
     where l.tipo = 'saida' and l.removido_em is null
       and l.data_movimento >= base.data_referencia_inicial
  ), 0) as total_saidas,
  base.saldo_inicial
    + coalesce((
        select sum(l.valor) from public.lancamentos_financeiros l
         where l.tipo = 'entrada' and l.removido_em is null
           and l.data_movimento >= base.data_referencia_inicial
      ), 0)
    - coalesce((
        select sum(l.valor) from public.lancamentos_financeiros l
         where l.tipo = 'saida' and l.removido_em is null
           and l.data_movimento >= base.data_referencia_inicial
      ), 0) as saldo_atual
from base;

comment on view public.vw_saldo_financeiro is
  'Saldo corrente único (uma linha): saldo inicial + entradas − saídas não removidas desde a data do saldo inicial.';
```

- [ ] **Step 2: Checklist de revisão** — `diferenca` é coluna gerada (`generated always as ... stored`), não precisa ser passada no INSERT; a view não tem `security_invoker`/`security definer` de propósito (mesmo raciocínio documentado de `vw_renda_familiar`: a proteção vem das tabelas por baixo, que já revogam `anon`); confirmar que a CTE `base` sempre produz 1 linha (não tem `FROM`, só `SELECT` de escalares).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260916150300_financeiro_conciliacoes.sql
git commit -m "$(cat <<'EOF'
feat(financeiro): conciliações periódicas e view de saldo corrente

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Migração — bucket de comprovantes (Storage)

**Files:**
- Create: `supabase/migrations/20260916150400_financeiro_storage.sql`

**Interfaces:**
- Consumes: `public.pode_lancar_financeiro()` (Task 1).
- Produces: bucket privado `comprovantes-financeiros` em `storage.buckets` + 4 policies em `storage.objects` — consumido pela Task 9 (upload/leitura de comprovante).

- [ ] **Step 1: Escrever a migração**

```sql
-- ============================================================================
-- 018 · Controle Orçamentário — comprovantes (Storage)
-- ----------------------------------------------------------------------------
-- Primeiro uso de Supabase Storage no projeto. Bucket privado — nenhum
-- comprovante é público, nem para confrade comum: o print/recibo às vezes
-- carrega dado de terceiro (nome/telefone num comprovante de PIX), então só
-- quem tem pode_lancar_financeiro() abre o arquivo, mesmo que o extrato em
-- si (que só diz "há comprovante anexado") seja visível a todo confrade.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'comprovantes-financeiros', 'comprovantes-financeiros', false,
  5242880, -- 5 MB
  array['image/jpeg', 'image/png', 'application/pdf']
)
on conflict (id) do nothing;

drop policy if exists "tesoureiro/admin lê comprovantes-financeiros" on storage.objects;
create policy "tesoureiro/admin lê comprovantes-financeiros"
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'comprovantes-financeiros' and public.pode_lancar_financeiro());

drop policy if exists "tesoureiro/admin envia comprovantes-financeiros" on storage.objects;
create policy "tesoureiro/admin envia comprovantes-financeiros"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'comprovantes-financeiros' and public.pode_lancar_financeiro());

drop policy if exists "tesoureiro/admin substitui comprovantes-financeiros" on storage.objects;
create policy "tesoureiro/admin substitui comprovantes-financeiros"
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'comprovantes-financeiros' and public.pode_lancar_financeiro())
  with check (bucket_id = 'comprovantes-financeiros' and public.pode_lancar_financeiro());

drop policy if exists "tesoureiro/admin apaga comprovantes-financeiros" on storage.objects;
create policy "tesoureiro/admin apaga comprovantes-financeiros"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'comprovantes-financeiros' and public.pode_lancar_financeiro());
```

- [ ] **Step 2: Checklist de revisão** — `public = false` (bucket privado); `file_size_limit` em bytes (5242880 = 5 MB); as 4 policies cobrem select/insert/update/delete e todas exigem `pode_lancar_financeiro()` — inclusive o `select`, mais restrito que o extrato em si (decisão confirmada na spec).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260916150400_financeiro_storage.sql
git commit -m "$(cat <<'EOF'
feat(financeiro): bucket privado de comprovantes no Storage

Primeiro uso de Supabase Storage no projeto. Só quem lança
(pode_lancar_financeiro()) lê ou escreve no bucket — mais restrito
que o extrato, porque um comprovante às vezes expõe dado de terceiro.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Aplicar as 5 migrações no Supabase de produção

**Files:** nenhum arquivo novo — task de operação, mesma disciplina usada em todas as fases anteriores (lições de 03/08 e 09/15 sobre `db push`).

**Interfaces:**
- Consumes: as 5 migrações das Tasks 1–5.
- Produces: schema aplicado no projeto `zyzyttkayblvgnfqkapq`, base para as Tasks 7–8.

- [ ] **Step 1: Confirmar que a CLI está na conta/projeto certos**

```bash
npx supabase projects list
```
Esperado: `zyzyttkayblvgnfqkapq` (vicentinos) aparece na lista. Se vier 403 ou o projeto não aparecer, rodar `npx supabase login` antes de continuar (lição de 09/15: "CLI logada" não é o mesmo fato que "CLI logada na conta certa").

- [ ] **Step 2: Comparar local vs. remoto antes de aplicar**

```bash
npx supabase link --project-ref zyzyttkayblvgnfqkapq
npx supabase migration list
```
Esperado: as 13 migrações já existentes aparecem como `remote` aplicadas; as 5 novas (`20260916150000` a `20260916150400`) aparecem só em `local`.

- [ ] **Step 3: Dry-run**

```bash
npx supabase db push --dry-run
```
Esperado: só as 5 migrações novas na lista (nenhuma das 13 antigas reaparece — se reaparecer, parar e investigar antes de continuar, mesma lição de 03/08).

- [ ] **Step 4: Aplicar de verdade**

```bash
npx supabase db push
```

- [ ] **Step 5: Spot-check direto no banco** (via `npx supabase db execute` ou SQL Editor do Dashboard)

```sql
select count(*) from public.categorias_financeiras; -- esperado: 8 (seed)
select proname from pg_proc where proname in ('pode_lancar_financeiro', 'verificar_consistencia_lancamento');
select tablename, rowsecurity from pg_tables
 where tablename in ('categorias_financeiras','lancamentos_financeiros','saldo_inicial_financeiro','conciliacoes_financeiras');
-- esperado: rowsecurity = true nas 4
select * from storage.buckets where id = 'comprovantes-financeiros'; -- esperado: 1 linha, public = false
```

- [ ] **Step 6: Cadastrar o saldo inicial real da conta BRB**

Pedir ao usuário o valor e a data do saldo atual da conta poupança BRB (dado institucional — não inferir, mesma lição de 03/08 sobre fato institucional). Registrar via SQL Editor:

```sql
insert into public.saldo_inicial_financeiro (id, valor, data_referencia, observacoes)
values (true, <VALOR_INFORMADO_PELO_USUARIO>, '<DATA_INFORMADA>', 'Saldo inicial ao ligar o controle orçamentário.')
on conflict (id) do update set
  valor = excluded.valor, data_referencia = excluded.data_referencia,
  observacoes = excluded.observacoes, atualizado_em = now();
```

Nenhum commit nesta task (é aplicação em produção, não mudança de arquivo).

---

### Task 7: Script de verificação — `supabase/verificar-rls-financeiro.mjs`

**Files:**
- Create: `supabase/verificar-rls-financeiro.mjs`

**Interfaces:**
- Consumes: `app/assets/supabase-client.js` (lê `SUPABASE_URL`/`SUPABASE_ANON_KEY` de lá, mesmo padrão de `verificar-rls-prontuario.mjs`); tabelas das Tasks 1–4; bucket da Task 5.
- Produces: script executável (`node supabase/verificar-rls-financeiro.mjs`), usado na Task 8.

- [ ] **Step 1: Escrever o script**

```javascript
#!/usr/bin/env node
// ============================================================================
// Prova que o Controle Orçamentário respeita as duas camadas de acesso:
// leitura ampla (todo confrade ativo) e escrita restrita (só tesoureiro ou
// administrador, via pode_lancar_financeiro()) — e que o comprovante no
// Storage é AINDA mais restrito que o extrato (só quem lança abre o arquivo).
//
// Uso:
//   node supabase/verificar-rls-financeiro.mjs
//
// Variáveis (ou preencha app/assets/supabase-client.js, lido por padrão):
//   SUPABASE_URL, SUPABASE_ANON_KEY       endereço e chave pública do projeto
//   TESOUREIRO_EMAIL, TESOUREIRO_SENHA    confrade de teste com papel
//                                         'tesoureiro' ou 'administrador'
//   CONFRADE_EMAIL, CONFRADE_SENHA        confrade de teste com papel comum
//                                         (ex.: 'vicentino') — lê mas não lança
//   NAO_CONFRADE_EMAIL, NAO_CONFRADE_SENHA
//                                         conta authenticated de teste, SEM
//                                         linha em confrades (descartável)
// ============================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const aqui = dirname(fileURLToPath(import.meta.url));

function daConfiguracao(nome) {
  try {
    const fonte = readFileSync(join(aqui, "..", "app", "assets", "supabase-client.js"), "utf8");
    return fonte.match(new RegExp(`${nome}\\s*=\\s*"([^"]+)"`))?.[1] ?? null;
  } catch {
    return null;
  }
}

const URL_BASE = process.env.SUPABASE_URL || daConfiguracao("SUPABASE_URL");
const ANON = process.env.SUPABASE_ANON_KEY || daConfiguracao("SUPABASE_ANON_KEY");
const TESOUREIRO_EMAIL = process.env.TESOUREIRO_EMAIL || "";
const TESOUREIRO_SENHA = process.env.TESOUREIRO_SENHA || "";
const CONFRADE_EMAIL = process.env.CONFRADE_EMAIL || "";
const CONFRADE_SENHA = process.env.CONFRADE_SENHA || "";
const NAO_CONFRADE_EMAIL = process.env.NAO_CONFRADE_EMAIL || "";
const NAO_CONFRADE_SENHA = process.env.NAO_CONFRADE_SENHA || "";

if (!URL_BASE || !ANON || URL_BASE.includes("SEU-PROJETO") || ANON.startsWith("COLE_AQUI")) {
  console.error("Configure SUPABASE_URL e SUPABASE_ANON_KEY (ou preencha app/assets/supabase-client.js).");
  process.exit(2);
}

const REST = `${URL_BASE}/rest/v1`;
const STORAGE = `${URL_BASE}/storage/v1`;
let passou = 0, falhou = 0;

function relatar(ok, titulo, detalhe = "") {
  if (ok) { passou++; console.log(`  OK    ${titulo}`); }
  else { falhou++; console.log(`  FALHA ${titulo}${detalhe ? "\n        " + detalhe : ""}`); }
}

async function chamar(caminho, { token = ANON, metodo = "GET", corpo, extra = {}, base = REST } = {}) {
  const r = await fetch(`${base}${caminho}`, {
    method: metodo,
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...extra,
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  let dados = null;
  const texto = await r.text();
  try { dados = texto ? JSON.parse(texto) : null; } catch { dados = texto; }
  return { status: r.status, dados };
}

async function login(email, senha) {
  const r = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "content-type": "application/json" },
    body: JSON.stringify({ email, password: senha }),
  });
  return r.json();
}

const negado = (r) => r.status === 401 || r.status === 403 || r.status === 404 ||
  (r.status >= 400 && r.status < 500);

const TABELAS = ["categorias_financeiras", "lancamentos_financeiros",
  "saldo_inicial_financeiro", "conciliacoes_financeiras"];
const idFalso = "00000000-0000-0000-0000-000000000000";
const CAMINHO_TESTE = "verificacao/arquivo-de-teste.txt";
const CONTEUDO_TESTE = "arquivo descartável de verificar-rls-financeiro.mjs";

// ---------------------------------------------------------------------------
// Porta de entrada: a chave é sequer aceita?
// ---------------------------------------------------------------------------
const testeChave = await chamar("/rpc/is_confrade_ativo", { metodo: "POST", corpo: {} });
if (testeChave.status === 401 && /invalid/i.test(JSON.stringify(testeChave.dados))) {
  console.error("\nA chave anon foi RECUSADA pelo projeto — nada abaixo teria sentido.");
  console.error(`  ${JSON.stringify(testeChave.dados)}`);
  process.exit(2);
}

// ---------------------------------------------------------------------------
console.log("\n=== 1. anon: nenhuma leitura/escrita em nenhuma tabela do financeiro ===");

for (const tabela of TABELAS) {
  const leitura = await chamar(`/${tabela}?select=*&limit=1`);
  const vazou = leitura.status === 200 && Array.isArray(leitura.dados) && leitura.dados.length > 0;
  relatar(!vazou && negado(leitura), `anon NÃO lê ${tabela}`,
    `status ${leitura.status}: ${JSON.stringify(leitura.dados).slice(0, 160)}`);

  const insert = await chamar(`/${tabela}`, { metodo: "POST", corpo: {} });
  relatar(negado(insert), `anon NÃO consegue INSERT em ${tabela}`,
    `status ${insert.status}: ${JSON.stringify(insert.dados).slice(0, 160)}`);
}

const saldoAnon = await chamar("/vw_saldo_financeiro?select=*");
const saldoVazou = saldoAnon.status === 200 && Array.isArray(saldoAnon.dados) && saldoAnon.dados.length > 0;
relatar(!saldoVazou && negado(saldoAnon), "anon NÃO lê vw_saldo_financeiro",
  `status ${saldoAnon.status}: ${JSON.stringify(saldoAnon.dados).slice(0, 160)}`);

const rpcAnon = await chamar("/rpc/pode_lancar_financeiro", { metodo: "POST", corpo: {} });
relatar(negado(rpcAnon), "anon NÃO executa pode_lancar_financeiro",
  `status ${rpcAnon.status}: ${JSON.stringify(rpcAnon.dados).slice(0, 160)}`);

console.log("\n=== 2. anon: nenhum acesso ao bucket de comprovantes ===");

const uploadAnon = await chamar(`/object/comprovantes-financeiros/${CAMINHO_TESTE}`, {
  base: STORAGE, metodo: "POST", extra: { "content-type": "text/plain" }, corpo: null,
});
relatar(negado(uploadAnon), "anon NÃO consegue enviar arquivo ao bucket",
  `status ${uploadAnon.status}: ${JSON.stringify(uploadAnon.dados).slice(0, 160)}`);

const leituraAnon = await chamar(`/object/comprovantes-financeiros/${CAMINHO_TESTE}`, { base: STORAGE });
relatar(negado(leituraAnon), "anon NÃO consegue ler arquivo do bucket",
  `status ${leituraAnon.status}`);

// ---------------------------------------------------------------------------
if (NAO_CONFRADE_EMAIL && NAO_CONFRADE_SENHA) {
  console.log("\n=== 3. authenticated sem linha em confrades: também barrado ===");

  const sessao = await login(NAO_CONFRADE_EMAIL, NAO_CONFRADE_SENHA);
  if (!sessao.access_token) {
    relatar(false, "login do usuário de teste (não confrade)", JSON.stringify(sessao).slice(0, 200));
  } else {
    const jwt = sessao.access_token;
    relatar(true, "usuário de teste autenticou");

    for (const tabela of TABELAS) {
      const r = await chamar(`/${tabela}?select=*&limit=1`, { token: jwt });
      const vazou = r.status === 200 && Array.isArray(r.dados) && r.dados.length > 0;
      relatar(!vazou, `authenticated não-confrade NÃO lê ${tabela}`,
        `status ${r.status}: ${JSON.stringify(r.dados).slice(0, 160)}`);
    }
  }
} else {
  console.log("\n=== 3. (pulado) — defina NAO_CONFRADE_EMAIL/NAO_CONFRADE_SENHA ===");
}

// ---------------------------------------------------------------------------
if (CONFRADE_EMAIL && CONFRADE_SENHA) {
  console.log("\n=== 4. confrade comum: LÊ tudo, mas não lança nem abre comprovante ===");

  const sessao = await login(CONFRADE_EMAIL, CONFRADE_SENHA);
  if (!sessao.access_token) {
    relatar(false, "login do confrade comum de teste", JSON.stringify(sessao).slice(0, 200));
  } else {
    const jwt = sessao.access_token;
    relatar(true, "confrade comum autenticou");

    const souLancador = await chamar("/rpc/pode_lancar_financeiro", { token: jwt, metodo: "POST", corpo: {} });
    relatar(souLancador.status === 200 && souLancador.dados === false,
      "pode_lancar_financeiro() devolve falso para confrade comum",
      `status ${souLancador.status}: ${JSON.stringify(souLancador.dados)}`);

    const saldo = await chamar("/vw_saldo_financeiro?select=*", { token: jwt });
    relatar(saldo.status === 200 && Array.isArray(saldo.dados) && saldo.dados.length === 1,
      "confrade comum LÊ vw_saldo_financeiro (exatamente 1 linha)",
      `status ${saldo.status}: ${JSON.stringify(saldo.dados).slice(0, 200)}`);

    for (const tabela of TABELAS) {
      const leitura = await chamar(`/${tabela}?select=*&limit=1`, { token: jwt });
      relatar(leitura.status === 200, `confrade comum LÊ ${tabela}`,
        `status ${leitura.status}: ${JSON.stringify(leitura.dados).slice(0, 160)}`);

      const insert = await chamar(`/${tabela}`, { token: jwt, metodo: "POST", corpo: {} });
      relatar(negado(insert), `confrade comum NÃO consegue INSERT em ${tabela}`,
        `status ${insert.status}: ${JSON.stringify(insert.dados).slice(0, 160)}`);
    }

    const leituraArquivo = await chamar(`/object/comprovantes-financeiros/${CAMINHO_TESTE}`, { token: jwt, base: STORAGE });
    relatar(negado(leituraArquivo), "confrade comum NÃO consegue ler arquivo do bucket",
      `status ${leituraArquivo.status}`);
  }
} else {
  console.log("\n=== 4. (pulado) — defina CONFRADE_EMAIL/CONFRADE_SENHA (papel comum, ex.: 'vicentino') ===");
}

// ---------------------------------------------------------------------------
if (TESOUREIRO_EMAIL && TESOUREIRO_SENHA) {
  console.log("\n=== 5. tesoureiro/admin: consegue lançar, editar (soft delete) e usar o bucket ===");

  const sessao = await login(TESOUREIRO_EMAIL, TESOUREIRO_SENHA);
  if (!sessao.access_token) {
    relatar(false, "login do tesoureiro de teste", JSON.stringify(sessao).slice(0, 200));
  } else {
    const jwt = sessao.access_token;
    relatar(true, "tesoureiro autenticou");

    const souLancador = await chamar("/rpc/pode_lancar_financeiro", { token: jwt, metodo: "POST", corpo: {} });
    relatar(souLancador.status === 200 && souLancador.dados === true,
      "pode_lancar_financeiro() devolve verdadeiro para o tesoureiro",
      `status ${souLancador.status}: ${JSON.stringify(souLancador.dados)}`);

    const categoria = await chamar("/categorias_financeiras?select=id&tipo=eq.entrada&ativa=eq.true&limit=1", { token: jwt });
    const categoriaId = categoria.dados?.[0]?.id;
    relatar(!!categoriaId, "existe ao menos 1 categoria de entrada ativa (seed da Task 1)",
      JSON.stringify(categoria.dados).slice(0, 160));

    if (categoriaId) {
      const criar = await chamar("/lancamentos_financeiros", {
        token: jwt, metodo: "POST",
        corpo: {
          tipo: "entrada", valor: 1.23, data_movimento: "2026-01-01",
          categoria_id: categoriaId, descricao: "Lançamento de teste — verificar-rls-financeiro.mjs",
          criado_por: sessao.user.id,
        },
        extra: { Prefer: "return=representation" },
      });
      const criouOk = criar.status === 201 && Array.isArray(criar.dados) && criar.dados[0]?.id;
      relatar(criouOk, "tesoureiro consegue INSERT em lancamentos_financeiros",
        `status ${criar.status}: ${JSON.stringify(criar.dados).slice(0, 200)}`);

      if (criouOk) {
        const idTeste = criar.dados[0].id;

        const softDelete = await chamar(`/lancamentos_financeiros?id=eq.${idTeste}`, {
          token: jwt, metodo: "PATCH",
          corpo: { removido_em: new Date().toISOString(), removido_por: sessao.user.id },
        });
        relatar(softDelete.status === 204 || softDelete.status === 200,
          "tesoureiro consegue soft-delete (UPDATE removido_em) do lançamento de teste",
          `status ${softDelete.status}`);

        const conferirSumiu = await chamar(
          `/lancamentos_financeiros?id=eq.${idTeste}&removido_em=is.null&select=id`, { token: jwt });
        relatar(Array.isArray(conferirSumiu.dados) && conferirSumiu.dados.length === 0,
          "lançamento removido não aparece mais no filtro removido_em is null",
          JSON.stringify(conferirSumiu.dados));
      }
    }

    const upload = await chamar(`/object/comprovantes-financeiros/${CAMINHO_TESTE}`, {
      base: STORAGE, token: jwt, metodo: "POST",
      extra: { "content-type": "text/plain" },
    });
    // upload via fetch simples de texto puro (sem multipart) — o endpoint
    // aceita o corpo bruto quando content-type não é multipart/form-data.
    relatar(upload.status === 200 || upload.status === 201,
      "tesoureiro consegue enviar arquivo ao bucket",
      `status ${upload.status}: ${JSON.stringify(upload.dados).slice(0, 160)}`);

    const leituraOk = await chamar(`/object/comprovantes-financeiros/${CAMINHO_TESTE}`, { token: jwt, base: STORAGE });
    relatar(leituraOk.status === 200, "tesoureiro consegue ler o arquivo que enviou",
      `status ${leituraOk.status}`);

    const apagar = await chamar(`/object/comprovantes-financeiros/${CAMINHO_TESTE}`, {
      token: jwt, metodo: "DELETE", base: STORAGE,
    });
    relatar(apagar.status === 200, "limpeza: arquivo de teste apagado do bucket",
      `status ${apagar.status}`);
  }
} else {
  console.log("\n=== 5. (pulado) — defina TESOUREIRO_EMAIL/TESOUREIRO_SENHA (papel 'tesoureiro' ou 'administrador') ===");
  console.log("  Sem esse par, 'tudo negado' não distingue 'protegido' de 'tudo quebrado'.");
}

// ---------------------------------------------------------------------------
console.log(`\n${passou} verificação(ões) passaram, ${falhou} falharam.`);
if (falhou) {
  console.log("NÃO publique o controle orçamentário enquanto houver falha aqui.");
}
process.exit(falhou ? 1 : 0);
```

- [ ] **Step 2: Checklist de revisão** — segue a mesma âncora de "chave rejeitada" do script do Prontuário; toda seção negativa (anon, não-confrade) tem seu par positivo correspondente na seção seguinte (lição de 02/08: "tudo negado" não prova nada sozinho); o teste de soft delete confere o INSERT, o UPDATE e que o filtro `removido_em is null` de fato esconde a linha depois; a limpeza do arquivo de Storage roda mesmo em caso de sucesso (não deixa lixo no bucket).

- [ ] **Step 3: Commit**

```bash
git add supabase/verificar-rls-financeiro.mjs
git commit -m "$(cat <<'EOF'
test(financeiro): script de verificação de RLS e do bucket de comprovantes

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Rodar a verificação contra o projeto real

**Files:** nenhum arquivo novo — task de operação.

**Interfaces:**
- Consumes: script da Task 7, schema aplicado na Task 6.

- [ ] **Step 1: Criar 3 contas de teste descartáveis** via Admin API (mesmo padrão das Fases 1/2: `service_role` obtida só em memória pela CLI, nunca gravada em arquivo)

```bash
npx supabase projects api-keys --project-ref zyzyttkayblvgnfqkapq
# copiar a service_role SÓ para uso imediato no terminal, não salvar em arquivo
```

Criar `tesoureiro-teste@example.com`, `confrade-teste@example.com`, `nao-confrade-teste@example.com` via `POST {SUPABASE_URL}/auth/v1/admin/users` com a `service_role` (header `apikey`/`Authorization`), `email_confirm: true`.

- [ ] **Step 2: Inserir os dois primeiros em `confrades`** (o terceiro fica de fora, de propósito — é o caso "authenticated sem linha em confrades")

```sql
insert into public.confrades (user_id, nome_completo, papel)
select id, 'Tesoureiro de teste', 'tesoureiro' from auth.users where email = 'tesoureiro-teste@example.com';

insert into public.confrades (user_id, nome_completo, papel)
select id, 'Confrade de teste', 'vicentino' from auth.users where email = 'confrade-teste@example.com';
```

- [ ] **Step 3: Rodar o script**

```bash
TESOUREIRO_EMAIL=tesoureiro-teste@example.com TESOUREIRO_SENHA='<senha-definida>' \
CONFRADE_EMAIL=confrade-teste@example.com CONFRADE_SENHA='<senha-definida>' \
NAO_CONFRADE_EMAIL=nao-confrade-teste@example.com NAO_CONFRADE_SENHA='<senha-definida>' \
node supabase/verificar-rls-financeiro.mjs
```
Esperado: `0 falharam`. Qualquer falha bloqueia a Task 9 até ser corrigida (nova migração de correção, não editar as já aplicadas).

- [ ] **Step 4: Apagar as 3 contas de teste** (Admin API `DELETE .../admin/users/<id>` para cada uma — o `on delete cascade` de `confrades.user_id` já limpa as linhas de `confrades` junto)

- [ ] **Step 5: Confirmar limpeza**

```sql
select count(*) from public.confrades where nome_completo ilike '%de teste%'; -- esperado: 0
select count(*) from auth.users where email like '%-teste@example.com'; -- esperado: 0
```

Nenhum commit nesta task.

---

### Task 9: `app/financeiro.html`

**Files:**
- Create: `app/financeiro.html`

**Interfaces:**
- Consumes: `sb`, `exigirAcesso`, `sair` de `./assets/area-vicentino.js`; `escapar` de `./assets/supabase-client.js`; tabelas/view das Tasks 1–4; bucket da Task 5; `./assets/prontuario.css`.
- Produces: página funcional em `/financeiro.html` — consumida pela Task 11 (link a partir de `area-vicentino.html`).

- [ ] **Step 1: Escrever a página**

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="theme-color" content="#4A1818">
  <meta name="robots" content="noindex, nofollow">
  <title>Controle Orçamentário · Conferência N. S. do Carmo</title>
  <link rel="icon" type="image/png" href="assets/logo-ssvp.png">

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=Inter:wght@300;400;500;600;700&display=swap">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
  <link rel="stylesheet" href="assets/prontuario.css">
  <style>
    /* ===== Extras só desta página — saldo em destaque e tabela do extrato. ===== */
    .saldo-card { padding: 24px 26px; margin-bottom: 24px; background: #fff; border: 1px solid var(--border); border-left: 4px solid var(--gold); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); display: flex; flex-wrap: wrap; gap: 28px; align-items: baseline; }
    .saldo-valor { font-family: 'Cormorant Garamond', serif; font-size: 2.4rem; color: var(--wine-deep); }
    .saldo-nota { font-size: 0.8rem; color: var(--text-muted); }
    .saldo-mini { display: flex; gap: 22px; flex-wrap: wrap; }
    .saldo-mini span { display: block; font-size: 0.78rem; color: var(--text-muted); }
    .saldo-mini strong { display: block; font-size: 1.1rem; }
    .valor-entrada { color: var(--ok); font-weight: 700; }
    .valor-saida { color: var(--erro); font-weight: 700; }
    .extrato-tabela { width: 100%; }
    .col-comprovante { text-align: center; width: 40px; }
    @media (max-width: 640px) { .saldo-card { flex-direction: column; gap: 12px; } }
  </style>
</head>
<body>

  <div class="topo">
    <div class="wrap topo-inner">
      <div class="topo-marca">
        <img src="assets/logo-ssvp.png" alt="">
        <div>
          <strong>Controle Orçamentário</strong>
          <span>Conferência N. S. do Carmo</span>
        </div>
      </div>
      <div class="topo-usuario" id="topo-usuario" hidden>
        <span id="usuario-nome"></span>
        <button class="btn btn-claro btn-pequeno" id="btn-sair">
          <i class="fa-solid fa-arrow-right-from-bracket" aria-hidden="true"></i> Sair
        </button>
      </div>
    </div>
  </div>

  <!-- ============= ACESSO ============= -->
  <section class="login" id="tela-login">
    <p>Verificando seu acesso…</p>
  </section>

  <!-- ============= PAINEL ============= -->
  <main class="painel wrap" id="tela-painel" hidden>

    <p class="aviso" id="aviso-painel" role="status"></p>

    <div class="saldo-card">
      <div>
        <span class="saldo-nota">Saldo atual</span>
        <span class="saldo-valor" id="saldo-valor">—</span>
      </div>
      <div class="saldo-mini">
        <div><span>Entradas (desde o saldo inicial)</span><strong class="valor-entrada" id="saldo-entradas">—</strong></div>
        <div><span>Saídas (desde o saldo inicial)</span><strong class="valor-saida" id="saldo-saidas">—</strong></div>
        <div><span>Saldo inicial</span><strong id="saldo-inicial-valor">—</strong></div>
      </div>
    </div>

    <!-- ---------- Novo lançamento (só tesoureiro/admin) ---------- -->
    <div class="editor" id="editor-lancamento" hidden>
      <h2>Novo lançamento</h2>
      <form id="form-lancamento">
        <input type="hidden" id="lf-id">
        <div class="grade-2">
          <div class="campo">
            <label for="lf-tipo">Tipo *</label>
            <select id="lf-tipo" required>
              <option value="entrada">Entrada</option>
              <option value="saida">Saída</option>
            </select>
          </div>
          <div class="campo">
            <label for="lf-valor">Valor (R$) *</label>
            <input type="number" id="lf-valor" min="0.01" step="0.01" required>
          </div>
        </div>
        <div class="grade-2">
          <div class="campo">
            <label for="lf-data">Data *</label>
            <input type="date" id="lf-data" required>
          </div>
          <div class="campo">
            <label for="lf-categoria">Categoria *</label>
            <select id="lf-categoria" required></select>
          </div>
        </div>
        <div class="campo">
          <label for="lf-descricao">Descrição</label>
          <textarea id="lf-descricao" maxlength="500"></textarea>
        </div>
        <div class="campo">
          <label for="lf-comprovante">Comprovante (imagem ou PDF, até 5 MB)</label>
          <input type="file" id="lf-comprovante" accept="image/jpeg,image/png,application/pdf">
          <span class="dica" id="lf-comprovante-atual"></span>
        </div>

        <div class="campo" id="bloco-vinculo" hidden>
          <label>Vincular a uma intervenção do Prontuário (opcional)</label>
          <span class="dica">Só para saídas que já são uma ajuda registrada no Prontuário — evita lançar o mesmo valor duas vezes.</span>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">
            <input type="text" id="lf-busca-familia" placeholder="Bairro ou código da família" minlength="3" style="flex:1;min-width:200px;">
            <button type="button" class="btn btn-neutro btn-pequeno" id="btn-buscar-familia"><i class="fa-solid fa-magnifying-glass"></i> Buscar</button>
          </div>
          <div id="resultado-busca-familia" style="margin-top:10px;"></div>
          <div id="vinculo-atual" style="margin-top:10px;" hidden>
            <span class="badge badge--elegivel" id="vinculo-atual-texto"></span>
            <button type="button" class="btn btn-neutro btn-pequeno" id="btn-remover-vinculo">Remover vínculo</button>
          </div>
          <input type="hidden" id="lf-intervencao-id">
        </div>

        <button type="submit" class="btn btn-ouro" id="btn-salvar-lancamento">
          <i class="fa-solid fa-plus" aria-hidden="true"></i> Adicionar lançamento
        </button>
        <button type="button" class="btn btn-neutro" id="btn-cancelar-lancamento" hidden>Cancelar edição</button>
        <p class="aviso" id="aviso-lancamento" role="status"></p>
      </form>
    </div>

    <!-- ---------- Extrato (todo confrade ativo vê) ---------- -->
    <h2 class="secao-titulo" style="font-size:1.4rem;color:var(--wine-deep);margin-bottom:16px;">Extrato</h2>
    <div class="barra">
      <div class="filtros" id="filtros-tipo">
        <button class="filtro ativo" data-tipo="todas">Todas</button>
        <button class="filtro" data-tipo="entrada">Entradas</button>
        <button class="filtro" data-tipo="saida">Saídas</button>
      </div>
      <div class="campo" style="flex:1;min-width:220px;margin-bottom:0;">
        <label for="busca-extrato">Buscar</label>
        <input type="text" id="busca-extrato" placeholder="Categoria ou descrição">
      </div>
    </div>
    <table class="subtabela extrato-tabela">
      <thead>
        <tr><th>Data</th><th>Categoria</th><th>Descrição</th><th>Valor</th><th class="col-comprovante">Comp.</th><th class="col-acao">Ações</th></tr>
      </thead>
      <tbody id="lista-extrato"></tbody>
    </table>
    <div class="vazio" id="extrato-vazio" hidden><i class="fa-regular fa-folder-open"></i><p>Nenhum lançamento encontrado.</p></div>

    <!-- ---------- Categorias (só tesoureiro/admin) ---------- -->
    <div class="editor" id="editor-categorias" hidden>
      <h2>Categorias</h2>
      <form id="form-categoria">
        <div class="grade-2">
          <div class="campo">
            <label for="cat-tipo">Tipo *</label>
            <select id="cat-tipo" required>
              <option value="entrada">Entrada</option>
              <option value="saida">Saída</option>
            </select>
          </div>
          <div class="campo">
            <label for="cat-nome">Nome *</label>
            <input type="text" id="cat-nome" maxlength="80" required>
          </div>
        </div>
        <button type="submit" class="btn btn-ouro btn-pequeno"><i class="fa-solid fa-plus" aria-hidden="true"></i> Adicionar categoria</button>
        <p class="aviso" id="aviso-categoria" role="status"></p>
      </form>
      <table class="subtabela" style="margin-top:16px;">
        <thead><tr><th>Tipo</th><th>Nome</th><th class="col-acao">Ativa</th></tr></thead>
        <tbody id="lista-categorias"></tbody>
      </table>
    </div>

    <!-- ---------- Conciliação (só tesoureiro/admin) ---------- -->
    <div class="editor" id="editor-conciliacao" hidden>
      <h2>Conciliação com o extrato do BRB</h2>
      <form id="form-conciliacao">
        <div class="grade-2">
          <div class="campo">
            <label for="cc-data">Data do extrato *</label>
            <input type="date" id="cc-data" required>
          </div>
          <div class="campo">
            <label for="cc-saldo">Saldo no extrato do BRB (R$) *</label>
            <input type="number" id="cc-saldo" step="0.01" required>
          </div>
        </div>
        <div class="campo">
          <label for="cc-observacoes">Observações</label>
          <textarea id="cc-observacoes" maxlength="500"></textarea>
        </div>
        <button type="submit" class="btn btn-ouro btn-pequeno"><i class="fa-solid fa-scale-balanced" aria-hidden="true"></i> Registrar conciliação</button>
        <p class="aviso" id="aviso-conciliacao" role="status"></p>
      </form>
      <table class="subtabela" style="margin-top:16px;">
        <thead><tr><th>Data</th><th>Extrato</th><th>Sistema</th><th>Diferença</th><th>Observações</th></tr></thead>
        <tbody id="lista-conciliacoes"></tbody>
      </table>
    </div>

  </main>

  <script type="module">
    import { escapar } from './assets/supabase-client.js';
    import { sb, exigirAcesso, sair } from './assets/area-vicentino.js';

    const telaLogin = document.getElementById('tela-login');
    const telaPainel = document.getElementById('tela-painel');
    const topoUsuario = document.getElementById('topo-usuario');
    const avisoPainel = document.getElementById('aviso-painel');

    let usuario = null;
    let souLancador = false;
    let categoriasCache = [];
    let lancamentosCache = [];
    let filtroTipo = 'todas';

    function formatarMoeda(valor) {
      return 'R$ ' + Number(valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    }

    // Mesmo cuidado de formatarData() em supabase-client.js: uma data pura do
    // Postgres é meia-noite UTC, que em Brasília é o dia anterior. Ancora ao
    // meio-dia antes de formatar, versão curta pra caber na tabela.
    function formatarDataCurta(iso) {
      if (!iso) return '';
      const texto = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T12:00:00` : iso;
      const d = new Date(texto);
      if (Number.isNaN(d.getTime())) return '';
      return d.toLocaleDateString('pt-BR');
    }

    function mostrarAviso(el, texto, tipo) {
      el.textContent = texto;
      el.className = 'aviso visivel ' + tipo;
      if (tipo === 'ok') setTimeout(() => { el.className = 'aviso'; }, 4000);
    }

    document.getElementById('btn-sair').addEventListener('click', sair);

    // -------------------------------------------------------------------------
    // Sessão
    // -------------------------------------------------------------------------
    async function verificarSessao() {
      const acesso = await exigirAcesso();
      if (!acesso) return;
      usuario = acesso.session.user;

      document.getElementById('usuario-nome').textContent = acesso.nome;
      topoUsuario.hidden = false;
      telaLogin.hidden = true;
      telaPainel.hidden = false;

      const { data } = await sb.rpc('pode_lancar_financeiro');
      souLancador = !!data;
      document.getElementById('editor-lancamento').hidden = !souLancador;
      document.getElementById('editor-categorias').hidden = !souLancador;
      document.getElementById('editor-conciliacao').hidden = !souLancador;

      document.getElementById('lf-data').valueAsDate = new Date();
      document.getElementById('cc-data').valueAsDate = new Date();

      await carregarCategorias();
      await carregarSaldoEExtrato();
      if (souLancador) await carregarConciliacoes();
    }

    // -------------------------------------------------------------------------
    // Saldo + extrato
    // -------------------------------------------------------------------------
    async function carregarSaldoEExtrato() {
      const [{ data: saldo, error: erroSaldo }, { data: lancamentos, error: erroLancamentos }] = await Promise.all([
        sb.from('vw_saldo_financeiro').select('*').maybeSingle(),
        sb.from('lancamentos_financeiros').select('*').is('removido_em', null)
          .order('data_movimento', { ascending: false }).limit(500),
      ]);

      const erro = erroSaldo || erroLancamentos;
      if (erro) { mostrarAviso(avisoPainel, 'Erro ao carregar dados: ' + erro.message, 'erro'); return; }

      document.getElementById('saldo-valor').textContent = formatarMoeda(saldo?.saldo_atual);
      document.getElementById('saldo-entradas').textContent = formatarMoeda(saldo?.total_entradas);
      document.getElementById('saldo-saidas').textContent = formatarMoeda(saldo?.total_saidas);
      document.getElementById('saldo-inicial-valor').textContent = formatarMoeda(saldo?.saldo_inicial);

      lancamentosCache = lancamentos || [];
      renderizarExtrato();
    }

    document.querySelectorAll('#filtros-tipo .filtro').forEach(b => {
      b.addEventListener('click', () => {
        document.querySelectorAll('#filtros-tipo .filtro').forEach(o => o.classList.toggle('ativo', o === b));
        filtroTipo = b.dataset.tipo;
        renderizarExtrato();
      });
    });
    document.getElementById('busca-extrato').addEventListener('input', renderizarExtrato);

    function renderizarExtrato() {
      const corpo = document.getElementById('lista-extrato');
      const vazio = document.getElementById('extrato-vazio');
      const termo = document.getElementById('busca-extrato').value.trim().toLowerCase();
      const mapaCategorias = new Map(categoriasCache.map(c => [c.id, c]));

      let filtrados = lancamentosCache;
      if (filtroTipo !== 'todas') filtrados = filtrados.filter(l => l.tipo === filtroTipo);
      if (termo) {
        filtrados = filtrados.filter(l =>
          (mapaCategorias.get(l.categoria_id)?.nome || '').toLowerCase().includes(termo) ||
          (l.descricao || '').toLowerCase().includes(termo));
      }

      if (!filtrados.length) {
        corpo.innerHTML = '';
        vazio.hidden = false;
        return;
      }
      vazio.hidden = true;

      corpo.innerHTML = filtrados.map(l => {
        const categoria = mapaCategorias.get(l.categoria_id);
        const classeValor = l.tipo === 'entrada' ? 'valor-entrada' : 'valor-saida';
        const sinal = l.tipo === 'entrada' ? '+ ' : '− ';
        const acoes = souLancador
          ? '<button type="button" class="btn btn-neutro btn-pequeno" data-acao="editar-lancamento" data-id="' + l.id + '"><i class="fa-solid fa-pen"></i></button> ' +
            '<button type="button" class="btn btn-erro btn-pequeno" data-acao="remover-lancamento" data-id="' + l.id + '"><i class="fa-regular fa-trash-can"></i></button>'
          : '';
        const comprovante = l.comprovante_path && souLancador
          ? '<button type="button" class="btn btn-neutro btn-pequeno" data-acao="ver-comprovante" data-path="' + escapar(l.comprovante_path) + '"><i class="fa-regular fa-file"></i></button>'
          : (l.comprovante_path ? '<i class="fa-regular fa-file" title="Há comprovante anexado" aria-hidden="true"></i>' : '');

        return '<tr>' +
          '<td>' + formatarDataCurta(l.data_movimento) + '</td>' +
          '<td>' + escapar(categoria?.nome || '—') + '</td>' +
          '<td>' + escapar(l.descricao || '') + '</td>' +
          '<td class="' + classeValor + '">' + sinal + formatarMoeda(l.valor) + '</td>' +
          '<td class="col-comprovante">' + comprovante + '</td>' +
          '<td class="col-acao">' + acoes + '</td>' +
        '</tr>';
      }).join('');
    }

    // -------------------------------------------------------------------------
    // Categorias
    // -------------------------------------------------------------------------
    async function carregarCategorias() {
      const { data, error } = await sb.from('categorias_financeiras').select('*').order('tipo').order('nome');
      if (error) { mostrarAviso(avisoPainel, 'Erro ao carregar categorias: ' + error.message, 'erro'); return; }
      categoriasCache = data || [];
      preencherSelectCategorias();
      if (souLancador) renderizarListaCategorias();
    }

    function preencherSelectCategorias() {
      const select = document.getElementById('lf-categoria');
      const tipoAtual = document.getElementById('lf-tipo').value;
      const idAtual = select.value;
      const opcoes = categoriasCache.filter(c => c.tipo === tipoAtual && (c.ativa || c.id === idAtual));
      select.innerHTML = opcoes.map(c => '<option value="' + c.id + '">' + escapar(c.nome) + '</option>').join('');
    }

    document.getElementById('lf-tipo').addEventListener('change', () => {
      preencherSelectCategorias();
      document.getElementById('bloco-vinculo').hidden = document.getElementById('lf-tipo').value !== 'saida';
    });

    function renderizarListaCategorias() {
      document.getElementById('lista-categorias').innerHTML = categoriasCache.map(c =>
        '<tr><td>' + (c.tipo === 'entrada' ? 'Entrada' : 'Saída') + '</td><td>' + escapar(c.nome) + '</td>' +
        '<td class="col-acao"><input type="checkbox" data-acao="alternar-categoria" data-id="' + c.id + '" ' + (c.ativa ? 'checked' : '') + '></td></tr>'
      ).join('');
    }

    document.getElementById('form-categoria').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const aviso = document.getElementById('aviso-categoria');
      const { error } = await sb.from('categorias_financeiras').insert({
        tipo: document.getElementById('cat-tipo').value,
        nome: document.getElementById('cat-nome').value.trim(),
      });
      if (error) { mostrarAviso(aviso, 'Não foi possível criar: ' + error.message, 'erro'); return; }
      document.getElementById('cat-nome').value = '';
      mostrarAviso(aviso, 'Categoria criada.', 'ok');
      await carregarCategorias();
    });

    document.getElementById('lista-categorias').addEventListener('change', async (ev) => {
      const alvo = ev.target.closest('[data-acao="alternar-categoria"]');
      if (!alvo) return;
      await sb.from('categorias_financeiras').update({ ativa: alvo.checked }).eq('id', alvo.dataset.id);
      await carregarCategorias();
    });

    // -------------------------------------------------------------------------
    // Vínculo com intervenção (só quando tipo = saida)
    // -------------------------------------------------------------------------
    document.getElementById('btn-buscar-familia').addEventListener('click', async () => {
      const termo = document.getElementById('lf-busca-familia').value.trim();
      const alvo = document.getElementById('resultado-busca-familia');
      if (termo.length < 3) { alvo.innerHTML = '<span class="dica">Digite ao menos 3 caracteres.</span>'; return; }

      const { data: familias } = await sb.from('familias')
        .select('id, endereco_bairro, codigo')
        .or('endereco_bairro.ilike.%' + termo + '%,codigo.ilike.%' + termo + '%')
        .limit(10);

      if (!familias?.length) { alvo.innerHTML = '<span class="dica">Nenhuma família encontrada.</span>'; return; }
      alvo.innerHTML = familias.map(f =>
        '<button type="button" class="btn btn-neutro btn-pequeno" data-acao="listar-intervencoes" data-familia="' + f.id + '" style="margin:3px 6px 3px 0;">' +
          escapar(f.endereco_bairro || 'Sem bairro') + (f.codigo ? ' · ' + escapar(f.codigo) : '') +
        '</button>').join('');
    });

    document.getElementById('resultado-busca-familia').addEventListener('click', async (ev) => {
      const listar = ev.target.closest('[data-acao="listar-intervencoes"]');
      if (listar) {
        const { data: intervencoes } = await sb.from('intervencoes')
          .select('id, tipo, descricao, valor_doado, data_ocorrencia')
          .eq('familia_id', listar.dataset.familia)
          .not('valor_doado', 'is', null)
          .order('data_ocorrencia', { ascending: false })
          .limit(10);

        const alvo = document.getElementById('resultado-busca-familia');
        if (!intervencoes?.length) { alvo.innerHTML = '<span class="dica">Essa família não tem intervenção com valor doado.</span>'; return; }
        alvo.innerHTML = intervencoes.map(i =>
          '<div style="margin:4px 0;"><button type="button" class="btn btn-ouro btn-pequeno" data-acao="vincular-intervencao" ' +
            'data-id="' + i.id + '" data-rotulo="' + escapar(escapar(i.descricao).slice(0, 60)) + ' — ' + formatarMoeda(i.valor_doado) + ' (' + formatarDataCurta(i.data_ocorrencia) + ')">' +
            '<i class="fa-solid fa-link"></i> Vincular</button> ' +
            escapar(i.descricao).slice(0, 60) + ' — ' + formatarMoeda(i.valor_doado) + ' (' + formatarDataCurta(i.data_ocorrencia) + ')</div>'
        ).join('');
        return;
      }

      const vincular = ev.target.closest('[data-acao="vincular-intervencao"]');
      if (vincular) {
        document.getElementById('lf-intervencao-id').value = vincular.dataset.id;
        document.getElementById('vinculo-atual-texto').textContent = vincular.dataset.rotulo;
        document.getElementById('vinculo-atual').hidden = false;
        document.getElementById('resultado-busca-familia').innerHTML = '';
        document.getElementById('lf-busca-familia').value = '';
      }
    });

    document.getElementById('btn-remover-vinculo').addEventListener('click', () => {
      document.getElementById('lf-intervencao-id').value = '';
      document.getElementById('vinculo-atual').hidden = true;
    });

    // -------------------------------------------------------------------------
    // Novo lançamento / edição
    // -------------------------------------------------------------------------
    function limparFormularioLancamento() {
      document.getElementById('form-lancamento').reset();
      document.getElementById('lf-id').value = '';
      document.getElementById('lf-data').valueAsDate = new Date();
      document.getElementById('lf-comprovante-atual').textContent = '';
      document.getElementById('lf-intervencao-id').value = '';
      document.getElementById('vinculo-atual').hidden = true;
      document.getElementById('bloco-vinculo').hidden = true;
      document.getElementById('btn-cancelar-lancamento').hidden = true;
      document.getElementById('btn-salvar-lancamento').innerHTML = '<i class="fa-solid fa-plus" aria-hidden="true"></i> Adicionar lançamento';
      preencherSelectCategorias();
    }

    document.getElementById('btn-cancelar-lancamento').addEventListener('click', limparFormularioLancamento);

    document.getElementById('form-lancamento').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const botao = document.getElementById('btn-salvar-lancamento');
      const aviso = document.getElementById('aviso-lancamento');
      botao.disabled = true;

      const idEdicao = document.getElementById('lf-id').value || null;
      const arquivo = document.getElementById('lf-comprovante').files[0];
      const idRegistro = idEdicao || crypto.randomUUID();

      let comprovantePath;
      if (arquivo) {
        if (arquivo.size > 5 * 1024 * 1024) {
          mostrarAviso(aviso, 'Comprovante maior que 5 MB.', 'erro');
          botao.disabled = false;
          return;
        }
        const nomeSanitizado = arquivo.name.replace(/[^A-Za-z0-9._-]/g, '_');
        const caminho = idRegistro + '/' + Date.now() + '-' + nomeSanitizado;
        const { error: erroUpload } = await sb.storage.from('comprovantes-financeiros')
          .upload(caminho, arquivo, { contentType: arquivo.type, upsert: false });
        if (erroUpload) {
          mostrarAviso(aviso, 'Não foi possível enviar o comprovante: ' + erroUpload.message, 'erro');
          botao.disabled = false;
          return;
        }
        comprovantePath = caminho;
      }

      const registro = {
        tipo: document.getElementById('lf-tipo').value,
        valor: parseFloat(document.getElementById('lf-valor').value),
        data_movimento: document.getElementById('lf-data').value,
        categoria_id: document.getElementById('lf-categoria').value,
        descricao: document.getElementById('lf-descricao').value.trim() || null,
        intervencao_id: document.getElementById('lf-intervencao-id').value || null,
      };
      if (comprovantePath) registro.comprovante_path = comprovantePath;

      let erro;
      if (idEdicao) {
        registro.atualizado_por = usuario.id;
        ({ error: erro } = await sb.from('lancamentos_financeiros').update(registro).eq('id', idEdicao));
      } else {
        registro.id = idRegistro;
        registro.criado_por = usuario.id;
        ({ error: erro } = await sb.from('lancamentos_financeiros').insert(registro));
      }

      botao.disabled = false;
      if (erro) { mostrarAviso(aviso, 'Não foi possível salvar: ' + erro.message, 'erro'); return; }

      mostrarAviso(aviso, 'Lançamento salvo.', 'ok');
      limparFormularioLancamento();
      await carregarSaldoEExtrato();
    });

    async function rotuloIntervencao(intervencaoId) {
      const { data: interv } = await sb.from('intervencoes')
        .select('id, descricao, valor_doado, data_ocorrencia, familia_id').eq('id', intervencaoId).maybeSingle();
      if (!interv) return 'Intervenção não encontrada.';
      const { data: familia } = await sb.from('familias').select('endereco_bairro, codigo').eq('id', interv.familia_id).maybeSingle();
      const nomeFamilia = familia?.endereco_bairro || familia?.codigo || 'família';
      return escapar(nomeFamilia) + ' — ' + escapar(interv.descricao || '').slice(0, 60) + ' (' + formatarDataCurta(interv.data_ocorrencia) + ')';
    }

    document.getElementById('lista-extrato').addEventListener('click', async (ev) => {
      const editar = ev.target.closest('[data-acao="editar-lancamento"]');
      if (editar) {
        const l = lancamentosCache.find(x => x.id === editar.dataset.id);
        if (!l) return;
        document.getElementById('lf-id').value = l.id;
        document.getElementById('lf-tipo').value = l.tipo;
        preencherSelectCategorias();
        document.getElementById('lf-categoria').value = l.categoria_id;
        document.getElementById('lf-valor').value = l.valor;
        document.getElementById('lf-data').value = l.data_movimento;
        document.getElementById('lf-descricao').value = l.descricao || '';
        document.getElementById('lf-comprovante-atual').textContent = l.comprovante_path ? 'Já tem comprovante — enviar outro arquivo substitui.' : '';
        document.getElementById('bloco-vinculo').hidden = l.tipo !== 'saida';
        if (l.intervencao_id) {
          document.getElementById('lf-intervencao-id').value = l.intervencao_id;
          document.getElementById('vinculo-atual-texto').textContent = await rotuloIntervencao(l.intervencao_id);
          document.getElementById('vinculo-atual').hidden = false;
        }
        document.getElementById('btn-cancelar-lancamento').hidden = false;
        document.getElementById('btn-salvar-lancamento').innerHTML = '<i class="fa-solid fa-floppy-disk" aria-hidden="true"></i> Salvar edição';
        document.getElementById('editor-lancamento').scrollIntoView({ behavior: 'smooth' });
        return;
      }

      const remover = ev.target.closest('[data-acao="remover-lancamento"]');
      if (remover) {
        if (!confirm('Remover este lançamento? Ele sai do extrato e do saldo, mas fica registrado.')) return;
        const { error } = await sb.from('lancamentos_financeiros')
          .update({ removido_em: new Date().toISOString(), removido_por: usuario.id })
          .eq('id', remover.dataset.id);
        if (error) { mostrarAviso(avisoPainel, 'Não foi possível remover: ' + error.message, 'erro'); return; }
        await carregarSaldoEExtrato();
        return;
      }

      const verComprovante = ev.target.closest('[data-acao="ver-comprovante"]');
      if (verComprovante) {
        const { data, error } = await sb.storage.from('comprovantes-financeiros')
          .createSignedUrl(verComprovante.dataset.path, 60);
        if (error) { mostrarAviso(avisoPainel, 'Não foi possível abrir o comprovante: ' + error.message, 'erro'); return; }
        window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
      }
    });

    // -------------------------------------------------------------------------
    // Conciliação
    // -------------------------------------------------------------------------
    async function carregarConciliacoes() {
      const { data, error } = await sb.from('conciliacoes_financeiras').select('*')
        .order('data_referencia', { ascending: false }).limit(24);
      if (error) return;
      document.getElementById('lista-conciliacoes').innerHTML = (data || []).map(c => {
        const classeDif = Number(c.diferenca) === 0 ? '' : (Number(c.diferenca) > 0 ? 'valor-entrada' : 'valor-saida');
        return '<tr><td>' + formatarDataCurta(c.data_referencia) + '</td>' +
          '<td>' + formatarMoeda(c.saldo_extrato) + '</td>' +
          '<td>' + formatarMoeda(c.saldo_sistema) + '</td>' +
          '<td class="' + classeDif + '">' + formatarMoeda(c.diferenca) + '</td>' +
          '<td>' + escapar(c.observacoes || '') + '</td></tr>';
      }).join('');
    }

    document.getElementById('form-conciliacao').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const aviso = document.getElementById('aviso-conciliacao');

      const { data: saldo, error: erroSaldo } = await sb.from('vw_saldo_financeiro').select('saldo_atual').maybeSingle();
      if (erroSaldo) { mostrarAviso(aviso, 'Erro ao calcular saldo do sistema: ' + erroSaldo.message, 'erro'); return; }

      const { error } = await sb.from('conciliacoes_financeiras').insert({
        data_referencia: document.getElementById('cc-data').value,
        saldo_extrato: parseFloat(document.getElementById('cc-saldo').value),
        saldo_sistema: saldo.saldo_atual,
        observacoes: document.getElementById('cc-observacoes').value.trim() || null,
        conciliado_por: usuario.id,
      });
      if (error) { mostrarAviso(aviso, 'Não foi possível registrar: ' + error.message, 'erro'); return; }

      document.getElementById('form-conciliacao').reset();
      document.getElementById('cc-data').valueAsDate = new Date();
      mostrarAviso(aviso, 'Conciliação registrada.', 'ok');
      await carregarConciliacoes();
    });

    verificarSessao();
  </script>
</body>
</html>
```

- [ ] **Step 2: Servir localmente e conferir sem dado real** (porta livre — lição de 03/08 sobre a 8000 ocupada)

```bash
python -m http.server 0 --directory app
```
Abrir a porta impressa, navegar até `/financeiro.html` sem sessão → deve redirecionar para `area-vicentino.html?destino=financeiro.html` (mesmo comportamento de `prontuario.html`). Confirma que o gate está ligado antes de qualquer QA com dado real (Task 12).

- [ ] **Step 3: Commit**

```bash
git add app/financeiro.html
git commit -m "$(cat <<'EOF'
feat(financeiro): página de lançamento, extrato, categorias e conciliação

Leitura (saldo/extrato/categorias/histórico de conciliação) para todo
confrade ativo; formulário de lançamento, gestão de categorias e
registro de conciliação só para quem tem pode_lancar_financeiro().

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: `app/financeiro-relatorio.html`

**Files:**
- Create: `app/financeiro-relatorio.html`

**Interfaces:**
- Consumes: mesmos imports da Task 9, mais `chart.js@4.4.4` via CDN (`https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js`, mesma versão da Fase 2); `public.vw_saldo_financeiro`, `public.lancamentos_financeiros`.

- [ ] **Step 1: Escrever a página**

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="theme-color" content="#4A1818">
  <meta name="robots" content="noindex, nofollow">
  <title>Relatório Orçamentário · Conferência N. S. do Carmo</title>
  <link rel="icon" type="image/png" href="assets/logo-ssvp.png">

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=Inter:wght@300;400;500;600;700&display=swap">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
  <link rel="stylesheet" href="assets/prontuario.css">
  <style>
    .stat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 28px; }
    .stat-card { padding: 20px 22px; background: #fff; border: 1px solid var(--border); border-left: 4px solid var(--gold); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); }
    .stat-card .valor { display: block; font-family: 'Cormorant Garamond', serif; font-size: 2rem; color: var(--wine-deep); line-height: 1.1; }
    .stat-card .rotulo { display: block; margin-top: 6px; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); }

    .grafico-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
    .grafico-card { padding: 22px 24px; background: #fff; border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); }
    .grafico-card h2 { font-size: 1.15rem; color: var(--wine-deep); margin-bottom: 4px; }
    .grafico-card .grafico-nota { font-size: 0.8rem; color: var(--text-muted); margin-bottom: 14px; }
    .grafico-caixa { position: relative; height: 260px; }
    .grafico-caixa canvas { width: 100% !important; height: 100% !important; }

    @media (max-width: 640px) {
      .stat-grid, .grafico-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>

  <div class="topo">
    <div class="wrap topo-inner">
      <div class="topo-marca">
        <img src="assets/logo-ssvp.png" alt="">
        <div>
          <strong>Relatório Orçamentário</strong>
          <span>Conferência N. S. do Carmo</span>
        </div>
      </div>
      <div class="topo-usuario" id="topo-usuario" hidden>
        <span id="usuario-nome"></span>
        <button class="btn btn-claro btn-pequeno" id="btn-sair">
          <i class="fa-solid fa-arrow-right-from-bracket" aria-hidden="true"></i> Sair
        </button>
      </div>
    </div>
  </div>

  <section class="login" id="tela-login">
    <p>Verificando seu acesso…</p>
  </section>

  <main class="painel wrap" id="tela-painel" hidden>

    <p class="aviso" id="aviso-painel" role="status"></p>

    <div class="stat-grid">
      <div class="stat-card"><span class="valor" id="stat-saldo">—</span><span class="rotulo">Saldo atual</span></div>
      <div class="stat-card"><span class="valor" id="stat-entradas-12m">—</span><span class="rotulo">Entradas — últimos 12 meses</span></div>
      <div class="stat-card"><span class="valor" id="stat-saidas-12m">—</span><span class="rotulo">Saídas — últimos 12 meses</span></div>
    </div>

    <h2 class="secao-titulo" style="font-size:1.4rem;color:var(--wine-deep);margin-bottom:16px;">Movimento ao longo do tempo</h2>
    <div class="grafico-grid">
      <div class="grafico-card">
        <h2>Entradas vs. saídas por mês</h2>
        <p class="grafico-nota">Últimos 12 meses.</p>
        <div class="grafico-caixa"><canvas id="grafico-entradas-saidas"></canvas></div>
      </div>
      <div class="grafico-card">
        <h2>Saldo acumulado</h2>
        <p class="grafico-nota">Saldo no fim de cada um dos últimos 12 meses.</p>
        <div class="grafico-caixa"><canvas id="grafico-saldo-acumulado"></canvas></div>
      </div>
    </div>

  </main>

  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js"></script>
  <script type="module">
    import { sb, exigirAcesso, sair } from './assets/area-vicentino.js';

    const telaLogin = document.getElementById('tela-login');
    const telaPainel = document.getElementById('tela-painel');
    const topoUsuario = document.getElementById('topo-usuario');
    const avisoPainel = document.getElementById('aviso-painel');

    function formatarMoeda(valor) {
      return 'R$ ' + Number(valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    }
    function mostrarAviso(el, texto, tipo) {
      el.textContent = texto;
      el.className = 'aviso visivel ' + tipo;
    }

    document.getElementById('btn-sair').addEventListener('click', sair);

    // -------------------------------------------------------------------------
    // Sessão — igual às outras ferramentas da Área do Vicentino. Diferente do
    // Dashboard de Efetividade (Fase 2, só-admin), este relatório é visível a
    // todo confrade ativo — mesma leitura ampla do extrato em financeiro.html.
    // -------------------------------------------------------------------------
    async function verificarSessao() {
      const acesso = await exigirAcesso();
      if (!acesso) return;

      document.getElementById('usuario-nome').textContent = acesso.nome;
      topoUsuario.hidden = false;
      telaLogin.hidden = true;
      telaPainel.hidden = false;
      await carregarDados();
    }

    // -------------------------------------------------------------------------
    // Janela fixa dos últimos 12 meses — mesma aritmética de ano/mês da Fase 2
    // (não usa Date + toISOString, pra não depender do fuso do navegador).
    // -------------------------------------------------------------------------
    function chaveAnoMes(ano, mesBase0) { return ano + '-' + String(mesBase0 + 1).padStart(2, '0'); }

    function chavesDosUltimosMeses() {
      const agora = new Date();
      let ano = agora.getFullYear();
      let mes = agora.getMonth() - 11;
      while (mes < 0) { mes += 12; ano -= 1; }
      const chaves = [];
      for (let i = 0; i < 12; i++) {
        chaves.push(chaveAnoMes(ano, mes));
        mes += 1;
        if (mes > 11) { mes = 0; ano += 1; }
      }
      return chaves;
    }

    function rotuloMes(chave) {
      const [ano, mes] = chave.split('-').map(Number);
      return new Date(ano, mes - 1, 1).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('.', '');
    }

    // Primeiro dia do mês seguinte a uma chave "AAAA-MM", como string ISO —
    // usado como limite superior exclusivo ao somar lançamentos até o fim do mês.
    function inicioDoMesSeguinte(chave) {
      const [ano, mes] = chave.split('-').map(Number);
      const proximo = mes === 12 ? ano + 1 : ano;
      const mesProximo = mes === 12 ? 1 : mes + 1;
      return proximo + '-' + String(mesProximo).padStart(2, '0') + '-01';
    }

    async function carregarDados() {
      const chaves = chavesDosUltimosMeses();
      const desde12m = chaves[0] + '-01';

      const [{ data: saldo, error: erroSaldo }, { data: todos, error: erroLancamentos }] = await Promise.all([
        sb.from('vw_saldo_financeiro').select('*').maybeSingle(),
        sb.from('lancamentos_financeiros').select('tipo, valor, data_movimento').is('removido_em', null),
      ]);

      const erro = erroSaldo || erroLancamentos;
      if (erro) { mostrarAviso(avisoPainel, 'Erro ao carregar dados: ' + erro.message, 'erro'); return; }

      const lancamentos = todos || [];
      const lancamentos12m = lancamentos.filter(l => l.data_movimento >= desde12m);
      const entradas12m = lancamentos12m.filter(l => l.tipo === 'entrada').reduce((s, l) => s + Number(l.valor), 0);
      const saidas12m = lancamentos12m.filter(l => l.tipo === 'saida').reduce((s, l) => s + Number(l.valor), 0);

      document.getElementById('stat-saldo').textContent = formatarMoeda(saldo?.saldo_atual);
      document.getElementById('stat-entradas-12m').textContent = formatarMoeda(entradas12m);
      document.getElementById('stat-saidas-12m').textContent = formatarMoeda(saidas12m);

      renderizarEntradasSaidasPorMes(lancamentos12m, chaves);
      renderizarSaldoAcumulado(lancamentos, chaves, Number(saldo?.saldo_inicial || 0), saldo?.data_referencia_inicial || '1900-01-01');
    }

    let graficoEntradasSaidas, graficoSaldoAcumulado;

    function renderizarEntradasSaidasPorMes(lancamentos12m, chaves) {
      const entradas = chaves.map(c => lancamentos12m
        .filter(l => l.tipo === 'entrada' && String(l.data_movimento).slice(0, 7) === c)
        .reduce((s, l) => s + Number(l.valor), 0));
      const saidas = chaves.map(c => lancamentos12m
        .filter(l => l.tipo === 'saida' && String(l.data_movimento).slice(0, 7) === c)
        .reduce((s, l) => s + Number(l.valor), 0));

      graficoEntradasSaidas?.destroy();
      graficoEntradasSaidas = new Chart(document.getElementById('grafico-entradas-saidas'), {
        type: 'bar',
        data: {
          labels: chaves.map(rotuloMes),
          datasets: [
            { label: 'Entradas', data: entradas, backgroundColor: '#2E6B4F' },
            { label: 'Saídas', data: saidas, backgroundColor: '#9B2C22' },
          ],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          scales: { y: { beginAtZero: true, ticks: { callback: v => 'R$ ' + v } } },
          plugins: { legend: { position: 'bottom' } },
        },
      });
    }

    function renderizarSaldoAcumulado(todosLancamentos, chaves, saldoInicial, dataReferenciaInicial) {
      const validos = todosLancamentos
        .filter(l => l.data_movimento >= dataReferenciaInicial)
        .sort((a, b) => a.data_movimento.localeCompare(b.data_movimento));

      const saldos = chaves.map(chave => {
        const limite = inicioDoMesSeguinte(chave);
        const dentro = validos.filter(l => l.data_movimento < limite);
        const total = dentro.reduce((s, l) => s + (l.tipo === 'entrada' ? Number(l.valor) : -Number(l.valor)), 0);
        return saldoInicial + total;
      });

      graficoSaldoAcumulado?.destroy();
      graficoSaldoAcumulado = new Chart(document.getElementById('grafico-saldo-acumulado'), {
        type: 'line',
        data: {
          labels: chaves.map(rotuloMes),
          datasets: [{ label: 'Saldo (R$)', data: saldos, borderColor: '#C9A567', backgroundColor: 'rgba(201,165,103,0.18)', fill: true, tension: 0.25 }],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          scales: { y: { ticks: { callback: v => 'R$ ' + v } } },
          plugins: { legend: { display: false } },
        },
      });
    }

    verificarSessao();
  </script>
</body>
</html>
```

- [ ] **Step 2: Servir localmente e conferir o gate** (mesmo teste da Task 9, porta livre)

- [ ] **Step 3: Commit**

```bash
git add app/financeiro-relatorio.html
git commit -m "$(cat <<'EOF'
feat(financeiro): relatório com gráficos de entradas/saídas e saldo acumulado

Visível a todo confrade ativo (mesma leitura ampla de financeiro.html),
seguindo o padrão de janela fixa de 12 meses e agregação client-side
já usado no Dashboard de Efetividade (Fase 2).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Integração com a Área do Vicentino + README

**Files:**
- Modify: `app/assets/area-vicentino.js`
- Modify: `app/area-vicentino.html`
- Modify: `supabase/README.md`

**Interfaces:**
- Consumes: `DESTINOS` (Set em `area-vicentino.js`), grade `.area-grid` de `area-vicentino.html`.
- Produces: navegação funcional a partir do hub; documentação do novo módulo.

- [ ] **Step 1: Adicionar as duas páginas novas a `DESTINOS`**

Em `app/assets/area-vicentino.js`, editar o `Set`:

```javascript
const DESTINOS = new Set([
  'manual.html',
  'prontuario.html',
  'prontuario-familia.html',
  'admin.html',
  'prontuario-dashboard.html',
  'financeiro.html',
  'financeiro-relatorio.html',
]);
```

- [ ] **Step 2: Adicionar os dois cards em `area-vicentino.html`**

Inserir, dentro de `<div class="area-grid">`, logo depois do card "Dashboard de Efetividade" (antes do card "Manual de Direitos"). Diferente daquele card, estes dois **não** levam `hidden` nem checagem de `is_admin()` — leitura é ampla para todo confrade ativo (decisão confirmada na spec):

```html
        <article class="area-card">
          <div class="area-icon"><i class="fa-solid fa-sack-dollar"></i></div>
          <h3>Controle Orçamentário</h3>
          <p>
            Entradas, saídas e saldo da conta da Conferência — coletas,
            doações, ajuda às famílias e despesas, com conciliação e
            comprovantes.
          </p>
          <a href="financeiro.html" class="area-link">
            Acessar o Controle Orçamentário <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
          </a>
        </article>

        <article class="area-card">
          <div class="area-icon"><i class="fa-solid fa-chart-line"></i></div>
          <h3>Relatório Orçamentário</h3>
          <p>
            Entradas e saídas por mês e saldo acumulado ao longo do tempo,
            nos últimos 12 meses.
          </p>
          <a href="financeiro-relatorio.html" class="area-link">
            Acessar o Relatório <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
          </a>
        </article>
```

- [ ] **Step 3: Atualizar `supabase/README.md`**

Adicionar à tabela de migrações (Instalação, passo 1):

```markdown
   | `20260916150000_financeiro_categorias.sql` | `public.categorias_financeiras`, `pode_lancar_financeiro()` |
   | `20260916150100_financeiro_lancamentos.sql` | `public.lancamentos_financeiros` + RLS + soft delete |
   | `20260916150200_financeiro_saldo_inicial.sql` | `public.saldo_inicial_financeiro` (linha única) |
   | `20260916150300_financeiro_conciliacoes.sql` | `public.conciliacoes_financeiras`, `vw_saldo_financeiro` |
   | `20260916150400_financeiro_storage.sql` | bucket privado `comprovantes-financeiros` + policies |
```

E uma seção nova ao final do arquivo:

```markdown
## Controle Orçamentário

`app/financeiro.html` (saldo, extrato, lançamento, categorias, conciliação) e
`app/financeiro-relatorio.html` (gráficos). Leitura para qualquer confrade
ativo (`is_confrade_ativo()`); lançar/editar exige `pode_lancar_financeiro()`
— confrade ativo com `confrades.papel in ('tesoureiro','administrador')`.

**Cadastrar um tesoureiro** — mesma tela de sempre (Authentication → Users →
*Add user*), depois:

```sql
insert into public.confrades (user_id, nome_completo, papel)
select id, 'Nome do tesoureiro', 'tesoureiro' from auth.users where email = 'tesoureiro@exemplo.com';
```

Ou, para quem já está em `confrades` com outro papel:

```sql
update public.confrades set papel = 'tesoureiro' where user_id = (select id from auth.users where email = 'tesoureiro@exemplo.com');
```

**Ajustar o saldo inicial da conta BRB** (só deve mudar se o ponto de
partida do controle estiver errado — não é para lançamentos do dia a dia,
que entram por `lancamentos_financeiros`):

```sql
insert into public.saldo_inicial_financeiro (id, valor, data_referencia, observacoes)
values (true, 1000.00, '2026-09-16', 'Ajuste do saldo inicial.')
on conflict (id) do update set
  valor = excluded.valor, data_referencia = excluded.data_referencia,
  observacoes = excluded.observacoes, atualizado_em = now();
```

Conferir com `node supabase/verificar-rls-financeiro.mjs` (instruções no topo
do arquivo) — precisa de um confrade de teste com papel `tesoureiro` (ou
`administrador`) e outro com papel comum, para provar os dois lados do RBAC.
```

- [ ] **Step 4: Commit**

```bash
git add app/assets/area-vicentino.js app/area-vicentino.html supabase/README.md
git commit -m "$(cat <<'EOF'
feat(financeiro): integra o Controle Orçamentário à Área do Vicentino

Dois cards novos no hub, visíveis a todo confrade ativo (leitura
ampla, diferente do card do Dashboard que é só-admin). Documenta o
módulo no README do Supabase.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: QA manual ao vivo, deploy e limpeza

**Files:** nenhum arquivo novo — verificação final antes de considerar a Fase 3 concluída.

**Interfaces:**
- Consumes: tudo das Tasks 1–11, em produção.

- [ ] **Step 1: Push para `main`** (Vercel publica automaticamente — mesmo fluxo de todas as fases anteriores)

```bash
git push origin main
```

- [ ] **Step 2: Criar 2 contas de teste descartáveis** (tesoureiro + confrade comum) via Admin API, mesmo procedimento da Task 8, e logar via Chrome DevTools MCP em produção (`https://manual-vicentinos.vercel.app`)

- [ ] **Step 3: Roteiro de QA — confrade comum**
  - Card "Controle Orçamentário" e "Relatório Orçamentário" aparecem no hub (`area-vicentino.html`).
  - `financeiro.html`: vê saldo, extrato e gráficos; **não** vê os editores de lançamento/categorias/conciliação; nenhuma coluna "Ações" na tabela; ícone de comprovante aparece sem ser clicável.
  - `financeiro-relatorio.html`: os 2 gráficos carregam (`Chart.getChart()` via `evaluate_script`).
  - Console sem erros nas duas páginas, 1280×900 e 375×812.

- [ ] **Step 4: Roteiro de QA — tesoureiro** (dados descartáveis, removidos ao final)
  - Cadastra uma categoria nova, aparece no `<select>` do formulário.
  - Lança uma entrada com comprovante (imagem pequena de teste) → aparece no extrato, saldo atualiza, ícone de comprovante é clicável e abre o arquivo (signed URL).
  - Lança uma saída vinculada a uma intervenção de teste (criar 1 família + 1 intervenção com `valor_doado` primeiro, pelo Prontuário) → vínculo aparece salvo; tentar vincular numa **entrada** deve ser impossível (bloco não aparece pra tipo entrada).
  - Edita o lançamento de entrada (muda a descrição) → extrato reflete a mudança.
  - Remove (soft delete) o lançamento de saída → some do extrato e do saldo; confirmar por SQL que a linha continua no banco com `removido_em` preenchido.
  - Registra uma conciliação → aparece no histórico com a diferença calculada corretamente.
  - Console sem erros, duas larguras de tela.

- [ ] **Step 5: Limpeza**
  - Apagar toda massa de teste: lançamentos, categoria de teste, intervenção/família de teste, conciliação de teste, arquivo do bucket, as 2 contas de auth (Admin API).
  - Confirmar por SQL que não sobrou nada (`select count(*) from public.lancamentos_financeiros where descricao ilike '%teste%'`, etc.).

- [ ] **Step 6: Atualizar `tasks/todo.md`**

Adicionar ao final do arquivo, seguindo o formato das fases anteriores (Contexto → Feito → Verificado ao vivo → Riscos residuais), registrando: o que foi construído, evidência da verificação (Tasks 8 e 12), e o saldo inicial real cadastrado na Task 6 (sem expor o valor em texto claro no commit público, se o usuário preferir — perguntar antes).

```bash
git add tasks/todo.md
git commit -m "$(cat <<'EOF'
docs(tasks): registra conclusão da Fase 3 (controle orçamentário)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
git push origin main
```

---

## Self-Review

**Cobertura da spec:** escopo entradas+saídas completas (Task 2), RBAC por `confrades.papel` (Task 1), categorias abertas (Task 1 + UI na Task 9), vínculo opcional com `intervencoes` (Task 2 + UI na Task 9), saldo inicial manual (Task 3), conciliação (Task 4 + UI na Task 9), comprovantes via Storage privado (Task 5 + upload/signed URL na Task 9), leitura ampla vs. escrita restrita (todas as migrações + Task 9/10), 2 páginas (Tasks 9–10), integração no hub (Task 11), verificação em camadas (Tasks 6–8, 12). Nenhum item da spec ficou sem task.

**Placeholders:** nenhum "TBD"/"implementar depois" — toda task tem SQL/HTML/JS completo, executável como está.

**Consistência de tipos/nomes:** `pode_lancar_financeiro()` (Task 1) é o único nome usado nas Tasks 2–11, nunca abreviado; `vw_saldo_financeiro` com as colunas `saldo_inicial`, `data_referencia_inicial`, `total_entradas`, `total_saidas`, `saldo_atual` (Task 4) são exatamente as colunas lidas em `financeiro.html` (Task 9) e `financeiro-relatorio.html` (Task 10); `lancamentos_financeiros` com `criado_por`/`atualizado_por`/`removido_por` (Task 2) batem com os três pontos do client que os preenchem (Task 9); bucket `comprovantes-financeiros` (Task 5) é o mesmo nome usado em `sb.storage.from(...)` nas Tasks 9 e no script da Task 7.
