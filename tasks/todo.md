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


---

# Mural da Comunidade e Pedidos de Oração (Supabase) — agosto/2026

## Contexto
Dois pedidos do usuário:
1. **Mural** para divulgar outros grupos e movimentos — o caso concreto foi o folheto das
   *Oficinas de Oração e Vida* (frei Ignácio Larrañaga; início em fevereiro e agosto;
   contato Fernanda (61) 99970-7548; www.tovbrasil.com.br).
2. **Pedidos de oração**, com os "privilegiados da semana", expostos na própria página.

O segundo abre o site a conteúdo de desconhecidos. O usuário pediu explicitamente
mecanismos contra fake news e discurso de ódio, e política de RLS protegendo o banco.

## Decisões confirmadas com o usuário
| Tema | Decisão |
|---|---|
| Quem publica no mural | Só a Conferência, pelo painel. Sem formulário público. |
| Pedidos de oração | Aprovação prévia — nada aparece antes de um moderador liberar. |
| Exibição | Primeiro nome + intenção curta; opção anônima; expira em 60 dias. |
| Formato | Duas páginas novas + faixa na home (não seções dentro da index). |
| Cartazes | Só texto estruturado — sem upload de imagem, sem Storage. |
| Infra | Conta Supabase já existia. Sem Cloudflare → sem Turnstile. |

## Princípio da arquitetura
**O navegador nunca escreve no banco.** A chave `anon` que vai no HTML só tem `SELECT`,
em colunas nomeadas, de linhas já moderadas. Não há política de INSERT/UPDATE/DELETE para
`anon` em nenhuma tabela. A única porta de escrita pública é a Edge Function, que usa
`service_role` do lado do servidor. A Vercel continua 100% estática — sem `api/`, sem
`package.json`, sem tocar em `vercel.json`.

## Tarefas
- [x] Migrações: `admins` + `is_admin()`, `mural_posts`, `pedidos_oracao`, limite e retenção
- [x] Proteção por **coluna** em `pedidos_oracao` (RLS é por linha e não esconderia
      `contato`/`ip_hash` de uma linha aprovada)
- [x] Edge Function `enviar-pedido` com 10 camadas de conferência
- [x] `app/assets/supabase-client.js` — configuração única + auxiliares compartilhados
- [x] `app/mural.html`, `app/oracoes.html`, `app/admin.html`
- [x] Menus (index/eventos), faixa "Comunidade" na home, `sitemap.xml`, `robots.txt`
- [x] Scripts de verificação: RLS, Edge Function e filtros de conteúdo
- [x] Verificação: HTML, JSON-LD, sintaxe JS, filtros, varredura de layout

## Decisões técnicas que merecem registro

**Proteção por coluna, não só RLS.** `revoke all ... from anon` + `grant select (id, nome,
intencao, privilegiado_semana, aprovado_em, criado_em)`. Sem isso, uma intenção aprovada
entregaria `contato` e `ip_hash` a qualquer visitante — a RLS filtra linhas, não colunas.
Consequência esperada: `select *` como anon dá **erro**, e o front pede as colunas pelo nome.

**`persistSession: false` no cliente público.** Sem isso, um moderador que tivesse acabado
de usar o painel continuaria autenticado ao abrir `oracoes.html` e, pela política de admin,
veria pedidos **pendentes** numa página pública.

**`noindex` em vez de `Disallow`.** `oracoes.html` traz `<meta robots noindex>` e o
`robots.txt` **não** a bloqueia — de propósito. `Disallow` impediria o robô de ler a meta e
ele ainda poderia indexar a URL a seco. Deixar rastrear é o que faz a ordem ser obedecida.

**Regras de conteúdo antes do limite por IP.** Ordem invertida durante a verificação: quem
cola um telefone sem pensar recebe o aviso e corrige, em vez de ficar uma hora de castigo.
O teto de estrago não muda — o limite continua guardando a fila do moderador, e nada
recusado chega a ser gravado.

**Armadilha anti-robô recortada no lugar** (`clip-path: inset(50%)`) e não em
`left: -9999px`: não cria risco de rolagem lateral e não entrega ao robô a pista fácil.

**Marcar em vez de bloquear vocabulário ofensivo.** Como tudo passa por aprovação prévia,
um falso positivo só muda a ordem da fila. Bloquear calado silenciaria alguém aflito.

## Evidências de verificação
1. **HTML** — 6 páginas com `html.parser`: 0 tags sem fechar, 0 erros de aninhamento.
   JSON-LD parseado em todas (index: WebSite/Organization/Church; eventos e mural:
   BreadcrumbList/CollectionPage).
