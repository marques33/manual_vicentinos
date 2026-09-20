"""
Gerador do Manual Vicentino em PDF com diagramacao ABNT (NBR 14724).

- Papel A4
- Margens: 3 cm sup./esq., 2 cm inf./dir.
- Fonte: Times New Roman 12 pt
- Espacamento: 1,5 no corpo, simples em citacoes longas e notas
- Recuo de paragrafo: 1,25 cm
- Texto justificado
- Capa + folha de rosto + sumario
- Numeracao progressiva (NBR 6024)
- Citacoes longas com recuo de 4 cm (NBR 10520)
- Secao "Referencias" consolidada (NBR 6023)
"""
from __future__ import annotations

import locale
import re
import shutil
import subprocess
import sys
from pathlib import Path

def _setup_collation() -> None:
    """Collation pt_BR para ordenar as referencias (NBR 6023).

    Sem isso, sort() cru joga "Águas"/"Índice" depois de "Zebra". O fallback ""
    (locale do host) pode ser C, que tem o mesmo defeito — por isso avisa, em
    vez de fingir que a ordem esta correta.
    """
    for loc in ("pt_BR.UTF-8", "pt_BR.utf8", "Portuguese_Brazil.1252"):
        try:
            locale.setlocale(locale.LC_COLLATE, loc)
            return
        except locale.Error:
            continue
    print("AVISO: collation pt_BR indisponivel; a ordem das REFERENCIAS pode "
          "divergir da NBR 6023 nesta maquina.", file=sys.stderr)


_setup_collation()

ROOT = Path(__file__).resolve().parent
BUILD = ROOT / "build"
BUILD.mkdir(exist_ok=True)
COMBINED_MD = BUILD / "manual_abnt_v3.md"
HEADER_TEX = BUILD / "abnt_header.tex"
TITLE_PAGE_TEX = BUILD / "abnt_titlepage.tex"
OUTPUT_TEX = ROOT / "Manual_Vicentino_ABNT_v3.tex"
OUTPUT_PDF = ROOT / "Manual_Vicentino_ABNT_v3.pdf"

SECTIONS = [
    ("01-beneficios-sociais", "BENEFÍCIOS SOCIAIS", [
        "01-cadastro-unico.md",
        "02-bolsa-familia.md",
        "03-bpc-loas.md",
        "04-seguro-desemprego.md",
        "05-auxilio-reclusao.md",
        "06-beneficios-df.md",
    ]),
    ("02-violencia-domestica", "VIOLÊNCIA DOMÉSTICA", [
        "01-lei-maria-da-penha.md",
        "02-como-denunciar.md",
        "03-medidas-protetivas.md",
        "04-rede-protecao-df.md",
        "05-violencia-idosos-criancas.md",
        "06-feminicidio-stalking.md",
    ]),
    ("03-criancas-adolescentes", "CRIANÇAS E ADOLESCENTES", [
        "01-direitos-eca.md",
        "02-guarda-adocao.md",
        "03-pensao-alimenticia.md",
        "04-alienacao-parental.md",
        "05-bullying.md",
        "06-conselho-tutelar-df.md",
    ]),
    ("04-direito-saude", "DIREITO À SAÚDE", [
        "01-direitos-paciente-sus.md",
        "02-emergencia-obrigatoria.md",
        "03-vasectomia-laqueadura.md",
        "04-cirurgia-miomas.md",
        "05-medicamentos.md",
        "06-saude-mental.md",
        "07-ouvidoria-sus.md",
    ]),
    ("05-previdencia-social", "PREVIDÊNCIA SOCIAL", [
        "01-aposentadorias.md",
        "02-auxilio-incapacidade.md",
        "03-pensao-por-morte.md",
        "04-salario-maternidade.md",
        "05-acesso-inss.md",
    ]),
    ("06-direito-consumidor", "DIREITO DO CONSUMIDOR", [
        "01-direitos-basicos-cdc.md",
        "02-superendividamento.md",
        "03-procon-df.md",
        "04-servicos-essenciais.md",
    ]),
    ("07-nocoes-direito-penal", "NOÇÕES DE DIREITO PENAL", [
        "01-quando-ir-delegacia.md",
        "02-crimes-comuns.md",
        "03-direitos-preso-familia.md",
    ]),
    ("08-acesso-justica", "ACESSO À JUSTIÇA", [
        "01-defensoria-publica-df.md",
        "02-justica-gratuita.md",
        "03-juizados-especiais.md",
        "04-nucleos-universidades.md",
    ]),
    ("09-direitos-fundamentais", "DIREITOS FUNDAMENTAIS", [
        "01-constituicao-direitos-sociais.md",
        "02-lei-organica-df.md",
    ]),
]

