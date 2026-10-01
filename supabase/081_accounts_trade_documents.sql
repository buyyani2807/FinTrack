-- 081 Sales and purchase documents (Phase 2): quotation, sales order, delivery challan, purchase order, goods receipt.
-- Apply after 080_accounts_inventory_valuation_stock_rules.sql.
--   * acc_trade_documents / acc_trade_document_lines: non-posting documents. They never touch ledgers or GST.
--   * Delivery challans move stock out and goods receipts move stock in (reasons 'delivery' / 'goods_receipt').
--     An invoice/bill line linked to a challan/GRN line does not move stock again.
--   * acc_voucher_item_lines.source_document_line_id links invoice lines to quotation/order/challan/GRN lines,
--     which drives pending quantity on orders.
--   * acc_document_settings: invoice template, contact details, logo, UPI, bank, terms, credit control.
--   * acc_parties.credit_limit / credit_days.

create table if not exists public.acc_trade_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid not null references public.acc_companies(id) on delete cascade,
  doc_type text not null check (doc_type in ('quotation', 'sales_order', 'delivery_challan', 'purchase_order', 'goods_receipt')),
  doc_number text not null,
  doc_date date not null,
  valid_until date,
  party_id uuid not null references public.acc_parties(id),
  status text not null default 'open' check (status in ('open', 'accepted', 'declined', 'closed', 'cancelled')),
  reference text,
  notes text,
  terms text,
  source_document_id uuid references public.acc_trade_documents(id),
  stock_posted boolean not null default false,
  taxable_total numeric(18,2) not null default 0,
  tax_total numeric(18,2) not null default 0,
  grand_total numeric(18,2) not null default 0,
  cancel_reason text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, doc_type, doc_number)
);

create index if not exists acc_trade_documents_company_idx
  on public.acc_trade_documents (organization_id, company_id, doc_type, doc_date desc);

create table if not exists public.acc_trade_document_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid not null references public.acc_companies(id) on delete cascade,
  document_id uuid not null references public.acc_trade_documents(id) on delete cascade,
  line_no integer not null,
  item_id uuid references public.acc_items(id),
  item_name text not null,
  item_sku text,
  item_type text not null default 'product' check (item_type in ('product', 'service')),
  unit text not null default 'Nos',
  quantity numeric(18,3) not null check (quantity > 0),
  rate numeric(18,2) not null default 0 check (rate >= 0),
  amount numeric(18,2) not null default 0 check (amount >= 0),
  discount_amount numeric(18,2) not null default 0 check (discount_amount >= 0 and discount_amount <= amount),
  gst_rate numeric(7,3) not null default 0,
  hsn_sac text,
  taxable_amount numeric(18,2) not null default 0,
  cgst_amount numeric(18,2) not null default 0,
  sgst_amount numeric(18,2) not null default 0,
  igst_amount numeric(18,2) not null default 0,
  source_line_id uuid references public.acc_trade_document_lines(id),
  unique (document_id, line_no)
);

create index if not exists acc_trade_document_lines_doc_idx on public.acc_trade_document_lines (document_id);
create index if not exists acc_trade_document_lines_source_idx on public.acc_trade_document_lines (source_line_id) where source_line_id is not null;

alter table public.acc_voucher_item_lines
  add column if not exists source_document_line_id uuid references public.acc_trade_document_lines(id);
create index if not exists acc_voucher_item_lines_source_doc_idx
  on public.acc_voucher_item_lines (source_document_line_id) where source_document_line_id is not null;

alter table public.acc_stock_movements
  add column if not exists document_id uuid references public.acc_trade_documents(id),
  add column if not exists document_line_id uuid references public.acc_trade_document_lines(id);

do $$
declare constraint_name text;
begin
  for constraint_name in
    select c.conname from pg_constraint c
    where c.conrelid = 'public.acc_stock_movements'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%reason%'
  loop
    execute format('alter table public.acc_stock_movements drop constraint %I', constraint_name);
  end loop;
end $$;

alter table public.acc_stock_movements
  add constraint acc_stock_movements_reason_check
  check (reason in ('opening', 'purchase', 'sale', 'sales_return', 'purchase_return', 'adjustment', 'reversal', 'delivery', 'goods_receipt'));