2. **Sintaxe JS** — 11 blocos inline + 4 arquivos passam em `node --check`.
3. **Filtros de conteúdo** — `node supabase/testar-filtros.mjs`: **32 casos, todos passam**.
   O script lê o `filtros.ts` de produção e tira só as anotações de tipo, então testa o
   código que roda de verdade. Inclui 8 pedidos legítimos que **não** podem ser recusados.
4. **Layout** — varredura de 320px a 1440px (16 larguras × 6 páginas = 96 combinações):
   zero estouro horizontal, zero conteúdo cortado, console limpo.
   O menu passou de 6 para 7 itens e **cabe** em toda a faixa (565px de largura a 768px;
   833px a partir de 1200px) — medido no navegador, não estimado.
5. **Sonda de layout afinada** — passou a distinguir moldura decorativa (`::before` com
   `inset` negativo) de conteúdo realmente cortado. Sem isso o relatório traria alarme falso
   permanente em `.manual-mock`, e alarme falso permanente treina a gente a ignorar relatório.
6. **Scripts para rodar contra o projeto real** (ainda não executados — dependem das chaves):
   `supabase/verificar-rls.mjs` e `supabase/verificar-funcao.mjs`.

## Estado da instalação no projeto Supabase

**Projeto correto: `cqkymbseyrebmsufimni` ("vicentinos").**

### Tropeço registrado: instalei no projeto errado antes de conferir

O usuário mandou primeiro a string de conexão do projeto `nvnaxawszomhjqrmziqi` e eu apliquei
as 4 migrações lá. Depois, ao receber a chave `anon`, o `ref` do payload do JWT
(`cqkymbseyrebmsufimni`) **não batia** com o do usuário do banco
(`postgres.nvnaxawszomhjqrmziqi`) — eram dois projetos diferentes.

Como cada projeto assina o JWT com um segredo próprio, a chave era recusada pelo outro com
`Invalid API key`. Se eu não tivesse conferido, o site subiria com o mural **eternamente
vazio e sem erro visível** — o pior tipo de falha, a silenciosa.

**Regra que fica:** antes de aplicar qualquer coisa, decodificar o `ref` do JWT e comparar
com o do usuário do banco. São dois pedaços de informação que vêm em mensagens diferentes e
que ninguém confere de olho.

Limpeza feita: as 3 tabelas, as 4 funções, o schema `private`, o job de purga e a extensão
`pg_cron` foram removidos de `nvnaxawszomhjqrmziqi`, que voltou ao estado em que eu o
encontrei (0 tabelas em `public`, 0 usuários). Nenhum dado do usuário existia lá.

### Feito
- [x] `SUPABASE_URL` e chave `anon` do projeto vicentinos em `app/assets/supabase-client.js`.
      Os três `ref` (usuário do banco, payload do JWT, URL) conferidos antes de aplicar.
- [x] As 4 migrações aplicadas em `cqkymbseyrebmsufimni`, `pg_cron` incluído e job ativo.
- [x] Moderador `renanmrqs32@gmail.com` (usuário já existia, confirmado) inserido em
      `public.admins`; `is_admin()` devolve `true` para ele.
- [x] **Prova de RLS de dentro do banco: 26 casos, 0 falhas.**
- [x] **Prova de RLS por fora, pela chave anon e pelo PostgREST: 18 casos, 0 falhas.**
- [x] Cartaz das Oficinas de Oração e Vida publicado (destaque, com link, contato da
      Fernanda). Site de destino conferido: `https://www.tovbrasil.com.br` responde 200.
- [x] Render contra o Supabase real: mural mostra o cartaz com `rel="noopener noreferrer
      nofollow"`; orações mostra os dois estados vazios corretos; painel mostra login com o
      painel escondido. Console limpo nas três.
- [x] Varredura de layout refeita já com dado real: 96 combinações, zero estouro.

### Dois defeitos encontrados por usar o sistema de verdade

**`link_externo` com `{4,300}` na regex.** O Postgres limita repetição a 255 (RE_DUP_MAX) e
recusa a expressão inteira. Efeito: **nenhum cartaz com link podia ser cadastrado**. Escapou
de todos os testes anteriores porque o `CHECK` só avalia a regex quando o link não é nulo, e
até então todos os casos usavam link nulo. Lição: um `CHECK` com `is null or ...` tem dois
caminhos, e o teste precisa passar pelos dois.

**O verificador mentiu.** Com a chave `anon` montada errada, `verificar-rls.mjs` reportou
14 "OK": as operações proibidas eram mesmo recusadas, só que por causa da chave inválida e
não da RLS. É o pior modo de falha de um teste de segurança — dizer "protegido" quando o
certo era dizer "não sei". Agora o script confere primeiro se a chave é aceita e aborta com
`exit 2` se não for. (A causa da chave errada fui eu: quebrei o literal em três pedaços para
o `ref` ficar legível, e o script só leu o primeiro.)

