-- FinTrack Accounts P0: reversed originals stay in the books with their reversing voucher.
-- Reports are computed in the app from posted + reversed lines so cash/AR/AP net to zero.
-- Cancelling a reversed original is blocked so the pair cannot be split.
-- Run AFTER 054_accounts_p1_ledger_opening.sql.

create or replace function public.acc_cancel_voucher(input_voucher_id uuid, input_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare org_id uuid; voucher public.acc_vouchers;
begin
  org_id := public.acc_require_owner();
  select * into voucher from public.acc_vouchers where id = input_voucher_id and organization_id = org_id;
  if voucher.id is null then raise exception 'Voucher not found'; end if;
  if voucher.status = 'cancelled' then raise exception 'Voucher is already cancelled'; end if;
  if voucher.status = 'reversed' then
    raise exception 'Reversed vouchers cannot be cancelled. Cancel the reversal instead.';
  end if;
  if voucher.status <> 'posted' then raise exception 'Only posted vouchers can be cancelled'; end if;
  perform public.acc_assert_period_open(org_id, voucher.voucher_date);
  update public.acc_vouchers
    set status = 'cancelled', cancel_reason = coalesce(nullif(trim(input_reason), ''), 'Cancelled'),
        cancelled_at = now(), cancelled_by = auth.uid()
    where id = voucher.id;
  perform public.acc_write_audit(org_id, 'voucher', voucher.id, 'cancel',
    jsonb_build_object('status', voucher.status, 'voucher_number', voucher.voucher_number),
    jsonb_build_object('status', 'cancelled'), input_reason);
end;
$$;

create or replace function public.acc_reverse_voucher(input_voucher_id uuid, input_date date, input_reason text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  org_id uuid;
  voucher public.acc_vouchers;
  lines jsonb;
  new_id uuid;
begin
  org_id := public.acc_require_owner();
  select * into voucher from public.acc_vouchers where id = input_voucher_id and organization_id = org_id;
  if voucher.id is null then raise exception 'Voucher not found'; end if;
  if voucher.status <> 'posted' then raise exception 'Only posted vouchers can be reversed'; end if;
  if voucher.reversed_voucher_id is not null then raise exception 'Voucher is already reversed'; end if;
  select jsonb_agg(jsonb_build_object(
    'coa_id', coa_id, 'party_id', party_id, 'debit', credit, 'credit', debit, 'description', coalesce(input_reason, 'Reversal')
  ) order by line_no) into lines
  from public.acc_voucher_lines where voucher_id = voucher.id;
  new_id := public.acc_post_voucher(
    voucher.voucher_type, coalesce(input_date, current_date),
    coalesce(nullif(trim(input_reason), ''), 'Reversal of ' || voucher.voucher_number),
    lines, voucher.party_id, 'accounts', 'reversal', voucher.id
  );
  -- Original stays in ledgers as status reversed; the reversing voucher is posted.
  -- Reports include both so cash, AR, AP and P&L net to zero.
  update public.acc_vouchers set reversed_voucher_id = new_id, status = 'reversed' where id = voucher.id;
  update public.acc_vouchers set original_voucher_id = voucher.id where id = new_id;
  perform public.acc_write_audit(org_id, 'voucher', voucher.id, 'reverse', jsonb_build_object('voucher_number', voucher.voucher_number), jsonb_build_object('reversal_id', new_id), input_reason);
  return new_id;
end;
$$;
