# Grafo Semântico — Manual Vicentino de Auxílios e Direitos

## Nós Principais (Temas)

```
[PESSOA VULNERÁVEL]
    ├── [BENEFÍCIOS SOCIAIS]
    │   ├── Federais
    │   │   ├── BPC/LOAS
    │   │   ├── Bolsa Família
    │   │   ├── Seguro-Desemprego
    │   │   └── Auxílio-Reclusão
    │   ├── Distritais (DF)
    │   │   ├── Cartão Material Escolar
    │   │   ├── Passe Livre
    │   │   ├── CODHAB (habitação)
    │   │   ├── Tarifa Social (energia/água)
    │   │   └── Outros SEDES
    │   └── Cadastro Único (CadÚnico)
    │       └── CRAS (porta de entrada)
    │
    ├── [PROTEÇÃO CONTRA VIOLÊNCIA]
    │   ├── Violência Doméstica
    │   │   ├── Lei Maria da Penha
    │   │   ├── Medidas Protetivas
    │   │   ├── Feminicídio
    │   │   └── Stalking
    │   ├── Violência contra Idosos
    │   ├── Violência contra Crianças
    │   └── Canais de Denúncia
    │       ├── Ligue 180
    │       ├── Ligue 190
    │       ├── Disque 100
    │       └── DEAM/DF
    │
    ├── [CRIANÇAS E ADOLESCENTES]
    │   ├── ECA — Direitos Fundamentais
    │   ├── Guarda e Adoção
    │   ├── Pensão Alimentícia
    │   │   ├── Ação de Alimentos
    │   │   ├── Execução / Prisão Civil
    │   │   ├── Alimentos Gravídicos
    │   │   └── Revisional / Exoneração
    │   ├── Alienação Parental
    │   ├── Bullying / Cyberbullying
    │   └── Conselho Tutelar
    │
    ├── [DIREITO À SAÚDE]
    │   ├── SUS — Direitos do Paciente
    │   ├── Emergência Obrigatória
    │   │   ├── Hospitais públicos
    │   │   └── Hospitais privados (obrigação legal)
    │   ├── Planejamento Familiar
    │   │   ├── Vasectomia
    │   │   └── Laqueadura
    │   ├── Cirurgias (Miomas)
    │   ├── Medicamentos (Farmácia Popular, alto custo)
    │   ├── Saúde Mental (CAPS)
    │   └── Ouvidoria SUS
    │
    ├── [PREVIDÊNCIA SOCIAL]
    │   ├── Aposentadorias
    │   ├── Auxílio por Incapacidade
    │   ├── Auxílio-Acidente
    │   ├── Pensão por Morte
    │   ├── Salário-Maternidade
    │   └── Acesso ao INSS
    │
    ├── [DIREITO DO CONSUMIDOR]
    │   ├── Direitos Básicos (CDC)
    │   ├── Superendividamento
    │   ├── PROCON-DF
    │   ├── Serviços Essenciais
    │   └── Planos de Saúde
    │
    ├── [NOÇÕES DE DIREITO PENAL]
    │   ├── Quando ir à Delegacia
    │   ├── Crimes Comuns
    │   ├── Direitos do Preso / Família
    │   └── Legítima Defesa
    │
    └── [ACESSO À JUSTIÇA]
        ├── Defensoria Pública (DPDF)
        ├── Justiça Gratuita
        ├── Juizados Especiais
        ├── NAJ (universidades)
        └── Constituição / LODF

```

## Relações entre Nós

