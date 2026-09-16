# Controle Orçamentário — Fase 3 de 3 (Perfis → Dashboard → Financeiro)

## Contexto

Pedido original do usuário (parte de um pedido maior, decomposto em 3 sub-projetos
via brainstorming: Prontuário de Atendimento, Atas de Reunião — ainda não planejado
— e Controle Financeiro). Este documento cobre o **Controle Financeiro**, adiado
para depois de perfis de acesso (Fase 1, concluída) e dashboard de efetividade
(Fase 2, concluída). Contexto original: digitalizar o controle da conta poupança
BRB e das coletas da Conferência Nossa Senhora do Carmo.

Decisão institucional confirmada: cobre **entradas e saídas completas** — não só
coletas e ajuda a famílias, mas também despesas administrativas e repasses ao
Conselho Particular.

## Decisões confirmadas com o usuário

| Tema | Decisão |
|---|---|
| Escopo | Entradas + saídas completas (não só coletas/ajuda a famílias). |
| Quem lança | Tesoureiro + administradores (`confrades.papel`), não todo confrade. |
| Categorias | Abertas — tesoureiro/admin cadastra pela UI, sem migration nova por categoria. |
| Vínculo com Prontuário | Saída de "ajuda a família" pode referenciar uma `intervencoes` existente (FK opcional), evita dado duplicado/divergente. |
| Saldo inicial | Cadastrado manualmente pelo tesoureiro (a conta BRB já tem saldo hoje). |
| Conciliação | Sim — registro periódico de "extrato mostrava R$X em tal data" com diferença contra o saldo calculado. |
| Comprovantes | Upload de arquivo/imagem (Supabase Storage — primeiro uso no projeto). |
| Quem vê extrato/saldo/relatório | Todo confrade ativo (transparência interna), mesmo sem poder lançar. |
| Quem abre o arquivo do comprovante | Só tesoureiro/admin — comprovante às vezes expõe dado de terceiro (nome/telefone num print de PIX). |
| Edição/exclusão | Soft delete + registro de quem/quando alterou (dado financeiro institucional pede trilha, diferente do resto do site). |
| Visualização | Extrato (tabela) + saldo + 2 gráficos Chart.js (mesma dependência já usada na Fase 2). |
| Estrutura de páginas | Duas páginas — `financeiro.html` (lançar/extrato/conciliação) e `financeiro-relatorio.html` (gráficos), espelhando o padrão `prontuario.html`/`prontuario-dashboard.html` da Fase 2. |

## Arquitetura

Reaproveita 100% do padrão já existente (Supabase Auth + RLS por tabela), sem Edge
Function nova — todo lançador é um confrade autenticado e identificável, o mesmo
cenário que o Prontuário já resolve sem Edge Function.

**Nova função de autorização: `pode_lancar_financeiro()`** — `SECURITY DEFINER`,
análoga a `is_confrade_ativo()`: `true` se o confrade tem linha ativa em
`confrades` **e** `papel in ('tesoureiro', 'administrador')`. Não reaproveita
`is_admin()` porque `is_admin()` é sobre moderação do site (mural/oração/usuários),
um conceito diferente de "quem mexe no dinheiro da Conferência" — `confrades.papel`
foi desenhada desde a Fase 1 do Prontuário justamente para RBAC fino como este.

**Leitura ampla:** extrato, saldo, relatório e lista de categorias usam
`is_confrade_ativo()` — todo confrade ativo vê, mesmo sem poder lançar.

**Nenhuma tabela nova tem grant/policy para `anon`** — dado financeiro nunca é
público, mesmo padrão do Prontuário (diferente de mural/oração).

## Modelo de dados

Migrations novas em `supabase/migrations/<timestamp>_<nome>.sql`, seguindo o
padrão já estabelecido (comentário de cabeçalho, `SECURITY DEFINER` com
`search_path` fixo, trigger `tocar_atualizado_em()` reaproveitada, `revoke all`
seguido de `grant` explícito, políticas nomeadas em português).

**1. `public.categorias_financeiras`**
- `id uuid pk default gen_random_uuid()`
- `tipo text not null check (tipo in ('entrada','saida'))`
- `nome text not null`
- `ativa boolean not null default true`
- `criado_em timestamptz not null default now()`
- Seed inicial: entradas (coleta em reunião, doação avulsa, doação PIX do site,
  repasse recebido); saídas (ajuda a família, despesa administrativa, repasse ao
  Conselho Particular, outra). Editável depois pela UI, sem migration nova.

