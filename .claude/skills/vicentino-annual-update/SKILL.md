---
name: vicentino-annual-update
description: Use no início de cada ano civil ou quando sair novo decreto de salário mínimo. Atualiza todos os valores monetários, datas e tabelas que dependem do ano vigente em todos os arquivos do manual (markdown, content.js, JSON-LD). Lista exaustiva de pontos a tocar — evita que algum valor "antigo" fique no manual.
---

# Atualização anual do Manual Vicentino

Manual cita valores em **R$ X (em AAAA)** dezenas de vezes. Salário mínimo muda anualmente por decreto (geralmente publicado em dezembro/janeiro). Quase todos os valores assistenciais derivam dele.

## Gatilhos para rodar esta skill

- Início de novo ano civil.
- Publicação de novo decreto de salário mínimo (verificar https://www.in.gov.br).
- Portaria Interministerial MPS/MF anual (geralmente em janeiro) — atualiza tetos previdenciários e auxílio-reclusão.
- Reajuste do Bolsa Família ou criação de novo benefício federal.

## Valores-âncora (bater nas fontes antes de editar)

| Item | Onde está | Fonte oficial |
|------|-----------|---------------|
| Salário mínimo | https://www.gov.br/trabalho-e-emprego (decreto anual) | Diário Oficial |
| Teto INSS / salário-de-contribuição | Portaria Interministerial MPS/MF | https://www.in.gov.br |
| Auxílio-Reclusão (limite de baixa renda) | Mesma portaria | — |
| Bolsa Família — valor mínimo | Lei 14.601/2023 + atos do MDS | https://www.gov.br/mds |

Salário mínimo derivados (calcular sempre com 4 casas, arredondar para 2):
- ½ SM (limite per capita CadÚnico/BF)
- ¼ SM (limite per capita BPC)
- 3 SM (renda total CadÚnico)
- 1 SM (BPC, salário-maternidade mínimo, etc.)

## Mapa de onde cada valor aparece

### Salário mínimo (R$ literal)

```bash
grep -rn "R\$ 1\.621" .  # ano 2026 — substituir pelo valor antigo
grep -rn "1\.621,00" .
```

Locais conhecidos:
- `01-beneficios-sociais/01-cadastro-unico.md` — limite per capita e total
- `01-beneficios-sociais/03-bpc-loas.md` — valor do benefício
- `01-beneficios-sociais/05-auxilio-reclusao.md` — referência
- `01-beneficios-sociais/06-beneficios-df.md` — programas DF
- `05-previdencia-social/*` — múltiplos
- `app/content.js` — espelho de tudo acima

### Tabelas-síntese (anualizar lastmod)

| Arquivo | Campo |
|---------|-------|
| `README.md` | "Última atualização: <mês>/<ano>" no rodapé |
| Cada `0X-*/README.md` | "Informações atualizadas em <mês>/<ano>" no rodapé |
| Cada `0X-*/0Y-*.md` | Mesma linha de rodapé |
| `app/content.js` | `home.content` espelha o README — atualizar lá também |
| `app/sitemap.xml` | `<lastmod>` em todas as URLs |
| `build_pdf_abnt.py` linha ~136 | `'date: "Brasília, <mês> de <ano>"'` |

### Schema.org JSON-LD (`app/index.html`)

- `Event` — atualizar `startDate`/`endDate` se houver almoço/evento novo (não confundir com atualização anual genérica).
- Conferir se URL canônica e telefone da Paróquia continuam corretos.

## Procedimento

1. **Coletar valores novos** das fontes oficiais. Anotar URL e data de consulta.
2. **Calcular derivados** do novo salário mínimo (½, ¼, 3 SM).
3. **Build de mapa de mudanças** — uma tabela `valor antigo → valor novo` antes de editar.
4. **Substituir nos `.md`** seção por seção. Conferir frase explicativa: às vezes a defasagem está no texto ("até R$ 810,50 em 2026" → "até R$ <novo> em <ano>"), não só no número.
5. **Sincronizar `app/content.js`** (ver skill `vicentino-content-sync`).
6. **Atualizar `build_pdf_abnt.py`** (linha do `date:`).
7. **Atualizar rodapés** "Última atualização" em todos os READMEs e arquivos de seção.
8. **Atualizar `app/sitemap.xml`** com a data de hoje.
9. **Atualizar `AUDITORIA_FATOS.md`** — datar nova auditoria, marcar valores conferidos com URL+data.
10. **Rebuild PDF** (ver skill `vicentino-pdf-build`).
11. **Smoke test no app** (`python -m http.server` em `app/` ou deploy preview Vercel).
12. **Commit único** com mensagem `chore: atualização anual <ano> — salário mínimo R$ X`.

## Armadilhas

- **Não trocar só o número.** A frase "(em 2026)" também precisa virar "(em 2027)". Caso contrário, o leitor vê o valor novo "etiquetado" como ano antigo e desconfia.
- **Bolsa Família não vai automaticamente para 1 SM.** Tem regra própria (R$ 600 mínimo + adicionais). Conferir lei vigente, não inferir.
- **Auxílio-Reclusão tem dois limites distintos**: o salário-de-contribuição máximo do segurado (Portaria) e o valor do benefício (1 SM dividido entre dependentes). Não confundir.
- **DF tem benefícios próprios** que podem não ter reajuste no mesmo dia (DF Social, Cartão Material Escolar). Conferir Portaria SEDES/DF antes de presumir.
- **Súmulas e leis não mudam por ano** — mas sua redação pode ser alterada por nova lei. Após qualquer reforma, rodar também `vicentino-fact-checker`.

## Critério de aceitação

Tarefa termina quando:
- `grep -rn "<valor antigo>" .` retorna zero resultados (excluindo `AUDITORIA_FATOS.md` histórico).
- Todos os rodapés "Informações atualizadas em..." têm a nova data.
- PDF rebuildado abre e o sumário mostra o novo `date:`.
- App carrega no navegador sem erro de console.
- `git diff` foi revisado e não tem `2025` ou ano antigo solto em texto.
