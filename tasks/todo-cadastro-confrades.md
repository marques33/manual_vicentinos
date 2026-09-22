# Cadastro de confrades — e-mail pelo administrador e autosserviço

## Pedido

> "é importante que eu possa alterar o e-mail dos confrades, além da senha.
> É importante que eles também possam retificar suas próprias informações"

## O que existe hoje

| Quem | Pode mudar | Onde |
|---|---|---|
| Administrador | senha de terceiro; categoria | `admin.html` → Edge Function `gerenciar-usuarios` |
| Administrador | papel, nome | **só na CRIAÇÃO** do usuário |
| Confrade | a própria senha | `area-vicentino.html` → `sb.auth.updateUser()` |
| Confrade | o próprio nome ou e-mail | **não pode** |

`confrades` tem `grant select` apenas (migração 011). O e-mail não mora em
`confrades`: mora em `auth.users`, alcançável só pela `service_role`.

## Dois achados que desenham a solução

**1. Não há SMTP próprio, e `mailer_autoconfirm` é `false`.** Medido em
22/09/2026 no `/auth/v1/settings` do projeto. O caminho padrão do autosserviço
(`sb.auth.updateUser({ email })`) dispara e-mail de confirmação pelo mailer
default do Supabase — ~2/hora, explicitamente não-produção. O confrade clicaria
em "salvar" e o e-mail nunca chegaria. Por isso a troca do próprio e-mail passa
pela Edge Function, com `email_confirm: true` na `service_role`.

**2. RLS é por LINHA; privilégio é por COLUNA.** Uma policy comum
(`using (user_id = auth.uid())`) deixaria o confrade editar a própria linha
inteira — inclusive `papel`, virando `administrador` sozinho. A trava certa é
`grant update (nome_completo)`: o Postgres confere privilégio de coluna contra
a lista do `SET`, então um `update ... set papel = ...` é recusado mesmo com a
policy passando.

## Decisões (confirmadas com o usuário)

- **Autosserviço:** nome e e-mail. Papel, categoria e `ativo` continuam do
  administrador — são decisão da Conferência, não dado pessoal.
- **Troca do próprio e-mail NÃO pede a senha atual.** Basta a sessão. Aceito o
  risco: errar o endereço tranca o confrade fora até o administrador corrigir —
  e o administrador passa a poder corrigir, que é a outra metade deste pedido.
- **Administrador:** e-mail, nome e papel (além da senha e da categoria). Hoje
  eleger uma tesoureira nova exige SQL no painel do Supabase.

## Plano

- [x] 1. Migração 027 — `grant update (nome_completo) on confrades to
      authenticated` + policy do próprio dono; trigger de `atualizado_em`
      (a coluna existe desde a 011 e nunca mudou; agora vai mudar).
- [x] 2. Edge Function: **fundir** `atualizar_categoria` em `atualizar_confrade`
      (nome, papel, categoria, e-mail num caminho só de validação) e criar
      `atualizar_meu_email`. Reestruturar o portão: hoje `is_admin()` é checado
      ANTES de ler a ação; passa a ser por ação, com a de autosserviço exigindo
      `is_membro_area()`.
- [x] 3. `admin.html`: trocar o seletor de categoria solto por um painel
      "Editar" com nome, e-mail, papel e categoria.
- [x] 4. `area-vicentino.html`: "Alterar senha" vira "Meus dados" — nome,
      e-mail e nova senha.
- [x] 5. `supabase/README.md` + verificação + deploy na ordem banco → função →
      front.

## Regra inegociável do autosserviço

**O usuário-alvo da ação de autosserviço sai do JWT, nunca do corpo da
requisição.** Como não há senha nem confirmação por e-mail, um `user_id` vindo
do corpo seria a permissão para qualquer confrade trocar o e-mail de acesso de
qualquer outro.

## Revisão — o que ficou

| Quem | Pode mudar | Por onde |
|---|---|---|
| Confrade | o próprio **nome** | UPDATE direto em `confrades` — grant de coluna (027) |
| Confrade | o próprio **e-mail** | Edge Function `atualizar_meu_email`, alvo tirado do JWT |
| Confrade | a própria **senha** | `sb.auth.updateUser()`, como antes |
| Administrador | nome, e-mail, papel e categoria de qualquer um | Edge Function `atualizar_confrade` |
| Administrador | senha de qualquer um | `redefinir_senha`, como antes |

