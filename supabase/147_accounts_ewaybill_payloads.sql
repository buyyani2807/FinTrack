-- E-way bill: prepare a Part A payload for a posted sales voucher and let the owner
-- record the e-way bill number (EBN) once they generate it on the government portal.
-- MyFinTracker never calls the e-way bill portal or a GSP here — see gstPrepExport.js
-- EWAYBILL_INTEGRATION_STUB for the "not live" disclaimer this mirrors from e-invoice.

create table if not exists public.acc_ewaybill_payloads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid not null references public.acc_companies(id) on delete cascade,
  voucher_id uuid not null references public.acc_vouchers(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'not_submitted'
    check (status in ('not_submitted', 'queued', 'submitted', 'failed', 'cancelled')),
  provider text,
  ebn text,
  ebn_valid_until timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create unique index if not exists acc_ewaybill_payloads_voucher_uidx
  on public.acc_ewaybill_payloads (voucher_id);

create index if not exists acc_ewaybill_payloads_company_status_idx
  on public.acc_ewaybill_payloads (company_id, status, created_at desc);

alter table public.acc_ewaybill_payloads enable row level security;

drop policy if exists acc_ewaybill_payloads_read on public.acc_ewaybill_payloads;
create policy acc_ewaybill_payloads_read on public.acc_ewaybill_payloads
  for select to authenticated
  using (
    public.can_accounts_read()
    and company_id = nullif(current_setting('request.headers', true)::json->>'x-acc-company-id', '')::uuid
  );

revoke insert, update, delete on public.acc_ewaybill_payloads from authenticated, anon;

-- Queue e-way bill outbound payload (Part A). No government call.
create or replace function public.acc_queue_ewaybill_payload(
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
  if voucher.voucher_type <> 'sales' then raise exception 'Only sales vouchers can prepare an e-way bill payload'; end if;
  if voucher.status <> 'posted' then raise exception 'Only posted sales can prepare an e-way bill payload'; end if;
  if jsonb_typeof(input_payload) <> 'object' then raise exception 'Payload must be a JSON object'; end if;

  insert into public.acc_ewaybill_payloads(
    organization_id, company_id, voucher_id, payload, status, created_by, updated_at
  ) values (
    org_id, active_company_id, input_voucher_id, input_payload, 'not_submitted', auth.uid(), now()
  )
  on conflict (voucher_id) do update set
    payload = excluded.payload,
    status = 'not_submitted',
    ebn = null,
    ebn_valid_until = null,
    error_message = null,
    updated_at = now()
  returning id into payload_id;

  perform public.acc_write_audit(org_id, 'ewaybill', payload_id, 'queue', null,
    jsonb_build_object('voucher_id', input_voucher_id, 'status', 'not_submitted'),
    'E-way bill payload prepared (not submitted)', active_company_id);
  return payload_id;
end;
$$;

grant execute on function public.acc_queue_ewaybill_payload(uuid, jsonb, uuid) to authenticated;

-- Record the EBN after the owner generates it themselves on the government portal.
create or replace function public.acc_record_ewaybill_number(
  input_voucher_id uuid,
  input_ebn text,
  input_valid_until timestamptz default null,
  input_company_id uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  org_id uuid;
  active_company_id uuid;
  clean_ebn text;
  payload_id uuid;
begin
  org_id := public.acc_require_owner();
  active_company_id := public.acc_require_company(input_company_id);
  clean_ebn := regexp_replace(coalesce(input_ebn, ''), '\\s', '', 'g');
  if clean_ebn !~ '^[0-9]{10,15}$' then
    raise exception 'Enter the e-way bill number (EBN) as shown on the portal — digits only';
  end if;

  update public.acc_ewaybill_payloads
    set ebn = clean_ebn,
        ebn_valid_until = input_valid_until,
        status = 'submitted',
        error_message = null,
        updated_at = now()
    where voucher_id = input_voucher_id
      and organization_id = org_id
      and company_id = active_company_id
    returning id into payload_id;

  if payload_id is null then
    raise exception 'Prepare the e-way bill payload for this voucher before recording its number';
  end if;

  perform public.acc_write_audit(org_id, 'ewaybill', payload_id, 'record_ebn', null,
    jsonb_build_object('voucher_id', input_voucher_id, 'ebn', clean_ebn),
    'E-way bill number recorded', active_company_id);
  return payload_id;
end;
$$;

grant execute on function public.acc_record_ewaybill_number(uuid, text, timestamptz, uuid) to authenticated;
