-- Bind GST documents to tax ledgers and copy GST lines onto reversals.
-- Requires 060_accounts_gst.sql (acc_gst_lines). Safe to apply after 061.

create unique index if not exists acc_gst_lines_voucher_line_uidx
  on public.acc_gst_lines(voucher_id, line_no);

create or replace function public.acc_gst_lines_must_match_ledgers()
returns trigger language plpgsql as $$
declare
  gst_cgst numeric := 0;
  gst_sgst numeric := 0;
  gst_igst numeric := 0;
  led_cgst numeric := 0;
  led_sgst numeric := 0;
  led_igst numeric := 0;
begin
  select
    coalesce(sum(cgst_amount), 0),
    coalesce(sum(sgst_amount), 0),
    coalesce(sum(igst_amount), 0)
  into gst_cgst, gst_sgst, gst_igst
  from public.acc_gst_lines
  where voucher_id = new.voucher_id;

  select
    coalesce(sum(case when c.code in ('1140', '2210') then l.debit + l.credit else 0 end), 0),
    coalesce(sum(case when c.code in ('1141', '2211') then l.debit + l.credit else 0 end), 0),
    coalesce(sum(case when c.code in ('1142', '2212') then l.debit + l.credit else 0 end), 0)
  into led_cgst, led_sgst, led_igst
  from public.acc_voucher_lines l
  join public.acc_coa c on c.id = l.coa_id
  where l.voucher_id = new.voucher_id;

  if gst_cgst <> led_cgst or gst_sgst <> led_sgst or gst_igst <> led_igst then
    raise exception 'GST document does not match tax ledgers. CGST % / % · SGST % / % · IGST % / %',
      gst_cgst, led_cgst, gst_sgst, led_sgst, gst_igst, led_igst;
  end if;
  return new;
end;
$$;

drop trigger if exists acc_gst_lines_match_ledgers on public.acc_gst_lines;
create constraint trigger acc_gst_lines_match_ledgers
after insert on public.acc_gst_lines
deferrable initially deferred
for each row
execute procedure public.acc_gst_lines_must_match_ledgers();

create or replace function public.acc_reverse_voucher(input_voucher_id uuid, input_date date, input_reason text, input_company_id uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  org_id uuid;
  company_id uuid;
  voucher public.acc_vouchers;
  lines jsonb;
  gst jsonb;
  new_id uuid;
begin
  org_id := public.acc_require_owner();
  company_id := public.acc_require_company(input_company_id);
  select * into voucher from public.acc_vouchers
    where id = input_voucher_id and organization_id = org_id and company_id = company_id;
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
    jsonb_build_object('reversal_id', new_id), input_reason, company_id);
  return new_id;
end;
$$;

grant execute on function public.acc_reverse_voucher(uuid, date, text, uuid) to authenticated;
