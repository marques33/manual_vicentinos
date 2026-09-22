# Supabase — mural, pedidos de oração e prontuário de atendimento

Backend das páginas `app/mural.html`, `app/oracoes.html`, `app/admin.html`,
`app/prontuario.html` e `app/prontuario-familia.html`. Nada aqui é publicado
pela Vercel: o site continua 100% estático (`vercel.json` → `outputDirectory:
app`).

## Ideia central

> O navegador nunca escreve no banco.

| Caminho | Chave | O que pode |
|---|---|---|
| Leitura das páginas públicas | `anon` | `SELECT` de colunas nomeadas, só em linhas já moderadas |
| Envio de pedido de oração | nenhuma | `POST` na Edge Function `enviar-pedido` |
| Painel de moderação | sessão do usuário | tudo, se o `user_id` estiver em `public.admins` |
| Edge Function | `service_role` | grava o pedido como `pendente` — só ela |

Não existe política de `INSERT`, `UPDATE` ou `DELETE` para `anon` em nenhuma tabela.

**O Prontuário de Atendimento é mais restrito ainda:** nenhuma das suas
tabelas tem qualquer grant ou policy para `anon` — é dado sensível (LGPD),
sem leitura pública alguma. Acesso exige `authenticated` + estar em
`public.confrades` com `ativo = true`.

## Instalação, na ordem

1. **Migrações** — Dashboard → SQL Editor, rodando na ordem dos nomes:

   | Arquivo | O que cria |
   |---|---|
   | `20260802120000_admins.sql` | `public.admins`, `is_admin()` |
   | `20260802120100_mural_posts.sql` | `public.mural_posts` + RLS |
   | `20260802120200_pedidos_oracao.sql` | `public.pedidos_oracao` + RLS + grants por coluna |
   | `20260802120300_limite_e_retencao.sql` | `private.rate_limit`, `registrar_tentativa()`, purga diária |
   | `20260803180000_mural_anexo.sql` | anexo para download no mural |
   | `20260915120000_confrades.sql` | `public.confrades`, `is_confrade_ativo()` |
   | `20260915120100_prontuario_familias_pessoas.sql` | `public.familias`, `public.pessoas` + RLS |
   | `20260915120200_prontuario_rendas.sql` | `public.fontes_renda`, `vw_renda_familiar` |
   | `20260915120300_prontuario_necessidades_intervencoes.sql` | `public.necessidades`, `public.intervencoes` |
   | `20260915120400_prontuario_parentescos_cruzados.sql` | `public.parentescos_cruzados` (vínculo entre famílias) |
   | `20260915120500_parametros_beneficios.sql` | `public.parametros_beneficios`, `calcular_elegibilidade_pessoa()` |
   | `20260915120600_confrades_papel_administrador.sql` | papel `administrador` em `confrades.papel` |
   | `20260916120000_area_vicentino_acesso_unico.sql` | `is_membro_area()` — autorização única da Área do Vicentino |
   | `20260916130000_fix_vw_renda_familiar_rls_bypass.sql` | `vw_renda_familiar` com `security_invoker` |
   | `20260916150000_financeiro_categorias.sql` | `public.categorias_financeiras`, `pode_lancar_financeiro()` |
   | `20260916150100_financeiro_lancamentos.sql` | `public.lancamentos_financeiros` + RLS + soft delete |
   | `20260916150200_financeiro_saldo_inicial.sql` | `public.saldo_inicial_financeiro` (linha única) |
   | `20260916150300_financeiro_conciliacoes.sql` | `public.conciliacoes_financeiras`, `vw_saldo_financeiro` |
   | `20260916150400_financeiro_storage.sql` | bucket privado `comprovantes-financeiros` + policies |
   | `20260916150500_financeiro_revoke_consistencia.sql` | `revoke` nas funções do financeiro + trigger de consistência |
   | `20260920120000_prontuario_sem_campos_obrigatorios.sql` | remove obrigatoriedade dos campos do prontuário |
   | `20260922130000_atas.sql` | `public.atas`, `pode_redigir_ata()` + RLS (trava da ata aprovada) |
   | `20260922130100_atas_presencas.sql` | `public.atas_presencas`, `ata_aberta_para_edicao()` |
   | `20260922130200_atas_reabertura.sql` | `pode_reabrir_ata()` + conserto da reabertura da ata aprovada |
   | `20260922140000_atas_movimento_caixa.sql` | as 36 linhas do Movimento de Caixa + contadores, em `public.atas` |
   | `20260922140100_confrades_categoria.sql` | `confrades.categoria` e a cópia congelada em `atas_presencas.categoria` |
   | `20260922150000_confrades_autosservico.sql` | grant de coluna `nome_completo` + policy do próprio dono + trigger de `atualizado_em` |

   Ou, com a CLI: `npx supabase db push`.

   Se o `create extension pg_cron` falhar por permissão, habilite a extensão em
   **Database → Extensions** e rode o arquivo 004 de novo.

