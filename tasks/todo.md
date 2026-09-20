# Correções pedidas em 19/09/2026

Quatro pedidos do usuário, tratados "em partes" conforme solicitado.
Cada parte tem causa raiz **comprovada ao vivo** antes de qualquer correção.

---

## Investigação — o que foi provado (não suposto)

Ambiente conferido antes de tocar em código:
- Projeto Supabase `zyzyttkayblvgnfqkapq` ("vicentinos"), `linked: true`, o mesmo
  `ref` na URL de `assets/supabase-client.js:34` e na sessão da CLI.
- `supabase migration list`: as 20 migrations locais estão aplicadas no remoto.
  Banco e repositório contam a mesma história — o bug não é migration faltando.
- `app/` e `supabase/` limpos e iguais a `origin/main` → o que está na Vercel é
  o que está no repositório.
- Controle positivo antes de qualquer negativa: `mural_posts` respondeu `200 []`
  com a chave anon. O canal funciona; a chave é válida.

Estado real dos dados (lido com service_role, somente leitura):

| tabela | linhas |
|---|---|
| `confrades` | 2 — ambos `papel: administrador`, `ativo: true` |
| `admins` | 2 — os mesmos dois |
| `familias` | 5+ — cadastro de família **funciona** |
| `pessoas` | **0** |
| `pedidos_oracao` | **0** |
| `mural_posts` | **0** |

Isso derrubou a hipótese mais "óbvia" (descompasso de autorização entre o portão
da tela, `is_membro_area()`, e a RLS do prontuário, `is_confrade_ativo()`): os
dois usuários reais são confrades ativos, então a RLS **passa** para eles. Essa
divergência existe e é um risco real, mas **não é** a causa deste bug — registrada
abaixo como achado fora de escopo.

---

## Parte 1 — "Não está sendo possível adicionar pessoas" (BUG REAL)

**Causa raiz (reproduzida ao vivo, com conta descartável, em 19/09/2026):**

| caso | payload | resultado |
|---|---|---|
| A | sem CPF | `201` criado |
| B | CPF `123.456.789` | **`400` `23514 pessoas_cpf_check`** |
| C | CPF `12345678901` | `201` criado |

O banco exige que o CPF seja exatamente 11 dígitos (migration `20260915120100`,
linha 51). O campo do formulário (`prontuario-familia.html:154`) é
`<input type="text" maxlength="11" placeholder="Só números">` — **sem máscara,
sem `pattern`, sem limpar pontuação no JS** (o submit em :369 só faz `.trim()`).

Quem digita CPF do jeito natural — `123.456.789-01` — tem o valor **truncado pelo
`maxlength="11"` para `123.456.789`**, que *parece* completo na tela (11
caracteres) e é rejeitado pelo banco. O usuário vê a mensagem crua do Postgres
(`new row for relation "pessoas" violates check constraint "pessoas_cpf_check"`),
que não diz o que fazer.

Isso explica `pessoas = 0` com 5 famílias cadastradas: toda família tem um
responsável, de quem se preenche o CPF — então toda tentativa falhou.

**Correções:**
1. Aceitar CPF formatado: `inputmode="numeric"`, `maxlength="14"`, e limpar para
   só dígitos no `input` e no submit. Enviar 11 dígitos ou nulo.
2. Validar no cliente antes de enviar, com mensagem em português.
3. **O formulário de edição tem o defeito idêntico** (:436) — corrigir junto.
4. `minlength="3"` em `nome_completo` (o CHECK do banco exige 3 a 150).
5. Tradutor de erro do Postgres para português, para o usuário nunca mais ler
   "violates check constraint".
6. `carregarTudo()` (:262) descarta o `error` e colapsa RLS, UUID inválido, JWT
   vencido e "família não existe" no mesmo "Família não encontrada", deixando o
   formulário escondido sem diagnóstico. Distinguir os casos.

## Parte 2 — Notificação de conclusão + redirecionamento

Hoje: cadastrar família **não mostra confirmação nenhuma** — navega direto para
`prontuario-familia.html` (:170). Cadastrar pessoa mostra só um texto discreto.

**Decidido com o usuário:** ao salvar uma pessoa, mostrar notificação de sucesso,
limpar o formulário e **permanecer na família** (quase sempre há mais moradores),
com um botão explícito "Concluir família" que volta ao `prontuario.html`.

- Notificação (toast) visível de sucesso **e** de erro, compartilhada.
- Família criada: confirma e segue para a família.
- Pessoa criada: confirma, limpa, permanece; botão "Concluir família e voltar".

