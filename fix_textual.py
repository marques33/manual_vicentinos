"""
Quarto passe — revisao linguistica completa do Manual Vicentino (markdowns).

Reaproveita o dicionario do fix_accents_v3.py (que so era aplicado em
app/content.js) e estende com:
  - Toponimos do DF
  - Lexemas remanescentes (CadUnico, voce, nao, sao, etc.)
  - Numerais ordinais (5o -> 5o)
  - Crases sistematicas em sintagmas frequentes
  - Casos pontuais "e" x "e" detectados no corpus
  - Travessoes "--" -> em-dash

Reescreve os .md in-place. Use `git diff` antes de comitar.
"""
from __future__ import annotations

import re
from pathlib import Path

import importlib.util

ROOT = Path(__file__).resolve().parent

# ---------------------------------------------------------------------------
# 1) Dicionario base: importa o de fix_accents_v3.py
# ---------------------------------------------------------------------------
_spec = importlib.util.spec_from_file_location(
    "fix_accents_v3", ROOT / "fix_accents_v3.py"
)
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)
BASE_DICT: dict[str, str] = dict(_mod.CANDIDATES)

# ---------------------------------------------------------------------------
# 2) Adicoes especificas para os .md (nao alcancadas pelo v3)
# ---------------------------------------------------------------------------
EXTRA: dict[str, str] = {
    # Toponimos do DF
    "Brasilia": "Brasília",
    "Ceilandia": "Ceilândia",
    "Brazlandia": "Brazlândia",
    "Candangolandia": "Candangolândia",
    "Itapoa": "Itapoã",
    "Paranoa": "Paranoá",
    "Varjao": "Varjão",
    "Sao Sebastiao": "São Sebastião",
    "Sao Jose": "São José",
    "Aguas Claras": "Águas Claras",
    "Nucleo Bandeirante": "Núcleo Bandeirante",
    # Termo recorrente
    "CadUnico": "CadÚnico",
    # Acentos faltantes em palavras frequentes
    "nao": "não", "Nao": "Não", "NAO": "NÃO",
    "voce": "você", "Voce": "Você", "voces": "vocês", "Voces": "Vocês",
    "sao": "são", "Sao": "São",
    "mae": "mãe", "Mae": "Mãe", "maes": "mães",
    "irmao": "irmão", "Irmao": "Irmão",
    "irmaos": "irmãos", "Irmaos": "Irmãos",
    "cartao": "cartão", "Cartao": "Cartão", "cartoes": "cartões",
    "faca": "faça", "Faca": "Faça", "facam": "façam",
    "raca": "raça", "racas": "raças",
    "laco": "laço", "lacos": "laços",
    "espaco": "espaço", "Espaco": "Espaço", "espacos": "espaços",
    "comeco": "começo", "comecar": "começar",
    "comeca": "começa", "comecou": "começou", "comecam": "começam",
    "ameaca": "ameaça", "ameacas": "ameaças",
    "ameacar": "ameaçar", "ameacou": "ameaçou",
    "doenca": "doença", "Doenca": "Doença",
    "doencas": "doenças", "Doencas": "Doenças",
    "crianca": "criança", "Crianca": "Criança",
    "criancas": "crianças", "Criancas": "Crianças",
    "graca": "graça", "Graca": "Graça",
    "presidio": "presídio", "presidios": "presídios",
    # Substantivos com til
    "regiao": "região", "Regiao": "Região", "regioes": "regiões",
    "religiao": "religião", "Religiao": "Religião",
    "uniao": "união", "Uniao": "União",
    "decisao": "decisão", "Decisao": "Decisão", "decisoes": "decisões",
    "operacao": "operação", "Operacao": "Operação", "operacoes": "operações",
    "denuncia": "denúncia", "Denuncia": "Denúncia", "denuncias": "denúncias",
    "transferencia": "transferência", "Transferencia": "Transferência",
    "experiencia": "experiência", "Experiencia": "Experiência",
    "agencia": "agência", "Agencia": "Agência",
    "agencias": "agências", "Agencias": "Agências",
    "frequencia": "frequência", "consequencia": "consequência",
    "consequencias": "consequências",
    "infancia": "infância", "Infancia": "Infância",
    "adolescencia": "adolescência", "Adolescencia": "Adolescência",
    "tendencia": "tendência", "tendencias": "tendências",
    "preferencia": "preferência", "preferencias": "preferências",
    # Substantivos -cao
    "composicao": "composição", "Composicao": "Composição",
    "separacao": "separação", "Separacao": "Separação",
    "informacao": "informação", "Informacao": "Informação",
    "informacoes": "informações", "Informacoes": "Informações",
    "orientacao": "orientação", "Orientacao": "Orientação",
    "orientacoes": "orientações",
    "atencao": "atenção", "Atencao": "Atenção",
    "discriminacao": "discriminação", "Discriminacao": "Discriminação",
    "distincao": "distinção",
    "alienacao": "alienação", "Alienacao": "Alienação",
    "obrigacao": "obrigação", "Obrigacao": "Obrigação",
    "obrigacoes": "obrigações",
    "alimentacao": "alimentação", "Alimentacao": "Alimentação",
    "habitacao": "habitação",
    "criacao": "criação", "Criacao": "Criação",
    "isencao": "isenção", "Isencao": "Isenção", "isencoes": "isenções",
    "publicacao": "publicação", "publicacoes": "publicações",
    "associacao": "associação",
    "construcao": "construção",
    "introducao": "introdução",
    "instrucao": "instrução", "instrucoes": "instruções",
    "explicacao": "explicação", "explicacoes": "explicações",
    "manutencao": "manutenção",
    "intencao": "intenção", "intencoes": "intenções",
    "redacao": "redação",
    # Adjetivos
    "publico": "público", "Publico": "Público", "publicos": "públicos",
    "publica": "pública", "Publica": "Pública", "publicas": "públicas",
    "rapido": "rápido", "rapida": "rápida",
    "rapidos": "rápidos", "rapidas": "rápidas",
    "medio": "médio", "media": "média", "medios": "médios", "medias": "médias",
    "Medio": "Médio",
    "medico": "médico", "medica": "médica",
    "medicos": "médicos", "medicas": "médicas",
    "Medico": "Médico", "Medica": "Médica",
    "proximo": "próximo", "Proximo": "Próximo",
    "proxima": "próxima", "Proxima": "Próxima",
    "necessario": "necessário", "Necessario": "Necessário",
    "necessaria": "necessária", "Necessaria": "Necessária",
    "necessarios": "necessários", "necessarias": "necessárias",
    "obrigatorio": "obrigatório", "Obrigatorio": "Obrigatório",
    "obrigatoria": "obrigatória", "Obrigatoria": "Obrigatória",
    "obrigatorios": "obrigatórios", "obrigatorias": "obrigatórias",
    "subsidiaria": "subsidiária", "subsidiario": "subsidiário",
    "salario": "salário", "Salario": "Salário",
    "salarios": "salários", "Salarios": "Salários",
    "usuario": "usuário", "Usuario": "Usuário",
    "usuaria": "usuária", "usuarios": "usuários",
    "funcionario": "funcionário", "funcionaria": "funcionária",
    "funcionarios": "funcionários",
    "judiciario": "judiciário", "Judiciario": "Judiciário",
    "tributario": "tributário", "tributaria": "tributária",
    "imobiliario": "imobiliário", "imobiliaria": "imobiliária",
    "criterio": "critério", "criterios": "critérios",
    "Criterio": "Critério", "Criterios": "Critérios",
    "duvida": "dúvida", "duvidas": "dúvidas",
    "Duvida": "Dúvida", "Duvidas": "Dúvidas",
    "credito": "crédito", "creditos": "créditos",
    "Credito": "Crédito",
    "metodo": "método", "metodos": "métodos", "Metodo": "Método",
    "agua": "água", "Agua": "Água",
    "aguas": "águas", "Aguas": "Águas",
    "indigena": "indígena", "indigenas": "indígenas",
    "Indigena": "Indígena", "Indigenas": "Indígenas",
    "analogo": "análogo", "analoga": "análoga",
    "escravidao": "escravidão", "Escravidao": "Escravidão",
    "certidao": "certidão", "Certidao": "Certidão",
    "certidoes": "certidões",
    "desejavel": "desejável", "Desejavel": "Desejável",
    "concluido": "concluído", "concluida": "concluída",
    "varios": "vários", "varias": "várias",
    "Varios": "Vários", "Varias": "Várias",
    "ja": "já", "Ja": "Já",
    "ate": "até", "Ate": "Até",
    "tambem": "também", "Tambem": "Também",
    "porem": "porém", "Porem": "Porém",
    "ninguem": "ninguém", "Ninguem": "Ninguém",
    "alguem": "alguém", "Alguem": "Alguém",
    "amanha": "amanhã", "Amanha": "Amanhã",
    "manha": "manhã", "Manha": "Manhã",
    "marco": "março",  # ATENCAO: "marco" tambem e substantivo (marco temporal)
    "ministerio": "ministério", "Ministerio": "Ministério",
    "ministerios": "ministérios",
    "constituicao": "constituição", "Constituicao": "Constituição",
    "coracao": "coração", "Coracao": "Coração",
    "tecnico": "técnico", "tecnica": "técnica",
    "Tecnico": "Técnico", "Tecnica": "Técnica",
    "tecnicos": "técnicos", "tecnicas": "técnicas",
    "saude": "saúde", "Saude": "Saúde",
    "juridica": "jurídica", "juridico": "jurídico",
    "Juridica": "Jurídica", "Juridico": "Jurídico",
    "juridicas": "jurídicas", "juridicos": "jurídicos",
    "policia": "polícia", "Policia": "Polícia",
    "estagio": "estágio", "estagios": "estágios", "Estagio": "Estágio",
    "estagiario": "estagiário", "estagiaria": "estagiária",
    "estagiarios": "estagiários",
    "obvio": "óbvio", "obvia": "óbvia",
    "obvios": "óbvios", "obvias": "óbvias",
    "remedio": "remédio", "remedios": "remédios",
    "Remedio": "Remédio", "Remedios": "Remédios",
    "veiculo": "veículo", "veiculos": "veículos",
    "exercicio": "exercício", "exercicios": "exercícios",
    "Exercicio": "Exercício",
    "matricula": "matrícula", "matriculas": "matrículas",
    "anonimo": "anônimo", "anonima": "anônima",
    "carnes": "carnês", "carne": "carnê",
    "Sumula": "Súmula", "sumula": "súmula",
    "sumulas": "súmulas", "Sumulas": "Súmulas",
    "Numero": "Número", "numero": "número",
    "numeros": "números", "Numeros": "Números",
    "Pe-de-Meia": "Pé-de-Meia",
    "Gas": "Gás", "gas": "gás",
    "Cancer": "Câncer",
    "Hanseniase": "Hanseníase",
    "pericia": "perícia", "pericial": "pericial",
    "Caesb": "CAESB",
    "auxilio": "auxílio", "Auxilio": "Auxílio",
    "auxilios": "auxílios", "Auxilios": "Auxílios",
    "obito": "óbito", "obitos": "óbitos",
    "heranca": "herança", "herancas": "heranças",
    "transitorio": "transitório", "transitoria": "transitória",
    "obstaculo": "obstáculo", "obstaculos": "obstáculos",
    "imprescritivel": "imprescritível",
    "imprescritiveis": "imprescritíveis",
    "inafiancavel": "inafiançável",
    "inafiancaveis": "inafiançáveis",
    "Reciproca": "Recíproca", "reciproca": "recíproca",
    "calculo": "cálculo", "calculos": "cálculos",
    "Calculo": "Cálculo",
    "comunitario": "comunitário", "comunitaria": "comunitária",
    "comunitarios": "comunitários", "comunitarias": "comunitárias",
    "Pediatrica": "Pediátrica", "pediatrica": "pediátrica",
    "antibiotico": "antibiótico", "antibioticos": "antibióticos",
    "alergico": "alérgico", "alergica": "alérgica",
    "fertil": "fértil", "ferteis": "férteis",
    # Mais lexemas detectados
    "Justica": "Justiça", "justica": "justiça",
    "posicao": "posição", "Posicao": "Posição", "posicoes": "posições",
    "negocio": "negócio", "negocios": "negócios",
    "ultimo": "último", "ultima": "última",
    "ultimos": "últimos", "ultimas": "últimas",
    "Ultimo": "Último", "Ultima": "Última",
    "favoravel": "favorável", "favoraveis": "favoráveis",
    "precaria": "precária", "precario": "precário",
    "precarias": "precárias", "precarios": "precários",
    "divida": "dívida", "Divida": "Dívida",
    "dividas": "dívidas", "Dividas": "Dívidas",
    "correspondencia": "correspondência",
    "correspondencias": "correspondências",
    "OBRIGATORIO": "OBRIGATÓRIO", "OBRIGATORIA": "OBRIGATÓRIA",
    "biometrico": "biométrico", "biometrica": "biométrica",
    "biometricos": "biométricos", "biometricas": "biométricas",
    "relatorio": "relatório", "relatorios": "relatórios",
    "Relatorio": "Relatório", "Relatorios": "Relatórios",
    "variacao": "variação", "variacoes": "variações",
    "Variacao": "Variação",
    "Flexibilizacao": "Flexibilização",
    "flexibilizacao": "flexibilização",
    "esperanca": "esperança",
    "Esperanca": "Esperança",
    "diferenca": "diferença", "diferencas": "diferenças",
    "Diferenca": "Diferença",
    "viuvo": "viúvo", "viuva": "viúva",
    "viuvos": "viúvos", "viuvas": "viúvas",
    "Negligencia": "Negligência", "negligencia": "negligência",
    "insuficiencia": "insuficiência", "Insuficiencia": "Insuficiência",
    # Mais palavras detectadas no PDF gerado
    "adocao": "adoção", "Adocao": "Adoção", "adocoes": "adoções",
    "transicao": "transição", "Transicao": "Transição",
    "transicoes": "transições",
    "regularizacao": "regularização",
    "regulamentacao": "regulamentação",
    "divorcio": "divórcio", "Divorcio": "Divórcio",
    "dissolucao": "dissolução",
    "investigacao": "investigação", "Investigacao": "Investigação",
    "motivacao": "motivação", "motivacoes": "motivações",
    "exploracao": "exploração", "exploracoes": "explorações",
    "Exploracao": "Exploração",
    "habilitacao": "habilitação", "Habilitacao": "Habilitação",
    "preparatorio": "preparatório", "preparatoria": "preparatória",
    "compativel": "compatível", "compativeis": "compatíveis",
    "legitimo": "legítimo", "legitima": "legítima",
    "legitimos": "legítimos", "legitimas": "legítimas",
    "colocacao": "colocação",
    "ligacao": "ligação", "ligacoes": "ligações",
    "Ligacao": "Ligação",
    "Funcionarios": "Funcionários",
    "arranhoes": "arranhões",
    "mudanca": "mudança", "Mudanca": "Mudança",
    "mudancas": "mudanças", "Mudancas": "Mudanças",
    "desnutricao": "desnutrição",
    "Medicos": "Médicos",
    "notificacao": "notificação",
    "notificacoes": "notificações",
    "humilhacao": "humilhação",
    "acrescimo": "acréscimo", "Acrescimo": "Acréscimo",
    "ressonancia": "ressonância",
    "internacao": "internação", "internacoes": "internações",
    "descricao": "descrição", "descricoes": "descrições",
    "Descricao": "Descrição",
    "caracteristica": "característica",
    "Caracteristica": "Característica",
    "caracteristicas": "características",
    "irreversivel": "irreversível", "irreversiveis": "irreversíveis",
    "contribuia": "contribuía", "contribuiam": "contribuíam",
    "viuvo": "viúvo", "viuva": "viúva",
    "viuvos": "viúvos", "viuvas": "viúvas",
    # Reativados como seguros neste corpus
    "media": "média", "carne": "carnê", "carnes": "carnês",
    # 13o salario
    "vasectomia": "vasectomia",  # ok
    "laqueadura": "laqueadura",  # ok
    "miomas": "miomas",  # ok
    # Verbos comuns (cuidado: "va", "vao" sao perigosos sem contexto)
    "minimo": "mínimo", "Minimo": "Mínimo",
    "minima": "mínima", "Minima": "Mínima",
    "minimos": "mínimos", "minimas": "mínimas",
    "fara": "fará", "havera": "haverá",
    "podera": "poderá", "tera": "terá",
    "dara": "dará", "devera": "deverá",
    "estarao": "estarão", "serao": "serão",
    "farao": "farão", "darao": "darão",
    "irao": "irão",
    "reune": "reúne", "reunir": "reunir",
    "reuna": "reúna", "Reuna": "Reúna",
    "reunam": "reúnam",
    # "ha" como verbo: substituir so quando seguido de espaco + substantivo curto
    # nao colocamos no dict simples; tratamos via padrao especifico abaixo
}

