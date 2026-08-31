-- FT-028 and FT-031. Run after 047_ft022_ft027_integrity.sql (or 047a plus 047).
-- Does not change Daily/Monthly collection amounts, interest formula, or Chit prize math.

-- ---------------------------------------------------------------------------
-- FT-031 — Inactive collection staff cannot SELECT assigned finance rows
-- ---------------------------------------------------------------------------
drop policy if exists "staff read assigned customers" on public.customers;
create policy "staff read assigned customers" on public.customers for select
using (
  organization_id = public.current_organization_id()
  and public.is_active_finance_member()
  and exists (
    select 1 from public.finance_accounts a
    where a.customer_id = customers.id and a.organization_id = public.current_organization_id()
      and a.collection_agent_id = auth.uid()
  )
);

drop policy if exists "staff read assigned accounts" on public.finance_accounts;
create policy "staff read assigned accounts" on public.finance_accounts for select
using (
  organization_id = public.current_organization_id()
  and public.is_active_finance_member()
  and collection_agent_id = auth.uid()
);

drop policy if exists "staff read assigned rate changes" on public.rate_changes;
create policy "staff read assigned rate changes" on public.rate_changes for select
using (
  public.is_active_finance_member()
  and exists (
    select 1 from public.finance_accounts a
    where a.id = rate_changes.finance_account_id and a.organization_id = public.current_organization_id()
      and a.collection_agent_id = auth.uid()
  )
);

drop policy if exists "staff read assigned payments" on public.payments;
create policy "staff read assigned payments" on public.payments for select
using (
  organization_id = public.current_organization_id()
  and public.is_active_finance_member()
  and exists (
    select 1 from public.finance_accounts a
    where a.id = payments.finance_account_id and a.organization_id = public.current_organization_id()
      and a.collection_agent_id = auth.uid()
  )
);

drop policy if exists "members read reminder log" on public.payment_reminder_log;
drop policy if exists "owners and assigned staff read reminder log" on public.payment_reminder_log;
create policy "owners and assigned staff read reminder log" on public.payment_reminder_log for select
  using (
    organization_id = public.current_organization_id()
    and public.is_active_finance_member()
    and (
      public.is_financier_owner()
      or sent_by = auth.uid()
      or (
        reminder_source = 'monthly_finance'
        and exists (
          select 1 from public.finance_accounts a
          where a.id = source_id
            and a.organization_id = public.current_organization_id()
            and a.collection_agent_id = auth.uid()
        )
      )
    )
  );

-- ---------------------------------------------------------------------------
-- FT-028 — Editing monthly interest rate applies from today, not restating history
-- ---------------------------------------------------------------------------
create or replace function public.update_finance_account(
  account_id uuid, customer_full_name text, customer_phone text, customer_address text, account_kind public.finance_kind,
  account_collection_amount numeric, account_disbursed_amount numeric, account_daily_collection numeric,
  account_principal numeric, account_monthly_interest_rate numeric, account_penalty_rate numeric
) returns void language plpgsql security definer set search_path = public
as $$
declare
  customer_uuid uuid;
  before_data jsonb;
  previous_kind public.finance_kind;
  previous_rate numeric;
  previous_start date;
  today_ist date := (timezone('Asia/Kolkata', now()))::date;
  new_rate numeric;
begin
  if not public.is_financier_owner() then raise exception 'Only a financier can edit accounts'; end if;
  select customer_id, to_jsonb(a), a.kind, a.monthly_interest_rate, a.start_date
    into customer_uuid, before_data, previous_kind, previous_rate, previous_start
    from public.finance_accounts a
    where id = account_id and organization_id = public.current_organization_id();
  if customer_uuid is null then raise exception 'Finance account not found'; end if;
  update public.customers set full_name = trim(customer_full_name), phone = trim(customer_phone),
    address = nullif(trim(customer_address), '') where id = customer_uuid;
  update public.finance_accounts set kind = account_kind, collection_amount = account_collection_amount,
    disbursed_amount = account_disbursed_amount, daily_collection = account_daily_collection,
    principal = account_principal, monthly_interest_rate = account_monthly_interest_rate,
    penalty_rate = coalesce(account_penalty_rate, 0)
  where id = account_id;

  new_rate := account_monthly_interest_rate;
  if account_kind = 'monthly' and previous_kind = 'monthly'
     and new_rate is not null
     and round(coalesce(previous_rate, 0), 4) is distinct from round(new_rate, 4) then
    if not exists (select 1 from public.rate_changes where finance_account_id = account_id)
       and previous_start is not null and previous_start < today_ist then
      insert into public.rate_changes(finance_account_id, effective_date, monthly_interest_rate)
      values (account_id, previous_start, coalesce(previous_rate, 0));
    end if;
    if exists (
      select 1 from public.rate_changes
      where finance_account_id = account_id and effective_date = today_ist
    ) then
      update public.rate_changes
        set monthly_interest_rate = new_rate
        where finance_account_id = account_id and effective_date = today_ist;
    else
      insert into public.rate_changes(finance_account_id, effective_date, monthly_interest_rate)
      values (account_id, today_ist, new_rate);
    end if;
  end if;

  perform public.write_finance_audit(account_id, 'account_updated', jsonb_build_object('before', before_data));
  perform public.accounts_sync_finance_disbursement(account_id);
end;
$$;

grant execute on function public.update_finance_account(
  uuid, text, text, text, public.finance_kind, numeric, numeric, numeric, numeric, numeric, numeric
) to authenticated;
