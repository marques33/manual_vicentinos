"""Gera a migration da carga inicial da Despensa a partir da planilha ODS.

A planilha `Inventario_Despensa_Vicentinos.ods` (26/10/2026) foi montada a
partir de 11 fotos da despensa: as quantidades sao ESTIMADAS e as colunas de
conferencia fisica e validade estao vazias. Este script le a aba
"Inventario", aplica as regras abaixo e grava a migration 030 — o SQL nao e
escrito a mao para que a carga seja reproduzivel a partir da fonte.

Regras (decididas com o usuario em 26/10/2026):
  * Todo item entra com `estimado = true` ate a conferencia fisica.
  * Ficam de fora os itens que nao sao estoque distribuivel (EXCLUIDOS).
  * A linha 9 mistura arroz e acucar de 1 kg. Dividir os 10 pacotes seria
    inventar dado: a linha vira um item provisorio "a separar na
    conferencia", e nasce "Arroz 1 kg" com saldo 0 para receber a contagem.
  * Unidade e categoria passam pelos mapas abaixo; valor desconhecido aborta.

Le o ODS so com a biblioteca padrao (zipfile + xml) — sem odfpy.

Uso:
    python supabase/gerar_carga_estoque.py Inventario_Despensa_Vicentinos.ods
"""
from __future__ import annotations

import argparse
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
MIGRATION = RAIZ / "supabase" / "migrations" / "20261026120200_estoque_carga_inicial.sql"
DATA_INVENTARIO = "2026-10-26"
PREFIXO_ORIGEM = f"inventario-{DATA_INVENTARIO}#"

_T = "{urn:oasis:names:tc:opendocument:xmlns:table:1.0}"
_O = "{urn:oasis:names:tc:opendocument:xmlns:office:1.0}"
_X = "{urn:oasis:names:tc:opendocument:xmlns:text:1.0}"

CATEGORIAS = {
    "Cestas básicas": "cestas",
    "Alimentos": "alimentos",
    "Higiene e limpeza": "higiene_limpeza",
    "Utensílios e outros": "utensilios_outros",
}

UNIDADES = {
    "cesta": "cesta", "volume": "volume", "pacote": "pacote", "saco": "saco",
    "fardo": "fardo", "garrafa": "garrafa", "caixa": "caixa", "bandeja": "bandeja",
    "rolo": "rolo", "unidade": "unidade", "peça": "peca",
}

# Nº da planilha -> motivo. Nao sao estoque que se entrega a familias.
EXCLUIDOS = {
    42: "material da Conferência (cestos de vime decorativos)",
    43: "material da Conferência (garrafas decoradas)",
    44: "engradados, alguns marcados 'DEVOLVER' — podem ser de terceiros",
}

PERECIVEIS = {27}  # ovos
LINHA_MISTA = 9    # arroz/açúcar 1 kg avulsos

# "20 × 500 g", "12 × 1 L" — o conteúdo de uma embalagem de embalagens.
_CONTEUDO = re.compile(r"\d+\s*×\s*[\d,]+\s*(?:g|kg|ml|L)\b")


@dataclass
class Item:
    numero: int
    categoria: str
    nome: str
    marcas: str | None
    unidade: str
    quantidade: int
    local: str | None
    observacoes: str | None
    conteudo_por_unidade: str | None = None
    perecivel: bool = False
    origem_ref: str = field(default="")


def _texto(celula) -> str:
    return " / ".join("".join(p.itertext()) for p in celula.iter(_X + "p")).strip()


def ler_aba(caminho: Path, aba: str) -> list[list[str]]:
    """Linhas da aba como listas de texto, expandindo células repetidas."""
    with zipfile.ZipFile(caminho) as z:
        raiz = ET.fromstring(z.read("content.xml"))
    for tabela in raiz.iter(_T + "table"):
        if tabela.get(_T + "name") != aba:
            continue
        linhas = []
        for linha in tabela.iter(_T + "table-row"):
            celulas: list[str] = []
            for c in linha:
                if c.tag not in (_T + "table-cell", _T + "covered-table-cell"):
                    continue
                repete = min(int(c.get(_T + "number-columns-repeated", "1")), 64)
                celulas += [_texto(c)] * repete
            while celulas and not celulas[-1]:
                celulas.pop()
            linhas.append(celulas)
        return linhas
    raise ValueError(f"aba {aba!r} não encontrada em {caminho}")


def _ou_nulo(texto: str) -> str | None:
    texto = texto.strip()
    return None if texto in ("", "—", "-") else texto


def ler_inventario(caminho: Path) -> list[Item]:
    """Itens da aba Inventário exatamente como estão (sem as regras de carga)."""
    linhas = ler_aba(caminho, "Inventário")
    cabecalho = next(i for i, l in enumerate(linhas) if l[:3] == ["Nº", "Categoria", "Item"])
    itens = []
    for l in linhas[cabecalho + 1:]:
        if not l or not l[0].isdigit():
            continue  # linha vazia ou a legenda do rodapé
        l = l + [""] * (12 - len(l))
        numero, categoria, nome, marcas, unidade, qtd, _conf, _dif, _val, local, _fotos, obs = l[:12]
        if categoria not in CATEGORIAS:
            raise ValueError(f"item {numero}: categoria desconhecida {categoria!r}")
        if unidade not in UNIDADES:
            raise ValueError(f"item {numero}: unidade desconhecida {unidade!r}")
        conteudo = _CONTEUDO.search(nome)
        itens.append(Item(
            numero=int(numero),
            categoria=CATEGORIAS[categoria],
            nome=nome.strip(),
            marcas=_ou_nulo(marcas),
            unidade=UNIDADES[unidade],
            quantidade=int(float(qtd.replace(",", "."))),
            local=_ou_nulo(local),
            observacoes=_ou_nulo(obs),
            conteudo_por_unidade=conteudo.group(0) if conteudo else None,
            origem_ref=f"{PREFIXO_ORIGEM}{int(numero)}",
        ))
    return itens


