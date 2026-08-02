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

---

# Doação por PIX com QR Code — agosto/2026

## Contexto
Pedido: incluir no site a informação de doação e o QR Code para a chave PIX `984139596`.

Decisões confirmadas com o usuário:
- A chave veio sem DDD. Confirmado **61** (Brasília) → chave final `+5561984139596`.
- A conta está em nome de **Horcioni**, consócia da Conferência (não é conta em nome da
  Conferência). Por isso o bloco avisa que é esse o nome que aparece no app do doador.
- Bloco publicado nas **duas** páginas (index.html e eventos.html).

## Tarefas
- [x] Confirmar DDD e titular da conta antes de gerar qualquer código
- [x] Gerar o BR Code (EMV MPM) estático com CRC16-CCITT-FALSE
- [x] Gerar o QR Code como SVG (`app/assets/pix-qr.svg`)
- [x] index.html — bloco PIX na seção "Como Ajudar" (+ CSS e responsivo)
- [x] eventos.html — bloco PIX na seção de doação, WhatsApp mantido como alternativa
- [x] Botões "copiar chave" e "copiar código" com fallback sem Clipboard API
- [x] Acessibilidade: alt no QR, `:focus-visible` nos botões, `aria-live` no feedback
- [x] Verificação: CRC, TLV, round-trip do QR, integridade do código no HTML, render local

## Evidências de verificação
1. **Algoritmo CRC** — check value canônico do CRC-16/CCITT-FALSE (`"123456789"` → `29B1`)
   confere em duas implementações independentes (bitwise e table-driven).
2. **Payload** — re-parse TLV completo fecha sem sobra de bytes; CRC do payload confere.
3. **Round-trip do QR** — o SVG **como servido pelo site** foi rasterizado no navegador e
   decodificado com pyzbar: devolve exatamente o BR Code esperado, chave `+5561984139596`.
4. **Integridade no HTML** — os 4 botões (2 por página) carregam a chave e o BR Code
   idênticos ao payload validado (conferido por script após cada reescrita de arquivo).
5. **Funcional** — clique nos 4 botões grava o valor correto (writeText interceptado),
   rótulo muda para "Copiado!"; console sem erros nas duas páginas.
6. **Layout** — desktop 1280px e mobile emulado 375×812 (DPR 2); bloco PIX sem overflow.

BR Code gerado:
`00020126360014br.gov.bcb.pix0114+55619841395965204000053039865802BR5922CONFERENCIA N S FATIMA6008BRASILIA62070503***6304A866`

## Riscos residuais / próximos passos
- **Teste real de pagamento não foi feito.** A validação é do formato (CRC/TLV/decodificação),
  não da titularidade. Antes de divulgar, alguém deve escanear e conferir se o app mostra o
  nome da Horcioni — só o banco resolve a chave para a conta de destino.
- O nome exibido no bloco é só "Horcioni"; se o app do banco mostrar o nome completo, pode
  valer alinhar o texto do site com o que o doador realmente vê.
- ~~Bug pré-existente: estouro horizontal de 10px a 375px.~~ **Corrigido** — ver seção
  abaixo.


---

# Correção do estouro horizontal em telas estreitas — agosto/2026

## Contexto
Achado durante a tarefa do PIX e reportado ao usuário, que pediu a correção.

## Causa raiz (duas, encadeadas)
1. `.ssvp-emblem-medal` tinha `width`/`height` fixos de 280px dentro de um `.ssvp-emblem`
   com `padding: 56px 40px` → mínimo de **362px**. O `.container` oferece `largura - 48`,
   então estourava em **qualquer viewport abaixo de ~410px** (não só a 375px).
2. `.ssvp-emblem` é item de grid, e item de grid tem `min-width: auto`. Ele crescia além
   da própria coluna, então um `max-width: 100%` no medalhão resolveria contra um pai
   inflado pelo próprio medalhão — a primeira correção sozinha não bastava.

## Achado fora do escopo (§6.1)
`.impact-stats` (grid de 2 colunas, `min-content` de 276px) não cabia no `.impact-card`
abaixo de ~378px de viewport e era **cortado** pelo `overflow: hidden` do cartão — texto
some, sem barra de rolagem para denunciar. Corrigido em commit separado: uma coluna só
abaixo de 400px.

## Correções
- `.ssvp-emblem-medal`: `max-width: 100%` + `aspect-ratio: 1` no lugar da altura fixa
  (preserva o círculo ao encolher).
- `.ssvp-emblem`: `min-width: 0`.
- `.impact-stats`: uma coluna em `@media (max-width: 400px)`.

## Evidências
- Varredura de 320px a 1440px em `index.html`: **zero** elementos fora da viewport,
  emblema sempre dentro da coluna do grid, medalhão sempre circular (161px a 280px).
- Verificação adicional por `scrollWidth > clientWidth` em `.impact-stat`/`.impact-text`/
  `.ssvp-emblem`: **zero** elementos com conteúdo cortado, até 290px de largura efetiva.
- `eventos.html` e `manual.html` varridas em 320/375/414/768/1280: zero estouros.
- Desktop inalterado: medalhão segue 280x280.

## Riscos residuais
- Entre 378px e 400px as estatísticas passam a ficar em uma coluna embora coubessem em
  duas. Escolha deliberada: margem de segurança contra variação de fonte e tradução.