### Instalação concluída em 2026-08-03
1. [x] **Cadastro público desligado** — Authentication → Providers → Email →
   *Enable sign ups* (feito pelo usuário no painel).
2. [x] **Segredo `IP_PEPPER` criado e `enviar-pedido` implantada** pela CLI do Supabase
   (`supabase secrets set` + `supabase functions deploy --project-ref cqkymbseyrebmsufimni`).
   A CLI **está** instalada nesta máquina (2.111.0) — a anotação anterior estava errada.
   `supabase functions list` confirma `verify_jwt: false` e `status: ACTIVE`.
   O deploy não precisou de Docker (a CLI avisa e envia os arquivos pela API).
3. [x] `node supabase/verificar-funcao.mjs` — **15 de 15 passaram, 0 falharam**, incluindo
   o limite por IP (429 já na 3ª tentativa). Evidência completa no commit desta data.
4. [ ] **Apagar os pedidos de teste** que o verificador deixou na fila: 1 do caminho
   legítimo ("Pela saúde de quem cuida…") + 2 de "Teste de limite número N". Todos estão
   como *pendente* (nunca chegaram à página pública). Botão **Excluir** em `admin.html`.
5. [ ] **Trocar as senhas de banco dos dois projetos** — as duas trafegaram por chat.

## Achados fora do escopo (§6.1) — registrados, não corrigidos
**`app/manual.html:977-978` — credenciais em texto puro no JavaScript do cliente.**
`VALID_USER = 'São Vicente de Paulo'`, `VALID_PASS = 'Afésemobrasémortaemsimesma'`, com a
sessão marcada em `sessionStorage` (`:979, 992, 1001, 1245`). Qualquer visitante lê isso em
"ver código-fonte" — não é autenticação, é um aviso de porta. **Não corrigido de propósito:**
a correção muda quem tem acesso ao Manual, e isso é decisão do usuário. Duas saídas, agora
que existe Supabase Auth no projeto: (a) se o Manual é público na prática, tirar a tela de
login; (b) se não é, usar o mesmo Supabase Auth do painel.

**Pré-existentes e benignos** (conferidos contra o `HEAD`, idênticos antes e depois — não
são regressão): `.manual-mock` e `.hero-frame` aparecem com `scrollWidth > clientWidth` na
sonda. São, respectivamente, a moldura decorativa `::before { inset: -8px }` e o recorte
proposital da foto do hero. Nenhum texto é cortado e o documento não rola na horizontal.

## Riscos residuais
- **Sem captcha.** Sem conta Cloudflare, as barreiras são armadilha + tempo + limite por IP.
  Barram robô comum, não ataque dirigido. Se a fila for inundada, ligar o Turnstile custa
  ~15 linhas na Edge Function.
- **Sem aviso automático de pedido novo.** A opção não foi marcada. O painel mostra a
  contagem de pendentes, mas nada avisa por fora — a fila precisa ser olhada. Um
  *Database Webhook* por e-mail resolve depois.
- **Moderação é humana.** Nenhum filtro pega ironia ou boato bem escrito. A garantia real
  de que nada impróprio entre no ar é a aprovação prévia.
- **Chave `anon` visível no HTML.** É o modelo do Supabase e está correto — *desde que* a
  RLS esteja como descrito. Por isso a verificação começa por ela.
- **LGPD.** Pedido de oração costuma ser dado sensível de terceiro. O desenho reduz o risco
  (primeiro nome, texto curto, consentimento, expiração em 60 dias, `noindex`, IP
  pseudonimizado por SHA-256 com pepper, purga diária), mas não elimina: alguém pode
  escrever mais do que devia. O moderador é quem segura isso.
- **Plano gratuito do Supabase** pausa projeto sem tráfego por 7 dias. Se acontecer, as
  páginas caem no estado de degradação (aviso cordial, nunca tela em branco).
- **Deno não está instalado** nesta máquina, então a Edge Function não foi executada
  localmente. A lógica de filtros foi testada em Node contra o arquivo real; o resto da
  função só será exercitado por `verificar-funcao.mjs` depois da implantação.

---

# Correção da identidade da Conferência (03/08/2026)

**Fato corrigido pelo usuário.** O site inteiro chamava a Conferência de *Nossa Senhora de
Fátima*. O nome correto é **Conferência Nossa Senhora do Carmo** — *Nossa Senhora de Fátima*
é o **Conselho Particular** a que ela é vinculada e subordinada. Além disso: fundada em
**23/03/1992**, agregada em **14/06/1999**, e as reuniões passam a ser **somente aos
sábados, 17h** (eram terças e sábados).

