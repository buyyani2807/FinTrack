-- Voucher attachments for FinTrack Accounts (owner-only, company-scoped).
-- Stores small files (PDF / images, max 512 KiB) as base64 so no Storage bucket is required.
-- Apply after 065_accounts_company_shadow_fix.sql.

create table if not exists public.acc_voucher_attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid not null references public.acc_companies(id) on delete cascade,
  voucher_id uuid not null references public.acc_vouchers(id) on delete cascade,
  file_name text not null,
  content_type text not null,
  byte_size integer not null check (byte_size > 0 and byte_size <= 524288),
  content_base64 text not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create index if not exists acc_voucher_attachments_voucher_idx
  on public.acc_voucher_attachments (organization_id, company_id, voucher_id, created_at desc);

alter table public.acc_voucher_attachments enable row level security;

drop policy if exists acc_voucher_attachments_owner_select on public.acc_voucher_attachments;
create policy acc_voucher_attachments_owner_select on public.acc_voucher_attachments
for select to authenticated
using (
  organization_id = public.current_organization_id()
  and public.is_financier_owner()
  and company_id = public.acc_request_company_id()
);

revoke all on table public.acc_voucher_attachments from authenticated;
grant select on table public.acc_voucher_attachments to authenticated;

create or replace function public.acc_add_voucher_attachment(
  input_voucher_id uuid,
  input_file_name text,
  input_content_type text,
  input_content_base64 text,
  input_company_id uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  org_id uuid;
  active_company_id uuid;
  voucher public.acc_vouchers;
  file_name text;
  content_type text;
  payload text;
  byte_size integer;
  new_id uuid;
begin
  org_id := public.acc_require_owner();
  active_company_id := public.acc_require_company(input_company_id);
  file_name := nullif(trim(input_file_name), '');
  content_type := lower(nullif(trim(input_content_type), ''));
  payload := nullif(trim(input_content_base64), '');
  if file_name is null then raise exception 'File name is required'; end if;
  if length(file_name) > 180 then raise exception 'File name is too long'; end if;
  if content_type is null or content_type not in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp') then
    raise exception 'Only PDF, JPEG, PNG, or WebP attachments are allowed';
  end if;
  if payload is null then raise exception 'Attachment content is required'; end if;
  if payload ~ '[^A-Za-z0-9+/=]' then raise exception 'Attachment content is not valid base64'; end if;
  byte_size := (length(payload) * 3) / 4;
  if right(payload, 2) = '==' then byte_size := byte_size - 2;
  elsif right(payload, 1) = '=' then byte_size := byte_size - 1;
  end if;
  if byte_size <= 0 or byte_size > 524288 then
    raise exception 'Attachment must be between 1 byte and 512 KB';
  end if;

  select * into voucher from public.acc_vouchers v
  where v.id = input_voucher_id and v.organization_id = org_id and v.company_id = active_company_id;
  if voucher.id is null then raise exception 'Voucher not found'; end if;
  if voucher.status not in ('posted', 'reversed') then
    raise exception 'Attachments are only allowed on posted or reversed vouchers';
  end if;

  insert into public.acc_voucher_attachments (
    organization_id, company_id, voucher_id, file_name, content_type, byte_size, content_base64, created_by
  ) values (
    org_id, active_company_id, voucher.id, file_name, content_type, byte_size, payload, auth.uid()
  ) returning id into new_id;

  perform public.acc_write_audit(
    org_id, 'voucher_attachment', new_id, 'create',
    null,
    jsonb_build_object('voucher_id', voucher.id, 'file_name', file_name, 'byte_size', byte_size),
    null,
    active_company_id
  );
  return new_id;
end;
$$;

create or replace function public.acc_delete_voucher_attachment(
  input_attachment_id uuid,
  input_company_id uuid default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  org_id uuid;
  active_company_id uuid;
  existing public.acc_voucher_attachments;
begin
  org_id := public.acc_require_owner();
  active_company_id := public.acc_require_company(input_company_id);
  select * into existing from public.acc_voucher_attachments a
  where a.id = input_attachment_id and a.organization_id = org_id and a.company_id = active_company_id;
  if existing.id is null then raise exception 'Attachment not found'; end if;
  delete from public.acc_voucher_attachments where id = existing.id;
  perform public.acc_write_audit(
    org_id, 'voucher_attachment', existing.id, 'delete',
    jsonb_build_object('voucher_id', existing.voucher_id, 'file_name', existing.file_name),
    null,
    null,
    active_company_id
  );
end;
$$;

notify pgrst, 'reload schema';
