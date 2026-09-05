-- Fix remaining PL/pgSQL company_id variable/column shadowing in Accounts RPCs.
-- Live scan after 064 still found company_id = company_id in these functions.
-- acc_assert_period_open is on every post path — that alone blocked Sale save.
-- Apply after 064_accounts_gst_save_fix.sql.
--
-- Verify (expect zero rows):
--   select p.oid::regprocedure::text as still_buggy
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and p.proname like 'acc_%'
--     and position('company_id = company_id' in pg_get_functiondef(p.oid)) > 0;

-- ---------------------------------------------------------------------------
-- Period lock check (called by acc_post_voucher / cancel / due)
-- ---------------------------------------------------------------------------
create or replace function public.acc_assert_period_open(input_org_id uuid, input_date date, input_company_id uuid default null)
returns void language plpgsql stable security definer set search_path = public as $$
declare active_company_id uuid;
begin
  active_company_id := coalesce(input_company_id, public.acc_request_company_id());
  if exists (
    select 1 from public.acc_period_locks l
    where l.organization_id = input_org_id
      and l.company_id = active_company_id
      and l.is_locked
      and input_date between l.period_from and l.period_to
  ) then
    raise exception 'This accounting period is locked';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- COA
-- ---------------------------------------------------------------------------
create or replace function public.acc_update_coa(
  input_id uuid,
  input_code text,
  input_name text,
  input_opening numeric default 0,
  input_opening_side text default 'debit',
  input_is_active boolean default true,
  input_company_id uuid default null
) returns void language plpgsql security definer set search_path = public as $$
declare org_id uuid; active_company_id uuid; account public.acc_coa; opening_amt numeric; opening_side text;
begin
  org_id := public.acc_require_owner();
  active_company_id := public.acc_require_company(input_company_id);
  select * into account
    from public.acc_coa c
    where c.id = input_id and c.organization_id = org_id and c.company_id = active_company_id;
  if account.id is null then raise exception 'Account not found'; end if;
  if trim(coalesce(input_code, '')) = '' or trim(coalesce(input_name, '')) = '' then
    raise exception 'Account code and name are required';
  end if;
  if account.is_system and trim(input_code) <> account.code then
    raise exception 'System account codes cannot be changed';
  end if;
  opening_amt := round(coalesce(input_opening, 0), 2);
  if opening_amt < 0 then raise exception 'Opening balance cannot be negative'; end if;
  opening_side := case when input_opening_side in ('debit', 'credit') then input_opening_side else account.opening_side end;
  update public.acc_coa
    set code = trim(input_code),
        name = trim(input_name),
        opening_balance = opening_amt,
        opening_side = opening_side,
        is_active = coalesce(input_is_active, true)
    where id = account.id;
  perform public.acc_write_audit(org_id, 'coa', account.id, 'update',
    jsonb_build_object('code', account.code, 'name', account.name),
    jsonb_build_object('code', trim(input_code), 'name', trim(input_name)),
    null, active_company_id);
end;
$$;