# Mescla EXTRA sobre BASE (EXTRA prevalece)
DICT: dict[str, str] = {**BASE_DICT, **EXTRA}

# Remove no-ops e entradas perigosas
DANGEROUS = {
    "esta", "Esta",       # pron. demonstrativo
    "tem", "Tem",         # 3a sing.
    "marco",              # tambem substantivo "marco temporal"
    "avo",                # avô vs avó — ambiguo
    # Homografos: a forma SEM acento e verbo, a COM acento e substantivo.
    # "some toda a renda da familia e divida pelo numero de pessoas" e a
    # instrucao de renda per capita do Bolsa Familia (02-bolsa-familia.md) e do
    # BPC/LOAS (03-bpc-loas.md). Trocar por "dívida" inverte o sentido da frase
    # mais importante do capitulo. O sentido de substantivo volta por contexto
    # em NOUN_PATTERNS, abaixo.
    "divida", "Divida",   # dividir (imperativo) vs dívida (debito)
    "previa", "Previa",   # prever (imperfeito) vs prévia (antecipada)
}
DICT = {k: v for k, v in DICT.items() if k not in DANGEROUS and k != v}

# ---------------------------------------------------------------------------
# 3) Padroes contextuais
# ---------------------------------------------------------------------------
URL_OR_CODE = re.compile(r"`[^`]*`|```[\s\S]*?```|https?://\S+|\[[^\]]+\]\([^)]+\)")
PLACEHOLDER = "\x00URL\x00"


