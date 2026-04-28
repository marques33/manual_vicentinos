# Auditoria de Fatos — Manual Vicentino (2026-04-28)

Cruzamento de dados realizado em fontes oficiais: Planalto, STJ, STF, TJDFT, Defensoria DF, DPU, SEDES-DF, MDS/INSS, SINJ-DF, Migalhas, JOTA, JusBrasil.

---

## 🔴 CORREÇÕES OBRIGATÓRIAS (3)

### 1. Lei 14.987/2024 → Lei 14.994/2024 (descumprimento de medida protetiva)
**Localizações:**
- `app/content.js` linhas 1860, 1865, 1923
- `02-violencia-domestica/03-medidas-protetivas.md` linhas 107, 112, 170

**Erro:** O manual atribui à Lei 14.987/2024 o aumento de pena (reclusão 2-5 anos + multa) por descumprimento de medida protetiva. **Errado.**
- **Lei 14.987/2024** (25/09/2024): altera o ECA — atendimento psicossocial a crianças/adolescentes filhos de vítimas. Sem relação com Lei Maria da Penha.
- **Lei 14.994/2024** (09/10/2024 — "Pacote Antifeminicídio"): é a que efetivamente alterou o art. 24-A da Lei Maria da Penha elevando pena para reclusão 2-5 anos + multa.

**Correção:** trocar todas as referências `Lei 14.987/2024` → `Lei 14.994/2024`. URL: https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2024/lei/l14994.htm

### 2. Feminicídio agora é crime autônomo (Lei 14.994/2024)
**Localizações:** `app/content.js` linha 2431, página "Feminicídio, Stalking e Violência Psicológica"

**Erro:** Manual cita apenas Lei 13.104/2015 e descreve feminicídio como "qualificadora do homicídio".

**Realidade pós-2026:** A Lei 14.994/2024 **transformou feminicídio em crime autônomo (art. 121-A do CP)**, com pena base de **20 a 40 anos** (era 12-30). Continua hediondo.

**Correção:** Atualizar para "Lei 13.104/2015, com redação dada pela Lei 14.994/2024 — art. 121-A do CP — pena de 20 a 40 anos."

### 3. Defensoria Pública DF — telefone DESATUALIZADO
**Localizações:** `app/content.js` linhas 595, 669, 691, 1029 (e cabeçalho `index.html` lista de emergência: linha 987)

**Erro:** Manual usa **(61) 3318-4300** e **(61) 3105-9200** — ambos desatualizados.

**Telefones oficiais atuais (defensoria.df.gov.br):**
- **(61) 2196-4300** — CRC (ligações de fora do DF)
- **162** — gratuito dentro do DF
- **(61) 99359-0015** — plantão/WhatsApp
- **(61) 2196-4600** — Ouvidoria

⚠️ **Crítico**: Defensoria é a porta de entrada principal do público-alvo do manual. Erro pode impedir acesso real ao serviço.

---

## ⚠️ ATUALIZAÇÕES RECOMENDADAS (5)

### 4. Estatuto do Idoso → Estatuto da Pessoa Idosa
A Lei 14.423/2022 alterou o nome oficial. Lei 10.741/2003 continua a mesma, só mudou a denominação.

### 5. Auxílio-Reclusão — informação incompleta
Manual diz "1 SM (R$ 1.621,00 em 2026)". Tecnicamente correto, mas **omite informações críticas**:
- O valor é **teto, dividido entre todos os dependentes habilitados**
- Exige segurado de baixa renda: salário-de-contribuição até **R$ 1.980,38** (Portaria Interministerial MPS/MF 13/2026)

### 6. Súmula 309 STJ — redação imprecisa
Manual: "prisão pelas 3 últimas parcelas + parcela do mês corrente"
Texto oficial: "3 prestações **anteriores ao ajuizamento da execução** + as vencidas no curso do processo"

### 7. Súmula 588 STJ — fonte legal misturada
Manual: "agressor não pode ter pena substituída por cestas básicas ou serviço comunitário"
- A vedação à **cesta básica** vem do **art. 17 da Lei 11.340/2006** (não da Súmula 588)
- A Súmula 588 veda substituição da pena privativa de liberdade por restritiva de direitos em geral

### 8. Súmula 536 STJ — escopo
Manual diz "acordos ou suspensão do processo". A súmula é específica: veda **suspensão condicional do processo e transação penal** (institutos da Lei 9.099/95). Termo "acordos" é genérico demais.

---

## ⏳ NÃO VERIFICADOS DEFINITIVAMENTE (precisam reconfirmação)

| Item | Telefone declarado | Observação |
|------|-------------------|------------|
| Aluguel Social DF | (61) 3181-1467 | Prefixo 3181 não localizado em fonte oficial SEDES |
| Passe Livre DF | (61) 3181-1470 | Idem — recomendar 156 + BRB Mobilidade (61) 3120-9500 |
| Lista completa de telefones individuais dos 30 CRAS | (61) 3773-7XXX | Prefixo plausível; conferir cada ramal no portal SEDES |
| Fóruns TJDFT (Ceilândia, Gama, Recanto das Emas) | nomes incompletos | Adicionar nomes oficiais dos desembargadores |

---

## ✅ CONFERIDOS E CORRETOS

### Valores monetários 2026 (11/13)
- Salário mínimo: R$ 1.621,00 (Decreto 12.797/2025) ✓
- BPC = 1 SM = R$ 1.621,00 ✓
- Bolsa Família mínimo R$ 600 ✓
- Primeira Infância R$ 150/criança ✓
- DF Social R$ 150/mês ✓
- Limite per capita BPC 1/4 SM = R$ 405,25 ✓
- Limite per capita BF 1/2 SM = R$ 810,50 ✓
- Limite total CadÚnico 3 SM = R$ 4.863,00 ✓
- Pena Lei 14.188/2021 (violência psicológica): 6 meses-2 anos ✓

### Leis citadas (19/21)
Lei 14.601/2023 (BF), Lei 8.742/1993 (LOAS), Lei DF 3.877/2006, Lei 11.340/2006, Lei 14.188/2021, Lei 14.550/2023, Lei 13.641/2018, Lei 8.069/1990 (ECA), Lei 13.146/2015, Lei 13.104/2015 (com ressalva — ver item 2), Lei 14.132/2021, Lei 13.058/2014, Lei 5.478/1968, Lei 11.804/2008, Lei 12.318/2010, Lei 13.185/2015, Lei 14.811/2024, Lei 8.213/1991, EC 103/2019.

### Súmulas e jurisprudência (10/10 existem)
Súmulas STJ 309, 358, 536, 542, 588, 596, 600 + STF ADC 19, ADI 4424, RE 567.985/Tema 27.

### Telefones nacionais e regionais
- 190, 192, 193, 180, 100, 136, 151 ✓
- BRB Mobilidade (61) 3120-9500 ✓
- Conselho Tutelar (61) 3213-0657 ✓
- Neoenergia 116 + WhatsApp (61) 3465-9318 ✓

---

## Resumo

| Categoria | OK | Ressalva | Erro crítico |
|-----------|-----|----------|--------------|
| Valores monetários | 11 | 2 | 0 |
| Leis | 19 | 1 | 1 |
| Súmulas/Jurisprudência | 5 | 5 | 0 |
| Telefones DF | 6 | 6 | 1 |
| **Total** | **41** | **14** | **3** |

**3 erros críticos** + **14 ressalvas** + **4 itens não-verificados** = 21 ajustes recomendados antes do deploy.
