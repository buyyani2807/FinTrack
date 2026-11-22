-- Receipt / document links for every module, not just Accounts.
-- Run once in the Supabase SQL editor after 155. Safe to re-run.
--
-- 154/155 filed PDFs under an Accounts company (<acc_companies.id>/<doc>.pdf). Finance and
-- Chit Fund receipts belong to the organization, and a Finance-only business may have no
-- Accounts company at all, so those are filed under the organization id instead
-- (<organizations.id>/<doc>.pdf). receipt_links also records what kind of document it is,
-- so the WhatsApp preview card can say "Payment Received" or "Quotation" instead of "Bill".

alter table public.receipt_links add column if not exists organization_id uuid references public.organizations(id) on delete cascade;
alter table public.receipt_links add column if not exists kind text not null default 'bill';
alter table public.receipt_links alter column company_id drop not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'receipt_links_owner_check') then
    alter table public.receipt_links add constraint receipt_links_owner_check
      check (company_id is not null or organization_id is not null);
  end if;
end $$;

create index if not exists receipt_links_organization_idx on public.receipt_links (organization_id);

-- A folder is either one of the organization's Accounts companies or the organization itself.
create or replace function public.receipt_folder_allowed(folder text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select folder is not null and (
    folder = public.current_organization_id()::text
    or exists (
      select 1 from public.acc_companies c
      where c.id::text = folder
        and c.organization_id = public.current_organization_id()
    )
  );
$$;

revoke all on function public.receipt_folder_allowed(text) from public, anon;
grant execute on function public.receipt_folder_allowed(text) to authenticated;

-- Folder for documents that belong to the organization (Finance, Chit Fund receipts).
create or replace function public.receipt_storage_folder()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select public.current_organization_id()::text;
$$;

revoke all on function public.receipt_storage_folder() from public, anon;
grant execute on function public.receipt_storage_folder() to authenticated;

drop function if exists public.create_receipt_link(uuid, text, text, text, text, date, numeric, numeric, integer);

-- p_company_id is the folder owner: an Accounts company id, or the organization id.
create or replace function public.create_receipt_link(
  p_company_id uuid,
  p_storage_path text,
  p_business_name text default '',
  p_customer_name text default '',
  p_bill_no text default '',
  p_bill_date date default null,
  p_amount numeric default 0,
  p_balance numeric default 0,
  p_days integer default 30,
  p_kind text default 'bill'
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_org uuid := public.current_organization_id();
  v_days integer := least(greatest(coalesce(p_days, 30), 1), 90);
  v_kind text := lower(coalesce(nullif(trim(p_kind), ''), 'bill'));
  v_is_org boolean;
begin
  if p_company_id is null or v_org is null or not public.receipt_folder_allowed(p_company_id::text) then
    raise exception 'Not allowed';
  end if;
  if p_storage_path is null or split_part(p_storage_path, '/', 1) <> p_company_id::text then
    raise exception 'Receipt path must be inside the folder';
  end if;
  if v_kind not in ('bill', 'invoice', 'receipt', 'quotation', 'sales_order', 'delivery_challan', 'purchase_order', 'goods_receipt') then
    v_kind := 'bill';
  end if;
  v_is_org := p_company_id = v_org;

  -- Sharing the same document again keeps its link (and refreshes the details and expiry).
  select code into v_code from public.receipt_links where storage_path = p_storage_path;
  if v_code is null then
    v_code := substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
  end if;

  insert into public.receipt_links (
    code, company_id, organization_id, kind, storage_path, business_name, customer_name, bill_no, bill_date, amount, balance, expires_at
  ) values (
    v_code,
    case when v_is_org then null else p_company_id end,
    v_org,
    v_kind,
    p_storage_path,
    left(coalesce(p_business_name, ''), 120),
    left(coalesce(p_customer_name, ''), 120),
    left(coalesce(p_bill_no, ''), 60),
    p_bill_date,
    coalesce(p_amount, 0),
    greatest(coalesce(p_balance, 0), 0),
    now() + make_interval(days => v_days)
  )
  on conflict (storage_path) do update set
    kind = excluded.kind,
    organization_id = excluded.organization_id,
    business_name = excluded.business_name,
    customer_name = excluded.customer_name,
    bill_no = excluded.bill_no,
    bill_date = excluded.bill_date,
    amount = excluded.amount,
    balance = excluded.balance,
    expires_at = excluded.expires_at;

  return v_code;
end;
$$;

revoke all on function public.create_receipt_link(uuid, text, text, text, text, date, numeric, numeric, integer, text) from public, anon;
grant execute on function public.create_receipt_link(uuid, text, text, text, text, date, numeric, numeric, integer, text) to authenticated;

notify pgrst, 'reload schema';
