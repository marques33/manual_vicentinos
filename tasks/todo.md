# ONDE ESTAMOS (retomada — atualizado em 20/09/2026)

Tudo que foi feito está commitado, no ar e verificado. Árvore limpa, `main`
igual ao remoto, 21 migrations aplicadas, nada pendente.

**Para retomar, leia nesta ordem:**
1. Esta seção.
2. `tasks/lessons.md` — as lições, principalmente as quatro de 19 e 20/09.
3. `tasks/site-vs-manual.md` — o relatório do `content.js` (decisão em aberto).

## Feito nesta rodada (19–20/09/2026)

| # | Entrega | Verificação |
|---|---|---|
| 1 | Cadastro de pessoa voltou a funcionar (era o CPF digitado com ponto/traço) | Playwright 31/31 |
| 2 | Notificações de sucesso/erro + botão "Concluir família" | idem |
| 3 | Menu de navegação nas 6 páginas internas (+ correção do menu no celular) | idem |
| 4 | Painel passou a registrar pedido de oração e privilegiado da semana | idem |
| 5 | Acentuação do manual concluída (1.096 linhas) e 3 defeitos dela corrigidos | diff normalizado |
| 6 | Telefone da Defensoria corrigido em 143 pontos (o antigo estava errado) | fontes oficiais |
| 7 | Bolsa Família reajustado (Decreto 13.120/2026) com aviso de vigência | — |
| 8 | Prontuário sem nenhum campo obrigatório (migration 021) | Playwright 16/16 |

## Decisões em aberto (esperando o usuário)

1. **Renda zero x renda não informada** — sem fonte de renda cadastrada, a tela
   diz "Extrema pobreza" e "Prato Cheio — provável". Mesmo tipo de erro já
   corrigido no BPC. Proposta ao final deste arquivo.
2. **`app/content.js` fora de sincronia com os `.md`** — o site não lê os
   arquivos do manual, carrega uma cópia embutida. Ver `tasks/site-vs-manual.md`;
   há uma armadilha que desaconselha regenerar às cegas.
3. **Divergência de autorização no prontuário** — portão de tela é
   `is_membro_area()`, RLS é `is_confrade_ativo()`. Hoje não afeta ninguém.
4. **Campo "Código" da família usado como nome** — e ele é UNIQUE, então dois
   atendidos homônimos quebram o cadastro.
5. **Saldo inicial da conta BRB** — `saldo_inicial_financeiro` segue sem linha.
6. **`biblioteca/` e `build/` fora do `.gitignore`** — quase entraram 40 MB num
   commit; convém ignorá-los de vez.

## Como rodar a verificação de novo

Os scripts de QA com Playwright viviam no diretório temporário da sessão e
**se perdem ao limpar o contexto**. Se forem úteis de novo, peça para
recriá-los — o padrão é: conta descartável via API de admin do Supabase,
servidor local em porta livre (ou `ALVO_BASE` para produção), e limpeza da
massa no `finally`, sempre conferida por varredura independente depois.

A chave `service_role` sai de
`supabase projects api-keys --project-ref zyzyttkayblvgnfqkapq -o json`
(a saída é uma LISTA, não um objeto com `keys`).

---

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

## Verificação — feita (§4 e pedido do usuário)

**Playwright, 31/31 checagens, 0 falhas**, logado com conta descartável
(confrade ativo + admin), primeiro contra o build local e depois **contra
produção** (`manual-vicentinos.vercel.app`), já com o deploy no ar.

O que cada parte provou na tela, e não só no código:

- **P1** — CPF digitado com pontuação é formatado no campo (`529.982.247-25`),
  a pessoa é aceita, e o banco recebe `52998224725` (só dígitos). Com CPF de 5
  dígitos, a tela diz *"O CPF precisa ter 11 dígitos — você digitou 5"* e
  **nunca** aparece `violates check constraint`.
- **P2** — notificação ao cadastrar família antes de abrir a ficha; ao salvar
  pessoa a tela permanece na família; "Concluir família" volta à lista.
- **P3** — 7 links de navegação nas seis páginas internas, com a página atual
  marcada, o item Dashboard visível para admin, e a troca de página feita pelo
  menu (sem botão voltar do navegador).