2. **Fechar o cadastro público** — Authentication → Providers → Email →
   **Enable sign ups = OFF**. Sem isso qualquer visitante cria a própria conta;
   ela não viraria admin, mas passaria a ser `authenticated`.

3. **Criar os moderadores** — Authentication → Users → *Add user* (e-mail + senha,
   marcando *Auto Confirm User*). Depois, no SQL Editor:

   ```sql
   insert into public.admins (user_id, nome)
   select id, 'Nome de quem modera' from auth.users where email = 'moderador@exemplo.com';
   ```

   **Criar os confrades com acesso ao Prontuário** — mesma tela (*Add user*),
   depois no SQL Editor:

   ```sql
   insert into public.confrades (user_id, nome_completo, papel)
   select id, 'Nome do confrade', 'vicentino' from auth.users where email = 'confrade@exemplo.com';
   ```

   `admins` e `confrades` são tabelas independentes — quem modera o site *e*
   usa o prontuário precisa de uma linha em cada uma.

4. **Segredos da Edge Function** — Edge Functions → Secrets:

   | Segredo | Valor |
   |---|---|
   | `IP_PEPPER` | string aleatória longa, ≥ 32 caracteres (`openssl rand -hex 32`) |
   | `ORIGENS_PERMITIDAS` | opcional; padrão já cobre o domínio de produção e o localhost |

   `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` são injetados pela plataforma —
   não crie esses dois à mão, e **nunca** coloque a `service_role` no HTML.

5. **Publicar a função** — `npx supabase functions deploy enviar-pedido`
   (ou colar os dois arquivos no editor do Dashboard).

6. **Ligar o site ao projeto** — preencher a URL e a chave `anon` em
   `app/assets/supabase-client.js`. Essa chave é pública por definição; quem
   protege o banco é a RLS.

7. **Conferir** — `node supabase/verificar-rls.mjs` (instruções no topo do arquivo).
   Enquanto esse script não passar inteiro, o site não deve ir ao ar.
   Para o Prontuário, rodar também `node supabase/verificar-rls-prontuario.mjs`
   (instruções no topo do arquivo) — ele precisa de um confrade de teste real
   em `public.confrades` para provar o lado positivo, além da chave `anon`.

## Retenção de dados

`private.purgar_dados_antigos()` roda todo dia às 03:15 (pg_cron) e:

- apaga pedidos expirados há mais de 30 dias e rejeitados há mais de 7;
- zera `ip_hash` e `user_agent` de qualquer pedido com mais de 30 dias;
- limpa o log de tentativas com mais de 2 dias.

Pedido de oração é dado pessoal — em geral sensível, e quase sempre de um
terceiro. Guardar só o necessário, pelo tempo necessário, é parte do desenho,
não um extra.

## Prontuário de Atendimento

`app/prontuario.html` (lista/cadastro de famílias) e
`app/prontuario-familia.html` (detalhe: pessoas, renda, necessidades,
intervenções, elegibilidade e parentesco entre famílias). Acesso só para
quem está em `public.confrades` com `ativo = true`.

