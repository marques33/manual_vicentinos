"""Testes de regressao da revisao linguistica (fix_textual.py).

Cada teste aqui trava um bug que ja existiu. Os dois primeiros grupos sao os
mais importantes: eles guardam a instrucao de renda per capita do Bolsa Familia
e do BPC/LOAS, que e a frase que o leitor do manual mais precisa acertar.

Rodar:  python -m pytest tests/ -v
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent


def _load(name: str):
    spec = importlib.util.spec_from_file_location(name, ROOT / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


ft = _load("fix_textual")


# ---------------------------------------------------------------------------
# Homografos: a forma sem acento e VERBO, a acentuada e SUBSTANTIVO
# ---------------------------------------------------------------------------
@pytest.mark.parametrize(
    "texto",
    [
        # As duas ocorrencias reais no manual, verbatim.
        "some toda a renda da familia e divida pelo numero de pessoas que moram na casa",
        "Some toda a renda de todas as pessoas que moram na mesma casa e divida pelo numero de moradores.",
        # Outras formas imperativas do mesmo verbo.
        "divida por 2",
        "divida entre os moradores",
        "Agora divida pelo total.",
    ],
)
def test_divida_verbo_nao_vira_substantivo(texto: str) -> None:
    """'divida' (imperativo de dividir) NUNCA pode virar 'dívida' (debito).

    Esse e o bug que inverteria o sentido da instrucao de renda per capita em
    01-beneficios-sociais/02-bolsa-familia.md e 03-bpc-loas.md.
    """
    assert "dívida" not in ft.fix_text(texto)


@pytest.mark.parametrize(
    "entrada,esperado",
    [
        ("pagar a divida", "pagar a dívida"),
        ("as dividas do consumidor", "as dívidas do consumidor"),
        ("renegociar sua divida", "renegociar sua dívida"),
        ("inscricao na divida ativa", "inscricao na dívida ativa"),
        ("a divida publica", "a dívida pública"),
    ],
)
def test_divida_substantivo_ainda_e_acentuada(entrada: str, esperado: str) -> None:
    """Tirar 'divida' do dicionario nao pode perder o sentido de debito."""
    assert ft.fix_text(entrada) == esperado


@pytest.mark.parametrize(
    "texto",
    [
        "O plano previa provar o CHECK pela chave anon",
        "A lei previa o prazo de 30 dias",
        "O decreto previa que o beneficio fosse mensal",
    ],
)
def test_previa_verbo_nao_vira_adjetivo(texto: str) -> None:
    """'previa' (imperfeito de prever) nao pode virar 'prévia'."""
    assert "prévia" not in ft.fix_text(texto)


@pytest.mark.parametrize(
    "entrada,esperado",
    [
        ("exige consulta previa", "exige consulta prévia"),
        # entrada ja acentuada de proposito: aqui so se testa "previa",
        # nao a cobertura do dicionario para "autorizacao" (ver todo.md).
        ("sem autorização previa", "sem autorização prévia"),
        ("uma previa do resultado", "uma prévia do resultado"),
    ],
)
def test_previa_substantivo_ainda_e_acentuada(entrada: str, esperado: str) -> None:
    assert ft.fix_text(entrada) == esperado


def test_homografos_fora_do_dicionario_simples() -> None:
    """O dicionario e aplicado sem contexto — homografo nao pode estar nele."""
    for palavra in ("divida", "Divida", "previa", "Previa", "esta", "tem", "marco", "avo"):
        assert palavra not in ft.DICT, (
            f"{palavra!r} voltou ao DICT; substituicao sem contexto corrompe o sentido"
        )


# ---------------------------------------------------------------------------
# Escopo: o script reescreve in-place, entao o glob e uma questao de seguranca
# ---------------------------------------------------------------------------
def test_escopo_nao_alcanca_fontes_legais_nem_skills() -> None:
    """biblioteca/ e .claude/ NAO podem ser reescritos.

    biblioteca/ sao fontes legais primarias (citacao, nao texto do projeto) e
    nao sao rastreadas pelo git — reescrever seria irreversivel. As skills em
    .claude/ contem exemplos do tipo '"Voce" -> "você"'; aplicar o dicionario
    reescreve os dois lados da seta e destroi a propria instrucao.
    """
    proibidas = {"biblioteca", ".claude", "tasks", "docs", "social", "supabase", "build"}
    for p in ft.content_files():
        assert not (proibidas & set(p.relative_to(ROOT).parts)), (
            f"{p.relative_to(ROOT)} esta no escopo de reescrita e nao deveria"
        )


def test_escopo_cobre_os_capitulos_do_manual() -> None:
    """Restringir o escopo nao pode ter deixado capitulo de fora."""
    alcancados = {p.resolve() for p in ft.content_files()}
    esperados = [p for d in ROOT.iterdir()
                 if d.is_dir() and ft.RE_CONTENT_DIR.match(d.name)
                 for p in d.rglob("*.md")]
    assert esperados, "nenhuma pasta 0X-* encontrada — teste invalido"
    faltando = [p for p in esperados if p.resolve() not in alcancados]
    assert not faltando, f"capitulos fora do escopo: {faltando}"
    assert (ROOT / "README.md").resolve() in alcancados


def test_escopo_e_deterministico_e_sem_duplicatas() -> None:
    files = ft.content_files()
    assert files == sorted(set(files))


# ---------------------------------------------------------------------------
# Shielding: codigo, URL e links nao podem ser "corrigidos"
# ---------------------------------------------------------------------------
@pytest.mark.parametrize(
    "texto",
    [
        "Veja `publico = media(nao)` no exemplo.",
        "Acesse https://gov.br/cadastro-unico/nao-sei?publico=sim hoje",
        "```\npublico = nao_sei(media)\n```",
        "```python\ndef nao_publico():\n    return media\n```",
    ],
)
def test_codigo_e_url_ficam_intactos(texto: str) -> None:
    assert ft.fix_text(texto) == texto


def test_restore_e_inverso_de_shield() -> None:
    texto = "Ligue para `190` ou veja https://exemplo.gov.br e depois nao pare."
    blindado, buracos = ft.shield(texto)
    assert ft.restore(blindado, buracos) == texto


# ---------------------------------------------------------------------------
# Idempotencia: rodar duas vezes nao pode mudar o resultado
# ---------------------------------------------------------------------------
@pytest.mark.parametrize(
    "texto",
    [
        "some toda a renda da familia e divida pelo numero de pessoas",
        "pagar a divida ate o vencimento",
        "A crianca tem direito a saude publica e gratuita.",
        "Procure a Defensoria Publica do Distrito Federal em Ceilandia.",
    ],
)
def test_fix_text_e_idempotente(texto: str) -> None:
    uma = ft.fix_text(texto)
    assert ft.fix_text(uma) == uma


# ---------------------------------------------------------------------------
# Acentuacao que deve continuar funcionando (nao regredir ao corrigir o resto)
# ---------------------------------------------------------------------------
@pytest.mark.parametrize(
    "entrada,esperado",
    [
        ("Voce tem direito a saude", "Você tem direito a saúde"),
        ("crianca e adolescente", "criança e adolescente"),
        ("Defensoria Publica", "Defensoria Pública"),
        ("Ceilandia e Brazlandia", "Ceilândia e Brazlândia"),
        ("CadUnico", "CadÚnico"),
        ("informacoes obrigatorias", "informações obrigatórias"),
    ],
)
def test_acentuacao_basica_continua_valendo(entrada: str, esperado: str) -> None:
    assert ft.fix_text(entrada) == esperado


# ---------------------------------------------------------------------------
# Conteudo real: as linhas vivas do manual sobrevivem a um round-trip
# ---------------------------------------------------------------------------
@pytest.mark.parametrize(
    "arquivo",
    ["01-beneficios-sociais/02-bolsa-familia.md", "01-beneficios-sociais/03-bpc-loas.md"],
)
def test_instrucao_de_renda_per_capita_sobrevive(arquivo: str) -> None:
    """Le o arquivo real e confere que 'divida pelo' continua verbo."""
    p = ROOT / arquivo
    if not p.exists():
        pytest.skip(f"{arquivo} nao existe neste checkout")
    original = p.read_text(encoding="utf-8")
    if "divida pelo" not in original:
        pytest.skip(f"{arquivo} nao contem mais a frase — teste obsoleto")
    corrigido = ft.fix_text(original)
    assert "dívida pelo" not in corrigido
    assert "divida pelo" in corrigido
