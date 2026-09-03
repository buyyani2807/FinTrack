-- Query indexes for FinTrack Accounts list and report loads.
-- Safe to re-run. Does not change posting, balances, or RLS.

create index if not exists acc_voucher_lines_company_voucher_idx
  on public.acc_voucher_lines(company_id, voucher_id, line_no);

create index if not exists acc_voucher_lines_company_coa_idx
  on public.acc_voucher_lines(company_id, coa_id);

create index if not exists acc_voucher_lines_company_party_idx
  on public.acc_voucher_lines(company_id, party_id)
  where party_id is not null;

create index if not exists acc_vouchers_company_status_date_idx
  on public.acc_vouchers(company_id, status, voucher_date desc);

create index if not exists acc_bank_statement_lines_company_statement_idx
  on public.acc_bank_statement_lines(company_id, statement_id, line_date);

create index if not exists acc_period_locks_company_idx
  on public.acc_period_locks(company_id, period_from desc);

create index if not exists acc_gst_lines_voucher_idx
  on public.acc_gst_lines(voucher_id, line_no);
