-- Customer workspace backups (all modules the org uses) + midnight schedule flag.
-- Paste after 125. Safe to re-run.
-- App API stores JSON in Storage bucket "workspace-backups" and calls restore_workspace_backup_json.

alter table public.organizations
  add column if not exists backup_schedule_enabled boolean not null default true;

comment on column public.organizations.backup_schedule_enabled is
  'When true, nightly cron creates a scheduled workspace backup for this organization.';

create table if not exists public.workspace_backups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null check (kind in ('manual', 'scheduled', 'pre_restore')),
  module_keys text[] not null default '{}',
  storage_path text not null,
  bytes integer not null default 0 check (bytes >= 0),
  counts jsonb not null default '{}'::jsonb,
  status text not null default 'ready' check (status in ('ready', 'failed', 'deleted')),
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists workspace_backups_org_created_idx
  on public.workspace_backups (organization_id, created_at desc);

alter table public.workspace_backups enable row level security;

drop policy if exists "owners read workspace backups" on public.workspace_backups;
create policy "owners read workspace backups" on public.workspace_backups
  for select to authenticated
  using (
    organization_id = public.current_organization_id()
    and public.is_financier_owner()
  );

revoke all on table public.workspace_backups from public, anon;
grant select on table public.workspace_backups to authenticated;
grant all on table public.workspace_backups to service_role;

