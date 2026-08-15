-- Financier-only correction and reversal workflow for recorded collections.
create or replace function public.update_finance_payment(
  payment_id uuid, payment_date date, payment_mode public.payment_mode,
  amount_total numeric, amount_interest numeric, amount_principal numeric,
  amount_penalty numeric, payment_ref text default null, payment_notes text default null
) returns void language plpgsql security definer set search_path = public
as $$
declare account_id uuid; before_data jsonb;
begin
  if not public.is_financier_owner() then raise exception 'Only a financier can edit recorded payments'; end if;
  if amount_total <= 0 then raise exception 'Payment amount must be greater than zero'; end if;
  select finance_account_id, to_jsonb(p) into account_id, before_data from public.payments p
    where p.id = payment_id and p.organization_id = public.current_organization_id();
  if account_id is null then raise exception 'Payment not found'; end if;
  update public.payments set paid_on = payment_date, mode = payment_mode, total_amount = amount_total,
    interest_amount = coalesce(amount_interest, 0), principal_amount = coalesce(amount_principal, 0),
    penalty_amount = coalesce(amount_penalty, 0), payment_reference = nullif(trim(payment_ref), ''),
    notes = nullif(trim(payment_notes), ''), updated_by = auth.uid(), updated_at = now() where id = payment_id;
  perform public.write_finance_audit(account_id, 'payment_corrected', jsonb_build_object('before', before_data), payment_id);
end; $$;

create or replace function public.delete_finance_payment(payment_id uuid) returns void language plpgsql security definer set search_path = public
as $$
declare account_id uuid; before_data jsonb;
begin
  if not public.is_financier_owner() then raise exception 'Only a financier can delete recorded payments'; end if;
  select finance_account_id, to_jsonb(p) into account_id, before_data from public.payments p
    where p.id = payment_id and p.organization_id = public.current_organization_id();
  if account_id is null then raise exception 'Payment not found'; end if;
  perform public.write_finance_audit(account_id, 'payment_deleted', jsonb_build_object('before', before_data), payment_id);
  delete from public.payments where id = payment_id;
end; $$;

grant execute on function public.update_finance_payment(uuid,date,public.payment_mode,numeric,numeric,numeric,numeric,text,text) to authenticated;
grant execute on function public.delete_finance_payment(uuid) to authenticated;