**2. `public.lancamentos_financeiros`**
- `id uuid pk default gen_random_uuid()`
- `tipo text not null check (tipo in ('entrada','saida'))`
- `valor numeric(10,2) not null check (valor > 0)`
- `data_movimento date not null`
- `categoria_id uuid not null references categorias_financeiras(id) on delete restrict`
- `descricao text`
- `intervencao_id uuid references intervencoes(id) on delete set null` — nullable;
  quando preenchido, `tipo` tem que ser `'saida'` (check/trigger).
- `comprovante_path text` — nullable, caminho no Storage.
- `criado_por uuid not null references auth.users(id) on delete restrict`
- `criado_em timestamptz not null default now()`
- `atualizado_por uuid references auth.users(id)`
- `atualizado_em timestamptz not null default now()` (trigger `tocar_atualizado_em`)
- `removido_por uuid references auth.users(id)`
- `removido_em timestamptz` — soft delete; extrato/saldo só consideram
  `removido_em is null`.

**3. `public.saldo_inicial_financeiro`** — linha única (constraint garante uma só).
- `id` fixo (`boolean primary key default true`, `check (id)`, padrão "singleton
  table" — ou índice único parcial; decidir na implementação)
- `valor numeric(10,2) not null default 0`
- `data_referencia date not null`
- `observacoes text`
- `atualizado_por uuid references auth.users(id)`
- `atualizado_em timestamptz not null default now()`

**4. `public.conciliacoes_financeiras`**
- `id uuid pk default gen_random_uuid()`
- `data_referencia date not null`
- `saldo_extrato numeric(10,2) not null`
- `saldo_sistema numeric(10,2) not null` — congelado no momento do registro, não
  recalculado depois.
- `diferenca numeric(10,2) generated always as (saldo_extrato - saldo_sistema) stored`
- `observacoes text`
- `conciliado_por uuid not null references auth.users(id) on delete restrict`
- `criado_em timestamptz not null default now()`

**View `vw_saldo_financeiro`** — saldo corrente = saldo inicial + Σentradas −
Σsaídas (só lançamentos com `removido_em is null` e `data_movimento >=
data_referencia` do saldo inicial). Base tanto do card de saldo quanto do
`saldo_sistema` calculado ao registrar uma conciliação.

**RLS — regra por tabela (as 4 tabelas + a view herda das tabelas base):**
```sql
alter table <tabela> enable row level security;
revoke all on <tabela> from anon, authenticated;
grant select, insert, update to authenticated;  -- sem delete: soft delete é update
create policy "<tabela>_leitura" on <tabela>
  for select to authenticated using (is_confrade_ativo());
create policy "<tabela>_escrita" on <tabela>
  for insert, update to authenticated
  using (pode_lancar_financeiro()) with check (pode_lancar_financeiro());
```

## Storage (comprovantes)

**Bucket privado `comprovantes-financeiros`** — primeira peça de Supabase Storage
no projeto. Caminho: `<lancamento_id>/<timestamp>-<nome-sanitizado>`. Tipos
aceitos: imagem (jpg/png) e PDF; limite 5 MB.

Policies em `storage.objects`, escopadas ao bucket (`bucket_id =
'comprovantes-financeiros'`):
- `insert`, `update`, `delete` → `pode_lancar_financeiro()`.
- `select` (necessário até para `createSignedUrl`) → `pode_lancar_financeiro()`
  — **mais restrito que o extrato**: qualquer confrade vê que há comprovante
  anexado (metadado no lançamento), mas só quem lança abre o arquivo, porque o
  print/recibo às vezes carrega dado de terceiro.

Front: upload direto do client autenticado
(`supabase.storage.from('comprovantes-financeiros').upload(...)`), sem Edge
Function — mesmo raciocínio do resto do Prontuário. Exibição gera signed URL de
curta duração (~60s, `createSignedUrl`) só quando tesoureiro/admin clica em "ver
comprovante" — nunca URL pública fixa.

## Páginas novas em `app/`

**`app/financeiro.html`** — gate de sessão (`is_confrade_ativo()`, mesmo padrão de
`prontuario.html`; sem sessão → redireciona à Área do Vicentino com `?destino=`).
- Card de saldo atual (via `vw_saldo_financeiro`) — visível a todo confrade.
- Extrato (lançamentos não removidos, mais recentes primeiro, valor colorido por
  tipo, categoria, descrição) — visível a todo confrade.
- Formulário de novo lançamento (tipo, valor, data, categoria, descrição, upload
  opcional de comprovante, vínculo opcional com intervenção — busca por família,
  só quando tipo = saída), gerenciamento de categorias (criar/ativar/desativar) e
  seção de conciliação (registrar + histórico com diferença destacada) — só
  aparecem se `pode_lancar_financeiro()` (checado por RPC, igual ao gate de admin
  já usado nas Fases 1/2).
- Editar/excluir (soft delete) e "ver comprovante" (signed URL) nas linhas do
  extrato — só para quem lança.
- Carrega `app/assets/prontuario.css` (já tem `[hidden] { display: none
  !important; }`) — evita repetir o bug de cascata CSS da Fase 2.

**`app/financeiro-relatorio.html`** — mesmo gate (`is_confrade_ativo()`, todo
confrade vê). 2 gráficos Chart.js, agregação 100% client-side, sem view/RPC nova
(mesmo padrão da Fase 2):
1. Entradas vs. saídas por mês (últimos 12 meses).
2. Saldo acumulado ao longo do tempo.

**Integração com a Área do Vicentino:**
- `app/assets/area-vicentino.js` — `financeiro.html` e `financeiro-relatorio.html`
  adicionados ao `Set` `DESTINOS`.
- `app/area-vicentino.html` — novo card "Controle Orçamentário" na grade,
  visível a todo confrade ativo (sem esconder — leitura já é ampla; diferente do
  card do Dashboard de Efetividade, que é só-admin).

## Sequência de implementação (rascunho — refinado no plano)

1. Migration `categorias_financeiras` + seed.
2. Migration `lancamentos_financeiros` + `pode_lancar_financeiro()` + trigger
   `tocar_atualizado_em` + check tipo/intervenção.
3. Migration `saldo_inicial_financeiro`.
4. Migration `conciliacoes_financeiras` + `vw_saldo_financeiro`.
5. RLS de todas as tabelas acima (leitura ampla, escrita restrita).
6. Bucket `comprovantes-financeiros` + policies de Storage.
7. `supabase/verificar-rls-financeiro.mjs` — mesmo padrão de
   `verificar-rls-prontuario.mjs`: `anon` barrado em tudo; confrade comum lê mas
   não escreve; tesoureiro/admin de teste lê e escreve; comprovante só abre para
   quem tem `pode_lancar_financeiro()`.
8. `app/financeiro.html`.
9. `app/financeiro-relatorio.html`.
10. Integração na Área do Vicentino (`area-vicentino.js`, `area-vicentino.html`).
11. Atualizar `supabase/README.md` com o novo módulo.

## Verificação

- **RLS/Storage:** `supabase/verificar-rls-financeiro.mjs` com o par
  negado/permitido em cada camada (lição de 02/08 e 03/08 aplicada): `anon`
  barrado; confrade comum lê saldo/extrato mas recebe negado ao inserir
  lançamento e ao baixar comprovante; tesoureiro de teste insere, edita
  (soft delete) e baixa comprovante; conta sem linha em `confrades` barrada em
  tudo.
- **Cálculo de saldo:** caso de teste real — saldo inicial R$X em data Y, inserir
  2 entradas e 1 saída com datas conhecidas, conferir `vw_saldo_financeiro`
  bate com a soma manual.
- **Conciliação:** registrar uma conciliação, conferir que `diferenca` bate com
  `saldo_extrato - saldo_sistema` e que uma conciliação antiga não muda quando
  novos lançamentos são inseridos depois (congelada no momento do registro).
- **Vínculo com intervenção:** criar uma saída vinculada a uma `intervencoes` de
  teste; tentar vincular numa entrada (deve falhar pelo check).
- **QA manual (Chrome DevTools MCP, contas descartáveis via Admin API):**
  confrade comum vê extrato/saldo/gráficos mas não vê formulário/categorias/
  conciliação nem baixa comprovante; tesoureiro de teste faz o fluxo completo
  (lançar entrada com comprovante, lançar saída vinculada a intervenção, editar,
  soft delete, registrar conciliação); console limpo nas duas páginas, dois
  tamanhos de tela (1280×900 e 375×812).
- Toda massa de teste (contas, lançamentos, categorias de teste) apagada ao
  final, confirmado via API — mesmo padrão das fases anteriores.

## Fora de escopo nesta fase (registrado para depois)

- Relatório por período customizável (a Fase 3 fixa "últimos 12 meses", igual à
  Fase 2) — seletor de período fica para depois se fizer falta.
- Exportação (CSV/PDF) do extrato.
- Notificação automática quando a diferença de uma conciliação for grande.
- Sub-projeto de Atas de Reunião (ainda não planejado).
- Política de retenção/anonimização LGPD para comprovantes (mesma pendência
  institucional já registrada para o Prontuário).
