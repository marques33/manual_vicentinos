---
name: vicentino-fact-checker
description: Use ao auditar leis, súmulas, valores monetários, telefones ou endereços citados no Manual Vicentino. Dispara em pedidos como "auditar fatos", "verificar leis", "conferir telefones", após edições em conteúdo jurídico ou antes de deploy. Cruza informações com fontes oficiais e atualiza AUDITORIA_FATOS.md.
---

# Auditoria de Fatos — Manual Vicentino

Manual jurídico orienta pessoas vulneráveis no DF. **Erro factual = pessoa perde direito real.** Verificação não é opcional.

## Fontes oficiais (ordem de prioridade)

| Tipo | Fonte canônica |
|------|----------------|
| Leis federais | https://www.planalto.gov.br |
| Súmulas STJ | https://www.stj.jus.br/sites/portalp/Jurisprudencia/Sumulas |
| Jurisprudência STF | https://portal.stf.jus.br |
| Leis e atos do DF | https://www.sinj.df.gov.br |
| Defensoria DF | https://www.defensoria.df.gov.br |
| Programas sociais GDF | https://www.sedes.df.gov.br |
| INSS / MDS | https://www.gov.br/inss + https://www.gov.br/mds |
| TJDFT | https://www.tjdft.jus.br |

## Erros críticos já catalogados (verificar se ainda estão no projeto)

`AUDITORIA_FATOS.md` lista 3 erros críticos. **Antes de auditar do zero, conferir se foram corrigidos:**

1. **Lei 14.987/2024 → Lei 14.994/2024** (descumprimento de medida protetiva). Locais conhecidos: `app/content.js` linhas ~1860/1865/1923, `02-violencia-domestica/03-medidas-protetivas.md` linhas ~107/112/170.
2. **Feminicídio agora é crime autônomo** (art. 121-A CP, pena 20-40 anos, Lei 14.994/2024). Local: `06-feminicidio-stalking.md` e `app/content.js` ~linha 2431.
3. **Defensoria DF — telefones.** Conferidos em 20/09/2026 contra o site da
   DPDF, a página CRC/DPDF do TJDFT e o portal `nahora.df.gov.br`:

   | Canal | Número | Observação |
   |---|---|---|
   | Disque Defensoria (dentro do DF) | **129** | seg–sex, 9h–12h25 e 13h15–16h55 |
   | CRC — ligações **de fora do DF** | **(61) 3465-8200** | trocado em 25/06/2024 |
   | WhatsApp — Núcleo de Assistência Jurídica da CRC | (61) 98100-7200 | canal oficial desde 10/03/2026 |
   | WhatsApp — plantão | (61) 99359-0015 | |

   **Obsoletos, nunca reintroduzir:** (61) 2196-4300, (61) 3318-4300,
   (61) 3105-9200, (61) 3318-2000.

   > **Esta entrada já causou um erro real.** Até 20/09/2026 ela mandava usar
   > **(61) 2196-4300** como número atual da CRC, e esse número — desativado
   > desde junho de 2024 — foi propagado para 35 arquivos do manual e 58
   > pontos de `app/content.js`. Também dava **162** como canal interno da
   > Defensoria; 162 é a Ouvidoria-Geral do GDF, não a DPDF. Antes de citar
   > qualquer telefone daqui, reconfira na fonte: número de atendimento
   > envelhece e esta tabela é memória, não evidência.

## Valores monetários 2026 (anchor de verificação)

| Item | Valor 2026 | Base legal |
|------|-----------|------------|
| Salário mínimo | R$ 1.621,00 | Decreto 12.797/2025 |
| BPC/LOAS | R$ 1.621,00 (1 SM) | Lei 8.742/1993 |
| Bolsa Família mínimo | R$ 600,00 | Lei 14.601/2023 |
| Primeira Infância (BF) | R$ 150,00/criança | — |
| DF Social | R$ 150,00/mês | Lei DF 6.466/2020 |
| BPC — limite per capita | R$ 405,25 (¼ SM) | — |
| Bolsa Família — limite per capita | R$ 810,50 (½ SM) | — |
| CadÚnico — limite per capita | R$ 810,50 (½ SM) | — |
| CadÚnico — limite total | R$ 4.863,00 (3 SM) | — |
| Auxílio-Reclusão — teto salário-de-contribuição | R$ 1.980,38 | Portaria Interministerial MPS/MF 13/2026 |

Antes de validar valores, conferir o ano corrente — se ano ≠ 2026, todos os valores acima podem estar defasados.

## Telefones nacionais conferidos

`190`, `192`, `193`, `180`, `100`, `136` (SUS), `135` (INSS), `151` (PROCON-DF), `121` (Disque Social), `156` (Central GDF), `116` (Neoenergia), `162` (Defensoria DF interno).

## Itens **não** verificados definitivamente (reconfirmar caso a caso)

- Aluguel Social DF — (61) 3181-1467 ❓
- Passe Livre DF — (61) 3181-1470 ❓ (alternativa: BRB Mobilidade (61) 3120-9500)
- Ramais individuais dos 30 CRAS (prefixo (61) 3773-7XXX é plausível)
- Nomes de fóruns TJDFT (Ceilândia, Gama, Recanto das Emas)

## Procedimento de auditoria

1. **Localizar afirmação**: lei, súmula, valor ou telefone com referência exata (`arquivo.md:linha`).
2. **Buscar fonte oficial** na tabela acima. Se não encontrar fonte oficial → marcar como **não verificado**.
3. **Citar URL e data de consulta** ao registrar correção.
4. **Comparar redação literal** quando for súmula ou artigo de lei (não parafrasear).
5. **Atualizar `AUDITORIA_FATOS.md`** com mesma estrutura: 🔴 Crítico / ⚠️ Recomendado / ⏳ Não verificado / ✅ OK.
6. **Aplicar correção em ambos os caminhos**: o `.md` da seção **e** `app/content.js` (ver skill `vicentino-content-sync`).

## Armadilhas comuns

- Súmula STJ 309 — redação literal: "as 3 prestações **anteriores ao ajuizamento da execução** + as vencidas no curso do processo". Manual frequentemente diz "3 últimas + mês corrente" — impreciso.
- Vedação a **cesta básica** em violência doméstica vem do **art. 17 da Lei 11.340/2006**, não da Súmula 588 STJ.
- Súmula 536 STJ veda **suspensão condicional do processo e transação penal** — não "acordos" em geral.
- **Estatuto do Idoso** foi renomeado para **Estatuto da Pessoa Idosa** (Lei 14.423/2022) — Lei 10.741/2003 segue válida.
- WhatsApp/celular de plantão (Defensoria, Conselho Tutelar) muda com frequência; reconfirmar antes de imprimir PDF.

## Saída esperada

Relatório no formato `AUDITORIA_FATOS.md`, agrupado por criticidade, com:
- Localização (`arquivo:linha`)
- Erro
- Correção recomendada
- URL da fonte oficial e data de consulta

Nunca declarar tarefa concluída sem ter aberto a URL oficial. Citação de memória ≠ verificação.