PAGEBREAK = "\n\n\\newpage\n\n"

RE_INTERNAL_LINK = re.compile(r"\[([^\]]+)\]\(([^)]*\.md[^)]*)\)")
RE_HTML_COMMENT = re.compile(r"<!--.*?-->", re.DOTALL)
RE_HR = re.compile(r"^\s*---\s*$", re.MULTILINE)


def clean_md(text: str) -> str:
    text = RE_HTML_COMMENT.sub("", text)
    text = RE_INTERNAL_LINK.sub(r"\1", text)
    # Remove regras horizontais decorativas — quebras visuais sao feitas pelos
    # proprios cabecalhos de secao.
    text = RE_HR.sub("", text)
    return text


def demote_headings(text: str, levels: int = 1) -> str:
    """Rebaixa todos os headings em N niveis."""
    new_lines = []
    for line in text.splitlines():
        m = re.match(r"^(#{1,5})\s+(.*)", line)
        if m:
            hashes, content = m.group(1), m.group(2)
            line = ("#" * levels) + hashes + " " + content
        new_lines.append(line)
    return "\n".join(new_lines)


def read(p: Path) -> str:
    return p.read_text(encoding="utf-8")


def build_combined() -> None:
    parts: list[str] = []

    # --- YAML metadata ----------------------------------------------------
    parts.append(
        "---\n"
        'title: "MANUAL VICENTINO DE DIREITOS E AUXÍLIOS"\n'
        'subtitle: "Guia Prático para Pessoas em Situação de Vulnerabilidade Social"\n'
        'author: "Sociedade de São Vicente de Paulo — Distrito Federal"\n'
        'date: "Brasília, maio de 2026"\n'
        "lang: pt-BR\n"
        "documentclass: report\n"
        "papersize: a4\n"
        "fontsize: 12pt\n"
        "linestretch: 1.5\n"
        "indent: true\n"
        "numbersections: true\n"
        "secnumdepth: 3\n"
        "toc: false\n"
        "colorlinks: true\n"
        "linkcolor: black\n"
        "urlcolor: NavyBlue\n"
        "toccolor: black\n"
        "geometry:\n"
        "  - top=3cm\n"
        "  - bottom=2cm\n"
        "  - left=3cm\n"
        "  - right=2cm\n"
        "header-includes:\n"
        "  - \\input{build/abnt_header.tex}\n"
        "include-before:\n"
        "  - \\input{build/abnt_titlepage.tex}\n"
        "---\n"
    )

    # --- Apresentacao -----------------------------------------------------
    readme = read(ROOT / "README.md")
    pre_sumario = readme.split("## Sumário", 1)[0]
    apresentacao = clean_md(pre_sumario)
    # Tira o H1 do README (titulo ja vem da capa) e a citacao decorativa
    apresentacao = re.sub(r"^#\s+.*\n", "", apresentacao, count=1)
    apresentacao = re.sub(r"^##\s+.*\n", "", apresentacao, count=1)
    apresentacao = re.sub(r"^>\s*\*.*\*\s*\n", "", apresentacao, count=1, flags=re.MULTILINE)

    parts.append("\\chapter*{APRESENTAÇÃO}")
    parts.append("\\addcontentsline{toc}{chapter}{APRESENTAÇÃO}")
    parts.append("\\markboth{APRESENTAÇÃO}{}")
    parts.append(apresentacao.strip())
    parts.append(PAGEBREAK)

    # --- Capitulos --------------------------------------------------------
    for folder, title, files in SECTIONS:
        section_dir = ROOT / folder
        # \chapter sera gerado pelo H1
        parts.append(f"# {title}")

        readme_path = section_dir / "README.md"
        if readme_path.exists():
            content = read(readme_path)
            content = re.sub(r"^#\s+.*\n", "", content, count=1)  # remove H1
            parts.append(demote_headings(clean_md(content), levels=1))

        for fname in files:
            fpath = section_dir / fname
            if not fpath.exists():
                print(f"AVISO: arquivo ausente: {fpath}", file=sys.stderr)
                continue
            content = read(fpath)
            # Promove H1 do arquivo para H2 (secao do capitulo)
            content = re.sub(r"^#\s+(.*)", r"## \1", content, count=1)
            content = clean_md(content)
            # Demais headings descem 1 nivel para preservar hierarquia
            lines = content.splitlines()
            out: list[str] = []
            for i, line in enumerate(lines):
                if i == 0 and line.startswith("## "):
                    out.append(line)
                    continue
                m = re.match(r"^(#{1,5})\s+(.*)", line)
                if m:
                    line = "#" + m.group(1) + " " + m.group(2)
                out.append(line)
            parts.append("\n".join(out))

    # --- Referencias ------------------------------------------------------
    refs_md = build_references()
    parts.append("\\newpage")
    parts.append("# REFERÊNCIAS")
    parts.append(refs_md)

    COMBINED_MD.write_text("\n\n".join(parts), encoding="utf-8")
    print(f"[ok] markdown ABNT: {COMBINED_MD} "
          f"({COMBINED_MD.stat().st_size//1024} KB)")


