-- FinTrack Accounts — additive small-business chart rows.
-- Run AFTER 052_fintrack_accounts_double_entry.sql.
-- Does not change Daily Finance, Monthly Finance, Chit Fund, Cashbook, or existing vouchers.
-- Extra ledgers are insert-on-conflict; existing books keep their balances.

create or replace function public.acc_seed_coa(input_org_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.acc_coa(organization_id, code, name, group_type, account_type, is_system)
  values
    (input_org_id, '1000', 'Cash in Hand', 'asset', 'cash', true),
    (input_org_id, '1010', 'UPI', 'asset', 'upi', true),
    (input_org_id, '1020', 'Bank', 'asset', 'bank', true),
    (input_org_id, '1100', 'Accounts Receivable', 'asset', 'receivable', true),
    (input_org_id, '1110', 'Daily Finance Receivable', 'asset', 'receivable', true),
    (input_org_id, '1120', 'Monthly Finance Receivable', 'asset', 'receivable', true),
    (input_org_id, '1130', 'Chit Fund Receivable', 'asset', 'receivable', true),
    (input_org_id, '1200', 'Loans & Advances', 'asset', 'other', false),
    (input_org_id, '1300', 'Fixed Assets', 'asset', 'other', false),
    (input_org_id, '2000', 'Accounts Payable', 'liability', 'payable', true),
    (input_org_id, '2100', 'Loans Payable', 'liability', 'payable', false),
    (input_org_id, '3000', 'Capital', 'equity', 'capital', true),
    (input_org_id, '3100', 'Drawings', 'equity', 'drawing', true),
    (input_org_id, '3200', 'Retained Earnings', 'equity', 'retained', true),
    (input_org_id, '4000', 'Interest Income', 'income', 'income', true),
    (input_org_id, '4100', 'Other Income', 'income', 'income', true),
    (input_org_id, '4200', 'Chit Commission', 'income', 'income', true),
    (input_org_id, '4300', 'Sales', 'income', 'income', true),
    (input_org_id, '4310', 'Service Income', 'income', 'income', false),
    (input_org_id, '5000', 'Rent', 'expense', 'expense', false),
    (input_org_id, '5010', 'Salary', 'expense', 'expense', false),
    (input_org_id, '5020', 'Agent Commission', 'expense', 'expense', false),
    (input_org_id, '5030', 'Fuel', 'expense', 'expense', false),
    (input_org_id, '5040', 'Electricity', 'expense', 'expense', false),
    (input_org_id, '5050', 'Internet', 'expense', 'expense', false),
    (input_org_id, '5060', 'Office Supplies', 'expense', 'expense', false),
    (input_org_id, '5065', 'Office Expenses', 'expense', 'expense', false),
    (input_org_id, '5070', 'Maintenance', 'expense', 'expense', false),
    (input_org_id, '5080', 'Marketing', 'expense', 'expense', false),
    (input_org_id, '5090', 'Travel', 'expense', 'expense', false),
    (input_org_id, '5100', 'Bank Charges', 'expense', 'expense', false),
    (input_org_id, '5110', 'Purchase', 'expense', 'expense', true),
    (input_org_id, '5120', 'Professional Fees', 'expense', 'expense', false),
    (input_org_id, '5990', 'Other Expenses', 'expense', 'expense', true)
  on conflict (organization_id, code) do nothing;
end;
$$;

insert into public.acc_coa(organization_id, code, name, group_type, account_type, is_system)
select s.organization_id, v.code, v.name, v.group_type, v.account_type, v.is_system
from public.acc_settings s
cross join (values
  ('1300', 'Fixed Assets', 'asset', 'other', false),
  ('4310', 'Service Income', 'income', 'income', false),
  ('5065', 'Office Expenses', 'expense', 'expense', false),
  ('5120', 'Professional Fees', 'expense', 'expense', false)
) as v(code, name, group_type, account_type, is_system)
on conflict (organization_id, code) do nothing;