def shield(text: str) -> tuple[str, list[str]]:
    holes: list[str] = []

    def _sub(m: re.Match[str]) -> str:
        holes.append(m.group(0))
        return f"{PLACEHOLDER}{len(holes) - 1}{PLACEHOLDER}"

    return URL_OR_CODE.sub(_sub, text), holes


def restore(text: str, holes: list[str]) -> str:
    return re.sub(rf"{PLACEHOLDER}(\d+){PLACEHOLDER}",
                  lambda m: holes[int(m.group(1))], text)


# Casos "e" -> "e" (verbo trocado por conjuncao) detectados no corpus
E_PATTERNS: list[tuple[re.Pattern[str], object]] = [
    (re.compile(r"\bbenef[ií]cio\s+e\s+para\b"), "benefício é para"),
    (re.compile(r"\bobriga[çc][aã]o\s+e\s+(rec[ií]proca|presumida|subsidi[áa]ria|complementar)"),
     lambda m: f"obrigação é {m.group(1)}"),
    (re.compile(r"\bnecessidade\s+e\s+presumida\b"), "necessidade é presumida"),
    (re.compile(r"\bIsso\s+e\s+CRIME\b"), "Isso é CRIME"),
    (re.compile(r"\bisso\s+e\s+crime\b"), "isso é crime"),
    (re.compile(r"(?<![A-Za-zÀ-ÿ])E\s+um\s+dos\b"), "É um dos"),
    (re.compile(r"(?<![A-Za-zÀ-ÿ])E\s+uma\s+das\b"), "É uma das"),
    (re.compile(r"\bnão\s+e\s+só\b"), "não é só"),
    (re.compile(r"\bque\s+e\s+(crime|importante|necess[áa]rio|necess[áa]ria|presumido|presumida|reconhecid[oa])\b"),
     lambda m: f"que é {m.group(1)}"),
    (re.compile(r"\bvalor\s+e\s+de\s+"), "valor é de "),
    # ORDEM IMPORTA: o caso longo tem de vir antes do curto, senao
    # "idade e menor é o valor" vira "idade é menor é o valor" (dois "é") e a
    # regra especifica nunca chega a casar.
    (re.compile(r"\bidade\s+e\s+menor\s+é\s+o\s+valor\b"), "idade é menor e o valor"),
    (re.compile(r"\bidade\s+e\s+menor\b"), "idade é menor"),
    (re.compile(r"\bidade\s+e\s+maior\b"), "idade é maior"),
    (re.compile(r"\besta\s+temporariamente\b"), "está temporariamente"),
    (re.compile(r"\besta\s+permanentemente\b"), "está permanentemente"),
    # "é" usado errado no lugar de "e" (conjuncao)
    (re.compile(r"\bvai\s+é\s+o\s+que\s+faz\b"), "vai e o que faz"),
    (re.compile(r"\ba\s+maternidade\s+é\s+a\s+infância\b"), "à maternidade e à infância"),
    (re.compile(r"\bbenef[ií]cio\s+é\s+o\s+passo\s+a\s+passo\b"),
     "benefício e o passo a passo"),
    # "Que E o/a" -> "Que É o/a" (titulos interrogativos)
    (re.compile(r"\bQue\s+E\s+(o|a|os|as)\b"), lambda m: f"Que É {m.group(1)}"),
    (re.compile(r"\bQuem\s+E\s+(o|a)\b"), lambda m: f"Quem É {m.group(1)}"),
    (re.compile(r"\bO\s+que\s+E\s+(o|a|isso|um|uma)\b"),
     lambda m: f"O que é {m.group(1)}"),
    # "se ha (subst)" -> "se ha (subst)" (verbo haver)
    (re.compile(r"\bse\s+ha\s+(crianças|idosos|pessoas|d[úu]vidas?|filhos?|risco|filhas?|m[ãa]es?|necessidade)"),
     lambda m: f"se há {m.group(1)}"),
    (re.compile(r"\bquando\s+ha\s+"), "quando há "),
    (re.compile(r"\bonde\s+ha\s+"), "onde há "),
    # "minimos" -> "mínimos" (deixado fora do dict para nao chocar com "minima")
    (re.compile(r"\bsal[áa]rios\s+minimos\b"), "salários mínimos"),
    (re.compile(r"\bminimo\s+(legal|exigido|necess[áa]rio)"),
     lambda m: f"mínimo {m.group(1)}"),
    # "13o salario" -> "13º salário"
    (re.compile(r"\b13o\s+sal[áa]rio\b"), "13º salário"),
    # "E para quem", "E preciso", "E exigência"
    (re.compile(r"(?<![A-Za-zÀ-ÿ])E\s+(para|preciso|exig[êe]ncia|necess[áa]rio|necess[áa]ria|crime|importante|obrigat[óo]ri[oa])\b"),
     lambda m: f"É {m.group(1)}"),
    # "criança e legalmente seu filho" -> "é"
    (re.compile(r"\b(crian[çc]a|adolescente|pessoa|filh[oa]|m[ãa]e|pai|adoção)\s+e\s+(legalmente|definitivamente|menor|maior)"),
     lambda m: f"{m.group(1)} é {m.group(2)}"),
    # "a adoção e concluída/irrevogavel/...
    (re.compile(r"\b(ado[çc][aã]o|guarda|tutela)\s+e\s+(conclu[íi]da|irrevog[áa]vel|definitiva)"),
     lambda m: f"{m.group(1)} é {m.group(2)}"),
    # "vínculo ... e rompido"
    (re.compile(r"\bv[ií]nculo\s+([^.\n]{0,40}?)\s+e\s+rompido\b"),
     lambda m: f"vínculo {m.group(1)} é rompido"),
    # "Conselho Tutelar e formado/responsavel"
    (re.compile(r"\b(Conselho\s+Tutelar|Defensoria\s+P[úu]blica|Minist[ée]rio\s+P[úu]blico)\s+e\s+(formado|formada|respons[áa]vel|composto|composta|um|uma)\b"),
     lambda m: f"{m.group(1)} é {m.group(2)}"),
    # "(orgao) nao e tribunal/judicial"
    (re.compile(r"\bn[ãa]o\s+e\s+tribunal\b"), "não é tribunal"),
    # "esta sofrendo violência"
    (re.compile(r"\bcrian[çc]a\s+esta\s+sofrendo\b"), "criança está sofrendo"),
    (re.compile(r"\b([Aa])\s+crian[çc]a\s+esta\s+(sem|sofrendo|em)\b"),
     lambda m: f"{m.group(1)} criança está {m.group(2)}"),
    # "Acesse e o perfil" — typo "é" no lugar de "e"
    (re.compile(r"\bdados\s+é\s+o\s+perfil\b"), "dados e o perfil"),
    # "Você é a criança passam" — "é" no lugar de "e"
    (re.compile(r"\bVoc[êe]\s+é\s+a\s+crian[çc]a\b"), "Você e a criança"),
    # "vai investigar"
    (re.compile(r"\bvai\s+investigar\b"), "vai investigar"),
    # "vao investigar"
    (re.compile(r"\bvao\s+investigar\b"), "vão investigar"),
    # "Aciona ... é a polícia"
    (re.compile(r"\bMinist[ée]rio\s+P[úu]blico\s+é\s+a\s+pol[íi]cia\b"),
     "Ministério Público e a polícia"),
    # "ha pelo menos"
    (re.compile(r"\bbenef[ií]cio\s+ha\s+pelo\s+menos\b"), "benefício há pelo menos"),
    # "ir a uma agência"
    (re.compile(r"\bir\s+a\s+uma\s+ag[êe]ncia\b"), "ir a uma agência"),
    # "exigência da lei"
    (re.compile(r"\bexig[êe]ncia\s+da\s+lei\b"), "exigência da lei"),
    # "Funcionarios de instituições"
    (re.compile(r"\bFuncion[áa]rios\s+de\s+institui[çc][õo]es\b"),
     "Funcionários de instituições"),
    # "sao obrigad" -> "são obrigad"
    (re.compile(r"\bsao\s+obrigad"), "são obrigad"),
]

