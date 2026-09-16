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
   | `20260916150000_financeiro_categorias.sql` | `public.categorias_financeiras`, `pode_lancar_financeiro()` |
   | `20260916150100_financeiro_lancamentos.sql` | `public.lancamentos_financeiros` + RLS + soft delete |
   | `20260916150200_financeiro_saldo_inicial.sql` | `public.saldo_inicial_financeiro` (linha única) |
   | `20260916150300_financeiro_conciliacoes.sql` | `public.conciliacoes_financeiras`, `vw_saldo_financeiro` |
   | `20260916150400_financeiro_storage.sql` | bucket privado `comprovantes-financeiros` + policies |

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
