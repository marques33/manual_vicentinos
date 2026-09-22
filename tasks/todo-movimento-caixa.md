# Movimento de Caixa — as 36 linhas do formulário oficial dentro da ata

## Origem

Foto do formulário de papel `orçamento-manual.jpeg`: **"Movimento de Caixa"**,
Conselho Metropolitano de Brasília/DF, semana de 22/08/2026, referente à Ata
nº 240. É a folha que a tesoureira preenche toda semana e envia ao Conselho
Particular — documento distinto da *minuta da ata*, e muito mais detalhado.

## O buraco

`public.atas` (migração 022) grava **9 valores** de caixa, vindos da minuta:
`saldo_anterior`, `coleta`, `outras_fontes`, `soma_receita`,
`auxilio_assistidos`, `despesas_diversas`, `decima`, `soma_despesa`,
`saldo_atual`.

Esses 9 são uma *compressão* das 36 linhas do Movimento de Caixa. O que se
perde:

| Bloco do papel | Linhas | Estado hoje |
|---|---|---|
| Receitas | 1–15 | comprimido em `coleta` + `outras_fontes` |
| Despesas | 16–30 | comprimido em `auxilio_assistidos` + `despesas_diversas` + `decima` |
| Distribuição de bens materiais | 31–33 | **não existe** — são quantidades (kg, unidades), não R$ |
| Resumo da situação do caixa | 34–36 | **não existe** |
| Contadores de assistência | 4 campos | **não existe** |
| Contadores de presença por categoria | 5 campos | `atas_presencas` é nominal; `confrades` não tem categoria |

Duas regras do papel que o modelo atual não representa:

1. **Linha 6 é a base de cálculo da décima** — só as linhas 1 a 5 entram nela.
   Hoje `decima` é número digitado solto, sem base declarada.
2. **Linha 30 (28+29) tem que bater com a linha 15 (13+14)** — é a conferência
   embutida no formulário. Na folha fotografada: 15 = 6.446,70 e
   30 = 510,70 + 5.936,00 = 6.446,70. ✓

## Decisões tomadas (confirmadas com o usuário)

- **Onde:** dentro de `atas`, não em módulo separado. Os 9 campos antigos
  **continuam existindo** e passam a ser **derivados** das 36 linhas no
  momento de salvar — ata antiga segue legível, e a prosa da minuta
  ("a tesoureira apresentou o estado do caixa…") continua funcionando sem
  reescrita.
- **Contadores:** os dois blocos entram. Os de presença saem de
  `atas_presencas`, com `categoria` nova em `confrades`.

## Mapeamento 36 linhas → 9 campos antigos

| Campo antigo | Passa a ser |
|---|---|
| `saldo_anterior` | linha 14 |
| `coleta` | linha 1 |
| `outras_fontes` | linha 13 − linha 1 |
| `soma_receita` | linha 13 |
| `auxilio_assistidos` | linhas 16 + 17 + 18 |
| `despesas_diversas` | linhas 19+20+21+22+23+25+26+27 |
| `decima` | linha 24 |
| `soma_despesa` | linha 28 |
| `saldo_atual` | linha 29 |

## Linhas calculadas × digitadas

**Calculadas** (readonly na tela, gravadas na linha — mesmo motivo dos totais
atuais: a ata impressa mostra números):
6 (=1..5) · 13 (=6..12) · 15 (=13+14) · 28 (=16..27) · 29 (=15−28) ·
30 (=28+29) · 36 (=29+34+35)

**Digitadas:** todas as demais.

Atenção às três que *parecem* calculadas e não são — o papel traz a fórmula
como **orientação**, e o valor gravado é o que de fato foi pago:
- **24** "(10% da linha 6)" → a tela mostra o esperado como dica, não força;
  a diferença entre o devido e o pago é justamente o que a **linha 34**
  ("décimas a serem enviadas") registra;
- **26** "(Linha nº 8)" e **27** "(referentes a linha 12)" → idem.

## Plano

- [x] 1. Migração `…_atas_movimento_caixa.sql` — 46 colunas novas em `atas`
      (29 de valor + 5 rótulos de linha em branco + 3 de bens + 4 contadores
      de assistência + `visitantes_qtd`), `numeric(10,2)` como o resto do
      módulo, todas anuláveis (rascunho no meio da reunião ≠ zero).
- [x] 2. Migração `…_confrades_categoria.sql` — `categoria` em `confrades`
      (`confrade` / `consocia` / `aspirante`), cópia congelada em
      `atas_presencas.categoria` (mesmo motivo de `nome`, migração 023) e
      policy de UPDATE em `confrades` para administrador — sem ela os
      cadastros existentes ficam todos em `confrade` sem conserto, e os
      contadores nascem errados.
- [x] 3. `app/ata.html` — bloco editor novo com as 36 linhas na ordem do
      papel, recálculo ao vivo, **aviso quando 15 ≠ 30**, dica de 10% na
      linha 24, contadores; `MAPA_CATEGORIA` do "Sugerir a partir do
      Financeiro" repontado para as linhas certas.
- [x] 4. `app/assets/ata-documento.js` — os 9 derivados + novo tipo de bloco
      `tabela`, para o Movimento de Caixa sair no documento.
- [x] 5. `app/assets/ata-odt.js` — `<table:table>` em ODF.
- [x] 6. `app/assets/ata-documento.css` — estilo da tabela, tela e impressão.
- [x] 7. `app/admin.html` + `supabase/functions/gerenciar-usuarios/index.ts` —
      categoria no cadastro e na edição do confrade.
