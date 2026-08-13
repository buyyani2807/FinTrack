-- Run AFTER 008_closure_and_bankruptcy_rules.sql.
-- Adds only the missing agent profile fields; Supabase Auth users are created by the secure Vercel API endpoint.

alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists is_active boolean not null default true;

create or replace function public.is_active_finance_member() returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce((select is_active from public.profiles where id = auth.uid()), false) $$;

create or replace function public.record_finance_payment(
  account_id uuid, payment_date date, payment_mode public.payment_mode, amount_total numeric,
  amount_interest numeric default 0, amount_principal numeric default 0, amount_penalty numeric default 0,
  payment_ref text default null, payment_notes text default null
) returns uuid language plpgsql security definer set search_path = public
as $$
declare org_id uuid; payment_id uuid; account_status text;
begin
  if not public.is_active_finance_member() then raise exception 'Your collection agent account is inactive'; end if;
  select organization_id, status into org_id, account_status from public.finance_accounts
  where id = account_id and organization_id = public.current_organization_id()
    and (public.is_financier_owner() or collection_agent_id = auth.uid());
  if org_id is null then raise exception 'Account not found or not assigned to you'; end if;
  if account_status <> 'active' then raise exception 'Collections are disabled for this account because it is %', account_status; end if;
  if amount_total <= 0 then raise exception 'Payment amount must be greater than zero'; end if;
  insert into public.payments(organization_id, finance_account_id, paid_on, mode, total_amount, interest_amount, principal_amount, penalty_amount, payment_reference, notes, created_by, collected_by)
  values(org_id, account_id, payment_date, payment_mode, amount_total, amount_interest, amount_principal, amount_penalty, nullif(trim(payment_ref), ''), nullif(trim(payment_notes), ''), auth.uid(), auth.uid()) returning id into payment_id;
  perform public.write_finance_audit(account_id, 'payment_recorded', jsonb_build_object('amount', amount_total, 'date', payment_date, 'mode', payment_mode), payment_id);
  return payment_id;
end;
$$;

grant execute on function public.is_active_finance_member() to authenticated;
grant execute on function public.record_finance_payment(uuid,date,public.payment_mode,numeric,numeric,numeric,numeric,text,text) to authenticated;
