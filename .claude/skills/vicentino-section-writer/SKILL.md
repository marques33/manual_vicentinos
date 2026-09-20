---
name: vicentino-section-writer
description: Use ao escrever ou reescrever seções/capítulos novos do Manual Vicentino, ou ao criar arquivo `.md` em qualquer pasta `0X-*`. Garante que o texto siga a voz do manual (acessível, prática, "passo a passo"), a estrutura padrão de capítulo e as convenções de markdown do projeto.
---

# Como escrever uma seção do Manual Vicentino

Público-alvo: **pessoa em situação de vulnerabilidade**, geralmente de baixa escolaridade, que vai ler isto buscando uma resposta concreta — "onde vou, o que levo, quem chamo".

## Voz e tom

- **Você**, não "o(a) usuário(a)" nem "o(a) leitor(a)".
- Frases curtas. Verbos no imperativo quando der instrução: "Vá ao CRAS", "Leve o CPF", "Ligue 180".
- Zero juridiquês sem tradução. Se citar artigo de lei, traduzir o que ele significa em uma frase.
- Sem floreio. Sem "vale ressaltar", sem "é importante notar". Vai direto.
- Tom acolhedor, nunca paternalista. "Você tem direito a", não "lhe é assegurado".

Quando precisar enfatizar:
- **negrito** para termos-chave que a pessoa vai procurar (CadÚnico, BPC, CRAS).
- `> blockquote` para alertas e resumos importantes.
- Tabela para listar documentos, telefones, endereços.

## Estrutura padrão de uma seção (`0X-<seção>/0Y-tema.md`)

```markdown
# <Nome do Tema>

## O Que É <o tema>?
Parágrafo explicando em linguagem comum. Pode terminar com:
> **Resumo:** uma frase prática.

---

## Quem Pode <ter direito / solicitar / ser atendido>?
Lista de critérios objetivos (renda, idade, situação).

---

## Documentos Necessários
Tabela ou lista. Marcar obrigatório vs. desejável.

---

## Passo a Passo: Como <fazer X>
**PASSO 1** — ...
**PASSO 2** — ...
(Negrito no "PASSO N", separadores em em-dash)

---

## Onde Ir no DF
Tabela: nome | endereço | telefones.

---

## Telefones Úteis
| Serviço | Telefone / Canal |
|---------|------------------|

---

## Base Legal
- Lei nº X.XXX/AAAA — descrição em uma frase.
- Súmula X STJ — texto literal entre aspas, depois explicação.

---

*Informações atualizadas em <mês> de <ano>. Valores e critérios podem mudar. Confirme sempre nos canais oficiais.*
```

Nem toda seção precisa de todas as caixas. Mas a ordem acima é fixa quando aparecem.

## Convenções de markdown do projeto

- H1 (`#`) único, no topo, é o título da seção. **Nunca** dois H1 no mesmo arquivo (o builder PDF promove H1 para `\chapter`).
- H2 (`##`) para blocos principais. H3 (`###`) só dentro de tabelas/listas grandes.
- `---` (três hífens) entre blocos principais.
- Tabelas com pipes `|` — sempre com cabeçalho. Builder PDF (xelatex) renderiza tudo o que for tabela GFM.
- Links internos: `[Texto](04-rede-protecao-df.md)` — nome de arquivo **sem acentos**.
- Listas com `-` (não `*`).
- Citação literal de lei/súmula: `> *"texto literal"* — Súmula 309 STJ`.

## Convenções específicas deste manual

- Sempre fechar com **rodapé de validade**: `*Informações atualizadas em <mês>/<ano>. Valores e critérios podem mudar. Confirme sempre nos canais oficiais.*`
- Em seção que cita valor monetário, escrever **R$ X.XXX,XX (em <ano>)** — deixa explícito que pode defasar.
- Citar **fonte oficial** ao falar de telefone que pode variar (ex: "Site: https://www.sedes.df.gov.br/cras").
- Quando há contato de **emergência**, destacar em blockquote no topo da seção:
  > **Em emergência: ligue 190 (PM) ou 180 (Central da Mulher).**

## Após criar/editar uma seção

1. **Linkar a partir do README.md** da raiz e do README.md da pasta da seção.
2. **Sincronizar** com `app/content.js` (ver skill `vicentino-content-sync`).
3. **Auditar fatos** citados (ver skill `vicentino-fact-checker`) — leis, telefones, valores.
4. **Adicionar ao `SECTIONS`** no `build_pdf_abnt.py` se for arquivo novo (ordem importa, é o sumário do PDF).
5. **Rebuild PDF** (ver skill `vicentino-pdf-build`).

## Anti-padrões observados no projeto (não repetir)

- "Reune" (sem acento) — escrever **reúne**.
- "Voce", "comecar", "atencao" — escrever **você, começar, atenção**.
- "(a) responsável familiar" — escrever **a Responsável Familiar** (pessoa concreta, não fórmula burocrática).
- Mencionar lei sem dizer o que ela faz.
- Endereço sem CEP nem ponto de referência (público-alvo às vezes não usa app de mapa).

## Exemplo de cabeçalho-modelo (copy-pasteable)

```markdown
# <Tema>

## O Que É <Tema>?

<Parágrafo de 3-5 linhas. Defina sem juridiquês.>

> **Resumo:** <uma frase prática que o leitor leva consigo>.

---

## Quem Pode <Solicitar/Ter Direito>?

- <critério 1>
- <critério 2 com valor monetário e ano: até R$ X em 2026>

---
```

Lembrete final: este manual está nas mãos de pessoas que precisam dele para sobreviver. Cada palavra ambígua é uma porta fechada.