def build_references() -> str:
    """Coleta as 'Fontes e Referencias' de cada arquivo e consolida."""
    refs: list[str] = []
    seen: set[str] = set()
    for folder, _, files in SECTIONS:
        for fname in files:
            p = ROOT / folder / fname
            if not p.exists():
                continue
            text = read(p)
            # Procura secao "Fontes e Referencias" ate o proximo H2/H3 ou fim
            m = re.search(
                r"(?:^|\n)#{1,3}\s+Fontes\s+e\s+Refer[êe]ncias\s*\n(.+?)(?=\n#{1,3}\s|\Z)",
                text, flags=re.DOTALL | re.IGNORECASE,
            )
            if not m:
                continue
            block = m.group(1)
            for line in block.splitlines():
                line = line.strip()
                if not line or not line.startswith("-"):
                    continue
                ref = line.lstrip("- ").strip()
                # remove formatacao markdown leve
                ref = re.sub(r"\*\*([^*]+)\*\*", r"\1", ref)
                if ref and ref not in seen:
                    seen.add(ref)
                    refs.append(ref)

    # Adiciona referencias normativas obrigatorias
    extras = [
        "BRASIL. Constituição da República Federativa do Brasil. Brasília, DF: Senado Federal, 1988.",
        "BRASIL. Lei nº 8.069, de 13 de julho de 1990. Estatuto da Criança e do Adolescente. Brasília, DF: Presidência da República, 1990.",
        "BRASIL. Lei nº 8.078, de 11 de setembro de 1990. Código de Defesa do Consumidor. Brasília, DF: Presidência da República, 1990.",
        "BRASIL. Lei nº 8.213, de 24 de julho de 1991. Planos de Benefícios da Previdência Social. Brasília, DF: Presidência da República, 1991.",
        "BRASIL. Lei nº 11.340, de 7 de agosto de 2006. Lei Maria da Penha. Brasília, DF: Presidência da República, 2006.",
        "BRASIL. Lei nº 13.146, de 6 de julho de 2015. Estatuto da Pessoa com Deficiência. Brasília, DF: Presidência da República, 2015.",
        "BRASIL. Lei nº 14.181, de 1º de julho de 2021. Lei do Superendividamento. Brasília, DF: Presidência da República, 2021.",
        "DISTRITO FEDERAL. Lei Orgânica do Distrito Federal. Brasília, DF: Câmara Legislativa, 1993.",
    ]
    for e in extras:
        if e not in seen:
            seen.add(e)
            refs.append(e)

    # ABNT NBR 6023: ordem alfabetica. locale.strxfrm respeita acentos
    # ("Ó" ordena junto de "O"); sort() cru joga acentuados para o fim.
    refs.sort(key=locale.strxfrm)
    return "\n\n".join(refs)


