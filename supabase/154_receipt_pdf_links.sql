-- Receipt PDF links for WhatsApp: a private Storage bucket holding Counter / sales
-- receipt PDFs, so a bill sent straight to the customer's number (wa.me, text only)
-- can carry a time-limited link to its PDF.
-- Run once in the Supabase SQL editor after 153. Safe to re-run.
--
-- Path shape: <acc_companies.id>/<bill id>.pdf. A signed-in user may upload, overwrite
-- and sign only files under an Accounts company that belongs to their own
-- organization. The bucket is private; customers open the file through a signed URL
-- the app creates (30 days by default), never through a public URL.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 2097152, array['application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.receipt_folder_allowed(folder text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.acc_companies c
    where c.id::text = folder
      and c.organization_id = public.current_organization_id()
  );
$$;

revoke all on function public.receipt_folder_allowed(text) from public, anon;
grant execute on function public.receipt_folder_allowed(text) to authenticated;

drop policy if exists "receipts upload own company" on storage.objects;
create policy "receipts upload own company" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'receipts' and public.receipt_folder_allowed((storage.foldername(name))[1]));

drop policy if exists "receipts read own company" on storage.objects;
create policy "receipts read own company" on storage.objects
  for select to authenticated
  using (bucket_id = 'receipts' and public.receipt_folder_allowed((storage.foldername(name))[1]));

drop policy if exists "receipts overwrite own company" on storage.objects;
create policy "receipts overwrite own company" on storage.objects
  for update to authenticated
  using (bucket_id = 'receipts' and public.receipt_folder_allowed((storage.foldername(name))[1]))
  with check (bucket_id = 'receipts' and public.receipt_folder_allowed((storage.foldername(name))[1]));