alter table public.acc_parties
  add column if not exists credit_limit numeric(18,2) not null default 0,
  add column if not exists credit_days integer;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'acc_parties_credit_check') then
    alter table public.acc_parties
      add constraint acc_parties_credit_check
      check (credit_limit >= 0 and (credit_days is null or (credit_days >= 0 and credit_days <= 365)));
  end if;
end $$;

create table if not exists public.acc_document_settings (
  company_id uuid primary key references public.acc_companies(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  business_address text,
  business_phone text,
  business_email text,
  logo_data_url text check (logo_data_url is null or length(logo_data_url) <= 400000),
  upi_id text,
  upi_payee_name text,
  bank_name text,
  bank_account_number text,
  bank_ifsc text,
  invoice_template text not null default 'a4' check (invoice_template in ('a4', 'a5', 'thermal')),
  show_upi_qr boolean not null default true,
  invoice_terms text,
  quotation_terms text,
  credit_control text not null default 'warn' check (credit_control in ('off', 'warn', 'block')),
  overdue_block_days integer not null default 0 check (overdue_block_days >= 0 and overdue_block_days <= 365),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

alter table public.acc_trade_documents enable row level security;
alter table public.acc_trade_document_lines enable row level security;
alter table public.acc_document_settings enable row level security;

drop policy if exists acc_trade_documents_select on public.acc_trade_documents;
create policy acc_trade_documents_select on public.acc_trade_documents for select to authenticated
  using (organization_id = public.current_organization_id() and public.can_accounts_read() and company_id = public.acc_request_company_id());

drop policy if exists acc_trade_document_lines_select on public.acc_trade_document_lines;
create policy acc_trade_document_lines_select on public.acc_trade_document_lines for select to authenticated
  using (organization_id = public.current_organization_id() and public.can_accounts_read() and company_id = public.acc_request_company_id());

drop policy if exists acc_document_settings_select on public.acc_document_settings;
create policy acc_document_settings_select on public.acc_document_settings for select to authenticated
  using (organization_id = public.current_organization_id() and public.can_accounts_read() and company_id = public.acc_request_company_id());

revoke all on table public.acc_trade_documents from authenticated;
revoke all on table public.acc_trade_document_lines from authenticated;
revoke all on table public.acc_document_settings from authenticated;
grant select on table public.acc_trade_documents to authenticated;
grant select on table public.acc_trade_document_lines to authenticated;
grant select on table public.acc_document_settings to authenticated;

create or replace function public.acc_next_document_number(input_company_id uuid, input_doc_type text)
returns text language plpgsql security definer set search_path = public as $$
declare
  seq integer;
  prefix text;
  org_id uuid;
begin
  select organization_id into org_id from public.acc_companies where id = input_company_id;
  if org_id is null then raise exception 'Accounts company not found'; end if;
  prefix := case input_doc_type
    when 'quotation' then 'QT'
    when 'sales_order' then 'SO'
    when 'delivery_challan' then 'DC'
    when 'purchase_order' then 'PO'
    when 'goods_receipt' then 'GRN'
    else 'DOC'
  end;
  insert into public.acc_sequences(organization_id, company_id, voucher_type, last_number)
  values (org_id, input_company_id, 'doc_' || input_doc_type, 1)
  on conflict (company_id, voucher_type)
  do update set last_number = public.acc_sequences.last_number + 1
  returning last_number into seq;
  return prefix || '-' || lpad(seq::text, 5, '0');
end;
$$;

-- Lines that already feed a later document or a posted invoice/bill.
create or replace function public.acc_trade_document_has_followups(input_document_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.acc_trade_document_lines child
    join public.acc_trade_documents child_doc on child_doc.id = child.document_id and child_doc.status <> 'cancelled'
    join public.acc_trade_document_lines parent on parent.id = child.source_line_id
    where parent.document_id = input_document_id
  ) or exists (
    select 1 from public.acc_voucher_item_lines vil
    join public.acc_vouchers v on v.id = vil.voucher_id and v.status = 'posted'
    join public.acc_trade_document_lines parent on parent.id = vil.source_document_line_id
    where parent.document_id = input_document_id
  );
$$;

create or replace function public.acc_save_trade_document(
  input_id uuid,
  input_doc_type text,
  input_doc_date date,
  input_party_id uuid,
  input_lines jsonb,
  input_valid_until date default null,
  input_reference text default null,
  input_notes text default null,
  input_terms text default null,
  input_source_document_id uuid default null,
  input_company_id uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  org_id uuid;
  active_company_id uuid;
  existing public.acc_trade_documents%rowtype;
  source_doc public.acc_trade_documents%rowtype;
  party public.acc_parties%rowtype;
  doc_id uuid;
  doc_no text;
  line jsonb;
  idx integer := 0;
  item public.acc_items%rowtype;
  qty numeric(18,3);
  rate numeric(18,2);
  amount numeric(18,2);
  discount numeric(18,2);
  taxable numeric(18,2);
  cgst numeric(18,2);
  sgst numeric(18,2);
  igst numeric(18,2);
  source_line uuid;
  line_id uuid;
  v_item_type text;
  v_item_name text;
  stock_sign integer := 0;
  is_sales boolean;
  sum_taxable numeric(18,2) := 0;
  sum_tax numeric(18,2) := 0;
begin
  org_id := public.acc_require_owner();
  active_company_id := public.acc_require_company(input_company_id);
  if input_doc_type not in ('quotation', 'sales_order', 'delivery_challan', 'purchase_order', 'goods_receipt') then
    raise exception 'Unknown document type %', input_doc_type;
  end if;
  if input_doc_date is null then raise exception 'Document date is required'; end if;
  if input_valid_until is not null and input_valid_until < input_doc_date then
    raise exception 'Valid-until / expected date cannot be before the document date';
  end if;
  if jsonb_typeof(input_lines) <> 'array' or jsonb_array_length(input_lines) = 0 then
    raise exception 'Add at least one item line';
  end if;

  is_sales := input_doc_type in ('quotation', 'sales_order', 'delivery_challan');
  stock_sign := case input_doc_type when 'delivery_challan' then -1 when 'goods_receipt' then 1 else 0 end;

  select * into party from public.acc_parties
  where id = input_party_id and organization_id = org_id and company_id = active_company_id;
  if party.id is null then raise exception 'Choose a party from this company'; end if;
  if is_sales and party.party_type <> 'customer' then raise exception 'Sales documents need a customer'; end if;
  if not is_sales and party.party_type <> 'supplier' then raise exception 'Purchase documents need a supplier'; end if;

  if input_source_document_id is not null then
    select * into source_doc from public.acc_trade_documents
    where id = input_source_document_id and organization_id = org_id and company_id = active_company_id;
    if source_doc.id is null then raise exception 'Source document not found'; end if;
    if source_doc.status in ('cancelled', 'declined') then raise exception 'Source document is %', source_doc.status; end if;
    if not (
      (input_doc_type = 'sales_order' and source_doc.doc_type = 'quotation')
      or (input_doc_type = 'delivery_challan' and source_doc.doc_type in ('quotation', 'sales_order'))
      or (input_doc_type = 'goods_receipt' and source_doc.doc_type = 'purchase_order')
    ) then
      raise exception 'A % cannot be created from a %', replace(input_doc_type, '_', ' '), replace(source_doc.doc_type, '_', ' ');
    end if;
  end if;

  if input_id is not null then
    select * into existing from public.acc_trade_documents
    where id = input_id and organization_id = org_id and company_id = active_company_id;
    if existing.id is null then raise exception 'Document not found'; end if;
    if existing.doc_type <> input_doc_type then raise exception 'Document type cannot change'; end if;
    if existing.status not in ('open', 'accepted') then raise exception 'Only open documents can be edited'; end if;
    if existing.stock_posted then raise exception 'Challans and goods receipts move stock. Cancel and create a new one instead of editing'; end if;
    if public.acc_trade_document_has_followups(existing.id) then
      raise exception 'This document already has orders, challans or invoices made from it and cannot be edited';
    end if;
    delete from public.acc_trade_document_lines where document_id = existing.id;
    doc_id := existing.id;
    doc_no := existing.doc_number;
    update public.acc_trade_documents set
      doc_date = input_doc_date,
      valid_until = input_valid_until,
      party_id = party.id,
      reference = nullif(trim(coalesce(input_reference, '')), ''),
      notes = nullif(trim(coalesce(input_notes, '')), ''),
      terms = nullif(trim(coalesce(input_terms, '')), ''),
      source_document_id = input_source_document_id,
      updated_at = now()
    where id = doc_id;
  else
    perform pg_advisory_xact_lock(hashtext(active_company_id::text || ':doc:' || input_doc_type));
    doc_no := public.acc_next_document_number(active_company_id, input_doc_type);
    insert into public.acc_trade_documents (
      organization_id, company_id, doc_type, doc_number, doc_date, valid_until, party_id, status,
      reference, notes, terms, source_document_id, stock_posted, created_by
    ) values (
      org_id, active_company_id, input_doc_type, doc_no, input_doc_date, input_valid_until, party.id, 'open',
      nullif(trim(coalesce(input_reference, '')), ''), nullif(trim(coalesce(input_notes, '')), ''),
      nullif(trim(coalesce(input_terms, '')), ''), input_source_document_id, stock_sign <> 0, auth.uid()
    ) returning id into doc_id;
  end if;

  for line in select value from jsonb_array_elements(input_lines)
  loop
    idx := idx + 1;
    qty := coalesce((line->>'quantity')::numeric, 0);
    rate := coalesce((line->>'rate')::numeric, 0);
    amount := round(qty * rate, 2);
    discount := round(coalesce((line->>'discount_amount')::numeric, 0), 2);
    if qty <= 0 then raise exception 'Quantity must be greater than zero on line %', idx; end if;
    if rate < 0 then raise exception 'Rate cannot be negative on line %', idx; end if;
    if discount < 0 or discount > amount then raise exception 'Discount must be between zero and the line amount on line %', idx; end if;
    taxable := round(coalesce((line->>'taxable_amount')::numeric, amount - discount), 2);
    cgst := round(coalesce((line->>'cgst_amount')::numeric, 0), 2);
    sgst := round(coalesce((line->>'sgst_amount')::numeric, 0), 2);
    igst := round(coalesce((line->>'igst_amount')::numeric, 0), 2);
    if taxable < 0 or cgst < 0 or sgst < 0 or igst < 0 then raise exception 'Tax amounts cannot be negative on line %', idx; end if;

    item := null;
    if nullif(line->>'item_id', '') is not null then
      select * into item from public.acc_items
      where id = (line->>'item_id')::uuid and organization_id = org_id and company_id = active_company_id;
      if item.id is null then raise exception 'Item not found on line %', idx; end if;
      if item.is_active is false then raise exception 'Inactive item cannot be used on line %', idx; end if;
    end if;
    v_item_name := coalesce(nullif(trim(coalesce(item.name, '')), ''), nullif(trim(coalesce(line->>'item_name', '')), ''));
    if v_item_name is null then raise exception 'Item name is required on line %', idx; end if;
    v_item_type := coalesce(nullif(item.item_type, ''), nullif(line->>'item_type', ''), 'product');
    if stock_sign <> 0 and v_item_type = 'product' and item.id is null then
      raise exception 'Choose a saved item on line % so stock can move', idx;
    end if;

    source_line := nullif(line->>'source_line_id', '')::uuid;
    if source_line is not null and not exists (
      select 1 from public.acc_trade_document_lines l
      where l.id = source_line and l.document_id = input_source_document_id
    ) then
      raise exception 'Line % does not belong to the source document', idx;
    end if;

    insert into public.acc_trade_document_lines (
      organization_id, company_id, document_id, line_no, item_id, item_name, item_sku, item_type, unit,
      quantity, rate, amount, discount_amount, gst_rate, hsn_sac, taxable_amount, cgst_amount, sgst_amount, igst_amount, source_line_id
    ) values (
      org_id, active_company_id, doc_id, idx, item.id, v_item_name,
      coalesce(nullif(trim(coalesce(item.sku, '')), ''), nullif(trim(coalesce(line->>'item_sku', '')), '')),
      v_item_type,
      coalesce(nullif(trim(coalesce(line->>'unit', '')), ''), item.unit, 'Nos'),
      qty, rate, amount, discount,
      coalesce((line->>'gst_rate')::numeric, item.gst_rate, 0),
      coalesce(nullif(trim(coalesce(line->>'hsn_sac', '')), ''), item.hsn_sac),
      taxable, cgst, sgst, igst, source_line
    ) returning id into line_id;

    sum_taxable := sum_taxable + taxable;
    sum_tax := sum_tax + cgst + sgst + igst;

    if stock_sign <> 0 and v_item_type = 'product' then
      perform public.acc_assert_stock_available_on(org_id, active_company_id, item.id, stock_sign * qty, input_doc_date);
      insert into public.acc_stock_movements (
        organization_id, company_id, item_id, movement_date, quantity_delta, reason, note,
        voucher_number, document_id, document_line_id, created_by
      ) values (
        org_id, active_company_id, item.id, input_doc_date, stock_sign * qty,
        case when stock_sign < 0 then 'delivery' else 'goods_receipt' end,
        null, doc_no, doc_id, line_id, auth.uid()
      );
    end if;
  end loop;

  update public.acc_trade_documents
  set taxable_total = sum_taxable, tax_total = sum_tax, grand_total = sum_taxable + sum_tax
  where id = doc_id;

  perform public.acc_write_audit(
    org_id, 'trade_document', doc_id, case when input_id is null then 'create' else 'update' end,
    null, jsonb_build_object('doc_type', input_doc_type, 'doc_number', doc_no, 'total', sum_taxable + sum_tax, 'lines', idx),
    null, active_company_id
  );
  return doc_id;
end;
$$;

create or replace function public.acc_set_trade_document_status(
  input_id uuid,
  input_status text,
  input_reason text default null,
  input_company_id uuid default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  org_id uuid;
  active_company_id uuid;
  doc public.acc_trade_documents%rowtype;
  mov public.acc_stock_movements%rowtype;
begin
  org_id := public.acc_require_owner();
  active_company_id := public.acc_require_company(input_company_id);
  if input_status not in ('open', 'accepted', 'declined', 'closed', 'cancelled') then
    raise exception 'Unknown status %', input_status;
  end if;
  select * into doc from public.acc_trade_documents
  where id = input_id and organization_id = org_id and company_id = active_company_id;
  if doc.id is null then raise exception 'Document not found'; end if;
  if doc.status = 'cancelled' then raise exception 'Cancelled documents cannot change status'; end if;
  if input_status in ('accepted', 'declined') and doc.doc_type <> 'quotation' then
    raise exception 'Only quotations can be accepted or declined';
  end if;
  if input_status = 'cancelled' then
    if nullif(trim(coalesce(input_reason, '')), '') is null then raise exception 'A cancel reason is required'; end if;
    if public.acc_trade_document_has_followups(doc.id) then
      raise exception 'Cancel the orders, challans or invoices made from this document first';
    end if;
    if doc.stock_posted then
      for mov in
        select * from public.acc_stock_movements
        where organization_id = org_id and company_id = active_company_id
          and document_id = doc.id and reason in ('delivery', 'goods_receipt')
      loop
        perform public.acc_assert_stock_available_on(org_id, active_company_id, mov.item_id, -mov.quantity_delta, mov.movement_date);
        insert into public.acc_stock_movements (
          organization_id, company_id, item_id, movement_date, quantity_delta, reason, note,
          voucher_number, document_id, document_line_id, created_by
        ) values (
          org_id, active_company_id, mov.item_id, mov.movement_date, -mov.quantity_delta, 'reversal',
          'Cancelled ' || replace(doc.doc_type, '_', ' '), doc.doc_number, doc.id, mov.document_line_id, auth.uid()
        );
      end loop;
    end if;
  end if;

  update public.acc_trade_documents
  set status = input_status,
      cancel_reason = case when input_status = 'cancelled' then trim(input_reason) else cancel_reason end,
      updated_at = now()
  where id = doc.id;

  perform public.acc_write_audit(
    org_id, 'trade_document', doc.id, 'status',
    jsonb_build_object('status', doc.status), jsonb_build_object('status', input_status),
    nullif(trim(coalesce(input_reason, '')), ''), active_company_id
  );
end;
$$;

create or replace function public.acc_save_document_settings(
  input_settings jsonb,
  input_company_id uuid default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  org_id uuid;
  active_company_id uuid;
  s jsonb := coalesce(input_settings, '{}'::jsonb);
begin
  org_id := public.acc_require_admin();
  active_company_id := public.acc_require_company(input_company_id);
  insert into public.acc_document_settings (
    company_id, organization_id, business_address, business_phone, business_email, logo_data_url,
    upi_id, upi_payee_name, bank_name, bank_account_number, bank_ifsc, invoice_template, show_upi_qr,
    invoice_terms, quotation_terms, credit_control, overdue_block_days, updated_at, updated_by
  ) values (
    active_company_id, org_id,
    nullif(trim(coalesce(s->>'business_address', '')), ''),
    nullif(trim(coalesce(s->>'business_phone', '')), ''),
    nullif(trim(coalesce(s->>'business_email', '')), ''),
    nullif(s->>'logo_data_url', ''),
    nullif(trim(coalesce(s->>'upi_id', '')), ''),
    nullif(trim(coalesce(s->>'upi_payee_name', '')), ''),
    nullif(trim(coalesce(s->>'bank_name', '')), ''),
    nullif(trim(coalesce(s->>'bank_account_number', '')), ''),
    upper(nullif(trim(coalesce(s->>'bank_ifsc', '')), '')),
    coalesce(nullif(s->>'invoice_template', ''), 'a4'),
    coalesce((s->>'show_upi_qr')::boolean, true),
    nullif(trim(coalesce(s->>'invoice_terms', '')), ''),
    nullif(trim(coalesce(s->>'quotation_terms', '')), ''),
    coalesce(nullif(s->>'credit_control', ''), 'warn'),
    coalesce((s->>'overdue_block_days')::integer, 0),
    now(), auth.uid()
  )
  on conflict (company_id) do update set
    business_address = excluded.business_address,
    business_phone = excluded.business_phone,
    business_email = excluded.business_email,
    logo_data_url = excluded.logo_data_url,
    upi_id = excluded.upi_id,
    upi_payee_name = excluded.upi_payee_name,
    bank_name = excluded.bank_name,
    bank_account_number = excluded.bank_account_number,
    bank_ifsc = excluded.bank_ifsc,
    invoice_template = excluded.invoice_template,
    show_upi_qr = excluded.show_upi_qr,
    invoice_terms = excluded.invoice_terms,
    quotation_terms = excluded.quotation_terms,
    credit_control = excluded.credit_control,
    overdue_block_days = excluded.overdue_block_days,
    updated_at = excluded.updated_at,
    updated_by = excluded.updated_by;

  perform public.acc_write_audit(
    org_id, 'document_settings', active_company_id, 'update', null,
    (s - 'logo_data_url') || jsonb_build_object('logo', coalesce(s->>'logo_data_url', '') <> ''),
    null, active_company_id
  );
end;
$$;

create or replace function public.acc_set_party_credit(
  input_party_id uuid,
  input_credit_limit numeric,
  input_credit_days integer,
  input_company_id uuid default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  org_id uuid;
  active_company_id uuid;
  party public.acc_parties%rowtype;
begin
  org_id := public.acc_require_owner();
  active_company_id := public.acc_require_company(input_company_id);
  if coalesce(input_credit_limit, 0) < 0 then raise exception 'Credit limit cannot be negative'; end if;
  if input_credit_days is not null and (input_credit_days < 0 or input_credit_days > 365) then
    raise exception 'Credit days must be between 0 and 365';
  end if;
  select * into party from public.acc_parties
  where id = input_party_id and organization_id = org_id and company_id = active_company_id;
  if party.id is null then raise exception 'Party not found'; end if;
  if party.credit_limit = round(coalesce(input_credit_limit, 0), 2) and party.credit_days is not distinct from input_credit_days then
    return;
  end if;
  update public.acc_parties
  set credit_limit = round(coalesce(input_credit_limit, 0), 2), credit_days = input_credit_days, updated_at = now()
  where id = party.id;
  perform public.acc_write_audit(
    org_id, 'party', party.id, 'update',
    jsonb_build_object('credit_limit', party.credit_limit, 'credit_days', party.credit_days),
    jsonb_build_object('credit_limit', round(coalesce(input_credit_limit, 0), 2), 'credit_days', input_credit_days),
    null, active_company_id
  );
end;
$$;

-- Same as 080, plus source_document_line_id; a line made from a live challan / GRN does not move stock again.
create or replace function public.acc_apply_voucher_item_lines(
  input_org_id uuid,
  input_company_id uuid,
  input_voucher public.acc_vouchers,
  input_lines jsonb
) returns void language plpgsql security definer set search_path = public as $$
declare
  line jsonb;
  idx integer := 0;
  item public.acc_items%rowtype;
  qty numeric(18,3);
  rate numeric(18,2);
  amount numeric(18,2);
  discount numeric(18,2);
  line_id uuid;
  delta numeric(18,3);
  reason_text text;
  stock_sign integer;
  v_item_type text;
  v_item_name text;
  v_item_sku text;
  v_unit text;
  source_line uuid;
  source_doc_type text;
  source_doc_status text;
  source_item uuid;
  source_pending numeric(18,3);
  skip_stock boolean;
begin
  if jsonb_typeof(input_lines) <> 'array' or jsonb_array_length(input_lines) = 0 then
    raise exception 'At least one item line is required';
  end if;
  if input_voucher.voucher_type not in ('sales', 'purchase', 'credit_note', 'debit_note') then
    raise exception 'Item lines are only supported on sales, purchase, credit note and debit note vouchers';
  end if;
  if exists (
    select 1 from public.acc_voucher_item_lines
    where voucher_id = input_voucher.id and organization_id = input_org_id and company_id = input_company_id
  ) then
    raise exception 'Item lines already exist for this voucher';
  end if;

  reason_text := case input_voucher.voucher_type
    when 'sales' then 'sale'
    when 'purchase' then 'purchase'
    when 'credit_note' then 'sales_return'
    else 'purchase_return'
  end;
  stock_sign := case when input_voucher.voucher_type in ('purchase', 'credit_note') then 1 else -1 end;

  for line in select value from jsonb_array_elements(input_lines)
  loop
    idx := idx + 1;
    qty := coalesce((line->>'quantity')::numeric, 0);
    rate := coalesce((line->>'rate')::numeric, 0);
    amount := coalesce((line->>'amount')::numeric, round(qty * rate, 2));
    discount := coalesce((line->>'discount_amount')::numeric, 0);
    if qty <= 0 then raise exception 'Item quantity must be greater than zero'; end if;
    if rate < 0 or amount < 0 then raise exception 'Item rate/amount cannot be negative'; end if;
    if discount < 0 then raise exception 'Discount cannot be negative on line %', idx; end if;
    if discount > amount then raise exception 'Discount cannot exceed the line amount on line %', idx; end if;

    item := null;
    if nullif(line->>'item_id', '') is not null then
      select * into item from public.acc_items
      where id = (line->>'item_id')::uuid
        and organization_id = input_org_id and company_id = input_company_id;
      if item.id is null then raise exception 'Item not found on line %', idx; end if;
      if item.is_active is false then raise exception 'Inactive item cannot be used on new vouchers'; end if;
    end if;

    v_item_name := coalesce(nullif(trim(coalesce(item.name, '')), ''), nullif(trim(coalesce(line->>'item_name', '')), ''));
    if v_item_name is null then
      raise exception 'Item name is required on line %', idx;
    end if;
    v_item_sku := coalesce(nullif(trim(coalesce(item.sku, '')), ''), nullif(trim(coalesce(line->>'item_sku', '')), ''));
    v_item_type := coalesce(
      nullif(trim(coalesce(item.item_type, '')), ''),
      nullif(trim(coalesce(line->>'item_type', '')), ''),
      'product'
    );
    v_unit := coalesce(
      nullif(trim(coalesce(line->>'unit', '')), ''),
      nullif(trim(coalesce(item.unit, '')), ''),
      'Nos'
    );

    source_line := nullif(line->>'source_document_line_id', '')::uuid;
    source_doc_type := null;
    source_doc_status := null;
    source_item := null;
    if source_line is not null then
      select d.doc_type, d.status, l.item_id into source_doc_type, source_doc_status, source_item
      from public.acc_trade_document_lines l
      join public.acc_trade_documents d on d.id = l.document_id
      where l.id = source_line and l.organization_id = input_org_id and l.company_id = input_company_id;
      if source_doc_type is null then raise exception 'Source document line not found on line %', idx; end if;
      if source_doc_status = 'cancelled' then raise exception 'Source document on line % is cancelled', idx; end if;
      if not (
        (input_voucher.voucher_type = 'sales' and source_doc_type in ('quotation', 'sales_order', 'delivery_challan'))
        or (input_voucher.voucher_type = 'purchase' and source_doc_type in ('purchase_order', 'goods_receipt'))
      ) then
        raise exception 'Line % cannot be billed from a %', idx, replace(source_doc_type, '_', ' ');
      end if;
    end if;
    skip_stock := source_line is not null
      and source_item is not distinct from item.id
      and (
        (input_voucher.voucher_type = 'sales' and source_doc_type = 'delivery_challan')
        or (input_voucher.voucher_type = 'purchase' and source_doc_type = 'goods_receipt')
      );
    if skip_stock then
      select l.quantity - coalesce((
        select sum(vil.quantity) from public.acc_voucher_item_lines vil
        join public.acc_vouchers v on v.id = vil.voucher_id and v.status = 'posted'
        where vil.source_document_line_id = l.id
      ), 0) into source_pending
      from public.acc_trade_document_lines l where l.id = source_line;
      if round(qty - source_pending, 3) > 0 then
        raise exception 'Line % bills % but only % is left to bill on that %', idx, qty, source_pending, replace(source_doc_type, '_', ' ');
      end if;
    end if;

    insert into public.acc_voucher_item_lines (
      organization_id, company_id, voucher_id, line_no, item_id, item_name, item_sku, item_type, unit,
      quantity, rate, amount, discount_amount, gst_rate, hsn_sac, taxable_amount, cgst_amount, sgst_amount, igst_amount,
      source_document_line_id
    ) values (
      input_org_id, input_company_id, input_voucher.id, idx,
      item.id,
      v_item_name,
      v_item_sku,
      v_item_type,
      v_unit,
      qty, rate, amount, discount,
      coalesce((line->>'gst_rate')::numeric, item.gst_rate, 0),
      coalesce(nullif(trim(coalesce(line->>'hsn_sac', '')), ''), item.hsn_sac),
      coalesce((line->>'taxable_amount')::numeric, amount - discount),
      coalesce((line->>'cgst_amount')::numeric, 0),
      coalesce((line->>'sgst_amount')::numeric, 0),
      coalesce((line->>'igst_amount')::numeric, 0),
      source_line
    ) returning id into line_id;

    if v_item_type = 'product' and item.id is not null and not skip_stock then
      delta := stock_sign * qty;
      perform public.acc_assert_stock_available_on(input_org_id, input_company_id, item.id, delta, input_voucher.voucher_date);
      insert into public.acc_stock_movements (
        organization_id, company_id, item_id, movement_date, quantity_delta, reason, note,
        voucher_id, voucher_item_line_id, voucher_number, created_by
      ) values (
        input_org_id, input_company_id, item.id, input_voucher.voucher_date, delta, reason_text, null,
        input_voucher.id, line_id, input_voucher.voucher_number, auth.uid()
      );
    end if;
  end loop;
end;
$$;

revoke all on function public.acc_next_document_number(uuid, text) from public, anon, authenticated;
revoke all on function public.acc_trade_document_has_followups(uuid) from public, anon, authenticated;
grant execute on function public.acc_save_trade_document(uuid, text, date, uuid, jsonb, date, text, text, text, uuid, uuid) to authenticated;
grant execute on function public.acc_set_trade_document_status(uuid, text, text, uuid) to authenticated;
grant execute on function public.acc_save_document_settings(jsonb, uuid) to authenticated;
grant execute on function public.acc_set_party_credit(uuid, numeric, integer, uuid) to authenticated;

notify pgrst, 'reload schema';