def write_header_tex() -> None:
    """Header LaTeX com customizacoes ABNT."""
    HEADER_TEX.write_text(r"""
% =============================================================================
% Cabecalho ABNT (NBR 14724 / 6024 / 10520)
% =============================================================================
\usepackage{fontspec}
\setmainfont{Times New Roman}
\setsansfont{Arial}
\usepackage{setspace}
\usepackage{indentfirst}
\usepackage{titlesec}
\usepackage{fancyhdr}
\usepackage{fmtcount}
\usepackage{microtype}
\usepackage{xcolor}

% --- Recuo de paragrafo 1,25 cm (ABNT) -----------------------------------
\setlength{\parindent}{1.25cm}
\setlength{\parskip}{0pt}

% --- Espacamento 1,5 no corpo --------------------------------------------
\onehalfspacing

% --- Numeracao progressiva NBR 6024 (sem ponto final) --------------------
\renewcommand{\thechapter}{\arabic{chapter}}
\renewcommand{\thesection}{\thechapter.\arabic{section}}
\renewcommand{\thesubsection}{\thesection.\arabic{subsection}}
\renewcommand{\thesubsubsection}{\thesubsection.\arabic{subsubsection}}

% --- Estilo dos titulos (ABNT: capitulo CAIXA ALTA negrito) --------------
% Titulos ja sao gerados em CAIXA ALTA no source markdown.
\titleformat{\chapter}[hang]
  {\normalfont\Large\bfseries}
  {\thechapter}{1em}{}
\titlespacing*{\chapter}{0pt}{-20pt}{20pt}

\titleformat{\section}
  {\normalfont\large\bfseries}
  {\thesection}{1em}{}

\titleformat{\subsection}
  {\normalfont\normalsize\bfseries}
  {\thesubsection}{1em}{}

\titleformat{\subsubsection}
  {\normalfont\normalsize\itshape}
  {\thesubsubsection}{1em}{}

% --- Citacao longa NBR 10520: recuo 4 cm, fonte 10, espacamento simples --
\renewenvironment{quote}
  {\list{}{\leftmargin=4cm \rightmargin=0pt}\item\relax
   \singlespacing\fontsize{10pt}{12pt}\selectfont}
  {\endlist}

% --- Cabecalho/rodape ----------------------------------------------------
\pagestyle{fancy}
\fancyhf{}
\fancyhead[R]{\thepage}
\fancyfoot[C]{}
\renewcommand{\headrulewidth}{0pt}

\fancypagestyle{plain}{%
  \fancyhf{}\fancyhead[R]{\thepage}\renewcommand{\headrulewidth}{0pt}}

% --- Listas mais compactas que o default ---------------------------------
\usepackage{enumitem}
\setlist{itemsep=0pt, parsep=2pt, topsep=2pt}

% --- Tabelas com largura controlada e quebra de pagina -------------------
\usepackage{longtable}
\usepackage{array}
\renewcommand{\arraystretch}{1.15}

% --- Hifenizacao em portugues --------------------------------------------
% (babel ja e carregado pelo pandoc via lang: pt-BR no YAML)

% --- Sumario com formatacao ABNT (titulo SUMARIO centralizado) -----------
\usepackage{tocloft}
\renewcommand{\contentsname}{SUMÁRIO}
\renewcommand{\cftchapfont}{\bfseries}
\renewcommand{\cftchappagefont}{\bfseries}
\setlength{\cftbeforechapskip}{6pt}
""", encoding="utf-8")


