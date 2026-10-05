-- Cashbook balances and the primary Accounts company were drifting because Sync
-- linked vouchers copied collections, disbursements and expenses only.
-- Openings, transfers, manual cashbook lines and chit payouts stayed in Cashbook.
-- Apply in the Supabase SQL editor after 082.

create or replace function public.acc_sync_operations()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  org_id uuid;
  active_company_id uuid;
  enabled boolean;
  grouped record;
  lines jsonb;
  cash_in numeric;
  cash_out numeric;
  upi_in numeric;
  upi_out numeric;
  bank_in numeric;
  bank_out numeric;
  total_in numeric;
  total_out numeric;
  recv uuid;
  capital uuid;
  other_income uuid;
  other_expense uuid;
  opening_already numeric;
  created integer := 0;
  skipped integer := 0;
  skip_reason text;
begin
  org_id := public.acc_require_owner();
  perform public.acc_initialize(null, current_date);
  active_company_id := public.acc_primary_company_id(org_id);
  select integration_enabled into enabled from public.acc_settings where organization_id = org_id;
  if not coalesce(enabled, false) then
    return jsonb_build_object('created', 0, 'skipped', 0, 'integration', false);
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

    cash_in := grouped.cash_in;
    cash_out := grouped.cash_out;
    upi_in := grouped.upi_in;
    upi_out := grouped.upi_out;
    bank_in := grouped.bank_in;
    bank_out := grouped.bank_out;
    total_in := grouped.money_in;
    total_out := grouped.money_out;
    recv := case
      when grouped.source_type like 'chit_%' or grouped.source_type like '%payout%' or grouped.source_type like '%lift%'
        then public.acc_coa_id(org_id, '1130', active_company_id)
      when grouped.finance_kind = 'monthly' then public.acc_coa_id(org_id, '1120', active_company_id)
      when grouped.finance_kind = 'daily' then public.acc_coa_id(org_id, '1110', active_company_id)
      else public.acc_coa_id(org_id, '1100', active_company_id)
    end;
    lines := '[]'::jsonb;

    if grouped.source_type = 'finance_payment'
      or (grouped.source_type like 'chit_%' and grouped.source_type not like '%payout%' and grouped.source_type not like '%lift%' and total_in > 0) then
      if cash_in > 0 then lines := lines || jsonb_build_array(jsonb_build_object('coa_id', public.acc_coa_id(org_id, '1000', active_company_id), 'debit', cash_in, 'credit', 0)); end if;
      if upi_in > 0 then lines := lines || jsonb_build_array(jsonb_build_object('coa_id', public.acc_coa_id(org_id, '1010', active_company_id), 'debit', upi_in, 'credit', 0)); end if;
      if bank_in > 0 then lines := lines || jsonb_build_array(jsonb_build_object('coa_id', public.acc_coa_id(org_id, '1020', active_company_id), 'debit', bank_in, 'credit', 0)); end if;
      lines := lines || jsonb_build_array(jsonb_build_object('coa_id', recv, 'debit', 0, 'credit', total_in));
      begin
        perform public.acc_post_voucher('receipt', grouped.entry_date, grouped.description, lines, null, case when grouped.source_type like 'chit_%' then 'chit' else 'finance' end, grouped.source_type, grouped.source_id, active_company_id, null);
        created := created + 1;
      exception when others then
        skipped := skipped + 1;
        if skip_reason is null then skip_reason := sqlerrm; end if;
      end;

    elsif grouped.source_type = 'finance_disbursement' then
      lines := jsonb_build_array(jsonb_build_object('coa_id', recv, 'debit', total_out, 'credit', 0));
      if cash_out > 0 then lines := lines || jsonb_build_array(jsonb_build_object('coa_id', public.acc_coa_id(org_id, '1000', active_company_id), 'debit', 0, 'credit', cash_out)); end if;
      if upi_out > 0 then lines := lines || jsonb_build_array(jsonb_build_object('coa_id', public.acc_coa_id(org_id, '1010', active_company_id), 'debit', 0, 'credit', upi_out)); end if;
      if bank_out > 0 then lines := lines || jsonb_build_array(jsonb_build_object('coa_id', public.acc_coa_id(org_id, '1020', active_company_id), 'debit', 0, 'credit', bank_out)); end if;
      begin
        perform public.acc_post_voucher('payment', grouped.entry_date, grouped.description, lines, null, 'finance', grouped.source_type, grouped.source_id, active_company_id, null);
        created := created + 1;
      exception when others then
        skipped := skipped + 1;
        if skip_reason is null then skip_reason := sqlerrm; end if;
      end;

    elsif grouped.source_type like '%payout%' or grouped.source_type like '%lift%' then
      lines := jsonb_build_array(jsonb_build_object('coa_id', recv, 'debit', total_out, 'credit', 0));
      if cash_out > 0 then lines := lines || jsonb_build_array(jsonb_build_object('coa_id', public.acc_coa_id(org_id, '1000', active_company_id), 'debit', 0, 'credit', cash_out)); end if;
      if upi_out > 0 then lines := lines || jsonb_build_array(jsonb_build_object('coa_id', public.acc_coa_id(org_id, '1010', active_company_id), 'debit', 0, 'credit', upi_out)); end if;
      if bank_out > 0 then lines := lines || jsonb_build_array(jsonb_build_object('coa_id', public.acc_coa_id(org_id, '1020', active_company_id), 'debit', 0, 'credit', bank_out)); end if;
      begin
        perform public.acc_post_voucher('payment', grouped.entry_date, grouped.description, lines, null, 'chit', grouped.source_type, grouped.source_id, active_company_id, null);
        created := created + 1;
      exception when others then
        skipped := skipped + 1;
        if skip_reason is null then skip_reason := sqlerrm; end if;
      end;

    elsif grouped.source_type = 'expense'
      or (grouped.source_type = 'manual' and total_out > 0 and total_in = 0) then
      other_expense := public.acc_coa_id(org_id, '5990', active_company_id);
      lines := jsonb_build_array(jsonb_build_object('coa_id', other_expense, 'debit', total_out, 'credit', 0));
      if cash_out > 0 then lines := lines || jsonb_build_array(jsonb_build_object('coa_id', public.acc_coa_id(org_id, '1000', active_company_id), 'debit', 0, 'credit', cash_out)); end if;
      if upi_out > 0 then lines := lines || jsonb_build_array(jsonb_build_object('coa_id', public.acc_coa_id(org_id, '1010', active_company_id), 'debit', 0, 'credit', upi_out)); end if;
      if bank_out > 0 then lines := lines || jsonb_build_array(jsonb_build_object('coa_id', public.acc_coa_id(org_id, '1020', active_company_id), 'debit', 0, 'credit', bank_out)); end if;
      begin
        perform public.acc_post_voucher('payment', grouped.entry_date, grouped.description, lines, null, 'cashbook', grouped.source_type, grouped.source_id, active_company_id, null);
        created := created + 1;
      exception when others then
        skipped := skipped + 1;
        if skip_reason is null then skip_reason := sqlerrm; end if;
      end;

    elsif grouped.source_type = 'manual' and total_in > 0 and total_out = 0 then
      other_income := public.acc_coa_id(org_id, '4100', active_company_id);
      if cash_in > 0 then lines := lines || jsonb_build_array(jsonb_build_object('coa_id', public.acc_coa_id(org_id, '1000', active_company_id), 'debit', cash_in, 'credit', 0)); end if;
      if upi_in > 0 then lines := lines || jsonb_build_array(jsonb_build_object('coa_id', public.acc_coa_id(org_id, '1010', active_company_id), 'debit', upi_in, 'credit', 0)); end if;
      if bank_in > 0 then lines := lines || jsonb_build_array(jsonb_build_object('coa_id', public.acc_coa_id(org_id, '1020', active_company_id), 'debit', bank_in, 'credit', 0)); end if;
      lines := lines || jsonb_build_array(jsonb_build_object('coa_id', other_income, 'debit', 0, 'credit', total_in));
      begin
        perform public.acc_post_voucher('receipt', grouped.entry_date, grouped.description, lines, null, 'cashbook', grouped.source_type, grouped.source_id, active_company_id, null);
        created := created + 1;
      exception when others then
        skipped := skipped + 1;
        if skip_reason is null then skip_reason := sqlerrm; end if;
      end;

    elsif grouped.source_type = 'transfer' then
      if cash_in > 0 then lines := lines || jsonb_build_array(jsonb_build_object('coa_id', public.acc_coa_id(org_id, '1000', active_company_id), 'debit', cash_in, 'credit', 0)); end if;
      if upi_in > 0 then lines := lines || jsonb_build_array(jsonb_build_object('coa_id', public.acc_coa_id(org_id, '1010', active_company_id), 'debit', upi_in, 'credit', 0)); end if;
      if bank_in > 0 then lines := lines || jsonb_build_array(jsonb_build_object('coa_id', public.acc_coa_id(org_id, '1020', active_company_id), 'debit', bank_in, 'credit', 0)); end if;
      if cash_out > 0 then lines := lines || jsonb_build_array(jsonb_build_object('coa_id', public.acc_coa_id(org_id, '1000', active_company_id), 'debit', 0, 'credit', cash_out)); end if;
      if upi_out > 0 then lines := lines || jsonb_build_array(jsonb_build_object('coa_id', public.acc_coa_id(org_id, '1010', active_company_id), 'debit', 0, 'credit', upi_out)); end if;
      if bank_out > 0 then lines := lines || jsonb_build_array(jsonb_build_object('coa_id', public.acc_coa_id(org_id, '1020', active_company_id), 'debit', 0, 'credit', bank_out)); end if;
      begin
        perform public.acc_post_voucher('contra', grouped.entry_date, grouped.description, lines, null, 'cashbook', grouped.source_type, grouped.source_id, active_company_id, null);
        created := created + 1;
      exception when others then
        skipped := skipped + 1;
        if skip_reason is null then skip_reason := sqlerrm; end if;
      end;

    elsif grouped.source_type = 'opening_balance' and total_in > 0 then
      select coalesce(c.opening_balance, 0) into opening_already
      from public.acc_coa c
      where c.id = case
        when cash_in > 0 then public.acc_coa_id(org_id, '1000', active_company_id)
        when upi_in > 0 then public.acc_coa_id(org_id, '1010', active_company_id)
        else public.acc_coa_id(org_id, '1020', active_company_id)
      end;
      if coalesce(opening_already, 0) <> 0 then
        skipped := skipped + 1;
        if skip_reason is null then skip_reason := 'Opening is already on the Accounts ledger'; end if;
      else
        capital := public.acc_coa_id(org_id, '3000', active_company_id);
        if cash_in > 0 then lines := lines || jsonb_build_array(jsonb_build_object('coa_id', public.acc_coa_id(org_id, '1000', active_company_id), 'debit', cash_in, 'credit', 0)); end if;
        if upi_in > 0 then lines := lines || jsonb_build_array(jsonb_build_object('coa_id', public.acc_coa_id(org_id, '1010', active_company_id), 'debit', upi_in, 'credit', 0)); end if;
        if bank_in > 0 then lines := lines || jsonb_build_array(jsonb_build_object('coa_id', public.acc_coa_id(org_id, '1020', active_company_id), 'debit', bank_in, 'credit', 0)); end if;
        lines := lines || jsonb_build_array(jsonb_build_object('coa_id', capital, 'debit', 0, 'credit', total_in));
        begin
          perform public.acc_post_voucher('journal', grouped.entry_date, grouped.description, lines, null, 'cashbook', grouped.source_type, grouped.source_id, active_company_id, null);
          created := created + 1;
        exception when others then
          skipped := skipped + 1;
          if skip_reason is null then skip_reason := sqlerrm; end if;
        end;
      end if;
    end if;
  end loop;

  return jsonb_build_object('created', created, 'skipped', skipped, 'skip_reason', skip_reason, 'integration', true);
end;
$$;

grant execute on function public.acc_sync_operations() to authenticated;

notify pgrst, 'reload schema';