## O que foi alterado
- `app/index.html`, `app/eventos.html`, `app/manual.html`, `app/mural.html`,
  `app/oracoes.html`, `app/admin.html` — nome da Conferência em títulos, metas, OG/Twitter,
  JSON-LD, cabeçalho, rodapé e corpo.
- `app/index.html` — parágrafo "Quem somos" com fundação/agregação e vínculo ao Conselho;
  cards da seção *Nossa Conferência* (Padroeira, Conselho Particular, Fundação e agregação);
  bloco de contato com linha do Conselho Particular; JSON-LD com `foundingDate` e
  `parentOrganization` aninhado (Conselho → SSVP).
- `app/eventos.html` — agenda com um único card (Sábado, 17h); CSS `.agenda-grid` de duas
  colunas para uma, centralizada.
- `.claude/skills/vicentino-seo-audit/SKILL.md` — tabela de entidades JSON-LD.

## Evidências
- JSON-LD dos 6 HTML parseado com `json.loads` — todos válidos.
- Balanceamento de tags conferido nos 6 arquivos — nenhum erro, nenhuma tag aberta.
- Servidor local (127.0.0.1:8123) + Chrome DevTools: seção *Nossa Conferência* renderiza os
  6 cards em grade 2×3; agenda de eventos com card único centralizado; `oracoes.html` e
  `mural.html` sem nenhuma ocorrência de "Fátima" ou "terça" no texto renderizado; console
  sem erros.

## Achados fora do escopo — aprovados e corrigidos em seguida
- `social/instagram-launch/**` e `social/render/all-slides.html`: todo o pacote de lançamento
  do Instagram trazia o nome errado *e* "toda terça-feira, 17h", além do slide "Padroeiros
  (N. S. do Carmo & N. S. de Fátima)". Reportado, aprovado pelo usuário e corrigido — ver
  seção abaixo.

---

# Correção do pacote de Instagram (03/08/2026)

Mesma correção de fato, aplicada ao material de redes sociais.

## O que foi alterado
- **Legendas:** `01-apresentacao/caption.md` (nome + fundação/agregação + vínculo ao Conselho
  + sábado), `02-almoco-convite/caption.md` (nome), `03-como-ajudar/caption.md` (sábado).
- **Roteiros de slide:** `01-apresentacao/slides.md` (capa, slide 3 reescrito, grade 2x2 com
  Padroeira e sábado), `02-almoco-convite/slides.md` (nome), `03-como-ajudar/slides.md`
  (capa, CTA e slide de reuniões).
- **Perfil:** `bio.md` (nome + sábados, dentro dos 150 caracteres), `destaques.md`
  (Padroeiros → Padroeira, mais destaques de fundação e Conselho), `stories-iniciais.md`,
  `README.md` (título).
- **Hashtags:** `#NossaSenhoraDeFatima` → `#ConferenciaNossaSenhoraDoCarmo` nos posts 1 e 2.
- **Layout renderizado:** `social/render/all-slides.html` — capa, slide 3, grade 2x2, capa do
  post 3, chip de voluntariado e slide de reuniões.
- **PNGs:** os 15 slides re-renderizados com `python social/render/render.py`.

## Evidências
- Varredura final em `social/`: nenhuma ocorrência de "terça"; as 4 de "Fátima" restantes são
  todas o Conselho Particular, corretas.
- Render executado sem erro (15 slides). Inspeção visual de `01/01`, `01/03`, `01/07`,
  `03/01`, `03/05` e `03/06`: nome novo na capa, texto do slide 3 dentro da caixa, grade 2x2
  com "Todo sábado" e "Padroeira / N. S. do Carmo / Conferência desde 1992", chip e título de
  reuniões com sábado.

## Corrigido de passagem
- `social/instagram-launch/README.md`: o texto dizia que a renderização "fica para o Canva",
  mas `social/render/render.py` já gera os PNGs dos posts 1 e 3 desde antes desta tarefa.
  Doc atualizada, com o aviso de que editar o `.md` sem editar `all-slides.html` faz o
  roteiro divergir da imagem.

## Riscos residuais
- **O post 2 (almoço) não tem layout em `all-slides.html`** — só roteiro `.md`. Se for para o
  ar, é montagem manual no Canva, sem a proteção do render.
- **Conteúdo já publicado no Instagram não é alcançado por esta correção.** Se algum destes
  posts já foi ao ar com o nome antigo, a correção precisa ser feita na própria plataforma
  (editar legenda; slide errado exige repostar).
- A data do almoço (24/05/2026) já passou — o post 2 está desatualizado por outro motivo,
  fora do escopo desta correção.
