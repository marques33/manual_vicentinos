#!/usr/bin/env python3
"""
Script para corrigir acentuação em arquivos markdown e JS do Manual Vicentino.
Usa regex com word boundaries para evitar falsos positivos.
"""
import os
import re
import glob

# Substituições seguras com word boundary (\b)
# Formato: (padrão_regex, substituição)
# Todas usam \b para não afetar substrings de outras palavras
WORD_REPLACEMENTS = [
    # === PALAVRAS COM -ção / -ções ===
    (r'\bacao\b', 'ação'), (r'\bAcao\b', 'Ação'),
    (r'\bacoes\b', 'ações'), (r'\bAcoes\b', 'Ações'),
    (r'\bsituacao\b', 'situação'), (r'\bSituacao\b', 'Situação'),
    (r'\bsituacoes\b', 'situações'), (r'\bSituacoes\b', 'Situações'),
    (r'\binformacao\b', 'informação'), (r'\bInformacao\b', 'Informação'),
    (r'\binformacoes\b', 'informações'), (r'\bInformacoes\b', 'Informações'),
    (r'\borientacao\b', 'orientação'), (r'\bOrientacao\b', 'Orientação'),
    (r'\borientacoes\b', 'orientações'),
    (r'\bprestacao\b', 'prestação'), (r'\bPrestacao\b', 'Prestação'),
    (r'\bprotecao\b', 'proteção'), (r'\bProtecao\b', 'Proteção'),
    (r'\beducacao\b', 'educação'), (r'\bEducacao\b', 'Educação'),
    (r'\balimentacao\b', 'alimentação'), (r'\bAlimentacao\b', 'Alimentação'),
    (r'\breclamacao\b', 'reclamação'), (r'\bReclamacao\b', 'Reclamação'),
    (r'\breclamacoes\b', 'reclamações'), (r'\bReclamacoes\b', 'Reclamações'),
    (r'\bhabitacao\b', 'habitação'), (r'\bHabitacao\b', 'Habitação'),
    (r'\bcontribuicao\b', 'contribuição'), (r'\bContribuicao\b', 'Contribuição'),
    (r'\bcontribuicoes\b', 'contribuições'), (r'\bContribuicoes\b', 'Contribuições'),
    (r'\bpensao\b', 'pensão'), (r'\bPensao\b', 'Pensão'),
    (r'\bpensoes\b', 'pensões'), (r'\bPensoes\b', 'Pensões'),
    (r'\bconcessao\b', 'concessão'), (r'\bConcessao\b', 'Concessão'),
    (r'\bagressao\b', 'agressão'), (r'\bAgressao\b', 'Agressão'),
    (r'\bobrigacao\b', 'obrigação'), (r'\bObrigacao\b', 'Obrigação'),
    (r'\bobrigacoes\b', 'obrigações'), (r'\bObrigacoes\b', 'Obrigações'),
    (r'\bviolacao\b', 'violação'), (r'\bViolacao\b', 'Violação'),
    (r'\bviolacoes\b', 'violações'),
    (r'\binscricao\b', 'inscrição'), (r'\bInscricao\b', 'Inscrição'),
    (r'\binscricoes\b', 'inscrições'),
    (r'\bsolicitacao\b', 'solicitação'), (r'\bSolicitacao\b', 'Solicitação'),
    (r'\balteracao\b', 'alteração'), (r'\bAlteracao\b', 'Alteração'),
    (r'\balteracoes\b', 'alterações'), (r'\bAlteracoes\b', 'Alterações'),
    (r'\batualizacao\b', 'atualização'), (r'\bAtualizacao\b', 'Atualização'),
    (r'\bconstituicao\b', 'constituição'), (r'\bConstituicao\b', 'Constituição'),
    (r'\bidentificacao\b', 'identificação'), (r'\bIdentificacao\b', 'Identificação'),
    (r'\bclassificacao\b', 'classificação'), (r'\bClassificacao\b', 'Classificação'),
    (r'\bmanutencao\b', 'manutenção'), (r'\bManutencao\b', 'Manutenção'),
    (r'\bprevencao\b', 'prevenção'), (r'\bPrevencao\b', 'Prevenção'),
    (r'\bremuneracao\b', 'remuneração'), (r'\bRemuneracao\b', 'Remuneração'),
    (r'\batencao\b', 'atenção'), (r'\bAtencao\b', 'Atenção'),
    (r'\breparacao\b', 'reparação'),
    (r'\blegislacao\b', 'legislação'), (r'\bLegislacao\b', 'Legislação'),
    (r'\borganizacao\b', 'organização'), (r'\bOrganizacao\b', 'Organização'),
    (r'\borganizacoes\b', 'organizações'),
    (r'\bmanifestacao\b', 'manifestação'),
    (r'\badministracao\b', 'administração'), (r'\bAdministracao\b', 'Administração'),
    (r'\badministracoes\b', 'administrações'), (r'\bAdministracoes\b', 'Administrações'),
    (r'\bindenizacao\b', 'indenização'), (r'\bIndenizacao\b', 'Indenização'),
    (r'\breavaliacao\b', 'reavaliação'),
    (r'\bparticipacao\b', 'participação'), (r'\bParticipacao\b', 'Participação'),
    (r'\bconfirmacao\b', 'confirmação'),
    (r'\bcomprovacao\b', 'comprovação'), (r'\bComprovacao\b', 'Comprovação'),
    (r'\bdeclaracao\b', 'declaração'), (r'\bDeclaracao\b', 'Declaração'),
    (r'\bdeclaracoes\b', 'declarações'),
    (r'\bpublicacao\b', 'publicação'),
    (r'\bcondicao\b', 'condição'), (r'\bCondicao\b', 'Condição'),
    (r'\bcondicoes\b', 'condições'), (r'\bCondicoes\b', 'Condições'),
    (r'\bexcecao\b', 'exceção'), (r'\bExcecao\b', 'Exceção'),
    (r'\bexcecoes\b', 'exceções'), (r'\bExcecoes\b', 'Exceções'),
    (r'\bdecisao\b', 'decisão'), (r'\bDecisao\b', 'Decisão'),
    (r'\bdecisoes\b', 'decisões'),
    (r'\bexecucao\b', 'execução'), (r'\bExecucao\b', 'Execução'),
    (r'\bexoneracao\b', 'exoneração'), (r'\bExoneracao\b', 'Exoneração'),
    (r'\balienacao\b', 'alienação'), (r'\bAlienacao\b', 'Alienação'),
    (r'\baquisicao\b', 'aquisição'),
    (r'\bcomunicacao\b', 'comunicação'),
    (r'\bnotificacao\b', 'notificação'), (r'\bNotificacao\b', 'Notificação'),
    (r'\bprorrogacao\b', 'prorrogação'), (r'\bProrrogacao\b', 'Prorrogação'),
    (r'\bduracao\b', 'duração'), (r'\bDuracao\b', 'Duração'),
    (r'\bdetencao\b', 'detenção'), (r'\bDetencao\b', 'Detenção'),
    (r'\breclusao\b', 'reclusão'), (r'\bReclusao\b', 'Reclusão'),
    (r'\bcessacao\b', 'cessação'), (r'\bCessacao\b', 'Cessação'),
    (r'\bsuspensao\b', 'suspensão'), (r'\bSuspensao\b', 'Suspensão'),
    (r'\butilizacao\b', 'utilização'),
    (r'\breabilitacao\b', 'reabilitação'),
    (r'\brepactuacao\b', 'repactuação'), (r'\bRepactuacao\b', 'Repactuação'),
    (r'\bnegociacao\b', 'negociação'), (r'\bNegociacao\b', 'Negociação'),
    (r'\breducao\b', 'redução'), (r'\bReducao\b', 'Redução'),
    (r'\bproducao\b', 'produção'),
    (r'\binstrucao\b', 'instrução'),
    (r'\binstrucoes\b', 'instruções'),
    (r'\bconstrucao\b', 'construção'),
    (r'\bdistribuicao\b', 'distribuição'),
    (r'\binstituicao\b', 'instituição'), (r'\bInstituicao\b', 'Instituição'),
    (r'\binstituicoes\b', 'instituições'), (r'\bInstituicoes\b', 'Instituições'),
    (r'\brestituicao\b', 'restituição'),
    (r'\bsubstituicao\b', 'substituição'),
    (r'\bresolucao\b', 'resolução'), (r'\bResolucao\b', 'Resolução'),
    (r'\brevisao\b', 'revisão'), (r'\bRevisao\b', 'Revisão'),
    (r'\bprofissao\b', 'profissão'),
    (r'\bprisao\b', 'prisão'), (r'\bPrisao\b', 'Prisão'),
    (r'\bapreensao\b', 'apreensão'),
    (r'\bintervencao\b', 'intervenção'), (r'\bIntervencao\b', 'Intervenção'),
    (r'\bisencao\b', 'isenção'), (r'\bIsencao\b', 'Isenção'),
    (r'\bisencoes\b', 'isenções'),
    (r'\bpeticao\b', 'petição'), (r'\bPeticao\b', 'Petição'),
    (r'\bavaliacao\b', 'avaliação'), (r'\bAvaliacao\b', 'Avaliação'),
    (r'\baplicacao\b', 'aplicação'),
    (r'\bverificacao\b', 'verificação'),
    (r'\bqualificacao\b', 'qualificação'),
    (r'\bomissao\b', 'omissão'), (r'\bOmissao\b', 'Omissão'),
    (r'\bcomissao\b', 'comissão'), (r'\bComissao\b', 'Comissão'),
    (r'\bdemissao\b', 'demissão'), (r'\bDemissao\b', 'Demissão'),
    (r'\brescisao\b', 'rescisão'), (r'\bRescisao\b', 'Rescisão'),
    (r'\bsecao\b', 'seção'), (r'\bSecao\b', 'Seção'),
    (r'\bsecoes\b', 'seções'), (r'\bSecoes\b', 'Seções'),
    (r'\bcontinuacao\b', 'continuação'),
    (r'\bgraduacao\b', 'graduação'),
    (r'\bdivulgacao\b', 'divulgação'),
    (r'\bconvocacao\b', 'convocação'),
    (r'\bretencao\b', 'retenção'),
    (r'\bextensao\b', 'extensão'),
    (r'\bpermissao\b', 'permissão'),
    (r'\badesao\b', 'adesão'),
    (r'\bprogressao\b', 'progressão'),
    (r'\batenuacao\b', 'atenuação'),
    (r'\bcontencao\b', 'contenção'),
    (r'\brenovacao\b', 'renovação'),

    # === PALAVRAS COM -ência / -ência ===
    (r'\bviolencia\b', 'violência'), (r'\bViolencia\b', 'Violência'),
    (r'\bemergencia\b', 'emergência'), (r'\bEmergencia\b', 'Emergência'),
    (r'\bfrequencia\b', 'frequência'), (r'\bFrequencia\b', 'Frequência'),
    (r'\baudiencia\b', 'audiência'), (r'\bAudiencia\b', 'Audiência'),
    (r'\bassistencia\b', 'assistência'), (r'\bAssistencia\b', 'Assistência'),
    (r'\bcompetencia\b', 'competência'), (r'\bCompetencia\b', 'Competência'),
    (r'\bconvivencia\b', 'convivência'), (r'\bConvivencia\b', 'Convivência'),
    (r'\binadimplencia\b', 'inadimplência'),
    (r'\bdependencia\b', 'dependência'), (r'\bDependencia\b', 'Dependência'),
    (r'\bprevidencia\b', 'previdência'), (r'\bPrevidencia\b', 'Previdência'),
    (r'\bexistencia\b', 'existência'),
    (r'\bdeficiencia\b', 'deficiência'), (r'\bDeficiencia\b', 'Deficiência'),
    (r'\bpermanencia\b', 'permanência'),
    (r'\bconsequencia\b', 'consequência'), (r'\bConsequencia\b', 'Consequência'),
    (r'\bconsequencias\b', 'consequências'), (r'\bConsequencias\b', 'Consequências'),
    (r'\breferencia\b', 'referência'), (r'\bReferencia\b', 'Referência'),
    (r'\breferencias\b', 'referências'), (r'\bReferencias\b', 'Referências'),
    (r'\bresidencia\b', 'residência'), (r'\bResidencia\b', 'Residência'),
    (r'\bcarencia\b', 'carência'), (r'\bCarencia\b', 'Carência'),
    (r'\bexigencia\b', 'exigência'), (r'\bExigencia\b', 'Exigência'),
    (r'\bexigencias\b', 'exigências'),
    (r'\burgencia\b', 'urgência'), (r'\bUrgencia\b', 'Urgência'),
    (r'\bocorrencia\b', 'ocorrência'), (r'\bOcorrencia\b', 'Ocorrência'),
    (r'\bvigencia\b', 'vigência'), (r'\bVigencia\b', 'Vigência'),
    (r'\breincidencia\b', 'reincidência'),
    (r'\bprovidencia\b', 'providência'),
    (r'\bexperiencia\b', 'experiência'),
    (r'\bincidencia\b', 'incidência'),

    # === PALAVRAS COM -úncia ===
    (r'\bdenuncia\b', 'denúncia'), (r'\bDenuncia\b', 'Denúncia'),
    (r'\bdenuncias\b', 'denúncias'), (r'\bDenuncias\b', 'Denúncias'),

    # === PALAVRAS COM -ício / -ício ===
    (r'\bbeneficio\b', 'benefício'), (r'\bBeneficio\b', 'Benefício'),
    (r'\bbeneficios\b', 'benefícios'), (r'\bBeneficios\b', 'Benefícios'),
    (r'\bexercicio\b', 'exercício'), (r'\bExercicio\b', 'Exercício'),
    (r'\bdomicilio\b', 'domicílio'), (r'\bDomicilio\b', 'Domicílio'),
    (r'\bvitalicio\b', 'vitalício'), (r'\bVitalicio\b', 'Vitalício'),
    (r'\bvitalicia\b', 'vitalícia'),
    (r'\balimenticio\b', 'alimentício'),
    (r'\balimenticia\b', 'alimentícia'), (r'\bAlimenticia\b', 'Alimentícia'),

    # === PALAVRAS COM -ário / -ária ===
    (r'\bsalario\b', 'salário'), (r'\bSalario\b', 'Salário'),
    (r'\bsalarios\b', 'salários'),
    (r'\bformulario\b', 'formulário'), (r'\bFormulario\b', 'Formulário'),
    (r'\btemporario\b', 'temporário'), (r'\bTemporario\b', 'Temporário'),
    (r'\btemporaria\b', 'temporária'),
    (r'\bnecessario\b', 'necessário'), (r'\bNecessario\b', 'Necessário'),
    (r'\bnecessarios\b', 'necessários'), (r'\bNecessarios\b', 'Necessários'),
    (r'\bnecessaria\b', 'necessária'), (r'\bNecessaria\b', 'Necessária'),
    (r'\bnecessarias\b', 'necessárias'),
    (r'\bcalendario\b', 'calendário'), (r'\bCalendario\b', 'Calendário'),
    (r'\bfuncionario\b', 'funcionário'), (r'\bfuncionarios\b', 'funcionários'),
    (r'\bprevidenciario\b', 'previdenciário'), (r'\bPrevidenciario\b', 'Previdenciário'),
    (r'\bprevidenciarios\b', 'previdenciários'),
    (r'\bjudiciario\b', 'judiciário'), (r'\bJudiciario\b', 'Judiciário'),
    (r'\bobrigatorio\b', 'obrigatório'), (r'\bObrigatorio\b', 'Obrigatório'),
    (r'\bobrigatoria\b', 'obrigatória'), (r'\bObrigatoria\b', 'Obrigatória'),
    (r'\bprovisorio\b', 'provisório'), (r'\bProvisorio\b', 'Provisório'),
    (r'\bprovisoria\b', 'provisória'), (r'\bProvisoria\b', 'Provisória'),
    (r'\bprovisoriamente\b', 'provisoriamente'),
    (r'\bvoluntario\b', 'voluntário'), (r'\bvoluntarios\b', 'voluntários'),
    (r'\bcontrario\b', 'contrário'),
    (r'\bordinario\b', 'ordinário'),
    (r'\bambulatorio\b', 'ambulatório'), (r'\bAmbulatorio\b', 'Ambulatório'),
    (r'\blaboratorio\b', 'laboratório'),

    # === PALAVRAS COM -ônio / -ômio ===
    (r'\bpatrimonio\b', 'patrimônio'), (r'\bPatrimonio\b', 'Patrimônio'),
    (r'\bmatrimonio\b', 'matrimônio'),

    # === SUBSTANTIVOS COMUNS ===
    (r'\bfamilia\b', 'família'), (r'\bFamilia\b', 'Família'),
    (r'\bfamilias\b', 'famílias'), (r'\bFamilias\b', 'Famílias'),
    (r'\bnumero\b', 'número'), (r'\bNumero\b', 'Número'),
    (r'\bnumeros\b', 'números'),
    (r'\bperiodo\b', 'período'), (r'\bPeriodo\b', 'Período'),
    (r'\bperiodos\b', 'períodos'),
    (r'\bhorario\b', 'horário'), (r'\bHorario\b', 'Horário'),
    (r'\bhorarios\b', 'horários'),
    (r'\bcodigo\b', 'código'), (r'\bCodigo\b', 'Código'),
    (r'\bcodigos\b', 'códigos'),
    (r'\btitulo\b', 'título'), (r'\bTitulo\b', 'Título'),
    (r'\bcapitulo\b', 'capítulo'),
    (r'\bveiculo\b', 'veículo'), (r'\bveiculos\b', 'veículos'),
    (r'\bvinculo\b', 'vínculo'), (r'\bvinculos\b', 'vínculos'),
    (r'\bindice\b', 'índice'), (r'\bIndice\b', 'Índice'),
    (r'\borgao\b', 'órgão'), (r'\bOrgao\b', 'Órgão'),
    (r'\borgaos\b', 'órgãos'), (r'\bOrgaos\b', 'Órgãos'),
    (r'\bcidadao\b', 'cidadão'), (r'\bCidadao\b', 'Cidadão'),
    (r'\bcidadaos\b', 'cidadãos'),
    (r'\bobito\b', 'óbito'), (r'\bObito\b', 'Óbito'),
    (r'\bconjuge\b', 'cônjuge'), (r'\bConjuge\b', 'Cônjuge'),
    (r'\bconjuges\b', 'cônjuges'),
    (r'\bcustodia\b', 'custódia'), (r'\bCustodia\b', 'Custódia'),
    (r'\banalise\b', 'análise'), (r'\bAnalise\b', 'Análise'),
    (r'\bsindrome\b', 'síndrome'),
    (r'\bjuizo\b', 'juízo'), (r'\bJuizo\b', 'Juízo'),
    (r'\bprejuizo\b', 'prejuízo'),
    (r'\bgenero\b', 'gênero'), (r'\bGenero\b', 'Gênero'),
    (r'\btransito\b', 'trânsito'), (r'\bTransito\b', 'Trânsito'),
    (r'\bauxilio\b', 'auxílio'), (r'\bAuxilio\b', 'Auxílio'),
    (r'\bauxilios\b', 'auxílios'), (r'\bAuxilios\b', 'Auxílios'),
    (r'\bmunicipio\b', 'município'), (r'\bmunicipios\b', 'municípios'),
    (r'\bindividuo\b', 'indivíduo'), (r'\bindividuos\b', 'indivíduos'),
    (r'\bcontinuo\b', 'contínuo'), (r'\bContinuo\b', 'Contínuo'),
    (r'\bcontinua\b', 'contínua'), (r'\bContinua\b', 'Contínua'),  # cuidado com verbo
    (r'\bpolicia\b', 'polícia'), (r'\bPolicia\b', 'Polícia'),
    (r'\bagencia\b', 'agência'), (r'\bAgencia\b', 'Agência'),
    (r'\bagencias\b', 'agências'),
    (r'\binfancia\b', 'infância'), (r'\bInfancia\b', 'Infância'),
    (r'\bsubstancia\b', 'substância'),
    (r'\banuncio\b', 'anúncio'),
    (r'\bsaude\b', 'saúde'), (r'\bSaude\b', 'Saúde'),
    (r'\balcool\b', 'álcool'),

    # === ADJETIVOS ===
    (r'\bunico\b', 'único'), (r'\bUnico\b', 'Único'),
    (r'\bunica\b', 'única'), (r'\bUnica\b', 'Única'),
    (r'\bjuridico\b', 'jurídico'), (r'\bJuridico\b', 'Jurídico'),
    (r'\bjuridica\b', 'jurídica'), (r'\bJuridica\b', 'Jurídica'),
    (r'\bjuridicos\b', 'jurídicos'), (r'\bjuridicas\b', 'jurídicas'),
    (r'\bpublico\b', 'público'), (r'\bPublico\b', 'Público'),
    (r'\bpublicos\b', 'públicos'),
    (r'\bpublica\b', 'pública'), (r'\bPublica\b', 'Pública'),
    (r'\bpublicas\b', 'públicas'),
    (r'\bmedico\b', 'médico'), (r'\bMedico\b', 'Médico'),
    (r'\bmedicos\b', 'médicos'),
    (r'\bmedica\b', 'médica'), (r'\bMedica\b', 'Médica'),
    (r'\bmedicas\b', 'médicas'),
    (r'\bbasico\b', 'básico'), (r'\bBasico\b', 'Básico'),
    (r'\bbasicos\b', 'básicos'),
    (r'\bbasica\b', 'básica'), (r'\bBasica\b', 'Básica'),
    (r'\bbasicas\b', 'básicas'),
    (r'\bdomestico\b', 'doméstico'), (r'\bDomestico\b', 'Doméstico'),
    (r'\bdomestica\b', 'doméstica'), (r'\bDomestica\b', 'Doméstica'),
    (r'\bdomesticos\b', 'domésticos'), (r'\bdomesticas\b', 'domésticas'),
    (r'\beconomico\b', 'econômico'), (r'\bEconomico\b', 'Econômico'),
    (r'\beconomica\b', 'econômica'), (r'\bEconomica\b', 'Econômica'),
    (r'\bpsicologico\b', 'psicológico'), (r'\bPsicologico\b', 'Psicológico'),
    (r'\bpsicologica\b', 'psicológica'), (r'\bPsicologica\b', 'Psicológica'),
    (r'\bfisico\b', 'físico'), (r'\bFisico\b', 'Físico'),
    (r'\bfisica\b', 'física'), (r'\bFisica\b', 'Física'),
    (r'\bminimo\b', 'mínimo'), (r'\bMinimo\b', 'Mínimo'),
    (r'\bminima\b', 'mínima'), (r'\bMinima\b', 'Mínima'),
    (r'\bmaximo\b', 'máximo'), (r'\bMaximo\b', 'Máximo'),
    (r'\bmaxima\b', 'máxima'),
    (r'\bvalido\b', 'válido'), (r'\bvalida\b', 'válida'),
    (r'\binvalido\b', 'inválido'), (r'\binvalida\b', 'inválida'),
    (r'\bproprio\b', 'próprio'), (r'\bProprio\b', 'Próprio'),
    (r'\bpropria\b', 'própria'), (r'\bPropria\b', 'Própria'),
    (r'\bproprios\b', 'próprios'), (r'\bproprias\b', 'próprias'),
    (r'\bespecifico\b', 'específico'), (r'\bEspecifico\b', 'Específico'),
    (r'\bespecifica\b', 'específica'), (r'\bEspecifica\b', 'Específica'),
    (r'\bespecificos\b', 'específicos'), (r'\bespecificas\b', 'específicas'),
    (r'\bpratico\b', 'prático'), (r'\bPratico\b', 'Prático'),
    (r'\bpratica\b', 'prática'), (r'\bPratica\b', 'Prática'),
    (r'\bpraticas\b', 'práticas'),
    (r'\bprevio\b', 'prévio'), (r'\bPrevio\b', 'Prévio'),
    (r'\bprevia\b', 'prévia'), (r'\bPrevia\b', 'Prévia'),
    (r'\beletrica\b', 'elétrica'), (r'\bEletrica\b', 'Elétrica'),
    (r'\beletrico\b', 'elétrico'), (r'\bEletrico\b', 'Elétrico'),
    (r'\beletronica\b', 'eletrônica'), (r'\bEletronica\b', 'Eletrônica'),
    (r'\beletronico\b', 'eletrônico'),
    (r'\bautonomo\b', 'autônomo'), (r'\bautonoma\b', 'autônoma'),
    (r'\banonimo\b', 'anônimo'), (r'\bAnonimo\b', 'Anônimo'),
    (r'\banonima\b', 'anônima'),
    (r'\bperiodico\b', 'periódico'), (r'\bperiodica\b', 'periódica'),
    (r'\bsocioeconomico\b', 'socioeconômico'), (r'\bsocioeconomica\b', 'socioeconômica'),
    (r'\bdiagnostico\b', 'diagnóstico'),

    # === -ável / -ível ===
    (r'\bpossivel\b', 'possível'), (r'\bPossivel\b', 'Possível'),
    (r'\bimpossivel\b', 'impossível'),
    (r'\bresponsavel\b', 'responsável'), (r'\bResponsavel\b', 'Responsável'),
    (r'\bresponsaveis\b', 'responsáveis'),
    (r'\bdisponivel\b', 'disponível'), (r'\bDisponivel\b', 'Disponível'),
    (r'\bdisponiveis\b', 'disponíveis'), (r'\bDisponiveis\b', 'Disponíveis'),
    (r'\bvulneravel\b', 'vulnerável'), (r'\bVulneravel\b', 'Vulnerável'),
    (r'\bvulneraveis\b', 'vulneráveis'), (r'\bVulneraveis\b', 'Vulneráveis'),
    (r'\bacessivel\b', 'acessível'),
    (r'\bduravel\b', 'durável'), (r'\bduraveis\b', 'duráveis'),
    (r'\bestavel\b', 'estável'), (r'\bEstavel\b', 'Estável'),
    (r'\bimovel\b', 'imóvel'), (r'\bImovel\b', 'Imóvel'),
    (r'\bimoveis\b', 'imóveis'), (r'\bImoveis\b', 'Imóveis'),
    (r'\btransferivel\b', 'transferível'),
    (r'\bintransferivel\b', 'intransferível'),
    (r'\bcabivel\b', 'cabível'),
    (r'\baplicavel\b', 'aplicável'),
    (r'\binviolavel\b', 'inviolável'),

    # === -útil / -ácil ===
    (r'\butil\b', 'útil'), (r'\bUtil\b', 'Útil'),
    (r'\buteis\b', 'úteis'), (r'\bUteis\b', 'Úteis'),
    (r'\bfacil\b', 'fácil'), (r'\bFacil\b', 'Fácil'),
    (r'\bdificil\b', 'difícil'),

    # === VÍTIMA ===
    (r'\bvitima\b', 'vítima'), (r'\bVitima\b', 'Vítima'),
    (r'\bvitimas\b', 'vítimas'), (r'\bVitimas\b', 'Vítimas'),
    (r'\blegitima\b', 'legítima'), (r'\bLegitima\b', 'Legítima'),

    # === ADVÉRBIOS E PREPOSIÇÕES ===
    (r'\balem\b', 'além'), (r'\bAlem\b', 'Além'),
    (r'\btambem\b', 'também'), (r'\bTambem\b', 'Também'),
    (r'\bporem\b', 'porém'), (r'\bPorem\b', 'Porém'),
    (r'\balguem\b', 'alguém'),
    (r'\bninguem\b', 'ninguém'), (r'\bNinguem\b', 'Ninguém'),
    (r'\bapos\b', 'após'), (r'\bApos\b', 'Após'),
    (r'\batras\b', 'atrás'),
    (r'\batraves\b', 'através'), (r'\bAtraves\b', 'Através'),
    (r'\brecem\b', 'recém'), (r'\bRecem\b', 'Recém'),

    # === "até" (com cuidado - word boundary) ===
    (r'\bate\b', 'até'), (r'\bAte\b', 'Até'),

    # === "não" ===
    (r'\bnao\b', 'não'), (r'\bNao\b', 'Não'),

    # === "só", "já", "lá" (word boundary evita problemas) ===
    (r'\bso\b', 'só'), (r'\bSo\b', 'Só'),
    (r'\bja\b', 'já'), (r'\bJa\b', 'Já'),

    # === "três", "mês" ===
    (r'\btres\b', 'três'), (r'\bTres\b', 'Três'),
    (r'\bmes\b', 'mês'), (r'\bMes\b', 'Mês'),

    # === VERBOS ===
    (r'\bestao\b', 'estão'), (r'\bEstao\b', 'Estão'),
    (r'\bserao\b', 'serão'), (r'\bSerao\b', 'Serão'),
    (r'\bterao\b', 'terão'),
    (r'\bdeverao\b', 'deverão'),
    (r'\bpoderao\b', 'poderão'),
    (r'\breceberao\b', 'receberão'),
    (r'\bfarao\b', 'farão'),
    (r'\birao\b', 'irão'),
    (r'\bpagarao\b', 'pagarão'),
    (r'\bficarao\b', 'ficarão'),

    # "será", "terá", "deverá", "poderá", "haverá", "receberá", etc.
    (r'\bsera\b', 'será'), (r'\bSera\b', 'Será'),
    (r'\btera\b', 'terá'), (r'\bTera\b', 'Terá'),
    (r'\bdevera\b', 'deverá'), (r'\bDevera\b', 'Deverá'),
    (r'\bpodera\b', 'poderá'), (r'\bPodera\b', 'Poderá'),
    (r'\bhavera\b', 'haverá'), (r'\bHavera\b', 'Haverá'),
    (r'\brecebera\b', 'receberá'),
    (r'\bficara\b', 'ficará'),
    (r'\bpagara\b', 'pagará'),
    (r'\bocorrera\b', 'ocorrerá'),

    # "está" — usar contexto para distinguir de "esta"
    # Padrões seguros para "está":
    (r'\besta\b(?= (?:em|no|na|sendo|previsto|prevista|incluido|incluida|localizado|localizada|cadastrado|cadastrada|disponivel|vinculado|vinculada|sujeito|sujeita|obrigado|obrigada|impedido|impedida|registrado|registrada|inserido|inserida|situado|situada|grávida|gravida|doente|preso|presa|desempregado|desempregada|incapaz|apto|apta|isento|isenta))', 'está'),
    (r'\bVoce esta\b', 'Você está'),
    (r'\bvoce esta\b', 'você está'),
    (r'\bnao esta\b', 'não está'),
    (r'\bse esta\b', 'se está'),
    (r'\bque esta\b', 'que está'),
    (r'\bainda esta\b', 'ainda está'),
    (r'\bja esta\b', 'já está'),

    # === PALAVRAS COM CEDILHA ===
    (r'\bservico\b', 'serviço'), (r'\bServico\b', 'Serviço'),
    (r'\bservicos\b', 'serviços'), (r'\bServicos\b', 'Serviços'),
    (r'\bendereco\b', 'endereço'), (r'\bEndereco\b', 'Endereço'),
    (r'\benderecos\b', 'endereços'), (r'\bEnderecos\b', 'Endereços'),
    (r'\bpreco\b', 'preço'), (r'\bprecos\b', 'preços'),
    (r'\blicenca\b', 'licença'),
    (r'\bsentenca\b', 'sentença'), (r'\bSentenca\b', 'Sentença'),
    (r'\bcrianca\b', 'criança'), (r'\bCrianca\b', 'Criança'),
    (r'\bcriancas\b', 'crianças'), (r'\bCriancas\b', 'Crianças'),
    (r'\bmudanca\b', 'mudança'), (r'\bmudancas\b', 'mudanças'),
    (r'\bcobranca\b', 'cobrança'), (r'\bcobrancas\b', 'cobranças'),
    (r'\bseguranca\b', 'segurança'), (r'\bSeguranca\b', 'Segurança'),
    (r'\blancamento\b', 'lançamento'),

    # === "você" ===
    (r'\bvoce\b', 'você'), (r'\bVoce\b', 'Você'),

    # === "é" (verbo ser) — SOMENTE em contextos inequívocos ===
    # Padrão: "X é Y" onde Y é adjetivo/substantivo conhecido
    (r' e o ', ' é o '), (r' e a ', ' é a '),
    (r' e um ', ' é um '), (r' e uma ', ' é uma '),
    (r' e que ', ' é que '),
    (r'\bO que e\b', 'O que é'), (r'\bo que e\b', 'o que é'),
    (r'\bQual e\b', 'Qual é'), (r'\bqual e\b', 'qual é'),
    (r'\bnao e\b', 'não é'), (r'\bNao e\b', 'Não é'),
    (r'\btambem e\b', 'também é'),
    (r'\bja e\b', 'já é'),
    (r'\bainda e\b', 'ainda é'),
    (r' e necessário', ' é necessário'), (r' e necessária', ' é necessária'),
    (r' e obrigatório', ' é obrigatório'), (r' e obrigatória', ' é obrigatória'),
    (r' e possível', ' é possível'),
    (r' e importante', ' é importante'),
    (r' e preciso', ' é preciso'),
    (r' e fundamental', ' é fundamental'),
    (r' e essencial', ' é essencial'),
    (r' e gratuito', ' é gratuito'), (r' e gratuita', ' é gratuita'),
    (r' e feito', ' é feito'), (r' e feita', ' é feita'),
    (r' e pago', ' é pago'), (r' e paga', ' é paga'),
    (r' e garantido', ' é garantido'), (r' e garantida', ' é garantida'),
    (r' e calculado', ' é calculado'), (r' e calculada', ' é calculada'),
    (r' e concedido', ' é concedido'), (r' e concedida', ' é concedida'),
    (r' e considerado', ' é considerado'), (r' e considerada', ' é considerada'),
    (r' e realizado', ' é realizado'), (r' e realizada', ' é realizada'),
    (r' e fixado', ' é fixado'), (r' e fixada', ' é fixada'),
    (r' e permitido', ' é permitido'), (r' e permitida', ' é permitida'),
    (r' e proibido', ' é proibido'), (r' e proibida', ' é proibida'),
    (r' e vedado', ' é vedado'), (r' e vedada', ' é vedada'),
    (r' e assegurado', ' é assegurado'), (r' e assegurada', ' é assegurada'),
    (r' e exigido', ' é exigido'), (r' e exigida', ' é exigida'),
    (r' e aplicável', ' é aplicável'),
    (r' e cabível', ' é cabível'),
    (r' e válido', ' é válido'), (r' e válida', ' é válida'),
    (r' e inválido', ' é inválido'),
    (r' e igual', ' é igual'),
    (r' e inferior', ' é inferior'), (r' e superior', ' é superior'),
    (r' e opcional', ' é opcional'),
    (r' e dividido', ' é dividido'), (r' e dividida', ' é dividida'),
    (r' e devido', ' é devido'), (r' e devida', ' é devida'),
    (r' e crime', ' é crime'),
    (r' e direito', ' é direito'),
    (r' e dever', ' é dever'),
    (r' e exclusivo', ' é exclusivo'),
    (r' e comum', ' é comum'),
    (r' e normal', ' é normal'),
    (r' e automático', ' é automático'), (r' e automática', ' é automática'),
]

