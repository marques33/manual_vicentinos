# Atualização do site — julho/2026

## Contexto
Site em `app/` (index.html, eventos.html, manual.html) publicado na Vercel.
Mudanças pedidas pelo usuário:
1. O almoço beneficente de 24/05/2026 já aconteceu → sair do site.
2. Reuniões: além das terças, agora também aos sábados, 17h (decisão confirmada: terças **e** sábados).
3. Incluir a obra atual: 9 famílias / 53 pessoas domiciliadas na Estrutural, cestas básicas,
   auxílio material e espiritual.
4. Página de eventos: zerada (só "em breve, novos encontros" + convite à doação).

## Tarefas
- [x] Mapear todas as ocorrências do evento e do horário das reuniões
- [x] index.html — metas (description, og, twitter) com terças e sábados
- [x] index.html — remover Event (almoço) do JSON-LD e enriquecer a Organization
- [x] index.html — substituir o banner do almoço por seção "Nossa obra hoje" (9 famílias / 53 pessoas / Estrutural)
- [x] index.html — atualizar os dois cards "Reuniões" (Conferência e Contato)
- [x] index.html — trocar CSS `.event-feature*` por `.impact*` (inclusive media queries)
- [x] eventos.html — metas, título, OG/Twitter e JSON-LD sem o almoço
- [x] eventos.html — remover card do evento e CSS morto; página com estado "em breve" + doação
- [x] sitemap.xml — remover imagem do encarte, atualizar lastmod
- [x] Verificação: HTML/JSON-LD válidos, sem referências órfãs ao almoço, render local

## Revisão final

### O que mudou
**app/index.html**
- Metas (description, keywords, og, twitter) com "terças e sábados, 17h" e a obra atual.
- JSON-LD: removido o nó `Event` do almoço; `Organization` agora descreve as 9 famílias /
  53 pessoas na Estrutural, cestas básicas, auxílio material e espiritual; `areaServed`
  passou a incluir Estrutural (SCIA); acrescentado `knowsAbout`.
- Banner do almoço (markup + CSS `.event-feature*` + `.btn-whatsapp`) substituído pela
  seção **"Nossa obra hoje"** (`.impact*`): texto + chips (cestas básicas / auxílio material /
  apoio espiritual) + cartões 9 famílias, 53 pessoas e Estrutural — DF, com CTA para #ajudar.
- Cards "Reuniões" (Nossa Conferência e Contato) → "Terças e sábados, às 17h".
- Card "Visitas às famílias" cita as 9 famílias na Estrutural.

**app/eventos.html**
- Metas, título, OG/Twitter e JSON-LD sem o almoço (agora `BreadcrumbList` + `CollectionPage`);
  imagem social passou a ser a de N. S. do Carmo.
- Card do evento, cardápio, ingressos e CSS morto (`.event-*`, `.btn-outline`) removidos.
- Nova seção "Nossos encontros semanais" (terça 17h / sábado 17h), estado "Em breve, novos
  encontros" e bloco de doação com a obra atual (9 famílias / 53 pessoas na Estrutural).

**app/sitemap.xml** — imagem do encarte removida, `lastmod` 2026-07-29, prioridade de
eventos 0.9 → 0.8.

### Evidências
- JSON-LD das duas páginas parseado com `json.loads` — válido (index: WebSite, Organization,
  Church/PlaceOfWorship; eventos: BreadcrumbList, CollectionPage).
- Balanceamento de tags verificado com `html.parser`: 0 tags abertas sem fechar, 0 erros.
- Render local (`python -m http.server`) no Chrome: seções novas conferidas em 1280px e em
  ~500px (breakpoint mobile), sem overflow horizontal e sem erros/avisos no console.
- `grep` confirma que não sobrou nenhuma referência a "almoço/ingresso/24-05/event-*"
  fora da menção genérica a futuros almoços beneficentes.

### Riscos residuais / próximos passos
- `app/assets/almoco-vicentinos.jpg` foi removido do repositório (segue recuperável pelo
  histórico do git, commit 3d8a067 e anteriores). Ainda é citado por dois documentos que não
  fazem parte do site: `social/instagram-launch/02-almoco-convite/slides.md` e o checklist
  `.claude/skills/vicentino-seo-audit/SKILL.md`.
- Google Search Console pode levar alguns dias para derrubar o rich result do Event antigo;
  o sitemap com `lastmod` novo acelera o recrawl.
- Se as reuniões de terça mudarem de horário, atualizar: metas + JSON-LD da index, os dois
  cards "Reuniões" e os cards da agenda em eventos.html.

## Diagnóstico de indexação (29/07/2026)

Consultas `site:manual-vicentinos.vercel.app` em DuckDuckGo/lite (índice Bing) e Brave:
**nenhum resultado**. Busca por frases exatas do site ("Manual Vicentino de Direitos e
Auxílios") também não retorna o domínio. O Google respondeu com CAPTCHA às consultas
automatizadas — a confirmação definitiva precisa ser feita no Search Console.

Lado técnico: tudo liberado para indexar.
- `robots.txt`: `Allow: /` + sitemap declarado.
- Cabeçalhos de produção: sem `X-Robots-Tag`; `<meta name="robots" content="index, follow">`.
- `canonical` correto nas três páginas; `sitemap.xml` responde 200.
- Meta `google-site-verification` presente (propriedade de prefixo de URL no GSC).

Ações pendentes (exigem login no Search Console — só o usuário pode fazer):
1. Sitemaps → enviar `https://manual-vicentinos.vercel.app/sitemap.xml`.
2. Inspeção de URL → `/`, `/eventos.html`, `/manual.html` → "Solicitar indexação".
3. Relatório "Páginas" → conferir o motivo caso apareçam como "Descoberta — não indexada".

Fator de risco conhecido: domínio gratuito `*.vercel.app` e ausência de links externos
apontando para o site. Um domínio próprio e links (site/redes da paróquia, bio do Instagram)
aceleram bastante a descoberta.