- **P4** — pedido registrado pelo painel nasce aprovado, já marcado como
  privilegiado, aparece na lista do painel (com o botão "Tirar dos
  privilegiados") **e** na página pública de Orações.
- **Console limpo em produção: 0 erros.** No teste local apareciam 2 erros de
  CORS da function `gerenciar-usuarios` — ela só aceita a origem de produção,
  então era o controle funcionando, não defeito; em produção não ocorrem.

Massa de teste apagada e **conferida por varredura independente**: restam
apenas as 2 contas reais, 2 confrades, 2 admins e as 7 famílias reais; nenhuma
linha com marca de QA.

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

---

# 20/09/2026 · Prontuário sem campos obrigatórios — concluído

Migration 021 + telas. Verificado com Playwright, 16/16, local e em produção.
Detalhes no commit `feat(prontuario): nenhum campo de preenchimento obrigatório`.

## Achado novo, do mesmo tipo, NÃO corrigido (§6.1)

**"Renda zero" e "renda não informada" continuam indistinguíveis na estimativa.**

Com uma pessoa recém-cadastrada e nenhuma fonte de renda registrada, a tela
exibe:

- `Plano DF Social — Extrema pobreza`
- `Cartão Prato Cheio — provável`

Isso vem de `coalesce(sum(fr.valor_mensal), 0)` na
`calcular_elegibilidade_pessoa` e na `vw_renda_familiar`: sem nenhuma linha de
renda, a soma é 0, e 0 per capita cai na faixa de extrema pobreza. Aritmética
correta, leitura errada — a família não declarou renda nenhuma, apenas ainda
não teve a renda cadastrada.

É exatamente o problema que acabou de ser corrigido no BPC (ausência de dado
aparecendo como conclusão), só que na outra tarja. E ficou **mais provável**
agora: com o cadastro sem campos obrigatórios, pessoa sem nenhuma informação
passa a ser o caso comum nas primeiras visitas.

**Correção proposta** (não aplicada, muda o que a tela diz para toda família):
distinguir "sem nenhuma linha em `fontes_renda` na família" de "linhas somando
zero". No primeiro caso, devolver as faixas como indeterminadas e exibir a
mesma tarja tracejada, com "falta cadastrar a renda". No segundo, manter a
estimativa — renda declarada como zero é informação.

Exige decisão: há famílias que de fato não têm renda alguma, e para elas a
tarja atual está certa. A diferença está em ter sido *perguntado*, o que o
sistema hoje não registra.

---

## Revisao /review de 20/09/2026 — scripts nao commitados

Rodada sobre `build_pdf_abnt.py`, `fix_textual.py` e as 5 skills novas (nao ha
diff contra `origin/main`; tudo era untracked). Corrigido nesta rodada: escopo do
glob, homografos `divida`/`previa`, guarda do pandoc, ordenacao NBR 6023 das
referencias, nome do PDF na skill `vicentino-pdf-build`, `.gitignore` (43,7 MB ->
2,06 MB), regra morta `idade e menor` e 37 testes de regressao em `tests/`.

### Registrado, NAO corrigido

6. **Referencias duplicadas no PDF.** `build_pdf_abnt.py` mantem as 43 secoes
   "Fontes e Referencias" no corpo dos capitulos E ainda acrescenta a secao
   REFERENCIAS consolidada no fim. O docstring promete consolidacao. Decidir:
   remover do corpo, remover a consolidada, ou assumir que as duas sao
   intencionais (por capitulo ajuda na versao impressa). Exige decisao editorial.
7. **As 184 "referencias" nao estao em ABNT NBR 6023.** 176 sao links markdown
   crus (`[CNJ -- Medidas protetivas](https://...)`); so as 8 hardcoded em
   `build_references()` seguem AUTOR. Titulo. Local: Editora, ano. Converter as
   176 e trabalho de conteudo, nao de codigo.
8. **Lacuna do dicionario de acentuacao.** ~230 palavras sem acento aparecem no
   conteudo e nao sao cobertas. O subconjunto com final `-cao`/`-coes`/`-encia`
   e quase todo defeito real: `Organica`, `Jurisprudencia`, `relacao`,
   `perseguicao`, `autorizacao`, `Estacao`, `Proibicao`, `conciliacao`,
   `Intimidacao`, `Regulacao`, `atuacao`. Cuidado: terminacoes `-aria`/`-oria`/
   `-ica` dao falso positivo (`Defensoria`, `Ouvidoria`, `aposentadoria`,
   `Portaria`, `significa` estao CORRETOS sem acento).
9. **Homografos ainda armados no dicionario** (sem ocorrencia viva hoje, achados
   pelo Codex): `faca`->`faca` (faca = objeto, relevante no capitulo de
   violencia), `carne`->`carne`, `media`->`media`, `Gas`->`Gas`, e as formas de
   futuro `fara`/`tera`/`dara`/`podera`/`devera`. Mesma classe do `divida`. Se
   entrar conteudo novo com essas palavras, corrompe. Tratar como o `divida`:
   tirar do DICT e criar padrao de contexto em `NOUN_PATTERNS`.
10. **`build/` (2,06 MB) segue fora do `.gitignore`.** E 100% artefato:
    `abnt_header.tex` e `abnt_titlepage.tex` sao escritos por
    `write_header_tex()`/`write_titlepage_tex()`, o resto e markdown/txt
    intermediario. Nao entrou no ignore porque nao estava na pergunta.
11. **Falhas que falham abertas em `build_pdf_abnt.py`** (achados do Codex,
    confirmados por leitura): capitulo ausente so emite AVISO e o PDF e dado
    como pronto (`:198-202`); `pre_sumario` depende do literal `## Sumario` e,
    se o heading mudar, insere o README inteiro como APRESENTACAO (`:172-178`);
    `clean_md()` remove o destino de qualquer link cujo URL contenha `.md`;
    `demote_headings()` nao rastreia blocos de codigo cercados e nao rebaixa H6.
12. **`re.sub(r"^#...")` sem `re.MULTILINE`** em `:195` e `:205`. Hoje os 53
    arquivos comecam com H1 e funciona; um arquivo com frontmatter passa a gerar
    `\chapter` solto no meio do capitulo, em silencio.
13. **Duplicacao de `demote_headings()`** reescrita inline em `:208-217`.
14. **Import dinamico de `fix_accents_v3.py` sem validacao** (`fix_textual.py`
    :27-32): se o arquivo sumir ou `CANDIDATES` mudar de tipo, traceback cru.
15. **Chaves duplicadas e no-ops no dicionario** (cosmetico): `viuvo`/`viuva`/
    `viuvos`/`viuvas` e `media`/`carne`/`carnes` aparecem duas vezes; `vasectomia`
    `laqueadura`, `miomas`, `reunir`, `pericial` mapeiam para si mesmos (o filtro
    `k != v` ja os descarta).

---

# Livro de Atas — 7ª ferramenta da Área do Vicentino (22/09/2026)

Pedido: redigir as atas das reuniões na própria página, manter o histórico,
visualizar em HTML e exportar em ODT e PDF. Modelo: os dois lados da "MINUTA DA
ATA DA CONFERENCIA" impressa (fotos `ata- frente.jpeg` / `ata- verso.jpeg`).

Decisões tomadas com o usuário antes de codar:
presença por caixas de seleção sobre `confrades`; tesouraria pré-preenchida do
Controle Orçamentário mas editável e **gravada** na ata; só secretário /
presidente / vice / administrador lavram, e ata aprovada trava; PDF pela
impressão do navegador.

## O que foi entregue

| # | Arquivo | Papel |
|---|---|---|
| 1 | `supabase/migrations/20260922130000_atas.sql` | `public.atas` (24 colunas da minuta) + `pode_redigir_ata()` + RLS |
| 2 | `supabase/migrations/20260922130100_atas_presencas.sql` | `public.atas_presencas` + `ata_aberta_para_edicao()` |
| 3 | `supabase/migrations/20260922130200_atas_reabertura.sql` | **conserto** da reabertura (ver abaixo) + `pode_reabrir_ata()` |
| 4 | `app/assets/ata-documento.js` | fonte única do texto da minuta; devolve blocos em texto puro |
| 5 | `app/assets/ata-odt.js` | empacota o `.odt` (fflate via esm.sh) |
| 6 | `app/assets/ata-documento.css` | a folha na tela + `@media print` (é o que vira o PDF) |
| 7 | `app/ata.html` | editor + visualização + exportação + aprovação |
| 8 | `app/atas.html` | histórico e abertura de ata nova |
| 9 | `supabase/verificar-rls-atas.mjs` | prova da RLS, no molde do script do financeiro |

Registro da ferramenta nova: `DESTINOS` em `assets/area-vicentino.js` e em
`assets/ui-comum.js`, card em `area-vicentino.html`, e "seis ferramentas" → sete.
`mensagemDeErro()` ganhou as constraints de ata.

## Bug encontrado e corrigido durante a revisão (antes de ir ao ar)

A policy de UPDATE da migração 022 era
`using (pode_redigir_ata() and (status = 'rascunho' or is_admin()))`, e o
comentário ao lado afirmava que `is_admin()` era o caminho de reabertura. Era
falso: `pode_redigir_ata()` lê `confrades.papel` e `is_admin()` lê
`public.admins` — **cadastros independentes** (dito na própria migração 006). Com
o `and` por fora, reabrir exigia estar nos dois ao mesmo tempo, e na prática
**ninguém reabria** — enquanto `ata.html` mostrava o botão "Reabrir" com base só
em `is_admin()`. Botão visível que não fazia nada.

Conserto na migração 024: as duas perguntas viraram duas funções
(`pode_redigir_ata()` / `pode_reabrir_ata()`), a policy passou a
`(pode_redigir_ata() and status='rascunho') or pode_reabrir_ata()`, e a tela
passou a espelhar exatamente essa expressão em `podeEditarAgora()`.

## Evidências

- **Migrações aplicadas** no projeto `zyzyttkayblvgnfqkapq` (`db push` × 3).
- **RLS, fronteira anon**: `node supabase/verificar-rls-atas.mjs` → 6/6 OK
  (anon não lê nem escreve `atas`/`atas_presencas`, não executa as três RPCs).
- **Documento**: 47/47 num teste de mesa sobre `ata-documento.js` — todas as
  frases fixas da minuta, fuso da data (19, não 18), campo vazio virando lacuna
  e não `"null"`, escape de `<script>`, `&` e aspa.
- **ODT**: 11/11 na inspeção do pacote (`mimetype` é o 1º membro e está
  *Stored*; CRC de todos os membros; os 4 XML bem formados; sem U+FFFD;
  caractere de controle removido; as 3 notícias viram 3 `<text:p>`) **e o
  LibreOffice abriu e converteu o arquivo para PDF sem erro**, com acentuação
  correta e layout fiel ao modelo de papel.
- **Navegador** (Chrome, servidor local): os módulos carregam, o `fflate` do
  esm.sh resolve, o ODT é gerado na página (3.142 bytes); `destinoSeguro()`
  aceita `ata.html?id=<uuid>` e recusa externo e `?nova=1`; o CSS do documento
  não sofre interferência da página; no modo impressão o topo e a barra somem,
  `.wrap`/`.painel` são neutralizados e as quebras de página ficam protegidas.
- **Consistência**: script cruzando os 24 campos editáveis da migração com o
  formulário, o `salvar()` e o documento — 100% cobertos; nenhum `id` referenciado
  no JS sem existir no HTML; nenhum `<label for>` órfão.

## O que NÃO foi verificado — precisa das contas de teste

As seções 2, 3 e 4 de `verificar-rls-atas.mjs` ficaram **puladas**: exigem contas
de teste que não estão versionadas (mesma exigência de
`verificar-rls-financeiro.mjs`). Falta provar ao vivo:

- confrade comum lê a ata mas não a lavra;
- secretário cria, edita e aprova;
- **a trava**: ata aprovada recusa UPDATE e recusa mudança de presença;
- a reabertura consertada na 024;
- e, na interface, o ciclo completo salvar → aprovar → reabrir.

Para rodar (criando antes os usuários no Dashboard e as linhas em `confrades`):

```
SECRETARIO_EMAIL=... SECRETARIO_SENHA=... \
CONFRADE_EMAIL=...   CONFRADE_SENHA=... \
NAO_CONFRADE_EMAIL=... NAO_CONFRADE_SENHA=... \
node supabase/verificar-rls-atas.mjs
```

O script cria atas com `numero >= 990000` e, como `atas` não tem grant de
DELETE, **imprime no fim o SQL de limpeza** — ou limpa sozinho se receber
`SUPABASE_SERVICE_ROLE_KEY`.

## Riscos residuais e próximos passos

1. **A primeira ata precisa do número certo.** O livro de papel vai até a 243;
   a tela só sugere `max(numero)+1` depois que existir uma ata. Na primeira, a
   secretária digita.
2. **O ODT sai sem a bandeira** do cabeçalho (a tela e o PDF têm). Embutir
   imagem em ODF exige membro binário em `Pictures/`, entrada no manifesto e um
   `<draw:frame>`. Melhoria possível, custo pequeno, não urgente.
3. **`saldo_inicial_financeiro` segue sem linha** (item já aberto acima). Até
   ela existir, o "Sugerir a partir do Financeiro" propõe saldo anterior vazio
   na primeira ata.
4. **Relatório de frequência** ("quem faltou quantas vezes") agora é possível —
   o dado existe em `atas_presencas` —, mas a tela é outra tarefa.
5. Ata de Conselho Particular não está contemplada; esta minuta é a da
   Conferência.

## Achados fora do escopo

- **`supabase/README.md` omitia 5 migrações** na tabela de instalação
  (`confrades_papel_administrador`, `area_vicentino_acesso_unico`,
  `fix_vw_renda_familiar_rls_bypass`, `financeiro_revoke_consistencia`,
  `prontuario_sem_campos_obrigatorios`). Quem seguisse aquelas instruções
  montaria um banco **sem `is_membro_area()`**, de que a Área inteira depende.
  Trivial e contido → **corrigido**, em commit separado.
