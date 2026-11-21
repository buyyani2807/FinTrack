-- Short bill links for WhatsApp: myfintracker.com/b/<code> instead of a long Supabase
-- Storage signed URL. The /b/ page (api/_lib/receiptLinkPage.js, served by the
-- bill-scan function to stay within Vercel Hobby's 12-function limit) shows a preview
-- card with the shop name and amount, then opens the PDF from the private "receipts"
-- bucket (154_receipt_pdf_links.sql) through a short-lived signed URL.
-- Run once in the Supabase SQL editor after 154. Safe to re-run.
--
-- receipt_links holds only what the preview card shows. It is not part of workspace
-- backup/restore on purpose: links expire after 30 days and can be recreated by
-- sharing the bill again, and the PDFs themselves are regenerated from the voucher.

create table if not exists public.receipt_links (
  code text primary key,
  company_id uuid not null references public.acc_companies(id) on delete cascade,
  storage_path text not null unique,
  business_name text not null default '',
  customer_name text not null default '',
  bill_no text not null default '',
  bill_date date,
  amount numeric(14,2) not null default 0,
  balance numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists receipt_links_company_idx on public.receipt_links (company_id);

-- No policies: only the server (service role) reads this table, and the app writes to
-- it only through create_receipt_link() below.
alter table public.receipt_links enable row level security;

create or replace function public.create_receipt_link(
  p_company_id uuid,
  p_storage_path text,
  p_business_name text default '',
  p_customer_name text default '',
  p_bill_no text default '',
  p_bill_date date default null,
  p_amount numeric default 0,
  p_balance numeric default 0,
  p_days integer default 30
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_days integer := least(greatest(coalesce(p_days, 30), 1), 90);
begin
  if p_company_id is null or not public.receipt_folder_allowed(p_company_id::text) then
    raise exception 'Not allowed';
  end if;
  if p_storage_path is null or split_part(p_storage_path, '/', 1) <> p_company_id::text then
    raise exception 'Receipt path must be inside the company folder';
  end if;

  -- Sharing the same bill again keeps its link (and refreshes the details and expiry).
  select code into v_code from public.receipt_links where storage_path = p_storage_path;
  if v_code is null then
    v_code := substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
  end if;

  insert into public.receipt_links (
    code, company_id, storage_path, business_name, customer_name, bill_no, bill_date, amount, balance, expires_at
  ) values (
    v_code, p_company_id, p_storage_path,
    left(coalesce(p_business_name, ''), 120),
    left(coalesce(p_customer_name, ''), 120),
    left(coalesce(p_bill_no, ''), 60),
    p_bill_date,
    coalesce(p_amount, 0),
    greatest(coalesce(p_balance, 0), 0),
    now() + make_interval(days => v_days)
  )
  on conflict (storage_path) do update set
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

revoke all on function public.create_receipt_link(uuid, text, text, text, text, date, numeric, numeric, integer) from public, anon;
grant execute on function public.create_receipt_link(uuid, text, text, text, text, date, numeric, numeric, integer) to authenticated;

notify pgrst, 'reload schema';
