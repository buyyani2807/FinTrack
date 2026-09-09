-- 073 Accounts market-ready: bill-wise settlements, e-invoice payload queue, admin settings.
-- Apply after 072_accounts_qa_hardening.sql.

-- Bill-wise settlement links on receipt / payment / notes
alter table public.acc_vouchers
  add column if not exists settlements jsonb not null default '[]'::jsonb;

comment on column public.acc_vouchers.settlements is
  'Bill-wise links: [{ "invoice_voucher_id": uuid, "amount": number }]. Empty = legacy FIFO allocation in reports.';

-- Outbound e-invoice payloads (queue only — no IRP/GSP calls)
create table if not exists public.acc_einvoice_payloads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid not null references public.acc_companies(id) on delete cascade,
  voucher_id uuid not null references public.acc_vouchers(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'not_submitted'
    check (status in ('not_submitted', 'queued', 'submitted', 'failed', 'cancelled')),
  provider text,
  irn text,
  ack_number text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create unique index if not exists acc_einvoice_payloads_voucher_uidx
  on public.acc_einvoice_payloads (voucher_id);

create index if not exists acc_einvoice_payloads_company_status_idx
  on public.acc_einvoice_payloads (company_id, status, created_at desc);

alter table public.acc_einvoice_payloads enable row level security;

drop policy if exists acc_einvoice_payloads_read on public.acc_einvoice_payloads;
create policy acc_einvoice_payloads_read on public.acc_einvoice_payloads
  for select to authenticated
  using (
    public.can_accounts_read()
    and company_id = nullif(current_setting('request.headers', true)::json->>'x-acc-company-id', '')::uuid
  );

revoke insert, update, delete on public.acc_einvoice_payloads from authenticated, anon;

-- Company settings: owner-admin only (was writer/owner RPC)
create or replace function public.acc_save_settings(
  input_company_name text,
  input_fy_start_month integer,
  input_books_started_on date,
  input_company_id uuid default null
) returns void language plpgsql security definer set search_path = public as $$
declare org_id uuid; company_id uuid;
begin
  org_id := public.acc_require_admin();
  company_id := public.acc_require_company(input_company_id);
  update public.acc_companies
    set name = coalesce(nullif(trim(input_company_name), ''), name),
        fy_start_month = coalesce(input_fy_start_month, fy_start_month),
        books_started_on = coalesce(input_books_started_on, books_started_on),
        updated_at = now()
    where id = company_id and organization_id = org_id;
  if (select is_primary from public.acc_companies where id = company_id) then
    insert into public.acc_settings(organization_id, company_name, fy_start_month, books_started_on, updated_by)
    values (org_id, nullif(trim(input_company_name), ''), coalesce(input_fy_start_month, 4), input_books_started_on, auth.uid())
    on conflict (organization_id) do update set
      company_name = excluded.company_name,
      fy_start_month = excluded.fy_start_month,
      books_started_on = excluded.books_started_on,
      updated_at = now(),
      updated_by = auth.uid();
  end if;
end;
$$;

grant execute on function public.acc_save_settings(text, integer, date, uuid) to authenticated;

-- Queue e-invoice outbound payload (no government call)
create or replace function public.acc_queue_einvoice_payload(
  input_voucher_id uuid,
  input_payload jsonb,
  input_company_id uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  org_id uuid;
  active_company_id uuid;
  voucher public.acc_vouchers%rowtype;
  payload_id uuid;
begin
  org_id := public.acc_require_owner();
  active_company_id := public.acc_require_company(input_company_id);
  select * into voucher from public.acc_vouchers v
  where v.id = input_voucher_id and v.organization_id = org_id and v.company_id = active_company_id;
  if not found then raise exception 'Voucher not found'; end if;
  if voucher.voucher_type <> 'sales' then raise exception 'Only sales vouchers can queue an e-invoice payload'; end if;
  if voucher.status <> 'posted' then raise exception 'Only posted sales can queue an e-invoice payload'; end if;
  if jsonb_typeof(input_payload) <> 'object' then raise exception 'Payload must be a JSON object'; end if;

  insert into public.acc_einvoice_payloads(
    organization_id, company_id, voucher_id, payload, status, created_by, updated_at
  ) values (
    org_id, active_company_id, input_voucher_id, input_payload, 'not_submitted', auth.uid(), now()
  )
  on conflict (voucher_id) do update set
    payload = excluded.payload,
    status = 'not_submitted',
    irn = null,
    ack_number = null,
    error_message = null,
    updated_at = now()
  returning id into payload_id;

  perform public.acc_write_audit(org_id, 'einvoice', payload_id, 'queue', null,
    jsonb_build_object('voucher_id', input_voucher_id, 'status', 'not_submitted'),
    'E-invoice payload queued (not submitted)', active_company_id);
  return payload_id;
end;
$$;

grant execute on function public.acc_queue_einvoice_payload(uuid, jsonb, uuid) to authenticated;

-- Extend post voucher with settlements
drop function if exists public.acc_post_voucher(text, date, text, jsonb, uuid, text, text, uuid, uuid, jsonb, uuid, jsonb);
drop function if exists public.acc_post_voucher(text, date, text, jsonb, uuid, text, text, uuid, uuid, jsonb, uuid, jsonb, jsonb);

create or replace function public.acc_post_voucher(
  input_voucher_type text,
  input_date date,
  input_narration text,
  input_lines jsonb,
  input_party_id uuid default null,
  input_source_module text default null,
  input_source_type text default null,
  input_source_transaction_id uuid default null,
  input_company_id uuid default null,
  input_gst_lines jsonb default null,
  input_client_request_id uuid default null,
  input_item_lines jsonb default null,
  input_settlements jsonb default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  org_id uuid;
  active_company_id uuid;
  voucher_id uuid;
  voucher_no text;
  line jsonb;
  line_no integer := 0;
  total_debit numeric := 0;
  total_credit numeric := 0;
  debit_amt numeric;
  credit_amt numeric;
  today_ist date := (timezone('Asia/Kolkata', now()))::date;
  coa uuid;
  party uuid;
  voucher_row public.acc_vouchers%rowtype;
  settlements jsonb := '[]'::jsonb;
  settlement jsonb;
  settle_total numeric := 0;
  settle_invoice uuid;
  settle_amt numeric;
begin
  org_id := public.acc_require_owner();
  active_company_id := public.acc_require_company(input_company_id);

  if input_client_request_id is not null then
    select v.id into voucher_id
    from public.acc_vouchers v
    where v.company_id = active_company_id
      and v.client_request_id = input_client_request_id
    limit 1;
    if voucher_id is not null then
      return voucher_id;
    end if;
  end if;

  if input_date > today_ist then raise exception 'Voucher date cannot be in the future'; end if;
  perform public.acc_assert_period_open(org_id, input_date, active_company_id);
  if jsonb_typeof(input_lines) <> 'array' or jsonb_array_length(input_lines) < 2 then
    raise exception 'A voucher needs at least two lines';
  end if;
  if input_party_id is not null and not exists (
    select 1 from public.acc_parties p where p.id = input_party_id and p.company_id = active_company_id
  ) then
    raise exception 'Party does not belong to this company';
  end if;

  if jsonb_typeof(input_settlements) = 'array' then
    settlements := '[]'::jsonb;
    for settlement in select * from jsonb_array_elements(input_settlements)
    loop
      settle_invoice := nullif(settlement->>'invoice_voucher_id', '')::uuid;
      settle_amt := round(coalesce((settlement->>'amount')::numeric, 0), 2);
      if settle_invoice is null then raise exception 'Settlement link needs invoice_voucher_id'; end if;
      if settle_amt <= 0 then raise exception 'Settlement amounts must be positive'; end if;
      if not exists (
        select 1 from public.acc_vouchers v
        where v.id = settle_invoice
          and v.company_id = active_company_id
          and v.status in ('posted', 'reversed')
      ) then
        raise exception 'Settlement invoice does not belong to this company';
      end if;
      settle_total := settle_total + settle_amt;
      settlements := settlements || jsonb_build_array(jsonb_build_object(
        'invoice_voucher_id', settle_invoice,
        'amount', settle_amt
      ));
    end loop;
  end if;

  for line in select * from jsonb_array_elements(input_lines)
  loop
    debit_amt := round(coalesce((line->>'debit')::numeric, 0), 2);
    credit_amt := round(coalesce((line->>'credit')::numeric, 0), 2);
    if debit_amt < 0 or credit_amt < 0 then raise exception 'Voucher lines cannot be negative'; end if;
    if debit_amt > 0 and credit_amt > 0 then raise exception 'A voucher line cannot be both debit and credit'; end if;
    if debit_amt = 0 and credit_amt = 0 then raise exception 'Every voucher line needs a debit or a credit'; end if;
    if coalesce(nullif(line->>'coa_id', ''), '') = '' then raise exception 'Every voucher line needs an account'; end if;
    coa := (line->>'coa_id')::uuid;
    if not exists (select 1 from public.acc_coa c where c.id = coa and c.company_id = active_company_id) then
      raise exception 'Account does not belong to this company';
    end if;
    party := nullif(line->>'party_id', '')::uuid;
    if party is not null and not exists (
      select 1 from public.acc_parties p where p.id = party and p.company_id = active_company_id
    ) then
      raise exception 'Party does not belong to this company';
    end if;
    total_debit := total_debit + debit_amt;
    total_credit := total_credit + credit_amt;
  end loop;
  if total_debit <= 0 or total_debit <> total_credit then
    raise exception 'Unbalanced voucher cannot be posted. Debits % · Credits %', total_debit, total_credit;
  end if;
  if jsonb_typeof(settlements) = 'array' and jsonb_array_length(settlements) > 0 and settle_total > total_debit then
    raise exception 'Settlement links (%) exceed voucher amount (%)', settle_total, total_debit;
  end if;

  if jsonb_typeof(input_gst_lines) = 'array' and jsonb_array_length(input_gst_lines) > 0 then
    declare
      gst_cgst numeric := 0;
      gst_sgst numeric := 0;
      gst_igst numeric := 0;
      led_cgst numeric := 0;
      led_sgst numeric := 0;
      led_igst numeric := 0;
    begin
      select
        coalesce(sum(round(coalesce((g->>'cgst_amount')::numeric, 0), 2)), 0),
        coalesce(sum(round(coalesce((g->>'sgst_amount')::numeric, 0), 2)), 0),
        coalesce(sum(round(coalesce((g->>'igst_amount')::numeric, 0), 2)), 0)
      into gst_cgst, gst_sgst, gst_igst
      from jsonb_array_elements(input_gst_lines) g;
      select
        coalesce(sum(case when c.code in ('1140', '2210') then round(coalesce((l->>'debit')::numeric, 0) + coalesce((l->>'credit')::numeric, 0), 2) else 0 end), 0),
        coalesce(sum(case when c.code in ('1141', '2211') then round(coalesce((l->>'debit')::numeric, 0) + coalesce((l->>'credit')::numeric, 0), 2) else 0 end), 0),
        coalesce(sum(case when c.code in ('1142', '2212') then round(coalesce((l->>'debit')::numeric, 0) + coalesce((l->>'credit')::numeric, 0), 2) else 0 end), 0)
      into led_cgst, led_sgst, led_igst
      from jsonb_array_elements(input_lines) l
      join public.acc_coa c on c.id = (l->>'coa_id')::uuid and c.company_id = active_company_id;
      if gst_cgst <> led_cgst or gst_sgst <> led_sgst or gst_igst <> led_igst then
        raise exception 'GST document does not match tax ledgers. CGST % / % · SGST % / % · IGST % / %',
          gst_cgst, led_cgst, gst_sgst, led_sgst, gst_igst, led_igst;
      end if;
    end;
  end if;

  voucher_no := public.acc_next_number(active_company_id, input_voucher_type);
  insert into public.acc_vouchers(
    organization_id, company_id, voucher_type, voucher_number, voucher_date, narration, status, party_id,
    source_module, source_type, source_transaction_id, client_request_id, settlements, created_by, posted_at, posted_by
  ) values (
    org_id, active_company_id, input_voucher_type, voucher_no, input_date, coalesce(input_narration, ''), 'posted', input_party_id,
    input_source_module, input_source_type, input_source_transaction_id, input_client_request_id, settlements, auth.uid(), now(), auth.uid()
  ) returning id into voucher_id;

  for line in select * from jsonb_array_elements(input_lines)
  loop
    line_no := line_no + 1;
    insert into public.acc_voucher_lines(organization_id, company_id, voucher_id, line_no, coa_id, party_id, debit, credit, description)
    values (
      org_id, active_company_id, voucher_id, line_no,
      (line->>'coa_id')::uuid,
      coalesce(nullif(line->>'party_id', '')::uuid, input_party_id),
      round(coalesce((line->>'debit')::numeric, 0), 2),
      round(coalesce((line->>'credit')::numeric, 0), 2),
      coalesce(line->>'description', input_narration)
    );
  end loop;

  if jsonb_typeof(input_gst_lines) = 'array' then
    insert into public.acc_gst_lines(
      organization_id, company_id, voucher_id, line_no, hsn_sac, description, taxable_amount, rate,
      cgst_amount, sgst_amount, igst_amount, supply_type, itc_eligible
    )
    select org_id, active_company_id, voucher_id,
           coalesce((g->>'line_no')::integer, ordinality::integer),
           nullif(trim(g->>'hsn_sac'), ''),
           coalesce(g->>'description', input_narration),
           round(coalesce((g->>'taxable_amount')::numeric, 0), 2),
           round(coalesce((g->>'rate')::numeric, 0), 2),
           round(coalesce((g->>'cgst_amount')::numeric, 0), 2),
           round(coalesce((g->>'sgst_amount')::numeric, 0), 2),
           round(coalesce((g->>'igst_amount')::numeric, 0), 2),
           coalesce(nullif(g->>'supply_type', ''), 'none'),
           coalesce((g->>'itc_eligible')::boolean, true)
    from jsonb_array_elements(input_gst_lines) with ordinality as t(g, ordinality);
  end if;

  if jsonb_typeof(input_item_lines) = 'array' and jsonb_array_length(input_item_lines) > 0 then
    select * into voucher_row from public.acc_vouchers where id = voucher_id;
    perform public.acc_apply_voucher_item_lines(org_id, active_company_id, voucher_row, input_item_lines);
  end if;

  perform public.acc_write_audit(org_id, 'voucher', voucher_id, 'post', null, jsonb_build_object(
    'voucher_number', voucher_no, 'voucher_type', input_voucher_type, 'debit', total_debit, 'credit', total_credit,
    'settlements', settlements
  ), input_narration, active_company_id);
  return voucher_id;
exception
  when unique_violation then
    if input_client_request_id is not null then
      select v.id into voucher_id
      from public.acc_vouchers v
      where v.company_id = active_company_id and v.client_request_id = input_client_request_id
      limit 1;
      if voucher_id is not null then return voucher_id; end if;
    end if;
    raise;
end;
$$;

grant execute on function public.acc_post_voucher(text, date, text, jsonb, uuid, text, text, uuid, uuid, jsonb, uuid, jsonb, jsonb) to authenticated;
