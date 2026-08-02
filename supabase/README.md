# Supabase — mural e pedidos de oração

Backend das páginas `app/mural.html`, `app/oracoes.html` e `app/admin.html`.
Nada aqui é publicado pela Vercel: o site continua 100% estático
(`vercel.json` → `outputDirectory: app`).

## Ideia central

> O navegador nunca escreve no banco.

| Caminho | Chave | O que pode |
|---|---|---|
| Leitura das páginas públicas | `anon` | `SELECT` de colunas nomeadas, só em linhas já moderadas |
| Envio de pedido de oração | nenhuma | `POST` na Edge Function `enviar-pedido` |
| Painel de moderação | sessão do usuário | tudo, se o `user_id` estiver em `public.admins` |
| Edge Function | `service_role` | grava o pedido como `pendente` — só ela |

Não existe política de `INSERT`, `UPDATE` ou `DELETE` para `anon` em nenhuma tabela.

## Instalação, na ordem

1. **Migrações** — Dashboard → SQL Editor, rodando na ordem dos nomes:

   | Arquivo | O que cria |
   |---|---|
   | `20260802120000_admins.sql` | `public.admins`, `is_admin()` |
   | `20260802120100_mural_posts.sql` | `public.mural_posts` + RLS |
   | `20260802120200_pedidos_oracao.sql` | `public.pedidos_oracao` + RLS + grants por coluna |
   | `20260802120300_limite_e_retencao.sql` | `private.rate_limit`, `registrar_tentativa()`, purga diária |

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

## Retenção de dados

`private.purgar_dados_antigos()` roda todo dia às 03:15 (pg_cron) e:

- apaga pedidos expirados há mais de 30 dias e rejeitados há mais de 7;
- zera `ip_hash` e `user_agent` de qualquer pedido com mais de 30 dias;
- limpa o log de tentativas com mais de 2 dias.

Pedido de oração é dado pessoal — em geral sensível, e quase sempre de um
terceiro. Guardar só o necessário, pelo tempo necessário, é parte do desenho,
não um extra.
