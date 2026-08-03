-- ============================================================================
-- 005 · Anexo para download nos cartazes do mural
-- ----------------------------------------------------------------------------
-- Até aqui um cartaz tinha UM link (`link_externo`, site do grupo). Quando o
-- movimento manda também um folheto em PDF, não havia onde pôr: usar o
-- `link_externo` custaria o site.
--
-- São dois campos porque o rótulo é conteúdo editorial — "Folheto do 2º
-- semestre (PDF, 2,6 MB)" diz ao paroquiano o que ele vai baixar e quanto vai
-- gastar de dados antes de tocar no link. O tamanho vai no texto, não em coluna
-- própria: é informação que só existe para ser lida, nunca consultada.
--
-- RLS e grants não mudam: as políticas de `mural_posts` são por linha, não por
-- coluna, e continuam valendo para as novas.
-- ============================================================================

alter table public.mural_posts
  add column if not exists anexo_url    text,
  add column if not exists anexo_rotulo text;

-- ----------------------------------------------------------------------------
-- anexo_url
--
-- Duas formas aceitas:
--
--   /assets/arquivo.pdf   arquivo servido pelo próprio site (o caso comum).
--                         Caminho relativo de propósito: o mesmo registro vale
--                         no preview local, no preview da Vercel e em produção,
--                         sem domínio gravado no banco.
--   https://…             arquivo de terceiro.
--
-- Depois de `/assets/` não se admite barra. Isso não é capricho de estilo: sem
-- barra não existe `..` que escape da pasta, e a validação fica provada pela
-- própria forma da expressão, não por uma lista de casos que alguém lembrou.
--
-- `~*` porque moderador digita `.PDF` tanto quanto `.pdf`.
--
-- O teto de tamanho fica no char_length, e não como {5,300} dentro da regex —
-- o Postgres limita repetição a 255 (RE_DUP_MAX) e recusaria a expressão
-- inteira. Mesma armadilha documentada no CHECK de `link_externo`, na 002.
-- ----------------------------------------------------------------------------
alter table public.mural_posts
  drop constraint if exists mural_posts_anexo_url_check;

alter table public.mural_posts
  add constraint mural_posts_anexo_url_check check (
    anexo_url is null or (
      (
        anexo_url ~* '^/assets/[A-Za-z0-9._-]+\.(pdf|jpe?g|png)$'
        or anexo_url ~ '^https://[^[:space:]]+$'
      )
      and char_length(anexo_url) between 12 and 300
    )
  );

-- ----------------------------------------------------------------------------
-- anexo_rotulo — opcional. Sem ele o site escreve "Baixar arquivo".
-- ----------------------------------------------------------------------------
alter table public.mural_posts
  drop constraint if exists mural_posts_anexo_rotulo_check;

alter table public.mural_posts
  add constraint mural_posts_anexo_rotulo_check check (
    anexo_rotulo is null
    or char_length(btrim(anexo_rotulo)) between 3 and 60
  );

comment on column public.mural_posts.anexo_url is
  'Arquivo para download: "/assets/nome.pdf" (nosso) ou https:// (de terceiro). NULL = sem anexo.';
comment on column public.mural_posts.anexo_rotulo is
  'Texto do botão de download. NULL = o site usa "Baixar arquivo".';