# Homografos removidos do DICT (ver DANGEROUS): recupera o sentido de
# SUBSTANTIVO so quando o contexto e inequivoco. Na duvida, nao mexe — deixar
# um acento faltando e barato; inverter o sentido de uma instrucao nao e.
NOUN_PATTERNS: list[tuple[re.Pattern[str], object]] = [
    # "a divida", "as dividas", "da divida", "sua divida"...
    (re.compile(r"\b([Aa]|[Aa]s|[Dd]a|[Dd]as|[Nn]a|[Nn]as|[Ss]ua|[Ss]uas"
                r"|[Ee]ssa|[Ee]ssas|[Uu]ma|[Mm]inha)\s+divida\b"),
     lambda m: f"{m.group(1)} dívida"),
    # "divida ativa", "divida publica"...
    (re.compile(r"\bdivida\s+(ativa|p[úu]blica|consolidada|total|pendente)\b"),
     lambda m: f"dívida {m.group(1)}"),
    # "a previa", "uma previa" — substantivo. "previa que/o/a" continua verbo.
    (re.compile(r"\b([Aa]|[Uu]ma|[Dd]a|[Nn]a)\s+previa\b"),
     lambda m: f"{m.group(1)} prévia"),
    # "consulta previa", "autorizacao previa"...
    (re.compile(r"\b(consulta|autoriza[çc][ãa]o|an[áa]lise|avalia[çc][ãa]o"
                r"|comunica[çc][ãa]o|licen[çc]a|notifica[çc][ãa]o)\s+previa\b"),
     lambda m: f"{m.group(1)} prévia"),
]