-- Restore selected modules from a workspace backup payload (service role only).
-- Replaces live data for those modules; caller should create a pre_restore checkpoint first.
create or replace function public.restore_workspace_backup_json(
  target_org_id uuid,
  payload jsonb,
  module_keys text[] default null,
  actor_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  wanted text[];
  key text;
  finance jsonb;
  cashbook jsonb;
  chit jsonb;
  accounts jsonb;
  company jsonb;
  restored text[] := '{}';
begin
  if coalesce(auth.role(), '') is distinct from 'service_role' then
    raise exception 'Workspace restore requires a verified server call';
  end if;
  if target_org_id is null then
    raise exception 'Organization is required';
  end if;
  if payload is null or payload->>'format' is distinct from 'myfintracker-workspace-backup' then
    raise exception 'Invalid workspace backup payload';
  end if;
  if (payload #>> '{organization,id}')::uuid is distinct from target_org_id then
    raise exception 'Backup organization does not match this workspace';
  end if;

  if module_keys is null or array_length(module_keys, 1) is null then
    select array_agg(k) into wanted
    from jsonb_array_elements_text(coalesce(payload->'moduleKeys', '[]'::jsonb)) as k;
  else
    wanted := module_keys;
  end if;
  if wanted is null or array_length(wanted, 1) is null then
    raise exception 'Backup has no modules to restore';
  end if;

  -- Optional org branding / packs (never touch subscription columns here).
  update public.organizations o
  set
    name = coalesce(nullif(trim(payload #>> '{organization,name}'), ''), o.name),
    feature_packs = coalesce(payload #>'{organization,feature_packs}', o.feature_packs),
    module_overrides = coalesce(payload #>'{organization,module_overrides}', o.module_overrides),
    company_address = coalesce(payload #>> '{organization,company_address}', o.company_address),
    company_phone = coalesce(payload #>> '{organization,company_phone}', o.company_phone),
    company_email = coalesce(payload #>> '{organization,company_email}', o.company_email),
    company_logo_url = coalesce(payload #>> '{organization,company_logo_url}', o.company_logo_url),
    receipt_footer = coalesce(payload #>> '{organization,receipt_footer}', o.receipt_footer),
    receipt_terms = coalesce(payload #>> '{organization,receipt_terms}', o.receipt_terms),
    whatsapp_templates = coalesce(payload #>'{organization,whatsapp_templates}', o.whatsapp_templates),
    reminder_settings = coalesce(payload #>'{organization,reminder_settings}', o.reminder_settings)
  where o.id = target_org_id;

  foreach key in array wanted loop
    if key = 'finance' then
      finance := payload #>'{modules,finance}';
      if finance is null then continue; end if;
      delete from public.payments where organization_id = target_org_id;
      delete from public.rate_changes rc
        using public.finance_accounts fa
        where rc.finance_account_id = fa.id and fa.organization_id = target_org_id;
      delete from public.finance_accounts where organization_id = target_org_id;
      delete from public.customers where organization_id = target_org_id;

      insert into public.customers
      select r.*
      from jsonb_array_elements(coalesce(finance->'customers', '[]'::jsonb)) elem,
           lateral jsonb_populate_record(
             null::public.customers,
             elem || jsonb_build_object('organization_id', target_org_id)
           ) r;
      insert into public.finance_accounts
      select r.*
      from jsonb_array_elements(coalesce(finance->'finance_accounts', '[]'::jsonb)) elem,
           lateral jsonb_populate_record(
             null::public.finance_accounts,
             elem || jsonb_build_object('organization_id', target_org_id)
           ) r;
      insert into public.rate_changes
      select * from jsonb_populate_recordset(null::public.rate_changes, coalesce(finance->'rate_changes', '[]'::jsonb));
      insert into public.payments
      select r.*
      from jsonb_array_elements(coalesce(finance->'payments', '[]'::jsonb)) elem,
           lateral jsonb_populate_record(
             null::public.payments,
             elem || jsonb_build_object('organization_id', target_org_id)
           ) r;
      restored := array_append(restored, 'finance');

    elsif key = 'cashbook' then
      cashbook := payload #>'{modules,cashbook}';
      if cashbook is null then continue; end if;
      delete from public.day_closings where organization_id = target_org_id;
      delete from public.account_transfers where organization_id = target_org_id;
      delete from public.cashbook_entries where organization_id = target_org_id;
      delete from public.ledger_accounts where organization_id = target_org_id;

      -- Explicit columns — never rely on record position / populate_record for NOT NULL org id.
      insert into public.ledger_accounts (
        id, organization_id, account_type, name, bank_account_last4, is_default, is_active, created_at, updated_at
      )
      select
        coalesce((elem->>'id')::uuid, gen_random_uuid()),
        target_org_id,
        elem->>'account_type',
        coalesce(nullif(elem->>'name', ''), 'Account'),
        nullif(elem->>'bank_account_last4', ''),
        coalesce((elem->>'is_default')::boolean, false),
        coalesce((elem->>'is_active')::boolean, true),
        coalesce((elem->>'created_at')::timestamptz, now()),
        coalesce((elem->>'updated_at')::timestamptz, now())
      from jsonb_array_elements(coalesce(cashbook->'ledger_accounts', '[]'::jsonb)) elem;

      insert into public.cashbook_entries
      select r.*
      from jsonb_array_elements(coalesce(cashbook->'cashbook_entries', '[]'::jsonb)) elem,
           lateral jsonb_populate_record(
             null::public.cashbook_entries,
             elem || jsonb_build_object('organization_id', target_org_id)
           ) r;
      insert into public.account_transfers
      select r.*
      from jsonb_array_elements(coalesce(cashbook->'account_transfers', '[]'::jsonb)) elem,
           lateral jsonb_populate_record(
             null::public.account_transfers,
             elem || jsonb_build_object('organization_id', target_org_id)
           ) r;
      insert into public.day_closings
      select r.*
      from jsonb_array_elements(coalesce(cashbook->'day_closings', '[]'::jsonb)) elem,
           lateral jsonb_populate_record(
             null::public.day_closings,
             elem || jsonb_build_object('organization_id', target_org_id)
           ) r;
      restored := array_append(restored, 'cashbook');

    elsif key = 'chit' then
      chit := payload #>'{modules,chit}';
      if chit is null then continue; end if;
      -- Child tables first (best-effort; ignore missing tables on older DBs via exception blocks).
      begin delete from public.chit_live_auction_bids b using public.chit_live_auctions a, public.chit_schemes s
        where b.auction_id = a.id and a.scheme_id = s.id and s.organization_id = target_org_id; exception when undefined_table then null; end;
      begin delete from public.chit_live_auctions a using public.chit_schemes s
        where a.scheme_id = s.id and s.organization_id = target_org_id; exception when undefined_table then null; end;
      begin delete from public.fixed_chit_payments p using public.chit_schemes s
        where p.scheme_id = s.id and s.organization_id = target_org_id; exception when undefined_table then null; end;
      begin delete from public.fixed_chit_lifts l using public.chit_schemes s
        where l.scheme_id = s.id and s.organization_id = target_org_id; exception when undefined_table then null; end;
      begin delete from public.predefined_chit_payments p using public.chit_schemes s
        where p.scheme_id = s.id and s.organization_id = target_org_id; exception when undefined_table then null; end;
      begin delete from public.predefined_chit_schedule p using public.chit_schemes s
        where p.scheme_id = s.id and s.organization_id = target_org_id; exception when undefined_table then null; end;
      begin delete from public.chit_security_deposits d using public.chit_schemes s
        where d.scheme_id = s.id and s.organization_id = target_org_id; exception when undefined_table then null; end;
      -- chit_payouts / chit_installments have cycle_id (+ organization_id), not scheme_id.
      begin delete from public.chit_payouts where organization_id = target_org_id; exception when undefined_table then null; end;
      begin delete from public.chit_installments where organization_id = target_org_id; exception when undefined_table then null; end;
      begin delete from public.chit_bids b using public.chit_cycles c, public.chit_schemes s
        where b.cycle_id = c.id and c.scheme_id = s.id and s.organization_id = target_org_id; exception when undefined_table then null; end;
      begin delete from public.chit_cycles c using public.chit_schemes s
        where c.scheme_id = s.id and s.organization_id = target_org_id; exception when undefined_table then null; end;
      begin delete from public.chit_enrollments e using public.chit_schemes s
        where e.scheme_id = s.id and s.organization_id = target_org_id; exception when undefined_table then null; end;
      delete from public.chit_schemes where organization_id = target_org_id;
      delete from public.chit_members where organization_id = target_org_id;

      insert into public.chit_members
      select r.*
      from jsonb_array_elements(coalesce(chit->'chit_members', '[]'::jsonb)) elem,
           lateral jsonb_populate_record(
             null::public.chit_members,
             elem || jsonb_build_object('organization_id', target_org_id)
           ) r;
      insert into public.chit_schemes
      select r.*
      from jsonb_array_elements(coalesce(chit->'chit_schemes', '[]'::jsonb)) elem,
           lateral jsonb_populate_record(
             null::public.chit_schemes,
             elem || jsonb_build_object('organization_id', target_org_id)
           ) r;
      begin
        insert into public.chit_enrollments
        select r.*
        from jsonb_array_elements(coalesce(chit->'chit_enrollments', '[]'::jsonb)) elem,
             lateral jsonb_populate_record(
               null::public.chit_enrollments,
               elem || jsonb_build_object('organization_id', target_org_id)
             ) r;
      exception when undefined_table then null; end;
      begin
        insert into public.chit_cycles
        select r.*
        from jsonb_array_elements(coalesce(chit->'chit_cycles', '[]'::jsonb)) elem,
             lateral jsonb_populate_record(
               null::public.chit_cycles,
               elem || jsonb_build_object('organization_id', target_org_id)
             ) r;
      exception when undefined_table then null; end;
      begin
        insert into public.chit_bids
        select * from jsonb_populate_recordset(null::public.chit_bids, coalesce(chit->'chit_bids', '[]'::jsonb));
      exception when undefined_table then null; end;
      begin
        insert into public.chit_installments
        select r.*
        from jsonb_array_elements(coalesce(chit->'chit_installments', '[]'::jsonb)) elem,
             lateral jsonb_populate_record(
               null::public.chit_installments,
               elem || jsonb_build_object('organization_id', target_org_id)
             ) r;
      exception when undefined_table then null; end;
      begin
        insert into public.chit_payouts
        select r.*
        from jsonb_array_elements(coalesce(chit->'chit_payouts', '[]'::jsonb)) elem,
             lateral jsonb_populate_record(
               null::public.chit_payouts,
               elem || jsonb_build_object('organization_id', target_org_id)
             ) r;
      exception when undefined_table then null; end;
      begin
        insert into public.chit_security_deposits
        select r.*
        from jsonb_array_elements(coalesce(chit->'chit_security_deposits', '[]'::jsonb)) elem,
             lateral jsonb_populate_record(
               null::public.chit_security_deposits,
               elem || jsonb_build_object('organization_id', target_org_id)
             ) r;
      exception when undefined_table then null; end;
      begin
        insert into public.predefined_chit_schedule
        select r.*
        from jsonb_array_elements(coalesce(chit->'predefined_chit_schedule', '[]'::jsonb)) elem,
             lateral jsonb_populate_record(
               null::public.predefined_chit_schedule,
               elem || jsonb_build_object('organization_id', target_org_id)
             ) r;
      exception when undefined_table then null; end;
      begin
        insert into public.predefined_chit_payments
        select r.*
        from jsonb_array_elements(coalesce(chit->'predefined_chit_payments', '[]'::jsonb)) elem,
             lateral jsonb_populate_record(
               null::public.predefined_chit_payments,
               elem || jsonb_build_object('organization_id', target_org_id)
             ) r;
      exception when undefined_table then null; end;
      begin
        insert into public.fixed_chit_lifts
        select r.*
        from jsonb_array_elements(coalesce(chit->'fixed_chit_lifts', '[]'::jsonb)) elem,
             lateral jsonb_populate_record(
               null::public.fixed_chit_lifts,
               elem || jsonb_build_object('organization_id', target_org_id)
             ) r;
      exception when undefined_table then null; end;
      begin
        insert into public.fixed_chit_payments
        select r.*
        from jsonb_array_elements(coalesce(chit->'fixed_chit_payments', '[]'::jsonb)) elem,
             lateral jsonb_populate_record(
               null::public.fixed_chit_payments,
               elem || jsonb_build_object('organization_id', target_org_id)
             ) r;
      exception when undefined_table then null; end;
      restored := array_append(restored, 'chit');

    elsif key = 'accounts' then
      accounts := payload #>'{modules,accounts}';
      if accounts is null then continue; end if;
      for company in select * from jsonb_array_elements(coalesce(accounts->'companies', '[]'::jsonb))
      loop
        perform public.restore_accounts_company_from_backup(target_org_id, company);
      end loop;
      restored := array_append(restored, 'accounts');
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'restored', to_jsonb(restored),
    'actorId', actor_id
  );
end;
$$;

revoke all on function public.restore_workspace_backup_json(uuid, jsonb, text[], uuid) from public, anon, authenticated;
grant execute on function public.restore_workspace_backup_json(uuid, jsonb, text[], uuid) to service_role;

-- Per-company Accounts restore helper used by restore_workspace_backup_json.
create or replace function public.restore_accounts_company_from_backup(
  target_org_id uuid,
  company_pack jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_company_id uuid;
  company_row jsonb;
begin
  company_row := company_pack->'company';
  if company_row is null or company_row->>'id' is null then
    return;
  end if;
  target_company_id := (company_row->>'id')::uuid;

  -- Ensure company row exists for this org (insert or update).
  insert into public.acc_companies
  select * from jsonb_populate_record(null::public.acc_companies, company_row)
  on conflict (id) do update set
    name = excluded.name,
    books_started_on = excluded.books_started_on,
    gstin = excluded.gstin,
    pan = excluded.pan,
    state_code = excluded.state_code,
    gst_registration = excluded.gst_registration,
    legal_name = excluded.legal_name,
    status = excluded.status,
    is_primary = excluded.is_primary,
    fy_start_month = excluded.fy_start_month
  where public.acc_companies.organization_id = target_org_id;

  if not exists (
    select 1 from public.acc_companies c
    where c.id = target_company_id and c.organization_id = target_org_id
  ) then
    raise exception 'Accounts company does not belong to this workspace';
  end if;

  -- Wipe dependent books for this company (order matters).
  -- Variable must not be named company_id — that makes "where company_id = company_id" ambiguous.
  begin delete from public.acc_gst_lines t where t.company_id = target_company_id; exception when undefined_table then null; end;
  begin
    update public.acc_voucher_item_lines t
      set source_document_line_id = null
      where t.company_id = target_company_id;
  exception when undefined_table then null; when undefined_column then null; end;
  begin delete from public.acc_voucher_item_lines t where t.company_id = target_company_id; exception when undefined_table then null; end;
  begin
    update public.acc_stock_movements t
      set document_id = null, document_line_id = null
      where t.company_id = target_company_id;
  exception when undefined_table then null; when undefined_column then null; end;
  begin delete from public.acc_stock_movements t where t.company_id = target_company_id; exception when undefined_table then null; end;
  begin delete from public.acc_voucher_lines t where t.company_id = target_company_id; exception when undefined_table then null; end;
  begin delete from public.acc_vouchers t where t.company_id = target_company_id; exception when undefined_table then null; end;
  -- Trade docs reference acc_items / acc_parties — clear before items/parties.
  begin
    update public.acc_trade_document_lines t
      set source_line_id = null, item_id = null
      where t.company_id = target_company_id;
  exception when undefined_table then null; when undefined_column then null; end;
  begin delete from public.acc_trade_document_lines t where t.company_id = target_company_id; exception when undefined_table then null; end;
  begin
    update public.acc_trade_documents t set source_document_id = null where t.company_id = target_company_id;
  exception when undefined_table then null; when undefined_column then null; end;
  begin delete from public.acc_trade_documents t where t.company_id = target_company_id; exception when undefined_table then null; end;
  begin delete from public.acc_price_list_rates t where t.company_id = target_company_id; exception when undefined_table then null; end;
  begin
    update public.acc_parties t set price_list_id = null where t.company_id = target_company_id;
  exception when undefined_table then null; when undefined_column then null; end;
  begin delete from public.acc_price_lists t where t.company_id = target_company_id; exception when undefined_table then null; end;
  begin delete from public.acc_items t where t.company_id = target_company_id; exception when undefined_table then null; end;
  begin delete from public.acc_item_categories t where t.company_id = target_company_id; exception when undefined_table then null; end;
  begin delete from public.acc_party_pipeline t where t.company_id = target_company_id; exception when undefined_table then null; end;
  -- Payroll references parties + COA pay accounts.
  begin delete from public.acc_payroll_runs t where t.company_id = target_company_id; exception when undefined_table then null; end;
  begin delete from public.acc_payroll_days t where t.company_id = target_company_id; exception when undefined_table then null; end;
  begin delete from public.acc_payroll_leave t where t.company_id = target_company_id; exception when undefined_table then null; end;
  begin delete from public.acc_payroll_profiles t where t.company_id = target_company_id; exception when undefined_table then null; end;
  begin delete from public.acc_parties t where t.company_id = target_company_id; exception when undefined_table then null; end;
  begin
    update public.acc_coa t set parent_id = null where t.company_id = target_company_id;
  exception when undefined_table then null; when undefined_column then null; end;
  begin delete from public.acc_coa t where t.company_id = target_company_id; exception when undefined_table then null; end;
  begin delete from public.acc_settings t where t.company_id = target_company_id; exception when undefined_table then null; end;
  begin delete from public.acc_document_settings t where t.company_id = target_company_id; exception when undefined_table then null; end;
  begin delete from public.acc_inventory_settings t where t.company_id = target_company_id; exception when undefined_table then null; end;

  if company_pack->'settings' is not null and company_pack->'settings' != 'null'::jsonb then
    begin
      insert into public.acc_settings
      select * from jsonb_populate_record(null::public.acc_settings, company_pack->'settings');
    exception when undefined_table then null; end;
  end if;
  begin
    insert into public.acc_coa
    select * from jsonb_populate_recordset(null::public.acc_coa, coalesce(company_pack->'acc_coa', '[]'::jsonb));
  exception when undefined_table then null; end;
  begin
    insert into public.acc_item_categories
    select * from jsonb_populate_recordset(null::public.acc_item_categories, coalesce(company_pack->'acc_item_categories', '[]'::jsonb));
  exception when undefined_table then null; end;
  begin
    insert into public.acc_items
    select * from jsonb_populate_recordset(null::public.acc_items, coalesce(company_pack->'acc_items', '[]'::jsonb));
  exception when undefined_table then null; end;
  begin
    insert into public.acc_price_lists
    select * from jsonb_populate_recordset(null::public.acc_price_lists, coalesce(company_pack->'acc_price_lists', '[]'::jsonb));
  exception when undefined_table then null; end;
  begin
    insert into public.acc_parties
    select * from jsonb_populate_recordset(null::public.acc_parties, coalesce(company_pack->'acc_parties', '[]'::jsonb));
  exception when undefined_table then null; end;
  begin
    insert into public.acc_price_list_rates
    select * from jsonb_populate_recordset(null::public.acc_price_list_rates, coalesce(company_pack->'acc_price_list_rates', '[]'::jsonb));
  exception when undefined_table then null; end;
  begin
    insert into public.acc_trade_documents
    select * from jsonb_populate_recordset(null::public.acc_trade_documents, coalesce(company_pack->'acc_trade_documents', '[]'::jsonb));
  exception when undefined_table then null; end;
  begin
    insert into public.acc_trade_document_lines
    select * from jsonb_populate_recordset(null::public.acc_trade_document_lines, coalesce(company_pack->'acc_trade_document_lines', '[]'::jsonb));
  exception when undefined_table then null; end;
  begin
    insert into public.acc_vouchers
    select * from jsonb_populate_recordset(null::public.acc_vouchers, coalesce(company_pack->'acc_vouchers', '[]'::jsonb));
  exception when undefined_table then null; end;
  begin
    insert into public.acc_voucher_lines
    select * from jsonb_populate_recordset(null::public.acc_voucher_lines, coalesce(company_pack->'acc_voucher_lines', '[]'::jsonb));
  exception when undefined_table then null; end;
  begin
    insert into public.acc_voucher_item_lines
    select * from jsonb_populate_recordset(null::public.acc_voucher_item_lines, coalesce(company_pack->'acc_voucher_item_lines', '[]'::jsonb));
  exception when undefined_table then null; end;
  begin
    insert into public.acc_stock_movements
    select * from jsonb_populate_recordset(null::public.acc_stock_movements, coalesce(company_pack->'acc_stock_movements', '[]'::jsonb));
  exception when undefined_table then null; end;
  begin
    insert into public.acc_gst_lines
    select * from jsonb_populate_recordset(null::public.acc_gst_lines, coalesce(company_pack->'acc_gst_lines', '[]'::jsonb));
  exception when undefined_table then null; end;
  begin
    insert into public.acc_party_pipeline
    select * from jsonb_populate_recordset(null::public.acc_party_pipeline, coalesce(company_pack->'acc_party_pipeline', '[]'::jsonb));
  exception when undefined_table then null; end;
  begin
    insert into public.acc_payroll_profiles
    select * from jsonb_populate_recordset(null::public.acc_payroll_profiles, coalesce(company_pack->'acc_payroll_profiles', '[]'::jsonb));
  exception when undefined_table then null; end;
  begin
    insert into public.acc_payroll_days
    select * from jsonb_populate_recordset(null::public.acc_payroll_days, coalesce(company_pack->'acc_payroll_days', '[]'::jsonb));
  exception when undefined_table then null; end;
  begin
    insert into public.acc_payroll_leave
    select * from jsonb_populate_recordset(null::public.acc_payroll_leave, coalesce(company_pack->'acc_payroll_leave', '[]'::jsonb));
  exception when undefined_table then null; end;
  begin
    insert into public.acc_payroll_runs
    select * from jsonb_populate_recordset(null::public.acc_payroll_runs, coalesce(company_pack->'acc_payroll_runs', '[]'::jsonb));
  exception when undefined_table then null; end;
  if company_pack->'acc_document_settings' is not null and company_pack->'acc_document_settings' != 'null'::jsonb then
    begin
      insert into public.acc_document_settings
      select * from jsonb_populate_record(null::public.acc_document_settings, company_pack->'acc_document_settings');
    exception when undefined_table then null; end;
  end if;
  if company_pack->'acc_inventory_settings' is not null and company_pack->'acc_inventory_settings' != 'null'::jsonb then
    begin
      insert into public.acc_inventory_settings
      select * from jsonb_populate_record(null::public.acc_inventory_settings, company_pack->'acc_inventory_settings');
    exception when undefined_table then null; end;
  end if;
end;
$$;

revoke all on function public.restore_accounts_company_from_backup(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.restore_accounts_company_from_backup(uuid, jsonb) to service_role;