**Atualizar os parâmetros de benefício quando sair novo decreto** (ex.:
mudança no valor do Cartão Prato Cheio ou nas faixas do Plano DF Social) —
nunca dar `UPDATE` na linha vigente, sempre fechar e abrir uma nova, para
que atendimentos antigos continuem referenciando a regra da época:

```sql
update public.parametros_beneficios
   set vigente_ate = current_date - 1
 where vigente_ate is null;

insert into public.parametros_beneficios (salario_minimo, decreto_referencia, prato_cheio_valor_parcela)
values (1518.00, 'Decreto XX.XXX/2027', 280.00);
```

A função `calcular_elegibilidade_pessoa()` é uma **estimativa de triagem**
para orientar o vicentino — não é decisão automática de benefício. A UI já
deixa isso explícito ao lado de cada selo de elegibilidade.

## Livro de Atas

`app/atas.html` (histórico) e `app/ata.html` (a ata: editor, visualização e
exportação em ODT e PDF). Leitura e exportação para qualquer confrade ativo
(`is_confrade_ativo()`); lavrar exige `pode_redigir_ata()` — confrade ativo com
`confrades.papel in ('secretario','presidente','vice_presidente','administrador')`.

**A ata aprovada trava, e quem trava é o banco.** A policy de `UPDATE` só
alcança a linha enquanto ela é rascunho; depois de aprovada, só
`pode_reabrir_ata()` (moderador em `public.admins` **ou** confrade ativo com
papel `administrador`) chega nela. A tela desabilita os campos, mas isso é
conveniência — a fronteira é a RLS. O mesmo vale para `atas_presencas`, via
`ata_aberta_para_edicao()`: sem ela, dava para trocar a lista de presentes de
uma ata já assinada.

**Cadastrar uma secretária:**

```sql
insert into public.confrades (user_id, nome_completo, papel)
select id, 'Nome da secretária', 'secretario' from auth.users where email = 'secretaria@exemplo.com';
```

**O número da ata continua o livro de papel.** `atas.numero` é `unique` e não
uma sequence: a última ata manuscrita é a 243, e a primeira ata do sistema
recebe o número à mão. Daí em diante a tela sugere `max(numero) + 1`.

**Os valores da tesouraria são gravados na ata, não calculados.** A tela
sugere a partir de `lancamentos_financeiros`, mas o que fica é o retrato do que
a tesoureira apresentou naquele dia — corrigir um lançamento meses depois não
pode reescrever uma ata já lida e aprovada.

### Movimento de Caixa (migração 025)

A Conferência preenche **dois** impressos por reunião: a minuta da ata (a prosa)
e o **Movimento de Caixa** do Conselho Metropolitano — 36 linhas numeradas, que
é a folha ENVIADA ao Conselho Particular. As 36 linhas moram em `public.atas`,
ao lado da minuta: é a mesma reunião, a mesma gravação e a mesma trava de
aprovação.

Sete linhas são conta e não se digitam: **6** (base da décima, linhas 1 a 5),
**13** (6 a 12), **15** (13+14), **28** (16 a 27), **29** (15−28), **30** (28+29)
e **36** (29+34+35). A conferência do impresso — **a linha 15 tem que bater com
a 30** — aparece na tela, em vermelho quando não fecha.

Três linhas *parecem* conta e não são: a **24** (o papel orienta 10% da linha 6),
a **26** (linha 8) e a **27** (linha 12). O impresso traz a fórmula como
orientação; o que se grava é o que foi **de fato pago**, e a diferença entre o
devido e o pago é justamente o que a **linha 34** registra.

**Os nove campos da minuta viraram derivados.** `saldo_anterior`, `coleta`,
`outras_fontes`, `soma_receita`, `auxilio_assistidos`, `despesas_diversas`,
`decima`, `soma_despesa` e `saldo_atual` continuam existindo e continuam sendo
o que a prosa da ata recita — mas saem das 36 linhas na hora de salvar (o mapa
está no cabeçalho da migração 025). Enquanto a folha estiver em branco eles
seguem digitados, que é o que mantém editável a ata lavrada antes dela existir.