`atualizar_categoria` (criada horas antes, na tarefa do Movimento de Caixa)
foi **fundida** em `atualizar_confrade`: duas ações escrevendo a mesma tabela
seriam duas validações do mesmo `user_id`, livres para divergir.

### Evidências (§4)

`SUPABASE_SERVICE_ROLE_KEY=... node supabase/verificar-cadastro-confrades.mjs`
— **30 verificações contra o banco de produção**, com contas descartáveis
criadas e apagadas pelo próprio script. Todas passaram:

| Seção | O que prova |
|---|---|
| 1 | o confrade grava o próprio nome; `atualizado_em` é carimbado pelo trigger |
| 2 | **a trava**: `papel`, `categoria` e `ativo` na própria linha → 403; e `papel` **de carona junto com o nome, no mesmo UPDATE** → 403 também |
| 3 | update na linha de outro confrade não alcança linha nenhuma |
| 4 | o e-mail próprio troca, **nasce confirmado**, e o login acompanha |
| 5 | **a trava**: `user_id` no corpo apontando para outro confrade **não desvia o alvo** — o e-mail do outro fica intacto |
| 6 | confrade comum recebe `acesso_negado` em `atualizar_confrade`, `listar`, `criar_usuario`, `redefinir_senha` e em ação desconhecida |
| 7 | o administrador altera nome, e-mail, papel e categoria de terceiro; o confrade entra pelo e-mail novo; e-mail duplicado dá 409 **sem gravar o nome pela metade** |

**Navegador** (Chrome, front local na porta 8000 contra o Supabase de produção,
com contas descartáveis):

- *Meus dados* abre já preenchido com o nome e o e-mail gravados;
- salvar os três de uma vez respondeu "Salvo: nome, e-mail, senha.", o topo
  passou a mostrar o nome novo, e no banco: e-mail trocado e confirmado, nome
  trocado, **`papel` intacto em `vicentino`**;
- o e-mail **antigo** e a senha **antiga** passaram a dar 400 no login; o par
  novo dá 200;
- *Editar cadastro* no `admin.html` elegeu a confrade tesoureira e trocou
  e-mail, nome e categoria — a lista recarregou mostrando
  "… · Tesoureiro · Consócia";
- e-mail duplicado mostrou "Já existe uma conta com este e-mail.", o painel
  ficou aberto, e o nome da tentativa recusada **não** vazou para o banco.

As contas de teste foram apagadas; restam só as três reais.

### Defeito encontrado e corrigido durante a verificação

E-mail duplicado respondia `falha_trocar_email` ("Não foi possível trocar o
e-mail") em vez de `email_ja_cadastrado` ("Já existe uma conta com este
e-mail") — o administrador não saberia o motivo da recusa.

Causa raiz medida com sonda direta ao GoTrue: o endpoint devolve
`{"code":"23505","message":"duplicate key value violates unique constraint
\"users_email_partial_key\"","detail":"... already exists."}`, e
`servico.auth.admin.updateUserById()` **achatava** isso em algo que nenhuma das
frases procuradas casava. Corrigido trocando o SDK por `fetch` direto no
endpoint, onde o código `23505` é sinal exato. Reimplantado e reverificado.

## Riscos residuais e próximos passos

1. **Errar o próprio e-mail tranca o confrade fora** — foi a escolha
   consciente (sem senha de confirmação, sem SMTP). O conserto é o
   administrador em `admin.html`, que agora existe.
2. **`ativo` continua sem UI.** Desativar um vicentino que saiu da Conferência
   ainda é SQL no painel do Supabase.
3. **A ordem de deploy tem uma janela.** Fundir `atualizar_categoria` em
   `atualizar_confrade` quebrou o seletor de categoria da produção entre o
   deploy da function e o push do front. Foi assumido conscientemente porque o
   seletor tinha horas de vida e ainda não havia sido usado; da próxima vez,
   ação renomeada pede o front primeiro (aceitando as duas por um tempo) ou uma
   janela combinada.

## Achados fora do escopo

- **`disable_signup: false`** no projeto `zyzyttkayblvgnfqkapq` (medido em
  22/09/2026). Qualquer pessoa cria conta pela API de auth. Não é brecha de
  acesso — a Área exige linha em `confrades`/`admins` (`is_membro_area()`) —
  mas enche `auth.users` de estranhos e ocupa e-mails que um confrade legítimo
  poderia querer usar. Correção é no painel (Authentication → Sign In / Up →
  desligar "Allow new users to sign up"), não no código. **Reportado, não
  corrigido** — muda comportamento do projeto e é decisão do usuário.