# Crases sistematicas
CRASE_PATTERNS: list[tuple[re.Pattern[str], object]] = [
    (re.compile(r"\bprote[çc][aã]o\s+a\s+mulher\b"), "proteção à mulher"),
    (re.compile(r"\bsujeit([oa]s?)\s+a\s+Lei\s+Maria\s+da\s+Penha\b"),
     lambda m: f"sujeit{m.group(1)} à Lei Maria da Penha"),
    (re.compile(r"\ban[áa]logo\s+a\s+escravid[aã]o\b"), "análogo à escravidão"),
    (re.compile(r"\bda\s+creche\s+a\s+universidade\b"), "da creche à universidade"),
    (re.compile(r"\bDireito\s+a\s+(Sa[úu]de|Justi[çc]a|Educa[çc][aã]o)\b"),
     lambda m: f"Direito à {m.group(1)}"),
    (re.compile(r"\bAcesso\s+a\s+Justi[çc]a\b"), "Acesso à Justiça"),
    (re.compile(r"\bdireito\s+a\s+Defensoria\s+P[úu]blica\b"),
     "direito à Defensoria Pública"),
]

# Ordinais
ORDINAL_RULES: list[tuple[re.Pattern[str], object]] = [
    (re.compile(r"\b[Aa]rt(\.|igo)\s*(\d+)o\b"),
     lambda m: f"{'A' if m.group(0)[0]=='A' else 'a'}rt{m.group(1)} {m.group(2)}º"),
    (re.compile(r"\b(\d+)o\s+(ano|lugar|grau|m[êe]s|dia|inciso|par[áa]grafo|cap[íi]tulo)\b"),
     lambda m: f"{m.group(1)}º {m.group(2)}"),
    (re.compile(r"\b(\d+)a\s+(Etapa|Vara|Turma|Regi[ãa]o|Inst[âa]ncia|Se[çc][aã]o|S[ée]rie|Edi[çc][aã]o)\b"),
     lambda m: f"{m.group(1)}ª {m.group(2)}"),
]

