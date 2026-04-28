#!/usr/bin/env python3
"""Terceiro passe — varredura ampla de acentos remanescentes."""
import re
from pathlib import Path

CANDIDATES = {
    'denuncia': 'denúncia', 'Denuncia': 'Denúncia', 'denuncias': 'denúncias',
    'idoneo': 'idôneo', 'idoneos': 'idôneos',
    'comodo': 'cômodo', 'Comodo': 'Cômodo',
    'hipotese': 'hipótese', 'hipoteses': 'hipóteses',
    'biopsia': 'biópsia', 'Biopsia': 'Biópsia',
    'estagio': 'estágio', 'Estagio': 'Estágio', 'estagios': 'estágios',
    'colegio': 'colégio', 'Colegio': 'Colégio',
    'historia': 'história', 'Historia': 'História', 'historias': 'histórias',
    'historico': 'histórico', 'historica': 'histórica',
    'caracteristica': 'característica', 'caracteristicas': 'características',
    'numero': 'número', 'Numero': 'Número', 'numeros': 'números',
    'protecao': 'proteção', 'Protecao': 'Proteção', 'protecoes': 'proteções',
    'oposicao': 'oposição',
    'discricao': 'discrição',
    'punicao': 'punição', 'punicoes': 'punições',
    'permanencia': 'permanência', 'Permanencia': 'Permanência',
    'pertinencia': 'pertinência',
    'transferencia': 'transferência',
    'inadimplencia': 'inadimplência',
    'incidencia': 'incidência',
    'ocorrencia': 'ocorrência', 'Ocorrencia': 'Ocorrência', 'ocorrencias': 'ocorrências',
    'sentenca': 'sentença', 'Sentenca': 'Sentença', 'sentencas': 'sentenças',
    'esperanca': 'esperança',
    'matricula': 'matrícula',
    'capitulo': 'capítulo', 'Capitulo': 'Capítulo', 'capitulos': 'capítulos',
    'carcere': 'cárcere', 'Carcere': 'Cárcere',
    'eleicao': 'eleição', 'eleicoes': 'eleições',
    'pretensao': 'pretensão',
    'execucao': 'execução', 'Execucao': 'Execução', 'execucoes': 'execuções',
    'absolvicao': 'absolvição',
    'condenacao': 'condenação',
    'fenomeno': 'fenômeno', 'fenomenos': 'fenômenos',
    'tributario': 'tributário', 'tributaria': 'tributária',
    'reincidencia': 'reincidência', 'Reincidencia': 'Reincidência',
    'paragrafos': 'parágrafos',
    'imobiliario': 'imobiliário', 'imobiliaria': 'imobiliária',
    'patrimonio': 'patrimônio', 'Patrimonio': 'Patrimônio',
    'extraordinaria': 'extraordinária', 'extraordinario': 'extraordinário',
    'ordinario': 'ordinário', 'ordinaria': 'ordinária',
    'eletronica': 'eletrônica', 'Eletronica': 'Eletrônica', 'eletronico': 'eletrônico',
    'eletronicos': 'eletrônicos',
    'telefonica': 'telefônica', 'telefonico': 'telefônico', 'telefonicas': 'telefônicas',
    'eletrica': 'elétrica', 'Eletrica': 'Elétrica', 'eletrico': 'elétrico',
    'energetica': 'energética', 'energetico': 'energético',
    'maximo': 'máximo', 'maxima': 'máxima', 'maximos': 'máximos', 'maximas': 'máximas',
    'variavel': 'variável', 'variaveis': 'variáveis',
    'aplicavel': 'aplicável', 'aplicaveis': 'aplicáveis',
    'visivel': 'visível',
    'imovel': 'imóvel', 'imoveis': 'imóveis', 'Imovel': 'Imóvel',
    'movel': 'móvel', 'moveis': 'móveis',
    'util': 'útil', 'uteis': 'úteis',
    'inutil': 'inútil',
    'civel': 'cível', 'Civel': 'Cível', 'civeis': 'cíveis',
    'fragil': 'frágil',
    'estavel': 'estável', 'estaveis': 'estáveis',
    'cidadao': 'cidadão', 'Cidadao': 'Cidadão', 'cidadaos': 'cidadãos', 'Cidadaos': 'Cidadãos',
    'voluntario': 'voluntário', 'Voluntario': 'Voluntário', 'voluntaria': 'voluntária',
    'voluntarios': 'voluntários', 'voluntarias': 'voluntárias',
    'paroquia': 'paróquia', 'paroquias': 'paróquias', 'Paroquia': 'Paróquia',
    'catolico': 'católico', 'catolicos': 'católicos', 'catolica': 'católica',
    'ladrao': 'ladrão', 'ladroes': 'ladrões',
    'maos': 'mãos',
    'pao': 'pão', 'paes': 'pães',
    'corrupcao': 'corrupção', 'Corrupcao': 'Corrupção',
    'fundacao': 'fundação', 'fundacoes': 'fundações',
    'isencao': 'isenção', 'isencoes': 'isenções',
    'extincao': 'extinção',
    'limitacao': 'limitação',
    'usucapiao': 'usucapião', 'Usucapiao': 'Usucapião',
    'resolucao': 'resolução', 'Resolucao': 'Resolução', 'resolucoes': 'resoluções',
    'conclusao': 'conclusão', 'Conclusao': 'Conclusão', 'conclusoes': 'conclusões',
    'omissao': 'omissão',
    'discussao': 'discussão',
    'audiencia': 'audiência', 'audiencias': 'audiências',
    'reuniao': 'reunião', 'Reuniao': 'Reunião',
    'sao maiores': 'são maiores',
    'orfao': 'órfão', 'orfaos': 'órfãos', 'orfaos do CRAS': 'órfãos do CRAS',
    'reu': 'réu', 'res': 'ré',
    'ginecologica': 'ginecológica',
    'sintese': 'síntese',
    'simbolico': 'simbólico', 'simbolica': 'simbólica',
    'analitico': 'analítico', 'analitica': 'analítica',
    'historicamente': 'historicamente',  # ok
    'estetica': 'estética', 'estetico': 'estético',
    'nucleos': 'núcleos',  # already
    'optica': 'óptica',
    'cronologico': 'cronológico',
    'cronologica': 'cronológica',
    'biologico': 'biológico', 'biologica': 'biológica',
    'biologa': 'bióloga', 'biologo': 'biólogo',
    'fisica': 'física', 'fisico': 'físico', 'fisicas': 'físicas', 'fisicos': 'físicos',
    'Fisica': 'Física',
    'inicio': 'início', 'Inicio': 'Início', 'inicios': 'inícios',
    'oficio': 'ofício', 'oficios': 'ofícios',
    'preso': 'preso',  # ok
    'previa': 'prévia', 'previo': 'prévio', 'previas': 'prévias',
    'previas': 'prévias',
    'previdencia': 'previdência',  # already
    'distribuicao': 'distribuição',
    'arrecadacao': 'arrecadação',
    'tributacao': 'tributação',
    'admissao': 'admissão',
    'pretensao': 'pretensão',
    'sucessao': 'sucessão',  # already
    'caducidade': 'caducidade',  # ok
    'apreciacao': 'apreciação',
    'depreciacao': 'depreciação',
    'simulacao': 'simulação',
    'transmissao': 'transmissão',
    'antecedente': 'antecedente',  # ok
    'autopsia': 'autópsia',
    'analise': 'análise', 'Analise': 'Análise', 'analises': 'análises',
    'estatistica': 'estatística', 'estatisticas': 'estatísticas',
    'multiplo': 'múltiplo', 'multipla': 'múltipla', 'multiplos': 'múltiplos',
    'sociologico': 'sociológico',
    'enfase': 'ênfase',
    'tonico': 'tônico',
    'eletronicas': 'eletrônicas',
    'extincao': 'extinção',
    'agressor': 'agressor',  # ok
    'agressores': 'agressores',  # ok
    'agressao': 'agressão',  # already
    'paginas': 'páginas',
    'fala': 'fala',  # ok
    'cita': 'cita',  # ok
    'sao paulo': 'são paulo',  # already
    'aproximacao': 'aproximação',
    'aproximadamente': 'aproximadamente',  # ok
    'simbolo': 'símbolo', 'simbolos': 'símbolos',
    'tao': 'tão',  # already
    'orgaos': 'órgãos',  # already
    # Verbos comuns
    'esta': 'está',  # CUIDADO — pode ser pronome demonstrativo "esta casa"
    'sera': 'será',  # already
    'podera': 'poderá',
    'tera': 'terá',
    'fara': 'fará',
    'dara': 'dará',
    'ira': 'irá',  # already
    'havera': 'haverá',
    'devera': 'deverá',
    'devera-se': 'deverá-se',
    'estarao': 'estarão',
    'serao': 'serão',
    'farao': 'farão',
    'darao': 'darão',
    'irao': 'irão',
    'estiveram': 'estiveram',  # ok
    'tiveram': 'tiveram',  # ok
    'tem': 'tem',  # noop, but "têm" plural is separate
}

# Removendo regras ambíguas — 'esta' pode ser demonstrativo, não trocar.
DANGEROUS = {'esta', 'tem'}
for k in list(CANDIDATES):
    if k in DANGEROUS:
        del CANDIDATES[k]


def main():
    p = Path('app/content.js')
    text = p.read_text(encoding='utf-8')
    fixes = []
    for word, repl in CANDIDATES.items():
        if word == repl:
            continue
        pat = r'\b' + re.escape(word) + r'\b'
        new_text, n = re.subn(pat, repl, text)
        if n:
            text = new_text
            fixes.append((n, word, repl))
    p.write_text(text, encoding='utf-8')
    for n, w, r in sorted(fixes, key=lambda x: -x[0])[:60]:
        print(f'{n:4d}  {w} -> {r}')
    print(f'Total: {sum(f[0] for f in fixes)}')


if __name__ == '__main__':
    main()
