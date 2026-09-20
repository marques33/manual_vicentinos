---
name: vicentino-pdf-build
description: Use ao gerar o PDF ABNT do manual ou ao validar mudanças estruturais antes de commit. Roda `build_pdf_abnt.py`, valida pré-requisitos (pandoc, xelatex), confere saída ABNT (NBR 14724/6024/10520/6023) e diagnostica erros comuns de build.
---

# Build do PDF ABNT — Manual Vicentino

Script: `build_pdf_abnt.py` (Python). Saída: `Manual_Vicentino_ABNT_v3.pdf` na raiz.

Especificação ABNT implementada:
- Papel A4, margens 3 cm sup/esq + 2 cm inf/dir (NBR 14724)
- Times New Roman 12 pt, espaçamento 1,5
- Recuo de parágrafo 1,25 cm, texto justificado
- Capa + folha de rosto + sumário automático
- Numeração progressiva (NBR 6024)
- Citações longas com recuo 4 cm (NBR 10520)
- Seção "Referências" consolidada (NBR 6023)

## Pré-requisitos

| Ferramenta | Verificar | Instalação |
|-----------|-----------|------------|
| Python 3.8+ | `python --version` | já presente |
| pandoc | `pandoc --version` | https://pandoc.org/installing.html |
| LaTeX com xelatex | `xelatex --version` | MiKTeX (Windows) ou TeX Live |
| Fonte Times New Roman | já no Windows | — |

Em Windows, MiKTeX é o caminho padrão. Após instalar, **abrir um novo terminal** para que o PATH atualize.

## Como rodar

```powershell
python build_pdf_abnt.py
```

O script:
1. Lê `README.md` (apresentação) + 9 pastas de seção em ordem.
2. Concatena em `build/manual_abnt.md` com YAML metadata pandoc.
3. Aplica `clean_md` (limpa caracteres problemáticos, rebaixa headings).
4. Gera `build/abnt_header.tex` e `build/abnt_titlepage.tex`.
5. Chama `pandoc --pdf-engine=xelatex` produzindo `Manual_Vicentino_ABNT_v3.pdf`.

## Validações pós-build

Abrir PDF e conferir:
- [ ] Capa com logo, brasão, "Manual Vicentino de Direitos e Auxílios"
- [ ] Folha de rosto com data correta (ver linha ~136 do script: `'date: "Brasília, <mês> de <ano>"'`)
- [ ] Sumário gerado, com numeração progressiva (1, 1.1, 1.1.1)
- [ ] Cada um dos 9 capítulos presentes, na ordem certa
- [ ] Tabelas renderizadas (não como texto bruto com pipes)
- [ ] Quebras de página entre capítulos
- [ ] Última página: seção "Referências" (NBR 6023) presente

## Diagnóstico de erros comuns

### `pandoc: xelatex not found`
xelatex não está no PATH. No Windows: instalar MiKTeX e abrir novo PowerShell. Em CI: `apt install texlive-xetex` (Linux).

### `! LaTeX Error: File '<pacote>.sty' not found`
MiKTeX vai oferecer instalar on-the-fly. Aceitar. Se rodando em modo silencioso, abrir MiKTeX Console → Settings → Always install missing packages.

### `! Package inputenc Error: Unicode character ... not set up`
Algum caractere chegou ao LaTeX sem ser tratado por `clean_md`. Localizar:
```bash
grep -rn "<caractere>" build/manual_abnt.md
```
Adicionar substituição em `clean_md` no script ou trocar o caractere no `.md` original.

### Tabela aparece como pipes literais
Tabela mal-formada — geralmente falta linha de separação `|---|---|` após o cabeçalho ou número de colunas inconsistente.

### Sumário com entradas duplicadas
Provável H1 duplicado em algum `.md` da seção. Manual exige um H1 por arquivo (vira `\chapter`). Rodar:
```bash
grep -rn "^# " 0*-*/*.md | grep -v "^.*:1:"
```

### Acentos quebrados na capa ou sumário
Geralmente o `clean_md` já trata, mas se aparecer, conferir se `_grafo_semantico.md` ou outro arquivo entrou na concatenação por engano. SECTIONS no script lista exatamente os arquivos que entram.

## Quando NÃO rodar este build

- Edição apenas em `app/content.js` ou `app/index.html` — esses não entram no PDF.
- Mudanças visuais do site web — independentes.

## Quando rodar

- Após qualquer edição em `0X-<seção>/*.md` ou `README.md` raiz.
- Após `vicentino-annual-update`.
- Antes de gerar release ou imprimir cópia física.
- Após `vicentino-fact-checker` aplicar correções.

## Output esperado

```
Gerando build/manual_abnt.md ...
Rodando pandoc ...
PDF gerado: Manual_Vicentino_ABNT_v3.pdf (XXX páginas)
```

Se PDF não foi atualizado (timestamp antigo), build silenciosamente falhou — conferir stderr.

## Não confundir com `Manual_Vicentino_Completo.pdf`

A raiz tem **dois PDFs**:
- `Manual_Vicentino_ABNT_v3.pdf` — gerado por `build_pdf_abnt.py` (este script).
- `Manual_Vicentino_Completo.pdf` — provável artefato anterior, não tem builder dedicado no projeto.

Esta skill cobre apenas o ABNT.