def aplicar_regras(itens: list[Item]) -> list[Item]:
    """Itens que entram na carga, já com exclusões, perecíveis e a linha mista."""
    carga = []
    for it in itens:
        if it.numero in EXCLUIDOS:
            continue
        it.perecivel = it.numero in PERECIVEIS
        if it.numero == LINHA_MISTA:
            it.nome = "Arroz / açúcar 1 kg avulsos — separar na conferência"
            it.observacoes = (
                "Linha mista na planilha: arroz e açúcar de 1 kg juntos. Na conferência, "
                "zerar este item e lançar as contagens em \"Arroz 1 kg\" e em "
                "\"Açúcar cristal 1 kg\"."
            )
            carga.append(it)
            carga.append(Item(
                numero=it.numero, categoria="alimentos", nome="Arroz 1 kg",
                marcas=None, unidade="pacote", quantidade=0, local=it.local,
                observacoes="Criado para receber o arroz da linha mista 9 na conferência.",
                origem_ref=f"{PREFIXO_ORIGEM}{it.numero}-arroz",
            ))
            continue
        carga.append(it)
    return carga


def _sql(valor) -> str:
    if valor is None:
        return "null"
    if isinstance(valor, bool):
        return "true" if valor else "false"
    if isinstance(valor, int):
        return str(valor)
    return "'" + str(valor).replace("'", "''") + "'"


def gerar_sql(carga: list[Item], origem: str) -> str:
    itens_sql = ",\n".join(
        "    (" + ", ".join(_sql(v) for v in (
            it.categoria, it.nome, it.marcas, it.unidade, it.conteudo_por_unidade,
            it.local, it.perecivel, it.observacoes, it.origem_ref)) + ")"
        for it in carga
    )
    qtd_sql = ",\n".join(
        f"    ({_sql(it.origem_ref)}, {it.quantidade})" for it in carga if it.quantidade > 0
    )
    excluidos = "\n".join(f"--   nº {n}: {motivo}" for n, motivo in sorted(EXCLUIDOS.items()))
    return f"""\
-- ============================================================================
-- 030 · Despensa — carga inicial a partir do inventário por fotos
-- ----------------------------------------------------------------------------
-- GERADO por supabase/gerar_carga_estoque.py a partir de {origem}.
-- Não editar à mão: corrija a planilha ou o script e gere de novo.
--
-- {len(carga)} itens, todos com estimado = true (quantidades estimadas por fotos
-- em {DATA_INVENTARIO}; a conferência física desliga a marca item a item).
-- Fora da carga:
{excluidos}
--
-- Reaplicável: item com origem_ref já existente é ignorado, e só ganha o
-- movimento carga_inicial o item que ainda não tem um.
-- Autor dos registros: o primeiro administrador ativo (criado_por é not null).
-- ============================================================================

do $$
declare
  v_autor uuid;
begin
  select user_id into v_autor
    from public.confrades
   where ativo and papel = 'administrador'
   order by criado_em
   limit 1;

  if v_autor is null then
    raise exception 'carga da despensa: nenhum confrade ativo com papel administrador para assinar os registros';
  end if;

  insert into public.estoque_itens
    (categoria, nome, marcas, unidade, conteudo_por_unidade, local, perecivel,
     observacoes, origem_ref, estimado, criado_por)
  select c.*, true, v_autor
    from (values
{itens_sql}
    ) as c (categoria, nome, marcas, unidade, conteudo_por_unidade, local,
            perecivel, observacoes, origem_ref)
  on conflict (origem_ref) where origem_ref is not null do nothing;

  insert into public.estoque_movimentos
    (item_id, tipo, quantidade, data_movimento, observacao, criado_por)
  select i.id, 'carga_inicial', q.quantidade, date '{DATA_INVENTARIO}',
         'Inventário por fotos de {DATA_INVENTARIO[8:]}/{DATA_INVENTARIO[5:7]}/{DATA_INVENTARIO[:4]} — quantidade estimada', v_autor
    from (values
{qtd_sql}
    ) as q (origem_ref, quantidade)
    join public.estoque_itens i on i.origem_ref = q.origem_ref
   where not exists (
     select 1 from public.estoque_movimentos m
      where m.item_id = i.id and m.tipo = 'carga_inicial'
   );
end $$;
"""


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("planilha", type=Path)
    ap.add_argument("--saida", type=Path, default=MIGRATION)
    args = ap.parse_args(argv)

    carga = aplicar_regras(ler_inventario(args.planilha))
    sql = gerar_sql(carga, args.planilha.name)
    args.saida.write_bytes(sql.encode("utf-8"))
    print(f"{len(carga)} itens -> {args.saida.relative_to(RAIZ) if args.saida.is_relative_to(RAIZ) else args.saida}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