# Travessoes
DOUBLE_DASH = re.compile(r"(?<=\S) -- (?=\S)")
EXCESS_HR = re.compile(r"(\n---\n\s*){2,}")


def apply_rules(text: str) -> str:
    # Palavras (case-sensitive, fronteiras)
    for raw, rep in DICT.items():
        text = re.sub(rf"\b{re.escape(raw)}\b", rep, text)
    for pat, rep in NOUN_PATTERNS:
        text = pat.sub(rep, text)
    for pat, rep in E_PATTERNS:
        text = pat.sub(rep, text)
    for pat, rep in CRASE_PATTERNS:
        text = pat.sub(rep, text)
    for pat, rep in ORDINAL_RULES:
        text = pat.sub(rep, text)
    text = DOUBLE_DASH.sub(" — ", text)
    text = EXCESS_HR.sub("\n---\n", text)
    return text


def fix_text(text: str) -> str:
    shielded, holes = shield(text)
    shielded = apply_rules(shielded)
    return restore(shielded, holes)


RE_CONTENT_DIR = re.compile(r"^\d{2}-")


def content_files() -> list[Path]:
    """Arquivos que a revisao linguistica pode reescrever.

    So os capitulos do manual (pastas `0X-*`) e o README, que vira a
    APRESENTACAO do PDF. Deliberadamente DE FORA:

    - `biblioteca/` — fontes legais primarias (vade mecum, CF/88, ECA, LOAS).
      Texto de lei e citacao, nao se "corrige"; e material nao rastreado pelo
      git, entao a reescrita seria irreversivel.
    - `.claude/` — as skills trazem exemplos do tipo `"Voce" -> "você"`. Aplicar
      o dicionario neles reescreve os dois lados da seta e apaga a instrucao.
    - `tasks/`, `docs/`, `social/`, `supabase/` — notas de projeto, nao conteudo.
    """
    files = [ROOT / "README.md"]
    for d in sorted(ROOT.iterdir()):
        if d.is_dir() and RE_CONTENT_DIR.match(d.name):
            files.extend(p for p in d.rglob("*.md") if "build" not in p.parts)
    return sorted({p for p in files if p.exists()})


def main() -> None:
    md_files = content_files()
    changed = 0
    for path in md_files:
        original = path.read_text(encoding="utf-8")
        fixed = fix_text(original)
        if fixed != original:
            path.write_text(fixed, encoding="utf-8")
            changed += 1
            print(f"[fix] {path.relative_to(ROOT)}")
    print(f"\n{changed} arquivos alterados de {len(md_files)}.")


if __name__ == "__main__":
    main()