create or replace function public.acc_delete_coa(input_id uuid, input_company_id uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare org_id uuid; active_company_id uuid; account public.acc_coa;
begin
  org_id := public.acc_require_owner();
  active_company_id := public.acc_require_company(input_company_id);
  select * into account
    from public.acc_coa c
    where c.id = input_id and c.organization_id = org_id and c.company_id = active_company_id;
  if account.id is null then raise exception 'Account not found'; end if;
  if account.is_system then raise exception 'System accounts cannot be deleted'; end if;
  if exists (
    select 1 from public.acc_voucher_lines vl
    where vl.company_id = active_company_id and vl.coa_id = account.id
  ) then
    raise exception 'Cannot delete an account that has transactions';
  end if;
  if exists (
    select 1 from public.acc_bank_statements bs
    where bs.company_id = active_company_id and bs.coa_id = account.id
  ) then
    raise exception 'Cannot delete an account that has bank statements';
  end if;
  delete from public.acc_coa where id = account.id;
  perform public.acc_write_audit(org_id, 'coa', account.id, 'delete',
    jsonb_build_object('code', account.code, 'name', account.name), null, 'Ledger deleted', active_company_id);
end;
$$;

create or replace function public.acc_set_coa_parent(input_id uuid, input_parent_id uuid, input_company_id uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare org_id uuid; active_company_id uuid; account public.acc_coa; parent public.acc_coa;
begin
  org_id := public.acc_require_owner();
  active_company_id := public.acc_require_company(input_company_id);
  select * into account
    from public.acc_coa c
    where c.id = input_id and c.organization_id = org_id and c.company_id = active_company_id;
  if account.id is null then raise exception 'Account not found'; end if;
  if input_parent_id is null then
    update public.acc_coa set parent_id = null where id = account.id;
    return;
  end if;
  if input_parent_id = account.id then raise exception 'An account cannot be its own parent'; end if;
  select * into parent
    from public.acc_coa c
    where c.id = input_parent_id and c.organization_id = org_id and c.company_id = active_company_id;
  if parent.id is null then raise exception 'Parent account not found'; end if;
  if parent.group_type <> account.group_type then raise exception 'Parent must be in the same group'; end if;
  if parent.parent_id = account.id then raise exception 'Circular parent is not allowed'; end if;
  update public.acc_coa set parent_id = parent.id where id = account.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Parties
-- ---------------------------------------------------------------------------
create or replace function public.acc_delete_party(input_id uuid, input_company_id uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare org_id uuid; active_company_id uuid; existing public.acc_parties%rowtype;
begin
  org_id := public.acc_require_owner();
  active_company_id := public.acc_require_company(input_company_id);
  select * into existing
    from public.acc_parties p
    where p.id = input_id and p.organization_id = org_id and p.company_id = active_company_id;
  if not found then raise exception 'Party not found'; end if;
  if public.acc_party_is_used(org_id, input_id) then
    raise exception 'This party cannot be deleted because accounting transactions already exist for this party.';
  end if;
  delete from public.acc_parties p where p.id = input_id and p.company_id = active_company_id;
  perform public.acc_write_audit(org_id, 'party', input_id, 'delete',
    jsonb_build_object('name', existing.name, 'party_type', existing.party_type), null, null, active_company_id);
end;
$$;

create or replace function public.acc_set_party_active(input_id uuid, input_active boolean, input_company_id uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare org_id uuid; active_company_id uuid; existing public.acc_parties%rowtype;
begin
  org_id := public.acc_require_owner();
  active_company_id := public.acc_require_company(input_company_id);
  select * into existing
    from public.acc_parties p
    where p.id = input_id and p.organization_id = org_id and p.company_id = active_company_id;
  if not found then raise exception 'Party not found'; end if;
  update public.acc_parties p
    set is_active = coalesce(input_active, true), updated_at = now()
    where p.id = input_id and p.company_id = active_company_id;
  perform public.acc_write_audit(org_id, 'party', input_id,
    case when coalesce(input_active, true) then 'activate' else 'deactivate' end,
    jsonb_build_object('is_active', existing.is_active),
    jsonb_build_object('is_active', coalesce(input_active, true)),
    null, active_company_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Vouchers
-- ---------------------------------------------------------------------------
create or replace function public.acc_cancel_voucher(input_voucher_id uuid, input_reason text, input_company_id uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare org_id uuid; active_company_id uuid; voucher public.acc_vouchers;
begin
  org_id := public.acc_require_owner();
  active_company_id := public.acc_require_company(input_company_id);
  select * into voucher
    from public.acc_vouchers v
    where v.id = input_voucher_id and v.organization_id = org_id and v.company_id = active_company_id;
  if voucher.id is null then raise exception 'Voucher not found'; end if;
  if voucher.status = 'cancelled' then raise exception 'Voucher is already cancelled'; end if;
  if voucher.status = 'reversed' then raise exception 'Reversed vouchers cannot be cancelled. Cancel the reversal instead.'; end if;
  if voucher.status <> 'posted' then raise exception 'Only posted vouchers can be cancelled'; end if;
  perform public.acc_assert_period_open(org_id, voucher.voucher_date, active_company_id);
  update public.acc_vouchers
    set status = 'cancelled', cancel_reason = coalesce(nullif(trim(input_reason), ''), 'Cancelled'),
        cancelled_at = now(), cancelled_by = auth.uid()
    where id = voucher.id;
  perform public.acc_write_audit(org_id, 'voucher', voucher.id, 'cancel',
    jsonb_build_object('status', voucher.status, 'voucher_number', voucher.voucher_number),
    jsonb_build_object('status', 'cancelled'), input_reason, active_company_id);
end;
$$;

create or replace function public.acc_reverse_voucher(input_voucher_id uuid, input_date date, input_reason text, input_company_id uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  org_id uuid;
  active_company_id uuid;
  voucher public.acc_vouchers;
  lines jsonb;
  gst jsonb;
  new_id uuid;
begin
  org_id := public.acc_require_owner();
  active_company_id := public.acc_require_company(input_company_id);
  select * into voucher from public.acc_vouchers v
    where v.id = input_voucher_id and v.organization_id = org_id and v.company_id = active_company_id;
  if voucher.id is null then raise exception 'Voucher not found'; end if;
  if voucher.status <> 'posted' then raise exception 'Only posted vouchers can be reversed'; end if;
  if voucher.reversed_voucher_id is not null then raise exception 'Voucher is already reversed'; end if;
  select jsonb_agg(jsonb_build_object(
    'coa_id', coa_id, 'party_id', party_id, 'debit', credit, 'credit', debit, 'description', coalesce(input_reason, 'Reversal')
  ) order by line_no) into lines
  from public.acc_voucher_lines where voucher_id = voucher.id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'line_no', line_no,
    'hsn_sac', hsn_sac,
    'description', description,
    'taxable_amount', taxable_amount,
    'rate', rate,
    'cgst_amount', cgst_amount,
    'sgst_amount', sgst_amount,
    'igst_amount', igst_amount,
    'supply_type', supply_type,
    'itc_eligible', itc_eligible
  ) order by line_no), '[]'::jsonb)
  into gst
  from public.acc_gst_lines
  where voucher_id = voucher.id;
  new_id := public.acc_post_voucher(
    voucher.voucher_type, coalesce(input_date, current_date),
    coalesce(nullif(trim(input_reason), ''), 'Reversal of ' || voucher.voucher_number),
    lines, voucher.party_id, 'accounts', 'reversal', voucher.id, voucher.company_id,
    case when gst = '[]'::jsonb then null else gst end
  );
  update public.acc_vouchers set reversed_voucher_id = new_id, status = 'reversed' where id = voucher.id;
  update public.acc_vouchers set original_voucher_id = voucher.id where id = new_id;
  perform public.acc_write_audit(org_id, 'voucher', voucher.id, 'reverse',
    jsonb_build_object('voucher_number', voucher.voucher_number),
    jsonb_build_object('reversal_id', new_id), input_reason, active_company_id);
  return new_id;
end;
$$;

create or replace function public.acc_lock_period(input_from date, input_to date, input_company_id uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare org_id uuid; active_company_id uuid; lock_id uuid;
begin
  org_id := public.acc_require_owner();
  active_company_id := public.acc_require_company(input_company_id);
  if input_to < input_from then raise exception 'Invalid period'; end if;
  insert into public.acc_period_locks(organization_id, company_id, period_from, period_to, locked_by)
  values (org_id, active_company_id, input_from, input_to, auth.uid())
  returning id into lock_id;
  perform public.acc_write_audit(org_id, 'period_lock', lock_id, 'lock', null,
    jsonb_build_object('from', input_from, 'to', input_to), 'Period locked', active_company_id);
  return lock_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Banking
-- ---------------------------------------------------------------------------
create or replace function public.acc_add_bank_statement(
  input_coa_id uuid, input_statement_date date, input_opening numeric, input_closing numeric, input_lines jsonb,
  input_company_id uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare org_id uuid; active_company_id uuid; statement_id uuid; line jsonb;
begin
  org_id := public.acc_require_owner();
  active_company_id := public.acc_require_company(input_company_id);
  if not exists (
    select 1 from public.acc_coa c where c.id = input_coa_id and c.company_id = active_company_id
  ) then
    raise exception 'Bank account does not belong to this company';
  end if;
  insert into public.acc_bank_statements(organization_id, company_id, coa_id, statement_date, opening_balance, closing_balance, created_by)
  values (org_id, active_company_id, input_coa_id, input_statement_date, coalesce(input_opening, 0), coalesce(input_closing, 0), auth.uid())
  returning id into statement_id;
  for line in select * from jsonb_array_elements(coalesce(input_lines, '[]'::jsonb))
  loop
    insert into public.acc_bank_statement_lines(organization_id, company_id, statement_id, line_date, description, amount, direction)
    values (
      org_id, active_company_id, statement_id, coalesce((line->>'line_date')::date, input_statement_date),
      coalesce(line->>'description', ''), (line->>'amount')::numeric, coalesce(line->>'direction', 'in')
    );
  end loop;
  return statement_id;
end;
$$;

create or replace function public.acc_match_bank_line(input_line_id uuid, input_voucher_line_id uuid, input_note text default null, input_company_id uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare org_id uuid; active_company_id uuid;
begin
  org_id := public.acc_require_owner();
  active_company_id := public.acc_require_company(input_company_id);
  if input_voucher_line_id is not null and not exists (
    select 1 from public.acc_voucher_lines vl
    where vl.id = input_voucher_line_id and vl.company_id = active_company_id
  ) then
    raise exception 'Books line does not belong to this company';
  end if;
  update public.acc_bank_statement_lines bsl
    set matched_voucher_line_id = input_voucher_line_id,
        match_status = case when input_voucher_line_id is null then 'unmatched' else 'matched' end,
        match_note = input_note
    where bsl.id = input_line_id and bsl.organization_id = org_id and bsl.company_id = active_company_id;
  if not found then raise exception 'Bank statement line not found'; end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Finance sync (primary company only)
-- ---------------------------------------------------------------------------
create or replace function public.acc_sync_operations()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  org_id uuid;
  active_company_id uuid;
  enabled boolean;
  grouped record;
  lines jsonb;
  cash_amt numeric;
  upi_amt numeric;
  bank_amt numeric;
  total_in numeric;
  total_out numeric;
  recv uuid;
  created integer := 0;
begin
  org_id := public.acc_require_owner();
  perform public.acc_initialize(null, current_date);
  active_company_id := public.acc_primary_company_id(org_id);
  select integration_enabled into enabled from public.acc_settings where organization_id = org_id;
  if not coalesce(enabled, false) then
    return jsonb_build_object('created', 0, 'integration', false);
  end if;

  for grouped in
    select source_type, source_id, min(entry_date) as entry_date, min(description) as description,
           coalesce(sum(money_in) filter (where la.account_type = 'cash'), 0) as cash_in,
           coalesce(sum(money_out) filter (where la.account_type = 'cash'), 0) as cash_out,
           coalesce(sum(money_in) filter (where la.account_type = 'upi'), 0) as upi_in,
           coalesce(sum(money_out) filter (where la.account_type = 'upi'), 0) as upi_out,
           coalesce(sum(money_in) filter (where la.account_type = 'bank'), 0) as bank_in,
           coalesce(sum(money_out) filter (where la.account_type = 'bank'), 0) as bank_out,
           coalesce(sum(money_in), 0) as money_in,
           coalesce(sum(money_out), 0) as money_out,
           min(fa.kind) as finance_kind
    from public.cashbook_entries e
    join public.ledger_accounts la on la.id = e.ledger_account_id
    left join public.finance_accounts fa on fa.id = e.finance_account_id
    where e.organization_id = org_id and e.source_type is not null and e.source_id is not null
    group by source_type, source_id
  loop
    if exists (
      select 1 from public.acc_vouchers v
      where v.company_id = active_company_id and v.source_type = grouped.source_type
        and v.source_transaction_id = grouped.source_id and v.status = 'posted'
    ) then
      continue;
    end if;
    cash_amt := grouped.cash_in + grouped.cash_out;
    upi_amt := grouped.upi_in + grouped.upi_out;
    bank_amt := grouped.bank_in + grouped.bank_out;
    total_in := grouped.money_in;
    total_out := grouped.money_out;
    recv := case
      when grouped.source_type like 'chit_%' then public.acc_coa_id(org_id, '1130', active_company_id)
      when grouped.finance_kind = 'monthly' then public.acc_coa_id(org_id, '1120', active_company_id)
      when grouped.finance_kind = 'daily' then public.acc_coa_id(org_id, '1110', active_company_id)
      else public.acc_coa_id(org_id, '1100', active_company_id)
    end;
    lines := '[]'::jsonb;
    if grouped.source_type = 'finance_payment' or (grouped.source_type like 'chit_%' and grouped.source_type not like '%payout%' and grouped.source_type not like '%lift%' and total_in > 0) then
      if cash_amt > 0 then lines := lines || jsonb_build_array(jsonb_build_object('coa_id', public.acc_coa_id(org_id, '1000', active_company_id), 'debit', cash_amt, 'credit', 0)); end if;
      if upi_amt > 0 then lines := lines || jsonb_build_array(jsonb_build_object('coa_id', public.acc_coa_id(org_id, '1010', active_company_id), 'debit', upi_amt, 'credit', 0)); end if;
      if bank_amt > 0 then lines := lines || jsonb_build_array(jsonb_build_object('coa_id', public.acc_coa_id(org_id, '1020', active_company_id), 'debit', bank_amt, 'credit', 0)); end if;
      lines := lines || jsonb_build_array(jsonb_build_object('coa_id', recv, 'debit', 0, 'credit', total_in));
      begin
        perform public.acc_post_voucher('receipt', grouped.entry_date, grouped.description, lines, null, case when grouped.source_type like 'chit_%' then 'chit' else 'finance' end, grouped.source_type, grouped.source_id, active_company_id, null);
        created := created + 1;
      exception when others then null;
      end;
    elsif grouped.source_type = 'finance_disbursement' then
      lines := jsonb_build_array(jsonb_build_object('coa_id', recv, 'debit', total_out, 'credit', 0));
      if cash_amt > 0 then lines := lines || jsonb_build_array(jsonb_build_object('coa_id', public.acc_coa_id(org_id, '1000', active_company_id), 'debit', 0, 'credit', cash_amt)); end if;
      if upi_amt > 0 then lines := lines || jsonb_build_array(jsonb_build_object('coa_id', public.acc_coa_id(org_id, '1010', active_company_id), 'debit', 0, 'credit', upi_amt)); end if;
      if bank_amt > 0 then lines := lines || jsonb_build_array(jsonb_build_object('coa_id', public.acc_coa_id(org_id, '1020', active_company_id), 'debit', 0, 'credit', bank_amt)); end if;
      begin
        perform public.acc_post_voucher('payment', grouped.entry_date, grouped.description, lines, null, 'finance', grouped.source_type, grouped.source_id, active_company_id, null);
        created := created + 1;
      exception when others then null;
      end;
    elsif grouped.source_type = 'expense' then
      lines := jsonb_build_array(jsonb_build_object('coa_id', public.acc_coa_id(org_id, '5990', active_company_id), 'debit', total_out, 'credit', 0));
      if cash_amt > 0 then lines := lines || jsonb_build_array(jsonb_build_object('coa_id', public.acc_coa_id(org_id, '1000', active_company_id), 'debit', 0, 'credit', cash_amt)); end if;
      if upi_amt > 0 then lines := lines || jsonb_build_array(jsonb_build_object('coa_id', public.acc_coa_id(org_id, '1010', active_company_id), 'debit', 0, 'credit', upi_amt)); end if;
      if bank_amt > 0 then lines := lines || jsonb_build_array(jsonb_build_object('coa_id', public.acc_coa_id(org_id, '1020', active_company_id), 'debit', 0, 'credit', bank_amt)); end if;
      begin
        perform public.acc_post_voucher('payment', grouped.entry_date, grouped.description, lines, null, 'cashbook', grouped.source_type, grouped.source_id, active_company_id, null);
        created := created + 1;
      exception when others then null;
      end;
    end if;
  end loop;
  return jsonb_build_object('created', created, 'integration', true);
end;
$$;

grant execute on function public.acc_assert_period_open(uuid, date, uuid) to authenticated;
grant execute on function public.acc_update_coa(uuid, text, text, numeric, text, boolean, uuid) to authenticated;
grant execute on function public.acc_delete_coa(uuid, uuid) to authenticated;
grant execute on function public.acc_set_coa_parent(uuid, uuid, uuid) to authenticated;
grant execute on function public.acc_delete_party(uuid, uuid) to authenticated;
grant execute on function public.acc_set_party_active(uuid, boolean, uuid) to authenticated;
grant execute on function public.acc_cancel_voucher(uuid, text, uuid) to authenticated;
grant execute on function public.acc_reverse_voucher(uuid, date, text, uuid) to authenticated;
grant execute on function public.acc_lock_period(date, date, uuid) to authenticated;
grant execute on function public.acc_add_bank_statement(uuid, date, numeric, numeric, jsonb, uuid) to authenticated;
grant execute on function public.acc_match_bank_line(uuid, uuid, text, uuid) to authenticated;
grant execute on function public.acc_sync_operations() to authenticated;

notify pgrst, 'reload schema';
