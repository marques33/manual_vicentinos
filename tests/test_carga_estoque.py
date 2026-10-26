"""Testes da carga inicial da Despensa (supabase/gerar_carga_estoque.py).

Guardam as regras combinadas com o usuario em 26/10/2026: o que entra, o que
fica de fora, a linha mista arroz/acucar e a fidelidade aos numeros da
planilha (a aba Resumo e a conferencia independente da aba Inventario).

A planilha nao e versionada (fica na raiz, como as fotos das atas); sem ela
os testes que a leem sao pulados.

Rodar:  python -m pytest tests/ -v
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
PLANILHA = ROOT / "Inventario_Despensa_Vicentinos.ods"


def _load():
    nome = "gerar_carga_estoque"
    spec = importlib.util.spec_from_file_location(nome, ROOT / "supabase" / f"{nome}.py")
    mod = importlib.util.module_from_spec(spec)
    sys.modules[nome] = mod
    spec.loader.exec_module(mod)
    return mod


g = _load()

precisa_planilha = pytest.mark.skipif(not PLANILHA.exists(), reason="planilha ODS ausente")


@pytest.fixture(scope="module")
def inventario():
    return g.ler_inventario(PLANILHA)


@pytest.fixture(scope="module")
def carga():
    return g.aplicar_regras(g.ler_inventario(PLANILHA))


@precisa_planilha
def test_le_os_44_itens_da_planilha(inventario):
    assert [it.numero for it in inventario] == list(range(1, 45))


@precisa_planilha
def test_somas_batem_com_a_aba_resumo(inventario):
    """O parser lê a coluna certa: a aba Resumo, calculada pelo LibreOffice, confere."""
    resumo = {l[0]: l for l in g.ler_aba(PLANILHA, "Resumo") if l}
    nomes = {v: k for k, v in g.CATEGORIAS.items()}
    for cat in g.CATEGORIAS.values():
        da_cat = [it for it in inventario if it.categoria == cat]
        linha = resumo[nomes[cat]]
        assert len(da_cat) == int(linha[1])
        assert sum(it.quantidade for it in da_cat) == int(linha[2])


@precisa_planilha
def test_carga_tem_42_itens_e_nenhum_excluido(carga):
    assert len(carga) == 42
    assert set(g.EXCLUIDOS) == {42, 43, 44}
    assert not {it.numero for it in carga} & set(g.EXCLUIDOS)


@precisa_planilha
def test_linha_mista_vira_provisorio_e_arroz_zerado(carga):
    da_linha = [it for it in carga if it.numero == g.LINHA_MISTA]
    provisorio, arroz = da_linha
    assert "separar na conferência" in provisorio.nome
    assert provisorio.quantidade == 10  # nada inventado: os 10 ficam juntos
    assert (arroz.nome, arroz.quantidade, arroz.unidade) == ("Arroz 1 kg", 0, "pacote")
    assert provisorio.origem_ref != arroz.origem_ref


@precisa_planilha
def test_total_de_cestas_e_o_da_planilha(carga):
    # Aba Resumo, "Cestas básicas (total)": 27 — os 4 "volumes" não são cesta.
    assert sum(it.quantidade for it in carga if it.unidade == "cesta") == 27


@precisa_planilha
def test_conteudo_por_unidade_e_pereciveis(carga):
    por_numero = {it.numero: it for it in carga if not it.origem_ref.endswith("-arroz")}
    assert por_numero[19].conteudo_por_unidade == "20 × 500 g"
    assert por_numero[24].conteudo_por_unidade == "12 × 1 L"
    assert [it.numero for it in carga if it.perecivel] == [27]
    assert por_numero[30].marcas == "Floral" and por_numero[33].marcas is None


@precisa_planilha
def test_origem_ref_unica(carga):
    refs = [it.origem_ref for it in carga]
    assert len(refs) == len(set(refs))


@precisa_planilha
def test_migration_versionada_esta_em_dia(carga):
    """A 030 do repositório é exatamente o que o script gera hoje.

    Compara sem o fim de linha: com core.autocrlf, o checkout no Windows grava
    CRLF, e o arquivo continua sendo o mesmo SQL.
    """
    esperado = g.gerar_sql(carga, PLANILHA.name)
    assert g.MIGRATION.read_bytes().decode("utf-8").replace("\r\n", "\n") == esperado


def test_sql_escapa_aspas():
    assert g._sql("caixa 'Natal'") == "'caixa ''Natal'''"
    assert g._sql(None) == "null" and g._sql(True) == "true" and g._sql(3) == "3"


def test_categoria_desconhecida_aborta(tmp_path, monkeypatch):
    monkeypatch.setattr(g, "ler_aba", lambda *_: [
        ["Nº", "Categoria", "Item"],
        ["1", "Brinquedos", "Bola", "—", "unidade", "1"],
    ])
    with pytest.raises(ValueError, match="categoria desconhecida"):
        g.ler_inventario(tmp_path / "x.ods")
