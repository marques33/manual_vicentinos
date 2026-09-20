---
name: vicentino-seo-audit
description: Use após editar `app/index.html`, `app/manual.html`, `app/eventos.html`, `app/sitemap.xml` ou `app/robots.txt`, ou ao receber pedido de "verificar SEO" / "auditar indexação". Confere Schema.org JSON-LD, meta tags, canonical, sitemap, robots e o token do Google Search Console.
---

# Auditoria SEO — site Vicentinos Brasília

Site público: https://manual-vicentinos.vercel.app/  
Objetivo: ser encontrado por (a) pessoas buscando ajuda ("vicentinos Brasília", "ajuda Asa Sul"), (b) doadores buscando a Conferência, (c) buscas pelo Manual.

Os 3 últimos commits do projeto foram todos sobre SEO — base já está montada, esta skill **mantém**, não reconstrói.

## Pontos de verificação

### 1. Tags meta principais (`app/index.html` `<head>`)

- [ ] `<title>` ≤ 60 caracteres, contém "Vicentinos Brasília"
- [ ] `<meta name="description">` ≤ 160 caracteres, com palavras-chave naturais
- [ ] `<meta name="keywords">` presente (pouco peso no Google, mas inofensivo)
- [ ] `<link rel="canonical" href="https://manual-vicentinos.vercel.app/">` — canonical em **todas** as páginas
- [ ] `<meta name="robots" content="index, follow, max-image-preview:large">`
- [ ] `<meta name="theme-color" content="#5C1F1B">`
- [ ] `<meta name="geo.region" content="BR-DF">` e `geo.placename`

### 2. Google Search Console

- [ ] `<meta name="google-site-verification" content="LIs_muGlKLc8XodWuoz2BWHK0Qb7QMEA0HTzj77mdXM">` presente em `index.html`
- [ ] Token coincide com a propriedade no GSC (URL prefix, não Domain)
- [ ] Sitemap submetido no GSC: `https://manual-vicentinos.vercel.app/sitemap.xml`

### 3. Open Graph + Twitter Card

Conferir em **todas** as páginas (`index.html`, `manual.html`, `eventos.html`):
- [ ] `og:type`, `og:locale=pt_BR`, `og:site_name`, `og:title`, `og:description`, `og:url`
- [ ] `og:image` com URL absoluta (https), 1200×1200 ou 1200×630
- [ ] `og:image:width`, `og:image:height`, `og:image:alt`
- [ ] `twitter:card=summary_large_image`, `twitter:title`, `twitter:description`, `twitter:image`

### 4. Schema.org JSON-LD (`<script type="application/ld+json">`)

`index.html` tem `@graph` com 4 entidades — todas precisam estar:

| `@id` | `@type` | Função |
|-------|---------|--------|
| `#website` | `WebSite` | site institucional |
| `#conferencia` | `Organization` | Conferência N.S. do Carmo (Conselho Particular N.S. de Fátima → SSVP) |
| `#paroquia` | `Church`, `PlaceOfWorship` | Paróquia do Carmo (sede física) |
| `#almoco-2026-MM-DD` | `Event` | almoço beneficente vigente |

Verificações:
- [ ] Todos os IDs são URLs absolutas com `#fragment`
- [ ] `#paroquia` tem `address` completo (`PostalAddress`), `telephone` em E.164 (`+55-61-99653-8206`), `containedInPlace` (Asa Sul / Brasília / DF)
- [ ] `#conferencia` referencia `#paroquia` em `location` e SSVP em `parentOrganization`
- [ ] `#almoco-*` tem `startDate`/`endDate` em ISO 8601 com offset (`-03:00`), `eventStatus`, `eventAttendanceMode`, `offers.price` em string, `priceCurrency: BRL`
- [ ] Validar com https://validator.schema.org/ ou Rich Results Test (https://search.google.com/test/rich-results) após cada edição
- [ ] Logo PNG e imagem do santuário acessíveis (HTTP 200)

### 5. `app/sitemap.xml`

- [ ] Namespace `xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"` presente
- [ ] URLs absolutas com `https://`
- [ ] `<lastmod>` em `YYYY-MM-DD`, atualizado quando o conteúdo muda
- [ ] `<priority>`: home `1.0`, eventos `0.9`, manual `0.8`
- [ ] `<changefreq>` coerente: `weekly` para home/eventos, `monthly` para manual
- [ ] Imagens importantes em `<image:image>` com `<image:loc>` e `<image:title>`

### 6. `app/robots.txt`

- [ ] Permite crawl (`Allow: /` ou ausência de `Disallow:`)
- [ ] Aponta para sitemap: `Sitemap: https://manual-vicentinos.vercel.app/sitemap.xml`
- [ ] Não bloqueia `/assets/` (imagens precisam ser crawladas para Image Search)

### 7. Performance / Core Web Vitals (auxiliar)

- [ ] Imagens grandes (`almoco-vicentinos.jpg`, `nossa-senhora-do-carmo.jpg`) com largura/altura definidas no HTML
- [ ] Imagens lazy-loaded (`loading="lazy"`) exceto a hero
- [ ] CSS crítico inline ou pré-carregado
- [ ] Sem console errors no DevTools

## Procedimento

1. **Snapshot inicial**: rodar Rich Results Test na URL atual antes de editar — guardar resultado.
2. **Editar** o HTML/sitemap/robots.
3. **Re-rodar Rich Results Test** local-first: copiar HTML editado e testar com a opção "Test code".
4. **Após deploy**: re-rodar pelo URL real.
5. **Atualizar `<lastmod>` no sitemap.xml** com a data de hoje (não esquecer).
6. **Pingar GSC**: Solicitar reindexação manual no Google Search Console (URL Inspection → Request indexing) para a página alterada.

## Armadilhas observadas

- Token GSC já foi alterado uma vez (commit `3d8a067`: "atualiza token do Google Search Console (URL prefix)"). **Não substituir** sem confirmar com o usuário — o GSC precisa estar verificado com o novo.
- O Vercel pode adicionar headers (`X-Robots-Tag`) via `vercel.json`. Conferir antes de declarar erro de indexação.
- Schema.org `Event` deve ser **desativado/atualizado** após o evento. Manter `Event` com data passada degrada relevância e pode disparar flag de "informação desatualizada".
- `og:image` precisa ser URL **absoluta**. Caminho relativo quebra preview no WhatsApp/Telegram/Facebook.
- Telefone na `#paroquia` deve ser E.164 (`+55-61-99653-8206`), não `(61) 99653-8206`.

## Critério de aceitação

- Rich Results Test sem erros para todos os tipos (`WebSite`, `Organization`, `Church`, `Event`)
- Sitemap valida em https://www.xml-sitemaps.com/validate-xml-sitemap.html
- GSC mostra a propriedade verificada e o sitemap como "Sucesso"
- `lastmod` do sitemap = data do último commit que tocou o conteúdo público
- Smoke check no Facebook Sharing Debugger e Twitter Card Validator: previews carregam imagem e título
