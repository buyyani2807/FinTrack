-- 142: Cashier is Counter-only on the server; staff details are owner-only.
-- Safe to re-run. Apply after 141. No client deploy is required first.
--
-- Business rules (owner decision, 13 Nov 2026):
--   1. A cashier only uses the Counter (POS billing). The server now enforces it:
--      - may post Counter sales and returns (voucher_type sale / credit_note with
--        source_type pos_counter), void Counter bills, and close the till day;
--      - may not write anything else in Accounts (journals, receipts, parties,
--        items, chart of accounts, price lists, payroll, settings, ...);
--      - may not read audit log, payroll, bank statements, trade documents,
--        filings, recurring templates, period locks, team invites, routes,
--        attachments or e-invoice payloads.
--      The cashier still reads vouchers, parties, items, stock and chart of accounts:
--      the Counter needs them for stock checks, prices and the khata credit limit.
--   2. Staff details (name, phone, email, role) in public.profiles are visible
--      only to the business owner. Everyone else sees only their own row.
--      Side effect: "Collected by" names on payments are blank for non-owners
--      unless the payment was collected by that user.
--
-- Triggers fire inside security-definer RPCs too, so every write path is covered.
-- The owner, service role and other Accounts roles are unaffected.

create or replace function public.acc_is_cashier()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.accounts_access_role() = 'cashier', false);
$$;
grant execute on function public.acc_is_cashier() to authenticated;

-- ---------------------------------------------------------------------------
-- 1a. Vouchers: Counter sales and returns only.
-- ---------------------------------------------------------------------------
create or replace function public.acc_cashier_guard_voucher()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.acc_is_cashier() then
    return coalesce(new, old);
  end if;
  if tg_op = 'INSERT' then
    if new.source_type is distinct from 'pos_counter' or new.voucher_type not in ('sale', 'credit_note') then
      raise exception 'A cashier can only post Counter sales and returns';
    end if;
    return new;
  elsif tg_op = 'UPDATE' then
    if old.source_type is distinct from 'pos_counter'
       or new.source_type is distinct from 'pos_counter'
       or new.voucher_type is distinct from old.voucher_type then
      raise exception 'A cashier can only change Counter bills';
    end if;
    return new;
  end if;
  raise exception 'A cashier cannot delete vouchers';
end;
$$;

drop trigger if exists acc_cashier_guard_voucher on public.acc_vouchers;
create trigger acc_cashier_guard_voucher
  before insert or update or delete on public.acc_vouchers
  for each row execute function public.acc_cashier_guard_voucher();

-- ---------------------------------------------------------------------------
-- 1b. Voucher children: only for a Counter voucher.
-- ---------------------------------------------------------------------------
create or replace function public.acc_cashier_guard_voucher_child()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  target_voucher uuid;
begin
  if not public.acc_is_cashier() then
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE' then
    raise exception 'A cashier cannot delete voucher details';
  end if;
  target_voucher := new.voucher_id;
  if target_voucher is null or not exists (
    select 1 from public.acc_vouchers v
    where v.id = target_voucher and v.source_type = 'pos_counter'
  ) then
    raise exception 'A cashier can only record Counter bills';
  end if;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['acc_voucher_lines', 'acc_voucher_item_lines', 'acc_gst_lines', 'acc_stock_movements']
  loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists acc_cashier_guard_child on public.%I', t);
      execute format(
        'create trigger acc_cashier_guard_child before insert or update or delete on public.%I
           for each row execute function public.acc_cashier_guard_voucher_child()', t);
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1c. Every other Accounts table: no cashier writes.
--     Allowed elsewhere: acc_sequences (bill numbers), acc_audit_log (written by
--     the RPCs), acc_counter_day_closes (till day close).
-- ---------------------------------------------------------------------------
create or replace function public.acc_cashier_block_write()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.acc_is_cashier() then
    raise exception 'A cashier can only use the Counter';
  end if;
  return coalesce(new, old);
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'acc_coa', 'acc_parties', 'acc_items', 'acc_item_categories',
    'acc_price_lists', 'acc_price_list_rates', 'acc_party_pipeline', 'acc_bulk_party_maps',
    'acc_settings', 'acc_document_settings', 'acc_inventory_settings',
    'acc_companies', 'acc_period_locks', 'acc_recurring_templates',
    'acc_bank_statements', 'acc_bank_statement_lines',
    'acc_trade_documents', 'acc_trade_document_lines',
    'acc_compliance_filings', 'acc_einvoice_payloads', 'acc_voucher_attachments',
    'acc_collection_routes', 'acc_collection_route_stops',
    'acc_payroll_profiles', 'acc_payroll_days', 'acc_payroll_leave', 'acc_payroll_runs',
    'acc_team_invites', 'acc_user_roles', 'acc_user_company_access'
  ]
  loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists acc_cashier_block_write on public.%I', t);
      execute format(
        'create trigger acc_cashier_block_write before insert or update or delete on public.%I
           for each row execute function public.acc_cashier_block_write()', t);
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1d. Cashier reads: hide data the Counter does not use.
--     Restrictive policies are ANDed with the existing read policies.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'acc_audit_log',
    'acc_payroll_profiles', 'acc_payroll_days', 'acc_payroll_leave', 'acc_payroll_runs',
    'acc_bank_statements', 'acc_bank_statement_lines',
    'acc_trade_documents', 'acc_trade_document_lines',
    'acc_compliance_filings', 'acc_recurring_templates', 'acc_period_locks',
    'acc_team_invites', 'acc_einvoice_payloads', 'acc_voucher_attachments',
    'acc_collection_routes', 'acc_collection_route_stops',
    'acc_party_pipeline', 'acc_bulk_party_maps'
  ]
  loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists acc_cashier_no_read on public.%I', t);
      execute format(
        'create policy acc_cashier_no_read on public.%I as restrictive for select to authenticated
           using (not public.acc_is_cashier())', t);
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Staff details: owner sees the organization's staff; everyone else only
--    their own profile row. Restrictive, so it narrows the existing
--    "members read profiles" policy without replacing it.
-- ---------------------------------------------------------------------------
drop policy if exists profiles_owner_or_self_read on public.profiles;
create policy profiles_owner_or_self_read on public.profiles
  as restrictive for select to authenticated
  using (id = auth.uid() or public.is_financier_owner());