| De | Para | Relação |
|---|---|---|
| CadÚnico | Bolsa Família | pré-requisito para |
| CadÚnico | BPC/LOAS | facilita acesso a |
| CadÚnico | Tarifa Social | pré-requisito para |
| CadÚnico | CODHAB | pré-requisito para |
| CRAS | CadÚnico | local de cadastro |
| CRAS | Benefícios Sociais | porta de entrada |
| Violência Doméstica | Medidas Protetivas | aciona |
| Violência Doméstica | DEAM | onde denunciar |
| Violência Doméstica | CRAM | apoio psicossocial |
| Violência Doméstica | Defensoria Pública | assistência jurídica |
| ECA | Conselho Tutelar | órgão de proteção |
| ECA | CRAS | encaminhamento |
| Pensão Alimentícia | Defensoria Pública | onde solicitar |
| Pensão Alimentícia | Prisão Civil | consequência inadimplência |
| SUS | UBS | porta de entrada |
| UBS | Especialista | encaminhamento |
| Especialista | Cirurgia | regulação SISREG |
| Emergência | Hospital (qualquer) | obrigação legal |
| INSS | Meu INSS | acesso digital |
| INSS | Agência INSS | acesso presencial |
| INSS | Defensoria Pública | contestação/recurso |
| Consumidor | PROCON-DF | reclamação |
| Consumidor | Juizado Especial | ação judicial |
| Crime | Delegacia | registro BO |
| Crime | Defensoria Pública | defesa/assistência |
| Acesso à Justiça | Defensoria Pública | principal via |
| Acesso à Justiça | Juizado Especial | sem advogado até 20 SM |

## Estrutura de Arquivos do Manual

```
manual_vicentinos/
├── README.md                          (índice geral)
├── 01-beneficios-sociais/
│   ├── README.md                      (índice da seção)
│   ├── 01-cadastro-unico.md
│   ├── 02-bolsa-familia.md
│   ├── 03-bpc-loas.md
│   ├── 04-seguro-desemprego.md
│   ├── 05-auxilio-reclusao.md
│   └── 06-beneficios-df.md
├── 02-violencia-domestica/
│   ├── README.md
│   ├── 01-lei-maria-da-penha.md
│   ├── 02-como-denunciar.md
│   ├── 03-medidas-protetivas.md
│   ├── 04-rede-protecao-df.md
│   ├── 05-violencia-idosos-criancas.md
│   └── 06-feminicidio-stalking.md
├── 03-criancas-adolescentes/
│   ├── README.md
│   ├── 01-direitos-eca.md
│   ├── 02-guarda-adocao.md
│   ├── 03-pensao-alimenticia.md
│   ├── 04-alienacao-parental.md
│   ├── 05-bullying.md
│   └── 06-conselho-tutelar-df.md
├── 04-direito-saude/
│   ├── README.md
│   ├── 01-direitos-paciente-sus.md
│   ├── 02-emergencia-obrigatoria.md
│   ├── 03-vasectomia-laqueadura.md
│   ├── 04-cirurgia-miomas.md
│   ├── 05-medicamentos.md
│   ├── 06-saude-mental.md
│   └── 07-ouvidoria-sus.md
├── 05-previdencia-social/
│   ├── README.md
│   ├── 01-aposentadorias.md
│   ├── 02-auxilio-incapacidade.md
│   ├── 03-pensao-por-morte.md
│   ├── 04-salario-maternidade.md
│   └── 05-acesso-inss.md
├── 06-direito-consumidor/
│   ├── README.md
│   ├── 01-direitos-basicos-cdc.md
│   ├── 02-superendividamento.md
│   ├── 03-procon-df.md
│   └── 04-servicos-essenciais.md
├── 07-nocoes-direito-penal/
│   ├── README.md
│   ├── 01-quando-ir-delegacia.md
│   ├── 02-crimes-comuns.md
│   └── 03-direitos-preso-familia.md
├── 08-acesso-justica/
│   ├── README.md
│   ├── 01-defensoria-publica-df.md
│   ├── 02-justica-gratuita.md
│   ├── 03-juizados-especiais.md
│   └── 04-nucleos-universidades.md
└── 09-direitos-fundamentais/
    ├── README.md
    ├── 01-constituicao-direitos-sociais.md
    └── 02-lei-organica-df.md
```
