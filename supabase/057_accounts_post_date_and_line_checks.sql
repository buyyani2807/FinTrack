-- FinTrack Accounts: reject future voucher dates and negative lines at post time.
-- Run AFTER 056_accounts_p2_due_date_parent.sql.
-- Replaces acc_post_voucher only. Does not change Daily Finance, Monthly Finance, Chit Fund, or Cashbook.

create or replace function public.acc_post_voucher(
  input_voucher_type text,
  input_date date,
  input_narration text,
  input_lines jsonb,
  input_party_id uuid default null,
  input_source_module text default null,
  input_source_type text default null,
  input_source_transaction_id uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  org_id uuid;
  voucher_id uuid;
  voucher_no text;
  line jsonb;
  line_no integer := 0;
  total_debit numeric := 0;
  total_credit numeric := 0;
  debit_amt numeric;
  credit_amt numeric;
  today_ist date := (timezone('Asia/Kolkata', now()))::date;
begin
  org_id := public.acc_require_owner();
  perform public.acc_initialize(null, current_date);
  if input_date > today_ist then
    raise exception 'Voucher date cannot be in the future';
  end if;
  perform public.acc_assert_period_open(org_id, input_date);
  if jsonb_typeof(input_lines) <> 'array' or jsonb_array_length(input_lines) < 2 then
    raise exception 'A voucher needs at least two lines';
  end if;
  for line in select * from jsonb_array_elements(input_lines)
  loop
    debit_amt := round(coalesce((line->>'debit')::numeric, 0), 2);
    credit_amt := round(coalesce((line->>'credit')::numeric, 0), 2);
    if debit_amt < 0 or credit_amt < 0 then
      raise exception 'Voucher lines cannot be negative';
    end if;
    if debit_amt > 0 and credit_amt > 0 then
      raise exception 'A voucher line cannot be both debit and credit';
    end if;
    if debit_amt = 0 and credit_amt = 0 then
      raise exception 'Every voucher line needs a debit or a credit';
    end if;
    if coalesce(nullif(line->>'coa_id', ''), '') = '' then
      raise exception 'Every voucher line needs an account';
    end if;
    total_debit := total_debit + debit_amt;
    total_credit := total_credit + credit_amt;
  end loop;
  if total_debit <= 0 or total_debit <> total_credit then
    raise exception 'Unbalanced voucher cannot be posted. Debits % · Credits %', total_debit, total_credit;
  end if;
  voucher_no := public.acc_next_number(org_id, input_voucher_type);
  insert into public.acc_vouchers(
    organization_id, voucher_type, voucher_number, voucher_date, narration, status, party_id,
    source_module, source_type, source_transaction_id, created_by, posted_at, posted_by
  ) values (
    org_id, input_voucher_type, voucher_no, input_date, coalesce(input_narration, ''), 'posted', input_party_id,
    input_source_module, input_source_type, input_source_transaction_id, auth.uid(), now(), auth.uid()
  ) returning id into voucher_id;
  for line in select * from jsonb_array_elements(input_lines)
  loop
    line_no := line_no + 1;
    insert into public.acc_voucher_lines(organization_id, voucher_id, line_no, coa_id, party_id, debit, credit, description)
    values (
      org_id, voucher_id, line_no,
      (line->>'coa_id')::uuid,
      coalesce(nullif(line->>'party_id', '')::uuid, input_party_id),
      round(coalesce((line->>'debit')::numeric, 0), 2),
      round(coalesce((line->>'credit')::numeric, 0), 2),
      coalesce(line->>'description', input_narration)
    );
  end loop;
  perform public.acc_write_audit(org_id, 'voucher', voucher_id, 'post', null, jsonb_build_object(
    'voucher_number', voucher_no, 'voucher_type', input_voucher_type, 'debit', total_debit, 'credit', total_credit
  ), input_narration);
  return voucher_id;
end;
$$;