def write_titlepage_tex() -> None:
    """Capa + folha de rosto ABNT."""
    TITLE_PAGE_TEX.write_text(r"""
% =============================================================================
% Capa ABNT
% =============================================================================
\begin{titlepage}
\thispagestyle{empty}
\begin{center}
{\large\bfseries SOCIEDADE DE SÃO VICENTE DE PAULO}\\[2pt]
{\large\bfseries CONSELHO METROPOLITANO DE BRASÍLIA}

\vfill

{\Large\bfseries MANUAL VICENTINO DE DIREITOS E AUXÍLIOS}\\[12pt]
{\large Guia Prático para Pessoas em Situação de Vulnerabilidade Social}

\vfill\vfill

{\large BRASÍLIA --- DISTRITO FEDERAL}\\[4pt]
{\large 2026}
\end{center}
\end{titlepage}

% =============================================================================
% Folha de rosto ABNT
% =============================================================================
\begin{titlepage}
\thispagestyle{empty}
\begin{center}
{\large SOCIEDADE DE SÃO VICENTE DE PAULO}

\vspace{4cm}

{\Large\bfseries MANUAL VICENTINO DE DIREITOS E AUXÍLIOS}\\[10pt]
{\large Guia Prático para Pessoas em Situação de Vulnerabilidade Social}

\vfill
\end{center}

\hspace*{8cm}\begin{minipage}{7cm}
\small Manual orientativo destinado a voluntários vicentinos e pessoas
assistidas, contendo informações práticas sobre direitos, benefícios sociais e
acesso a serviços públicos no Distrito Federal e na esfera federal.
\end{minipage}

\vfill

\begin{center}
{\large BRASÍLIA --- DISTRITO FEDERAL}\\[4pt]
{\large 2026}
\end{center}
\end{titlepage}

% =============================================================================
% Sumario
% =============================================================================
\pagenumbering{roman}
\tableofcontents
\clearpage
\pagenumbering{arabic}
\setcounter{page}{1}
""", encoding="utf-8")


def common_pandoc_args() -> list[str]:
    return [
        "pandoc",
        str(COMBINED_MD),
        "-s",
        "--resource-path", str(ROOT),
        "--top-level-division=chapter",
        "--highlight-style=tango",
    ]


def require_pandoc() -> None:
    if not shutil.which("pandoc"):
        sys.exit("pandoc nao encontrado")


def render_tex() -> None:
    require_pandoc()
    cmd = common_pandoc_args() + ["-o", str(OUTPUT_TEX)]
    print("[run]", " ".join(cmd))
    res = subprocess.run(cmd, capture_output=True, text=True, cwd=str(ROOT))
    if res.returncode != 0:
        print("STDOUT:", res.stdout[-2000:])
        print("STDERR:", res.stderr[-3000:])
        sys.exit(f"pandoc(tex) rc={res.returncode}")
    print(f"[ok] TeX: {OUTPUT_TEX} "
          f"({OUTPUT_TEX.stat().st_size//1024} KB)")


def render_pdf() -> None:
    require_pandoc()
    cmd = common_pandoc_args() + [
        "-o", str(OUTPUT_PDF),
        "--pdf-engine=xelatex",
    ]
    print("[run]", " ".join(cmd))
    res = subprocess.run(cmd, capture_output=True, text=True, cwd=str(ROOT))
    if res.returncode != 0:
        print("STDOUT:", res.stdout[-2000:])
        print("STDERR:", res.stderr[-3000:])
        sys.exit(f"pandoc rc={res.returncode}")
    print(f"[ok] PDF: {OUTPUT_PDF} "
          f"({OUTPUT_PDF.stat().st_size//1024} KB)")


def main() -> None:
    # Antes de qualquer escrita: sem pandoc o build nao termina, e sobrescrever
    # build/ e os .tex/.pdf finais deixaria artefatos novos misturados com os
    # antigos, sem como saber quais valem.
    require_pandoc()
    write_header_tex()
    write_titlepage_tex()
    build_combined()
    render_tex()
    render_pdf()


if __name__ == "__main__":
    main()