**Quem edita o quê, no cadastro de confrade**

| Campo | Onde mora | Quem altera |
|---|---|---|
| `nome_completo` | `public.confrades` | **o próprio** (grant de coluna, migração 027) e o administrador |
| e-mail de acesso | `auth.users` | **o próprio** (`atualizar_meu_email`) e o administrador (`atualizar_confrade`) |
| senha | `auth.users` | **o próprio** (`sb.auth.updateUser`) e o administrador (`redefinir_senha`) |
| `papel`, `categoria` | `public.confrades` | **só o administrador** — são decisão da Conferência |
| `ativo` | `public.confrades` | ninguém pela UI ainda; só SQL |

**A trava que sustenta isso é privilégio de COLUNA, não policy.** `confrades`
tem `grant update (nome_completo) to authenticated` mais a policy
`user_id = auth.uid()`. Uma policy sozinha deixaria o confrade rodar
`update confrades set papel = 'administrador' where user_id = auth.uid()` — a
linha é dele, a policy passa. RLS escolhe LINHAS; o grant escolhe COLUNAS, e
aqui são necessários os dois. Provado por
`node supabase/verificar-cadastro-confrades.mjs`, que tenta a escalação de
propósito (e tenta também `papel` de carona no mesmo `UPDATE` do nome).

**A troca de e-mail não passa por confirmação**, porque o projeto **não tem
SMTP próprio** e `mailer_autoconfirm` é `false` (medido em 22/09/2026 no
`/auth/v1/settings`). O fluxo padrão `sb.auth.updateUser({ email })` mandaria
uma mensagem pelo mailer default do Supabase (~2/hora, não-produção) que na
prática não chega. Por isso as duas pontas passam pela Edge Function, com
`email_confirm: true`. Consequência aceita: ninguém prova a posse do novo
endereço, e um erro de digitação tranca o confrade fora — recuperável pelo
administrador em `admin.html`.

**`atualizar_meu_email` é a única ação da Edge Function que um confrade comum
alcança**, e o alvo dela sai do **JWT**, nunca do corpo da requisição. Mandar
`user_id` no corpo não desvia nada — o verificador testa isso apontando para
outro confrade e exigindo que o e-mail do outro fique intacto.

**A categoria do associado (migração 026)** — `confrade` / `consocia` /
`aspirante` — alimenta os contadores de presença do cabeçalho da folha. É
diferente de `papel`, que é função na Conferência: uma consócia pode ser
tesoureira. A migração preenche os cadastros existentes com `confrade`, e
**eles precisam ser revistos** em `app/admin.html` (o seletor no cartão de cada
usuário) — até lá a folha conta toda a Conferência numa linha só. A escrita
passa pela Edge Function `gerenciar-usuarios` (ação `atualizar_categoria`),
porque `confrades` só tem grant de `SELECT`.

### Como conferir

`node supabase/verificar-movimento-caixa.mjs` — **não precisa de banco nem de
rede**: cruza as colunas da migração 025 com o módulo
`app/assets/ata-movimento-caixa.js` e com o formulário, e reproduz a aritmética
da folha de papel de 22/08/2026 (Ata 240: linha 13 = 107,00, linha 15 =
6.446,70, linha 28 = 510,70, linha 29 = 5.936,00, linha 30 = 6.446,70).

`node supabase/verificar-rls-atas.mjs` (instruções no topo do arquivo) — precisa
de contas de teste com os papéis para provar o lado positivo e a trava; cria
atas com `numero >= 990000` e diz no fim como limpá-las.

`SUPABASE_SERVICE_ROLE_KEY=... node supabase/verificar-cadastro-confrades.mjs` —
prova as travas do autosserviço contra o banco de verdade. Ao contrário dos
outros, **cria e apaga as contas descartáveis de que precisa**, então não
depende de conta de teste versionada. A `service_role` vem só do ambiente:
`npx supabase projects api-keys --project-ref <ref>`, nunca gravada em arquivo.

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
