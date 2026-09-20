---
name: vicentino-content-sync
description: Use ao editar qualquer arquivo `0X-*/*.md` ou `app/content.js`. O manual tem fonte dupla — markdown (canônica, gera PDF) e JS embutido (web app no Vercel). Esta skill mantém os dois sincronizados, mapeia IDs, alerta para drift de acentuação, e impede que correções fiquem "pela metade".
---

# Sincronização Markdown ↔ content.js

O manual existe em **dois caminhos paralelos**. Editar um sem o outro = bug em produção.

## Fontes

| Caminho | Conteúdo | Consumido por |
|---------|----------|---------------|
| `0X-<seção>/*.md` | Markdown canônico, com acentos corretos | Builder PDF (`build_pdf_abnt.py`), repositório, GitHub render |
| `app/content.js` | Mesmo conteúdo em template literals dentro de `MANUAL_CONTENT` | Web app `app/index.html`/`app/manual.html` (Vercel) |

**Markdown é a fonte da verdade.** Quando há divergência, `content.js` é que está errado.

## Estrutura de `app/content.js`

```js
const MANUAL_CONTENT = {
  home: { title, content },          // espelha README.md raiz
  sections: [
    {
      id: `01-benefícios-sociais`,    // ATENÇÃO: id COM acentos
      title, icon, readme,            // readme = conteúdo de 01-beneficios-sociais/README.md
      pages: [
        {
          id: `01-cadastro-único`,    // id COM acentos
          title,
          content: `...markdown...`,  // espelha 01-beneficios-sociais/01-cadastro-unico.md
        },
        ...
      ]
    },
    ...
  ]
}
```

## Mapeamento de paths (armadilha #1: acentos)

Nomes de arquivo no disco usam **ASCII** (sem acento). IDs em `content.js` usam **acentos**.

| Disco | id em content.js |
|-------|------------------|
| `01-beneficios-sociais/` | `01-benefícios-sociais` |
| `01-beneficios-sociais/01-cadastro-unico.md` | `01-cadastro-único` |
| `02-violencia-domestica/` | `02-violência-doméstica` |
| `02-violencia-domestica/04-rede-protecao-df.md` | `04-rede-proteção-df` |
| `03-criancas-adolescentes/` | `03-crianças-adolescentes` |
| `04-direito-saude/` | `04-direito-saúde` |
| `05-previdencia-social/` | `05-previdência-social` |

Use `grep -n "id: \`" app/content.js` para listar todos os IDs antes de edições estruturais.

## Drift conhecido (armadilha #2: caracteres já degradados)

Em algum ponto, parte de `app/content.js` foi processado por um script que **trocou acentos por ASCII** (provavelmente `fix_accents*.py`). Resultado: trechos no JS aparecem como "reune", "informacoes", "comecar", "porta de entrada", "voce", enquanto o markdown ainda tem "reúne", "informações", "começar", "você".

**Implicação:** comparação literal byte-a-byte vai sempre acusar diferença. Antes de "corrigir" o JS, verifique se a única diferença são acentos — nesse caso, restaurar acentos do markdown.

Use comparação **normalizada** (sem acentos) para detectar divergências reais de conteúdo:

```bash
python -c "import unicodedata,sys; t=open(sys.argv[1],encoding='utf-8').read(); print(unicodedata.normalize('NFKD',t).encode('ascii','ignore').decode())" arquivo.md
```

## Procedimento de sync

### Editou um `.md` da seção
1. Localizar bloco correspondente em `content.js` via `grep -n "id: \`<id-com-acentos>\`"`.
2. Substituir `content:` do bloco com o markdown atualizado (preservando acentos do `.md` original).
3. Conferir que `title` casa com o H1 do markdown.
4. Se mudou link interno (ex: `[X](04-rede-protecao-df.md)`): no JS, esse link aponta para `id` do roteador — manter sintaxe que o app espera.

### Editou `app/content.js`
1. Anti-padrão. Antes de continuar, perguntar: por que não no `.md`?
2. Se for só correção pontual urgente (deploy travado): replicar a correção no `.md` na mesma sessão.

### Edição que cruza várias seções (refactor)
1. Editar todos os `.md` primeiro.
2. Rodar diff normalizado contra `content.js` para gerar lista completa de divergências.
3. Aplicar todas no JS de uma vez (commit único).
4. Build PDF (`vicentino-pdf-build`) para validar markdown.
5. Abrir `app/index.html` ou rodar `python -m http.server` em `app/` para validar JS no navegador.

## Telefones e valores aparecem em **três** lugares

1. README.md raiz — tabela "Telefones Úteis"
2. README.md de cada seção — tabela local
3. `0X/0Y-*.md` — citações no corpo
4. `app/content.js` — espelho completo
5. `app/index.html` — schema.org JSON-LD (`telephone` da Paróquia)

Ao mudar telefone (ex: Defensoria), grep o número antigo em **todos** os caminhos:

```bash
grep -rn "3318-4300" .
```

## Checklist pré-commit

- [ ] Edição feita no `.md` (canônico)
- [ ] `app/content.js` espelha a mudança
- [ ] Acentos preservados (não regredir para ASCII)
- [ ] Links internos do markdown ainda batem com IDs do JS
- [ ] Tabelas de telefones consistentes em README raiz, README da seção e corpo
- [ ] Build PDF roda sem erro (apenas se tocou estrutura — H1, H2, listas)

Tarefa só termina quando os dois caminhos passam.
