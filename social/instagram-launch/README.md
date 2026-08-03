# Instagram da Conferência N. S. do Carmo — Pacote de Lançamento

Pacote inicial para abrir a página no Instagram. Conteúdo extraído da landing (`app/index.html`) e da página de eventos (`app/eventos.html`), preservando o tom da identidade já estabelecida: sóbrio, católico tradicional, paleta vinho e dourado.

## Tom de voz

- **Formal-acolhedor.** Frases curtas, vocabulário cuidado, sem gírias.
- **Cristocêntrico.** A caridade é meio, não fim. Cita-se o Evangelho e Ozanam.
- **Concreto.** Sempre que possível, traduzir doutrina em ação (visita, cesta, almoço).
- **Local.** Brasília, 913 Sul, Paróquia do Carmo. Não é página nacional.

Evitar: emojis de festa, linguagem de marketing, vitimização das famílias atendidas, autoelogio da conferência.

## Identidade visual sugerida

- Cores principais: vinho profundo (`#4A1818` / `#5C1F1B`), dourado (`#C9A567` / `#E0BE7E`), creme (`#F5E6D3` / `#FAF5EC`).
- Tipografia: **Cormorant Garamond** para títulos e citações; **Inter** para corpo.
- Logos: brasão SSVP e brasão da Paróquia do Carmo (em `app/assets/`).
- Lema constante: *Christum Annuntiare*.

## Ordem de postagem sugerida

1. **Post 1 — Apresentação** (`01-apresentacao/`): quem somos, missão, raízes. Abre a página com peso institucional.
2. **Stories de boas-vindas** (`stories-iniciais.md`): no mesmo dia do Post 1.
3. **Bio + Destaques** (`bio.md`, `destaques.md`): configurar antes do primeiro post.
4. **Post 2 — Convite do Almoço** (`02-almoco-convite/`): 2-3 dias depois do Post 1, no máximo 2 semanas antes do evento (24/05/2026).
5. **Post 3 — Como ajudar** (`03-como-ajudar/`): semana seguinte ao convite, mantém engajamento.

## Como usar cada pasta

Cada post tem três arquivos:
- `caption.md` — texto da legenda (copiar como está no Instagram).
- `slides.md` — conteúdo de cada slide do carrossel, na ordem.
- `hashtags.txt` — bloco de hashtags. Colar ao final da legenda OU como primeiro comentário.

Os slides dos posts 1 e 3 já são renderizados aqui: o layout vive em `social/render/all-slides.html` e `python social/render/render.py` gera os PNGs em `<post>/slides-png/`. O post 2 (almoço) ainda não tem layout — para ele, `slides.md` é o conteúdo a levar para o Canva.

**Ao editar o texto de um slide de 1 ou 3, editar `all-slides.html` também e rodar o render** — senão o `.md` e o PNG divergem.
