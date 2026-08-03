#!/usr/bin/env python3
"""
Otimiza um PDF feito de imagens para virar anexo de download do site.

O caso que motivou o script: o folheto das Oficinas de Oração e Vida chegou com
19,7 MB — 10 páginas A4 em que cada página é um PNG de página inteira. PNG é sem
perda, e para foto isso significa ~2 MB por página. O público do mural abre o
site pelo celular; 20 MB é barreira real.

O trabalho pesado é do PyMuPDF (`rewrite_images`, 1.24+): ele reencoda as
imagens embutidas como JPEG **mantendo a resolução original** — não reduz
dimensão, quem for imprimir continua com os mesmos pixels; a troca é só de
formato de compressão.

Duas escolhas deliberadas:

- `lossy=False` — imagem que já é JPEG fica como está. Reencodar JPEG sobre
  JPEG acumula perda de geração sem ganho de tamanho que compense.
- `dpi_target` não é usado — reamostrar é o que estraga folheto com texto fino
  sobre foto, que é justamente o material que passa por aqui.

O que o script NÃO faz: OCR. Se o PDF de entrada não tem camada de texto, o de
saída também não terá.

Uso:
    python build/otimizar_pdf_anexo.py entrada.pdf saida.pdf [qualidade]
"""

import sys
from pathlib import Path

import fitz  # PyMuPDF

# 82 foi conferido página a página no folheto das Oficinas: texto fino sobre
# foto continua limpo. Abaixo de ~75 aparece sujeira nas bordas das letras
# vazadas sobre imagem.
QUALIDADE_PADRAO = 82


def mb(caminho: Path) -> str:
    return f"{caminho.stat().st_size / 1024 / 1024:.2f} MB"


def otimizar(origem: Path, destino: Path, qualidade: int) -> None:
    doc = fitz.open(origem)
    paginas = doc.page_count

    doc.rewrite_images(
        quality=qualidade,
        lossless=True,   # PNG e afins: é aqui que está o ganho
        lossy=False,     # JPEG já comprimido fica intacto
        color=True,
        gray=True,
        bitonal=False,   # preto-e-branco puro encolhe mal em JPEG
    )

    # garbage=4: recolhe os objetos das imagens antigas, que de outro modo
    # continuariam no arquivo e o ganho seria só no papel.
    doc.save(destino, garbage=4, deflate=True, clean=True)
    doc.close()

    conferencia = fitz.open(destino)
    saida_paginas = conferencia.page_count
    conferencia.close()
    if saida_paginas != paginas:
        raise SystemExit(
            f"erro: entrada tem {paginas} páginas e saída tem {saida_paginas}"
        )

    print(f"páginas: {paginas}")
    print(f"{origem.name}: {mb(origem)}")
    print(f"{destino.name}: {mb(destino)}")


def main() -> int:
    if len(sys.argv) < 3:
        print(__doc__.strip())
        return 2

    origem = Path(sys.argv[1])
    destino = Path(sys.argv[2])
    qualidade = int(sys.argv[3]) if len(sys.argv) > 3 else QUALIDADE_PADRAO

    if not origem.is_file():
        print(f"erro: não encontrei {origem}", file=sys.stderr)
        return 1

    destino.parent.mkdir(parents=True, exist_ok=True)
    otimizar(origem, destino, qualidade)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