- [x] 8. `supabase/README.md` — as duas migrações na tabela de instalação.
- [x] 9. Verificação (§4): script cruzando as colunas da migração com o
      formulário, o `salvar()` e o documento; conferência aritmética contra a
      folha fotografada (107,00 / 6.339,70 / 6.446,70 / 510,70 / 5.936,00);
      teste no navegador.

## Revisão — o que ficou

**Banco.** Migração 025: 47 colunas novas em `atas` (29 valores de linha, 5
rótulos de linha em branco, 4 de bens, 4 contadores de assistência e
`visitantes_qtd`). Migração 026: `confrades.categoria` e a cópia congelada
`atas_presencas.categoria`. Nenhuma policy nova — as colunas nascem dentro de
tabelas cujas policies já são por linha, e a ata aprovada tranca a folha junto.

**Código.** `app/assets/ata-movimento-caixa.js` (novo) é a definição da folha:
`LINHAS`, a aritmética das 7 linhas de conta, `derivarCaixaDaMinuta()`,
`conferirBalanco()` e `contarPresencas()`. `ata.html` GERA o formulário a
partir de `LINHAS` (id do campo = `mc-` + nome da coluna, o que elimina o mapa
id↔coluna e a classe de erro de gravar na coluna do vizinho).
`ata-documento.js` ganhou o bloco `tabela`; `ata-odt.js`, `<table:table>` em
ODF com cabeçalho repetido por página. `admin.html` + a Edge Function
`gerenciar-usuarios` (ação nova `atualizar_categoria`) cuidam do cadastro.

### Evidências (§4)

| Prova | Como | Resultado |
|---|---|---|
| Migração × módulo × formulário | `node supabase/verificar-movimento-caixa.mjs` | 47 colunas = 47 campos; 36 linhas em ordem; 7 de conta (6,13,15,28,29,30,36) |
| Aritmética × o papel | idem, seção 5 | linha 13 = 107,00 · 15 = 6.446,70 · 28 = 510,70 · 29 = 5.936,00 · 30 = 6.446,70 · décima 10,70 — bate com a folha de 22/08/2026 |
| Derivação fecha com a folha | idem, seção 6, inclusive com TODAS as 29 linhas preenchidas | os 3 campos de despesa da minuta somam a linha 28; coleta + outras fontes somam a 13 |
| Contadores | idem, seção 8 | 8 presentes, 7 consócias, 1 aspirante — o cabeçalho do papel |
| Sintaxe | `node --check` nos módulos e nos `<script type="module">`; `node --experimental-strip-types --check` na Edge Function | tudo OK; tags de `ata.html` e `admin.html` balanceadas |
| Documento e ODT | render em Node com dublês | 5 tabelas; XML bem formado; todo estilo citado declarado; toda linha com o mesmo nº de células; `mimetype` primeiro no zip |
| **Navegador** (Chrome, `ata.html` real com dublês de rede) | servidor local em porta livre | 36 linhas geradas; as 7 contas certas; "10% da linha 6 = R$ 10,70"; "Confere: linha 15 e linha 30 fecham em R$ 6.446,70"; os 9 campos derivados e travados |
| Gravação | `salvar()` interceptado | 72 colunas enviadas, **nenhuma** coluna de controle vazada; presença com `categoria` |
| Sugestão do Financeiro | botão clicado | cada categoria caiu na linha certa (1, 3, 16, 24) |

### Defeito encontrado e corrigido durante a verificação

Ao **esvaziar** o Movimento de Caixa depois de tê-lo preenchido, os nove campos
da minuta ficavam com o último valor derivado e — destravados — passavam a ser
o que a ata GRAVA. A ata sairia afirmando um caixa que ninguém digitou e cuja
origem acabara de ser apagada. Corrigido em `aplicarCaixaDerivado()`: a
transição derivado → digitado limpa os nove. Verificado no navegador (esvaziar
zera; voltar a preencher retoma a derivação e trava de novo).

## Riscos residuais e próximos passos

1. **Os cadastros existentes nascem todos como `confrade`.** A migração 026 usa
   esse default para preencher as linhas que já existiam — não é um palpite
   sobre elas. Enquanto não forem revistos em `app/admin.html`, o cabeçalho da
   folha conta a Conferência inteira numa linha só. É o primeiro passo depois
   do deploy.
2. **A Edge Function precisa ser reimplantada** — `npx supabase functions deploy
   gerenciar-usuarios` — senão a ação `atualizar_categoria` responde
   `acao_desconhecida` e o seletor de categoria falha em silêncio no cartão.
3. **"Ajuda a família" cai toda na linha 16** na sugestão a partir do
   Financeiro. O impresso separa cesta (16), moradia (17) e conta paga (18), e
   a categoria não distingue. A tela avisa. Resolver de verdade pediria
   categorias novas em `categorias_financeiras` — tarefa própria.
4. **A linha 30 só diverge da 15 por resíduo de arredondamento**, já que
   29 = 15 − 28 e 30 = 28 + 29. A conferência continua valendo (pega o
   resíduo), mas só vira teste de digitação se um dia a 29 virar campo
   digitado.
5. **As RLS das duas migrações não foram provadas ao vivo** — dependem das
   contas de teste que `verificar-rls-atas.mjs` já exige e que não estão
   versionadas. As colunas novas não trazem policy própria: herdam as da 022 e
   da 023, que aquele script cobre.
6. `verificar-rls-atas.mjs` **não conhece as colunas novas**. Ele prova a trava
   da ata aprovada, que vale igual para elas, mas não escreve nenhuma.

## Achados fora do escopo

Nenhum. Os arquivos tocados (`ata.html`, `ata-documento.js`, `ata-odt.js`,
`ata-documento.css`, `admin.html`, `gerenciar-usuarios/index.ts`) não
apresentaram defeito além do que esta tarefa introduziu e corrigiu.
