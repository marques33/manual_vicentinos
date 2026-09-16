-- ============================================================================
-- 018 · Controle Orçamentário — comprovantes (Storage)
-- ----------------------------------------------------------------------------
-- Primeiro uso de Supabase Storage no projeto. Bucket privado — nenhum
-- comprovante é público, nem para confrade comum: o print/recibo às vezes
-- carrega dado de terceiro (nome/telefone num comprovante de PIX), então só
-- quem tem pode_lancar_financeiro() abre o arquivo, mesmo que o extrato em
-- si (que só diz "há comprovante anexado") seja visível a todo confrade.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'comprovantes-financeiros', 'comprovantes-financeiros', false,
  5242880, -- 5 MB
  array['image/jpeg', 'image/png', 'application/pdf']
)
on conflict (id) do nothing;

drop policy if exists "tesoureiro/admin lê comprovantes-financeiros" on storage.objects;
create policy "tesoureiro/admin lê comprovantes-financeiros"
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'comprovantes-financeiros' and public.pode_lancar_financeiro());

drop policy if exists "tesoureiro/admin envia comprovantes-financeiros" on storage.objects;
create policy "tesoureiro/admin envia comprovantes-financeiros"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'comprovantes-financeiros' and public.pode_lancar_financeiro());

drop policy if exists "tesoureiro/admin substitui comprovantes-financeiros" on storage.objects;
create policy "tesoureiro/admin substitui comprovantes-financeiros"
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'comprovantes-financeiros' and public.pode_lancar_financeiro())
  with check (bucket_id = 'comprovantes-financeiros' and public.pode_lancar_financeiro());

drop policy if exists "tesoureiro/admin apaga comprovantes-financeiros" on storage.objects;
create policy "tesoureiro/admin apaga comprovantes-financeiros"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'comprovantes-financeiros' and public.pode_lancar_financeiro());
