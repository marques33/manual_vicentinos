-- ============================================================================
-- 023 · Livro de Atas — presença dos associados
-- ----------------------------------------------------------------------------
-- No papel, "Com a presença dos seguintes associados" é uma linha de nomes
-- escritos à mão. Aqui é uma linha por confrade, marcada por caixa de seleção
-- sobre o cadastro que já existe.
--
-- A troca não é cosmética: a linha de nomes é texto e morre no documento; esta
-- tabela responde "quem faltou nas últimas seis reuniões?" — pergunta que a
-- Conferência faz e que hoje só se responde folheando o livro.
-- ============================================================================

create table if not exists public.atas_presencas (
  ata_id      uuid not null references public.atas(id) on delete cascade,
  confrade_id uuid not null references public.confrades(user_id) on delete cascade,

  -- O nome COPIADO do cadastro no momento em que a presença foi marcada.
  --
  -- Parece redundante com confrades.nome_completo, e é de propósito: sem esta
  -- cópia, um confrade que corrigisse o próprio nome no cadastro reescreveria
  -- retroativamente toda ata já aprovada e assinada em que ele aparece. A ata
  -- tem que dizer o que dizia no dia em que foi lida.
  --
  -- (Risco residual aceito: excluir de vez o usuário em auth.users cascateia
  -- até aqui e leva a linha junto. O projeto desativa com `ativo = false` e
  -- nunca exclui — é assim que deve continuar.)
  nome        text not null check (char_length(btrim(nome)) between 3 and 150),

  -- 'ausente' é gravado, e não apenas omitido: a diferença entre "faltou" e
  -- "a ata não registrou" é justamente o que um controle de frequência
  -- precisa saber.
  situacao    text not null
                check (situacao in ('presente','justificado','ausente')),

  primary key (ata_id, confrade_id)
);

comment on table public.atas_presencas is
  'Presença de cada confrade numa reunião. `nome` é cópia do cadastro no momento da marcação, para que renomear um confrade não altere ata já aprovada.';

create index if not exists atas_presencas_confrade_idx
  on public.atas_presencas (confrade_id);

-- ----------------------------------------------------------------------------
-- RLS
--
-- A leitura acompanha a da ata (todo confrade ativo). A escrita acompanha a
-- policy de UPDATE de `atas`, inclusive na trava: sem repetir aqui a condição
-- de rascunho, a ata aprovada ficaria trancada pela frente e aberta pelos
-- fundos — dava para trocar a lista de presentes de uma ata já assinada.
-- ----------------------------------------------------------------------------
alter table public.atas_presencas enable row level security;

revoke all on public.atas_presencas from anon, authenticated;
-- DELETE existe aqui (diferente de `atas`): desmarcar um confrade da lista é
-- apagar a linha, e isso acontece enquanto a ata ainda é rascunho.
grant select, insert, update, delete on public.atas_presencas to authenticated;

drop policy if exists "confrade ativo lê atas_presencas" on public.atas_presencas;
create policy "confrade ativo lê atas_presencas"
  on public.atas_presencas
  for select
  to authenticated
  using (public.is_confrade_ativo());

-- Uma função só, usada pelas três policies de escrita, para que a regra não
-- exista em três redações que um dia divergem.
create or replace function public.ata_aberta_para_edicao(p_ata_id uuid)
  returns boolean
  language sql
  security definer
  stable
  set search_path = public, pg_temp
as $$
  select public.pode_redigir_ata()
     and exists (
       select 1 from public.atas a
        where a.id = p_ata_id
          and (a.status = 'rascunho' or public.is_admin())
     );
$$;

comment on function public.ata_aberta_para_edicao(uuid) is
  'True se o usuário pode lavrar ata E a ata indicada ainda aceita edição (rascunho, ou qualquer status para administrador). Mesma regra da policy de UPDATE de public.atas.';

revoke all on function public.ata_aberta_para_edicao(uuid) from public, anon;
grant execute on function public.ata_aberta_para_edicao(uuid) to authenticated;

drop policy if exists "secretário marca presença em ata aberta" on public.atas_presencas;
create policy "secretário marca presença em ata aberta"
  on public.atas_presencas
  for insert
  to authenticated
  with check (public.ata_aberta_para_edicao(ata_id));

drop policy if exists "secretário corrige presença em ata aberta" on public.atas_presencas;
create policy "secretário corrige presença em ata aberta"
  on public.atas_presencas
  for update
  to authenticated
  using (public.ata_aberta_para_edicao(ata_id))
  with check (public.ata_aberta_para_edicao(ata_id));

drop policy if exists "secretário desmarca presença em ata aberta" on public.atas_presencas;
create policy "secretário desmarca presença em ata aberta"
  on public.atas_presencas
  for delete
  to authenticated
  using (public.ata_aberta_para_edicao(ata_id));
