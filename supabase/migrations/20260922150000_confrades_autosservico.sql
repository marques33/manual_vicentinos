-- ============================================================================
-- 027 · Confrades — o vicentino corrige o próprio nome
-- ----------------------------------------------------------------------------
-- Até aqui `confrades` era só leitura para o cliente (migração 011: `grant
-- select`), e toda escrita passava pela Edge Function `gerenciar-usuarios`.
-- Isso está certo para papel, categoria e `ativo` — são decisão da Conferência.
-- Não está certo para o NOME da pessoa, que é dela.
--
-- ----------------------------------------------------------------------------
-- Por que um GRANT DE COLUNA e não só uma policy
--
-- A policy óbvia seria:
--
--     for update using (user_id = auth.uid())
--
-- e ela é uma escalação de privilégio. RLS decide quais LINHAS o comando
-- alcança; não decide quais COLUNAS ele pode escrever. Com o grant de UPDATE na
-- tabela inteira, aquela policy deixa qualquer confrade rodar
--
--     update public.confrades set papel = 'administrador' where user_id = auth.uid();
--
-- — a linha é a dele, a policy passa, e ele acaba de se eleger. `papel` é o que
-- decide quem lavra ata (pode_redigir_ata, migração 022) e quem lança dinheiro
-- (pode_lancar_financeiro, migração 014).
--
-- O `grant update (nome_completo)` fecha isso num nível que a policy não
-- alcança: o Postgres confere privilégio de coluna contra a lista do `SET`, e
-- recusa com "permission denied for column papel" antes de a policy ser sequer
-- consultada. As duas travas são necessárias e nenhuma substitui a outra —
-- o grant diz QUAIS COLUNAS, a policy diz QUAIS LINHAS.
-- ============================================================================

grant update (nome_completo) on public.confrades to authenticated;

-- `with check` além de `using`, e os dois com a mesma condição: `using` decide
-- que linha o comando alcança (a minha), `with check` decide como ela pode
-- ficar depois (ainda minha). Sem o `with check`, um
-- `set user_id = '<outro>'` seria aceito — e aí a linha do outro passaria a
-- apontar para uma conta que não é a dele. `user_id` não tem grant de UPDATE,
-- então hoje isso já falharia no privilégio; o `with check` é a segunda
-- fechadura, para o dia em que alguém ampliar o grant sem reler este arquivo.
drop policy if exists "confrade corrige o próprio nome" on public.confrades;
create policy "confrade corrige o próprio nome"
  on public.confrades
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

comment on column public.confrades.nome_completo is
  'Nome do associado. Editável pelo próprio (grant de coluna + policy desta migração) e pelo administrador (Edge Function gerenciar-usuarios). Renomear aqui NÃO altera ata já lavrada: atas_presencas.nome é cópia congelada (migração 023).';

-- ----------------------------------------------------------------------------
-- atualizado_em passa a valer alguma coisa
--
-- A coluna existe desde a migração 011 e nunca mudou de valor — nada escrevia
-- em `confrades` depois do insert, então ela era sempre igual a `criado_em`.
-- Agora a linha muda por dois caminhos (o próprio confrade e o administrador),
-- e saber quando é o que permite ao painel mostrar "cadastro revisto em ___" —
-- que é exatamente a pergunta que a revisão de categoria da migração 026 deixou
-- em aberto.
--
-- O trigger não conflita com o grant de coluna acima: privilégio de coluna é
-- conferido contra o `SET` do comando, e o trigger escreve depois, no nível da
-- linha. Um confrade atualizando só `nome_completo` carimba `atualizado_em`
-- sem precisar de grant nela.
-- ----------------------------------------------------------------------------
drop trigger if exists confrades_atualizado_em on public.confrades;
create trigger confrades_atualizado_em
  before update on public.confrades
  for each row execute function public.tocar_atualizado_em();

-- ----------------------------------------------------------------------------
-- O e-mail NÃO está aqui, e não dá para trazê-lo
--
-- E-mail de acesso mora em `auth.users`, fora do alcance de qualquer policy
-- deste schema. Trocá-lo exige a `service_role`, e por isso tanto o
-- autosserviço quanto a edição pelo administrador passam pela Edge Function
-- `gerenciar-usuarios` — com `email_confirm: true`, porque o projeto não tem
-- SMTP próprio e o fluxo de confirmação por e-mail não entregaria a mensagem.
-- ----------------------------------------------------------------------------
