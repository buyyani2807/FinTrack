-- Optional, read-only. Lists finance payments that share the same account and date.
-- Do not delete these during pilot: existing accounts were entered on a single day.

select
  c.full_name as customer,
  c.phone,
  a.kind,
  p.paid_on,
  count(*) as payment_rows,
  count(distinct p.total_amount) > 1 as amounts_differ,
  string_agg(p.total_amount::text, ' + ' order by p.created_at, p.id) as amounts,
  string_agg(coalesce(p.receipt_number, '(no receipt)'), ', ' order by p.created_at, p.id) as receipts,
  string_agg(p.mode::text, ', ' order by p.created_at, p.id) as modes,
  min(p.created_at) as first_created_at,
  max(p.created_at) as last_created_at
from public.payments p
join public.finance_accounts a on a.id = p.finance_account_id
join public.customers c on c.id = a.customer_id
group by c.full_name, c.phone, a.kind, p.paid_on, p.finance_account_id
having count(*) > 1
order by p.paid_on, c.full_name;
