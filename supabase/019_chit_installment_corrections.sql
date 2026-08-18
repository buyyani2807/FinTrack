-- Owner-only Chit Fund installment correction/reversal. Run after 018.
create or replace function public.chit_update_installment_payment(
  input_installment_id uuid, input_amount_paid numeric, input_paid_date date,
  input_payment_mode public.payment_mode, input_payment_reference text
) returns void language plpgsql security definer set search_path = public
as $$
declare current_org uuid; due numeric;
begin
  if not public.chit_is_owner() then raise exception 'Only a financier can edit Chit Fund payments'; end if;
  select organization_id, net_amount_due into current_org, due from public.chit_installments where id = input_installment_id and organization_id = public.current_organization_id();
  if current_org is null then raise exception 'Installment not found'; end if;
  if input_amount_paid < 0 or input_amount_paid > due then raise exception 'Payment must be between zero and the amount due'; end if;
  update public.chit_installments set amount_paid = round(input_amount_paid, 2), paid_date = case when input_amount_paid > 0 then coalesce(input_paid_date, current_date) else null end,
    payment_mode = case when input_amount_paid > 0 then input_payment_mode else null end, payment_reference = nullif(trim(input_payment_reference), ''),
    status = case when input_amount_paid = 0 then 'due' when input_amount_paid < net_amount_due then 'partially_paid' else 'paid' end, updated_at = now()
  where id = input_installment_id;
end;
$$;
grant execute on function public.chit_update_installment_payment(uuid,numeric,date,public.payment_mode,text) to authenticated;

create or replace function public.chit_delete_installment_payment(input_installment_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not public.chit_is_owner() then raise exception 'Only a financier can delete Chit Fund payments'; end if;
  if not exists (select 1 from public.chit_installments where id = input_installment_id and organization_id = public.current_organization_id()) then raise exception 'Installment not found'; end if;
  update public.chit_installments set amount_paid = 0, paid_date = null, payment_mode = null, payment_reference = null, status = 'due', updated_at = now() where id = input_installment_id;
end;
$$;
grant execute on function public.chit_delete_installment_payment(uuid) to authenticated;