# Correções pontuais encontradas pelos revisores
SPECIFIC_FIXES = [
    ('superfulas', 'supérfluas'),
    ('qual o juros', 'quais os juros'),
]


def fix_file(filepath):
    """Aplica todas as substituições a um arquivo."""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    original = content

    # Aplica substituições com regex (word boundary)
    for pattern, replacement in WORD_REPLACEMENTS:
        content = re.sub(pattern, replacement, content)

    # Aplica correções pontuais
    for old, new in SPECIFIC_FIXES:
        content = content.replace(old, new)

    if content != original:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        # Contar diferenças aproximadas
        changes = sum(1 for a, b in zip(original.split(), content.split()) if a != b)
        return changes
    return 0


def main():
    base = r'C:\Users\renan\Desktop\manual_vicentinos'

    md_files = glob.glob(os.path.join(base, '**', '*.md'), recursive=True)
    js_files = [os.path.join(base, 'app', 'content.js')]
    html_files = [os.path.join(base, 'app', 'index.html')]

    all_files = md_files + js_files + html_files
    total_changes = 0

    for filepath in all_files:
        if '_grafo_semantico.md' in filepath:
            continue
        if '.vercel' in filepath:
            continue
        changes = fix_file(filepath)
        if changes > 0:
            rel = os.path.relpath(filepath, base)
            print(f'  {rel}: ~{changes} correções')
            total_changes += changes

    print(f'\nTotal: ~{total_changes} correções em {len(all_files)} arquivos')


if __name__ == '__main__':
    main()
