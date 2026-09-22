-- ============================================================================
-- 024 · Livro de Atas — conserta a reabertura da ata aprovada
-- ----------------------------------------------------------------------------
-- Defeito introduzido na migração 022 e encontrado antes de a ferramenta ir
-- ao ar: a policy de UPDATE de `atas` dizia
--
--     using (pode_redigir_ata() and (status = 'rascunho' or is_admin()))
--
-- e o comentário ao lado afirmava que a ata aprovada "só é alcançável por
-- is_admin(), que é o caminho de reabertura". A afirmação estava errada, por
-- causa do `and` no começo da expressão:
--
--   • `pode_redigir_ata()` olha public.confrades.papel;
--   • `is_admin()`         olha public.admins.
--
-- São dois cadastros INDEPENDENTES — a migração 006 diz isso com todas as
-- letras ("as duas tabelas são independentes de propósito; quem acumula os
-- dois papéis é cadastrado manualmente nas duas"). Com o `and` por fora,
-- reabrir exigia estar nos DOIS ao mesmo tempo:
--
--   • confrade com papel 'administrador' que não estivesse em public.admins
--     → `is_admin()` falso → `status = 'rascunho'` falso → recusado;
--   • moderador em public.admins sem papel de redação em confrades
--     → `pode_redigir_ata()` falso → recusado já no primeiro operando.
--
-- Ou seja: ninguém reabria, e ata.html mostrava o botão "Reabrir" para quem
-- passa em is_admin() — um botão visível que não fazia nada. Exatamente o
-- tipo de bug que a tela esconde e a RLS revela.
--
-- O conserto separa as duas perguntas, que sempre foram duas:
--
--     quem LAVRA  → pode_redigir_ata()  (secretário, presidente, vice, admin)
--     quem REABRE → pode_reabrir_ata()  (administrador, em qualquer dos dois
--                                        cadastros)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- pode_reabrir_ata() — quem destrava uma ata já aprovada.
--
-- O `or is_admin()` é deliberado e é a diferença em relação a
-- pode_lancar_financeiro(): destravar um documento fechado é operação de
-- manutenção, e o responsável técnico do site (o caso que public.admins existe
-- para cobrir, conforme a migração 013) precisa conseguir fazê-la sem que
-- alguém tenha de mexer no papel dele em confrades.
-- ----------------------------------------------------------------------------
create or replace function public.pode_reabrir_ata()
  returns boolean
  language sql
  security definer
  stable
  set search_path = public, pg_temp
as $$
  select public.is_admin()
      or exists (
        select 1 from public.confrades
         where user_id = auth.uid()
           and ativo
           and papel = 'administrador'
      );
$$;

comment on function public.pode_reabrir_ata() is
  'True se o usuário pode reabrir uma ata já aprovada: moderador em public.admins OU confrade ativo com papel administrador. Mais restrito que pode_redigir_ata() no papel, e mais amplo no cadastro.';

revoke all on function public.pode_reabrir_ata() from public, anon;
grant execute on function public.pode_reabrir_ata() to authenticated;

-- ----------------------------------------------------------------------------
-- A policy, agora com as duas perguntas separadas.
--
--   using       quem pode ALCANÇAR a linha como ela está hoje:
--               rascunho, para quem lavra; qualquer status, para quem reabre.
--   with check  quem pode ser o autor da linha resultante. Sem o
--               `or pode_reabrir_ata()` aqui, o moderador de public.admins
--               passaria no `using` e seria recusado no `with check` — o
--               update falharia pela metade, que é pior que falhar inteiro.
-- ----------------------------------------------------------------------------
drop policy if exists "secretário/presidente edita ata em rascunho" on public.atas;
create policy "secretário/presidente edita ata em rascunho"
  on public.atas
  for update
  to authenticated
  using (
    (public.pode_redigir_ata() and status = 'rascunho')
    or public.pode_reabrir_ata()
  )
  with check (
    public.pode_redigir_ata() or public.pode_reabrir_ata()
  );

-- ----------------------------------------------------------------------------
-- A mesma correção na porta dos fundos: sem isto, a lista de presentes de uma
-- ata reaberta continuaria trancada para quem acabou de reabri-la.
-- ----------------------------------------------------------------------------
create or replace function public.ata_aberta_para_edicao(p_ata_id uuid)
  returns boolean
  language sql
  security definer
  stable
  set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.atas a
     where a.id = p_ata_id
       and (
         (public.pode_redigir_ata() and a.status = 'rascunho')
         or public.pode_reabrir_ata()
       )
  );
$$;

comment on function public.ata_aberta_para_edicao(uuid) is
  'True se a ata indicada aceita edição pelo usuário atual: rascunho para quem lavra (pode_redigir_ata), ou qualquer status para quem reabre (pode_reabrir_ata). Mesma regra da policy de UPDATE de public.atas.';