## Parte 3 — Menu de navegação no topo

As 6 páginas internas (`prontuario`, `prontuario-familia`, `prontuario-dashboard`,
`financeiro`, `financeiro-relatorio`, `admin`) têm uma barra `.topo` com **zero
links de navegação**. O único caminho de volta ao hub é o botão voltar do
navegador — exatamente o que o usuário relatou.

- Nav compartilhada nas 6 páginas, na identidade wine/gold já existente.
- Item do Dashboard só aparece para admin (`is_admin()`), como já é a regra do hub.
- Responsiva; `admin.html` não carrega `prontuario.css`, então o CSS da nav é
  autocontido e com nomes prefixados para não colidir com o `<style>` inline dele.

## Parte 4 — Painel: privilegiados da semana e pedidos de oração

**Causa raiz: não há nada quebrado — a funcionalidade nunca foi construída.**

- "Privilegiado da semana" **não é um registro**: é a coluna booleana
  `pedidos_oracao.privilegiado_semana`. O botão de estrela só é desenhado para
  pedidos já aprovados (`admin.html:634`), e o filtro padrão do painel é
  "pendente" (:508).
- O painel **não tem nenhum formulário de criação** de pedido de oração: o único
  caminho de INSERT é o formulário público de `oracoes.html` para a Edge Function
  `enviar-pedido` (service_role).
- Com `pedidos_oracao` vazia, não há o que aprovar, logo não há o que destacar.

**Provado ao vivo que a correção é só de UI — nenhuma migration é necessária:**
um membro da área autenticado conseguiu INSERT de pedido já aprovado (`201`) e
PATCH de `privilegiado_semana` (`200`). Os dois CHECKs que o formulário precisa
respeitar também foram provados falhando: sem consentimento, violação de
`pedidos_oracao_consentimento_check`; aprovado sem `aprovado_em`, violação de
`pedidos_oracao_aprovacao_coerente`.

**Decidido com o usuário:** o pedido digitado no painel nasce **já aprovado e
publicado** (quem digita é o moderador, que já conferiu).

- Formulário "Novo pedido de oração" no painel, com opção de já marcar como
  privilegiado da semana.
- Payload obrigatório: consentimento verdadeiro, status aprovado, `aprovado_em`
  e `aprovado_por` preenchidos.
- Mensagens de erro em português.

---

## Verificação (exigida antes de concluir — §4 e pedido do usuário)
- Playwright contra o site real, logado, exercitando os quatro fluxos.
- Massa de teste criada com conta descartável e **apagada ao final**, confirmada
  por API.

---

## Achados fora do escopo (registrados, §6.1)

1. **53 arquivos `.md` de conteúdo com correções de acento não commitados**
   (`CadUnico` para `CadÚnico` etc.), anteriores a esta tarefa. **Não serão
   misturados** aos commits destas correções.
2. **Divergência de autorização no Prontuário (risco real, não é este bug).**
   O portão da tela é `is_membro_area()` (admin **ou** confrade ativo), mas a
   RLS de `familias`, `pessoas`, `fontes_renda`, `necessidades`, `intervencoes` e
   `parentescos_cruzados` é `is_confrade_ativo()`. Um usuário que seja admin sem
   linha em `confrades` (caminho documentado em `20260802120000_admins.sql`)
   entra na página e vê "Família não encontrada" em tudo, sem erro. Hoje não
   afeta ninguém porque os 2 usuários reais são confrades ativos. Exige decisão
   de produto, então não será corrigido em silêncio.
3. **Campo "Código" da família está sendo usado como nome.** As 5 famílias reais
   têm `codigo` igual ao nome da pessoa e `endereco_bairro` com o endereço
   completo. O rótulo induz ao erro, e `codigo` é UNIQUE — dois atendidos
   homônimos quebrariam o cadastro. Sugerir renomear o campo.
4. **Erros engolidos em silêncio** além do da Parte 1: `prontuario-familia.html`
   :267, :324-330, :345-347, :611 (descartam o erro) e :583, :588, :592, :641
   (mutações sem checagem nenhuma); `admin.html` :545, :602-607;
   `area-vicentino.js` :90.
5. **`area-vicentino.js:82-88` faz signOut quando a RPC `is_membro_area` falha** —
   uma oscilação de rede desloga o moderador sem explicação.
6. Pendência anterior, ainda aberta: cadastrar o saldo inicial real da conta BRB
   (`saldo_inicial_financeiro` sem linha).
