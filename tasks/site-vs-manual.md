# Relatório — `app/content.js` está fora de sincronia com os `.md`

Levantado em 20/09/2026, **sem alterar a estrutura do site** (a pedido).
Correções pontuais de fato já foram aplicadas e estão no ar: telefone da
Defensoria e valores do Bolsa Família. O que resta é a divergência estrutural.

---

## O que é o `content.js`

`app/manual.html` não lê os arquivos `.md`. Ele carrega
`<script src="content.js">` (linha 845), um objeto único `MANUAL_CONTENT` de
~344 KB que **embute uma cópia do texto** de cada capítulo.

Ou seja: os `.md` são a fonte para o PDF e para o repositório, mas o site serve
uma cópia paralela. Nada garante que as duas andem juntas — e hoje não andam.

## Situação medida

| | |
|---|---|
| Blocos de conteúdo no site | 43 |
| Idênticos ao `.md` correspondente | **0** |
| Divergentes, com `.md` de mesmo nome | 34 |
| Sem `.md` de mesmo nome (seções-índice) | 9 |

As diferenças vão de 14 a 445 caracteres. As maiores são conteúdo que entrou
nos `.md` e nunca chegou ao site:

| Bloco | site | `.md` | diferença |
|---|---:|---:|---:|
| `02-auxílio-incapacidade` | 8.675 | 9.120 | **+445** |
| `05-auxílio-reclusão` | 6.495 | 6.815 | **+320** |
| `04-salário-maternidade` | 6.359 | 6.570 | +211 |
| `03-pensão-por-morte` | 7.019 | 7.189 | +170 |
| `03-bpc-loas` | 8.871 | 9.034 | +163 |

Somam-se a isso as ~1.100 linhas de acentuação corrigidas nos `.md` nesta
sessão, que o site ainda não tem.

## A armadilha: as 9 seções-índice

Estes nove blocos **não têm `.md` de mesmo nome**:

```
01-benefícios-sociais   02-violência-doméstica   03-crianças-adolescentes
04-direito-saúde        05-previdência-social    06-direito-consumidor
07-noções-direito-penal 08-acesso-justiça        09-direitos-fundamentais
```

E não são os `README.md` das pastas, como parece à primeira vista. Conferido:
o bloco `01-benefícios-sociais` contém o texto do **Cadastro Único**, não o
índice da seção. Ou seja, a correspondência id → arquivo **não é** uma regra
simples de nome.

**Por isso uma regeneração ingênua apagaria conteúdo.** Qualquer script que
faça "para cada bloco, pegue o `.md` de mesmo nome" vai escrever o índice da
seção por cima do capítulo do Cadastro Único, ou deixar os nove blocos vazios.

Outro detalhe: os `id:` do site são **acentuados** (`01-benefícios-sociais`)
enquanto as pastas em disco não são (`01-beneficios-sociais`). Os ids são
internos à navegação do site e hoje funcionam; mas eles impedem o casamento
direto por nome de arquivo.

## Caminhos possíveis

1. **Gerador com mapa explícito** (recomendado). Um script que leia os `.md` e
   escreva o `content.js`, com o mapa id → arquivo declarado à mão para os 43
   blocos, incluindo os 9 casos especiais. Depois disso o site passa a ser
   derivado, e a divergência não volta. Custo: meio dia, e precisa de uma
   conferência bloco a bloco na primeira execução.
2. **Sincronizar só os 5 blocos com conteúdo faltando** e aceitar que o site
   fica sem as correções de acento por ora. Contido, mas não resolve a causa.
3. **Deixar como está** e tratar `content.js` como fonte independente — exige
   disciplina de editar nos dois lugares, que é justamente o que falhou até
   aqui.

Existe uma skill `vicentino-content-sync` no projeto; vale ler antes de
escrever qualquer gerador, pode já descrever o mapa.

## Já corrigido e no ar (não faz parte da pendência)

- Telefone da Defensoria: 72 ocorrências no `content.js`, incluindo 14 de um
  número ainda mais antigo, o (61) 3318-2000.
- Bolsa Família: valores do Decreto 13.120/2026 e aviso de vigência.
- Verificado logado em produção: 9 seções carregam, 0 erros de console.
