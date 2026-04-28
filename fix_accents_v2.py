#!/usr/bin/env python3
"""
Segundo passe de correção de acentuação no Manual Vicentino.
Corrige lacunas deixadas pelo fix_accents.py original.
NÃO faz trocas automáticas de 'e' por 'é' (causou erros inversos no passe anterior).
"""
import re
import sys
from pathlib import Path

# (padrão_regex, substituição) — todos com word boundary onde aplicável
RULES = [
    # === IMPERATIVOS / VERBOS ===
    (r'\bVa\b', 'Vá'),                              # imperativo de "ir" no início de instrução
    (r'\bha\b', 'há'),                              # verbo haver
    (r'\bHa\b', 'Há'),

    # === SUBSTANTIVOS / ADJETIVOS COMUNS SEM ACENTO ===
    (r'\bproximo\b', 'próximo'), (r'\bProximo\b', 'Próximo'),
    (r'\bproxima\b', 'próxima'), (r'\bProxima\b', 'Próxima'),
    (r'\bproximas\b', 'próximas'), (r'\bProximas\b', 'Próximas'),
    (r'\bproximos\b', 'próximos'), (r'\bProximos\b', 'Próximos'),

    (r'\bsao\b', 'são'), (r'\bSao\b', 'São'),
    (r'\bnao\b', 'não'), (r'\bNao\b', 'Não'), (r'\bNAO\b', 'NÃO'),

    (r'\bregiao\b', 'região'), (r'\bRegiao\b', 'Região'),
    (r'\bregioes\b', 'regiões'), (r'\bRegioes\b', 'Regiões'),

    (r'\bcriterio\b', 'critério'), (r'\bCriterio\b', 'Critério'),
    (r'\bcriterios\b', 'critérios'), (r'\bCriterios\b', 'Critérios'),

    (r'\bmetodo\b', 'método'), (r'\bMetodo\b', 'Método'),
    (r'\bmetodos\b', 'métodos'), (r'\bMetodos\b', 'Métodos'),

    (r'\bultimo\b', 'último'), (r'\bUltimo\b', 'Último'),
    (r'\bultima\b', 'última'), (r'\bUltima\b', 'Última'),
    (r'\bultimos\b', 'últimos'), (r'\bUltimos\b', 'Últimos'),
    (r'\bultimas\b', 'últimas'), (r'\bUltimas\b', 'Últimas'),

    (r'\buniao\b', 'união'), (r'\bUniao\b', 'União'),
    (r'\bnucleo\b', 'núcleo'), (r'\bNucleo\b', 'Núcleo'),
    (r'\bnucleos\b', 'núcleos'), (r'\bNucleos\b', 'Núcleos'),

    (r'\bJustica\b', 'Justiça'), (r'\bjustica\b', 'justiça'),
    (r'\bJustiça gratuita\b', 'Justiça Gratuita'),  # casing comum em título

    (r'\bgraca\b', 'graça'), (r'\bGraca\b', 'Graça'),
    (r'\bforca\b', 'força'), (r'\bForca\b', 'Força'),
    (r'\bameaca\b', 'ameaça'), (r'\bAmeaca\b', 'Ameaça'),
    (r'\bsentenca\b', 'sentença'), (r'\bSentenca\b', 'Sentença'),
    (r'\bheranca\b', 'herança'), (r'\bHeranca\b', 'Herança'),
    (r'\bcobranca\b', 'cobrança'), (r'\bCobranca\b', 'Cobrança'),
    (r'\bdivida\b', 'dívida'), (r'\bDivida\b', 'Dívida'),
    (r'\bdividas\b', 'dívidas'), (r'\bDividas\b', 'Dívidas'),
    (r'\bcrianca\b', 'criança'), (r'\bCrianca\b', 'Criança'),
    (r'\bcriancas\b', 'crianças'), (r'\bCriancas\b', 'Crianças'),
    (r'\bdomestica\b', 'doméstica'), (r'\bDomestica\b', 'Doméstica'),
    (r'\bdomesticas\b', 'domésticas'),
    (r'\bdomestico\b', 'doméstico'), (r'\bDomestico\b', 'Doméstico'),

    (r'\bpolicia\b', 'polícia'), (r'\bPolicia\b', 'Polícia'),
    (r'\bpolicial\b', 'policial'),  # já correto sem acento (policial não tem)
    # Remover regra acima — "policial" não tem acento

    (r'\bMinisterio\b', 'Ministério'), (r'\bministerio\b', 'ministério'),

    (r'\bsalario\b', 'salário'), (r'\bSalario\b', 'Salário'),
    (r'\bsalarios\b', 'salários'), (r'\bSalarios\b', 'Salários'),

    (r'\brelatorio\b', 'relatório'), (r'\bRelatorio\b', 'Relatório'),
    (r'\brelatorios\b', 'relatórios'), (r'\bRelatorios\b', 'Relatórios'),

    (r'\bperiodo\b', 'período'), (r'\bPeriodo\b', 'Período'),
    (r'\bperiodos\b', 'períodos'),

    (r'\busuario\b', 'usuário'), (r'\bUsuario\b', 'Usuário'),
    (r'\busuarios\b', 'usuários'), (r'\bUsuarios\b', 'Usuários'),

    (r'\bjudiciario\b', 'judiciário'), (r'\bJudiciario\b', 'Judiciário'),
    (r'\bjudiciaria\b', 'judiciária'), (r'\bJudiciaria\b', 'Judiciária'),

    (r'\bnecessario\b', 'necessário'), (r'\bNecessario\b', 'Necessário'),
    (r'\bnecessaria\b', 'necessária'), (r'\bNecessaria\b', 'Necessária'),
    (r'\bnecessarias\b', 'necessárias'),
    (r'\bnecessarios\b', 'necessários'),

    (r'\bobrigatorio\b', 'obrigatório'), (r'\bObrigatorio\b', 'Obrigatório'),
    (r'\bobrigatoria\b', 'obrigatória'), (r'\bObrigatoria\b', 'Obrigatória'),
    (r'\bOBRIGATORIO\b', 'OBRIGATÓRIO'),

    (r'\bbeneficio\b', 'benefício'), (r'\bBeneficio\b', 'Benefício'),
    (r'\bbeneficios\b', 'benefícios'), (r'\bBeneficios\b', 'Benefícios'),

    (r'\bbasico\b', 'básico'), (r'\bBasico\b', 'Básico'),
    (r'\bbasica\b', 'básica'), (r'\bBasica\b', 'Básica'),

    (r'\beconomica\b', 'econômica'), (r'\bEconomica\b', 'Econômica'),
    (r'\beconomico\b', 'econômico'), (r'\bEconomico\b', 'Econômico'),

    (r'\bjuridico\b', 'jurídico'), (r'\bJuridico\b', 'Jurídico'),
    (r'\bjuridica\b', 'jurídica'), (r'\bJuridica\b', 'Jurídica'),
    (r'\bjuridicas\b', 'jurídicas'),

    (r'\bpratica\b', 'prática'), (r'\bPratica\b', 'Prática'),
    (r'\bpraticas\b', 'práticas'), (r'\bPraticas\b', 'Práticas'),
    (r'\bpratico\b', 'prático'), (r'\bPratico\b', 'Prático'),

    (r'\btecnico\b', 'técnico'), (r'\bTecnico\b', 'Técnico'),
    (r'\btecnica\b', 'técnica'), (r'\bTecnica\b', 'Técnica'),

    (r'\bautomatico\b', 'automático'), (r'\bAutomatico\b', 'Automático'),
    (r'\bautomatica\b', 'automática'), (r'\bAutomatica\b', 'Automática'),

    (r'\brapido\b', 'rápido'), (r'\bRapido\b', 'Rápido'),
    (r'\brapida\b', 'rápida'), (r'\bRapida\b', 'Rápida'),

    (r'\bduvidas\b', 'dúvidas'), (r'\bDuvidas\b', 'Dúvidas'),
    (r'\bduvida\b', 'dúvida'), (r'\bDuvida\b', 'Dúvida'),

    (r'\bcarater\b', 'caráter'), (r'\bCarater\b', 'Caráter'),
    (r'\bcalculo\b', 'cálculo'), (r'\bCalculo\b', 'Cálculo'),
    (r'\bcalculos\b', 'cálculos'), (r'\bCalculos\b', 'Cálculos'),

    (r'\bnivel\b', 'nível'), (r'\bNivel\b', 'Nível'),
    (r'\bniveis\b', 'níveis'), (r'\bNiveis\b', 'Níveis'),

    (r'\bambito\b', 'âmbito'), (r'\bAmbito\b', 'Âmbito'),

    (r'\bonibus\b', 'ônibus'), (r'\bOnibus\b', 'Ônibus'),
    (r'\bmetro\b', 'metrô'), (r'\bMetro\b', 'Metrô'),

    (r'\bvideos\b', 'vídeos'), (r'\bVideos\b', 'Vídeos'),
    (r'\bvideo\b', 'vídeo'), (r'\bVideo\b', 'Vídeo'),
    (r'\baudios\b', 'áudios'), (r'\bAudios\b', 'Áudios'),
    (r'\baudio\b', 'áudio'), (r'\bAudio\b', 'Áudio'),

    (r'\bpopulacao\b', 'população'), (r'\bPopulacao\b', 'População'),
    (r'\bdiscriminacao\b', 'discriminação'), (r'\bDiscriminacao\b', 'Discriminação'),
    (r'\blegislacao\b', 'legislação'), (r'\bLegislacao\b', 'Legislação'),

    (r'\bdistancia\b', 'distância'), (r'\bDistancia\b', 'Distância'),
    (r'\bimportancia\b', 'importância'), (r'\bImportancia\b', 'Importância'),
    (r'\binfancia\b', 'infância'), (r'\bInfancia\b', 'Infância'),
    (r'\bcircunstancia\b', 'circunstância'),
    (r'\bcircunstancias\b', 'circunstâncias'),

    (r'\bfrequencia\b', 'frequência'), (r'\bFrequencia\b', 'Frequência'),
    (r'\bemergencia\b', 'emergência'), (r'\bEmergencia\b', 'Emergência'),
    (r'\bemergencias\b', 'emergências'),
    (r'\burgencia\b', 'urgência'), (r'\bUrgencia\b', 'Urgência'),
    (r'\bassistencia\b', 'assistência'), (r'\bAssistencia\b', 'Assistência'),
    (r'\bpaciencia\b', 'paciência'), (r'\bPaciencia\b', 'Paciência'),
    (r'\bexperiencia\b', 'experiência'), (r'\bExperiencia\b', 'Experiência'),
    (r'\binsuficiencia\b', 'insuficiência'),
    (r'\bresidencia\b', 'residência'), (r'\bResidencia\b', 'Residência'),
    (r'\btendencia\b', 'tendência'), (r'\bTendencia\b', 'Tendência'),
    (r'\bconveniencia\b', 'conveniência'),
    (r'\bconsciencia\b', 'consciência'), (r'\bConsciencia\b', 'Consciência'),
    (r'\bprevidencia\b', 'previdência'), (r'\bPrevidencia\b', 'Previdência'),
    (r'\bprevidenciaria\b', 'previdenciária'),
    (r'\bprevidenciario\b', 'previdenciário'),

    # Plurais "-oes" / "-ao" perdidos
    (r'\binscricao\b', 'inscrição'), (r'\bInscricao\b', 'Inscrição'),
    (r'\binscricoes\b', 'inscrições'),
    (r'\blesoes\b', 'lesões'), (r'\bLesoes\b', 'Lesões'),
    (r'\bdecisoes\b', 'decisões'), (r'\bDecisoes\b', 'Decisões'),
    (r'\bcondicoes\b', 'condições'), (r'\bCondicoes\b', 'Condições'),
    (r'\brelacoes\b', 'relações'), (r'\bRelacoes\b', 'Relações'),
    (r'\bfuncoes\b', 'funções'), (r'\bFuncoes\b', 'Funções'),
    (r'\bposicoes\b', 'posições'), (r'\bPosicoes\b', 'Posições'),
    (r'\bnotificacao\b', 'notificação'), (r'\bNotificacao\b', 'Notificação'),
    (r'\baplicacao\b', 'aplicação'), (r'\bAplicacao\b', 'Aplicação'),
    (r'\baplicacoes\b', 'aplicações'),
    (r'\bcomunicacao\b', 'comunicação'), (r'\bComunicacao\b', 'Comunicação'),
    (r'\bdiscriminacao\b', 'discriminação'),
    (r'\batencao\b', 'atenção'), (r'\bAtencao\b', 'Atenção'),
    (r'\badocao\b', 'adoção'), (r'\bAdocao\b', 'Adoção'),
    (r'\bexoneracao\b', 'exoneração'), (r'\bExoneracao\b', 'Exoneração'),
    (r'\bavaliacao\b', 'avaliação'), (r'\bAvaliacao\b', 'Avaliação'),
    (r'\bsuspensao\b', 'suspensão'), (r'\bSuspensao\b', 'Suspensão'),
    (r'\bsucessao\b', 'sucessão'), (r'\bSucessao\b', 'Sucessão'),
    (r'\bpunicao\b', 'punição'), (r'\bPunicao\b', 'Punição'),
    (r'\bexpedicao\b', 'expedição'), (r'\bExpedicao\b', 'Expedição'),
    (r'\blimitacoes\b', 'limitações'),
    (r'\bindicacoes\b', 'indicações'),
    (r'\borientacoes\b', 'orientações'),
    (r'\bpublicacoes\b', 'publicações'),
    (r'\bindenizacoes\b', 'indenizações'),
    (r'\boperacoes\b', 'operações'),
    (r'\breuniao\b', 'reunião'), (r'\bReuniao\b', 'Reunião'),
    (r'\bdivorcio\b', 'divórcio'), (r'\bDivorcio\b', 'Divórcio'),
    (r'\bquestoes\b', 'questões'), (r'\bQuestoes\b', 'Questões'),
    (r'\birmaos\b', 'irmãos'), (r'\bIrmaos\b', 'Irmãos'),
    (r'\bcertidao\b', 'certidão'), (r'\bCertidao\b', 'Certidão'),
    (r'\bintimidacao\b', 'intimidação'), (r'\bIntimidacao\b', 'Intimidação'),
    (r'\bsistematica\b', 'sistemática'), (r'\bSistematica\b', 'Sistemática'),
    (r'\bmanifestacao\b', 'manifestação'), (r'\bManifestacao\b', 'Manifestação'),

    # Cidades / Locais DF
    (r'\bForum\b', 'Fórum'), (r'\bforum\b', 'fórum'),
    (r'\bBrasilia\b', 'Brasília'),
    (r'\bBrazlandia\b', 'Brazlândia'),
    (r'\bCeilandia\b', 'Ceilândia'),
    (r'\bSamambaia\b', 'Samambaia'),  # já correto
    (r'\bParanoa\b', 'Paranoá'),
    (r'\bItapoa\b', 'Itapoã'),
    (r'\bGama\b', 'Gama'),  # sem acento

    # Direito penal / técnico
    (r'\bproibe\b', 'proíbe'),
    (r'\binquerito\b', 'inquérito'), (r'\bInquerito\b', 'Inquérito'),
    (r'\bpresidio\b', 'presídio'), (r'\bPresidio\b', 'Presídio'),
    (r'\bSumula\b', 'Súmula'), (r'\bSumulas\b', 'Súmulas'),
    (r'\bsumula\b', 'súmula'), (r'\bsumulas\b', 'súmulas'),

    # Saúde / corpo
    (r'\bovulo\b', 'óvulo'), (r'\bOvulo\b', 'Óvulo'),
    (r'\butero\b', 'útero'), (r'\bUtero\b', 'Útero'),
    (r'\bpelvica\b', 'pélvica'), (r'\bPelvica\b', 'Pélvica'),
    (r'\bginecologica\b', 'ginecológica'),
    (r'\bginecologico\b', 'ginecológico'),
    (r'\bprimaria\b', 'primária'), (r'\bPrimaria\b', 'Primária'),
    (r'\bpsicologos\b', 'psicólogos'),
    (r'\bpsicologo\b', 'psicólogo'),
    (r'\bpsicologa\b', 'psicóloga'),
    (r'\bserios\b', 'sérios'),
    (r'\bserio\b', 'sério'), (r'\bSerio\b', 'Sério'),
    (r'\bpanico\b', 'pânico'), (r'\bPanico\b', 'Pânico'),
    (r'\btao\b', 'tão'), (r'\bTao\b', 'Tão'),
    (r'\bmantem\b', 'mantém'), (r'\bMantem\b', 'Mantém'),
    (r'\bconcessionaria\b', 'concessionária'),
    (r'\bconcessionarias\b', 'concessionárias'),
    (r'\bpenitenciaria\b', 'penitenciária'),
    (r'\bgravida\b', 'grávida'), (r'\bGravida\b', 'Grávida'),
    (r'\bgravidicos\b', 'gravídicos'),
    (r'\bindicio\b', 'indício'), (r'\bIndicio\b', 'Indício'),
    (r'\bindicios\b', 'indícios'),
    (r'\bmatricula\b', 'matrícula'), (r'\bMatricula\b', 'Matrícula'),
    (r'\bmatriculas\b', 'matrículas'),
    (r'\bpre-escola\b', 'pré-escola'), (r'\bPre-escola\b', 'Pré-escola'),
    (r'\bmedio\b', 'médio'), (r'\bMedio\b', 'Médio'),  # ensino médio
    (r'\bmedia\b', 'média'), (r'\bMedia\b', 'Média'),  # média de
    (r'\bvariacao\b', 'variação'), (r'\bVariacao\b', 'Variação'),
    (r'\bvariacoes\b', 'variações'),

    # Numeração ordinal
    (r'\bArt\.\s*1o\b', 'Art. 1º'),
    (r'\bArt\.\s*2o\b', 'Art. 2º'),
    (r'\bArt\.\s*3o\b', 'Art. 3º'),
    (r'\bArt\.\s*4o\b', 'Art. 4º'),
    (r'\bArt\.\s*5o\b', 'Art. 5º'),
    (r'\bArt\.\s*6o\b', 'Art. 6º'),
    (r'\bArt\.\s*7o\b', 'Art. 7º'),
    (r'\bArt\.\s*8o\b', 'Art. 8º'),
    (r'\bArt\.\s*9o\b', 'Art. 9º'),
    (r'\bArtigo 1o\b', 'Artigo 1º'),
    (r'\bArtigo 2o\b', 'Artigo 2º'),
    (r'\bArtigo 5o\b', 'Artigo 5º'),
    (r'\bArtigo 6o\b', 'Artigo 6º'),
    (r'\b1o andar\b', '1º andar'),
    (r'\b2o andar\b', '2º andar'),
    (r'\b3o andar\b', '3º andar'),

    # === "e" → "é" CONTEXTOS ESPECÍFICOS (apenas onde é inequívoco) ===
    # NÃO usar padrões genéricos como " e o " (causa erros inversos).
    # Apenas casos onde "e" + adjetivo/predicativo não pode ser conjunção.
    (r'\bO BPC \*\*não e aposentadoria\*\*', 'O BPC **não é aposentadoria**'),
    (r'\bComo R\$ 200,00 e menor que', 'Como R$ 200,00 é menor que'),
    (r'\bA renda per capita e R\$', 'A renda per capita é R$'),
    (r'\bO valor e de \*\*1 salário', 'O valor é de **1 salário'),
    (r'\bE crime exigir cheque-caucao\b', 'É crime exigir cheque-caução'),
    (r'\bIsso e CRIME\b', 'Isso é CRIME'),
    (r'\bIsso não e\b', 'Isso não é'),
    (r'\bnão e um problema particular\. E um crime\b',
     'não é um problema particular. É um crime'),
    (r'\bnão e para punir -- e para garantir\b',
     'não é para punir -- é para garantir'),
    (r'\bE um benefício\b', 'É um benefício'),
    (r'\bSe o segurado especial também fez contribuições facultativas ao INSS, o cálculo',
     'Se o segurado especial também fez contribuições facultativas ao INSS, o cálculo'),  # noop, só para registro
    (r'\bo registro civil e de graça\b', 'o registro civil é de graça'),
    (r'\bquem e reconhecidamente pobre\b', 'quem é reconhecidamente pobre'),
    (r'\bO devedor e citado\b', 'O devedor é citado'),
    (r'\bagrupamentos quando o segurado especial e\b', 'agrupamentos quando o segurado especial é'),

    # "esta" → "está" (verbo) em contextos óbvios
    (r'\bvocê esta\b', 'você está'),
    (r'\bquem esta\b', 'quem está'),
    (r'\bque esta\b', 'que está'),

    # === Outros ajustes pontuais ===
    (r'\bcaucao\b', 'caução'), (r'\bCaucao\b', 'Caução'),
    (r'\bformularios\b', 'formulários'),
    (r'\bformulario\b', 'formulário'),
    (r'\bfavoraveis\b', 'favoráveis'),

    # "ate" → "até": apenas em contextos seguros (rodeado de palavras pt)
    (r' ate ', ' até '),
    (r'\(ate ', '(até '),
    (r'\bAte\b', 'Até'),

    # "ja" → "já" (advérbio)
    (r' ja ', ' já '),
    (r'\bJa\b', 'Já'),

    # "so" → "só" (advérbio "apenas") — APENAS em contextos seguros
    # NÃO usar \bso\b genérico — pode quebrar palavras compostas e nomes
    (r' so para ', ' só para '),
    (r' so se ', ' só se '),
    (r' so quando ', ' só quando '),
    (r' so o ', ' só o '),
    (r' so a ', ' só a '),
]

# Ajuste especial: "policial" foi listado por engano — não tem acento. Filtrar regra inválida.
RULES = [r for r in RULES if r != (r'\bpolicial\b', 'policial')]

# Substituir noop registrado
RULES = [r for r in RULES if not (r[0].startswith('\\bSe o segurado especial'))]


def fix_file(path: Path) -> tuple[int, dict[str, int]]:
    text = path.read_text(encoding='utf-8')
    original = text
    counts: dict[str, int] = {}
    for pat, rep in RULES:
        new_text, n = re.subn(pat, rep, text)
        if n > 0:
            counts[pat] = counts.get(pat, 0) + n
            text = new_text
    if text != original:
        path.write_text(text, encoding='utf-8')
    total = sum(counts.values())
    return total, counts


def main():
    target = Path('app/content.js')
    if not target.exists():
        print(f'ERRO: {target} não encontrado', file=sys.stderr)
        sys.exit(1)
    total, counts = fix_file(target)
    print(f'Total de substituições em {target}: {total}')
    for pat, n in sorted(counts.items(), key=lambda x: -x[1])[:30]:
        print(f'  {n:4d}  {pat}')


if __name__ == '__main__':
    main()
