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

-- Disable cashbook-sync triggers while restoring snapshots (they already include cashbook rows).
create or replace function public._ws_backup_toggle_data_triggers(enable boolean)
returns void
language plpgsql
as $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'chit_installments',
    'fixed_chit_payments',
    'predefined_chit_payments',
    'fixed_chit_lifts',
    'predefined_chit_schedule',
    'chit_cycles',
    'chit_payouts',
    'payments',
    'finance_accounts',
    'acc_vouchers',
    'acc_voucher_lines',
    'acc_voucher_item_lines',
    'acc_gst_lines',
    'acc_stock_movements',
    'acc_trade_documents',
    'acc_trade_document_lines',
    'acc_items',
    'acc_parties',
    'acc_coa'
  ]
  loop
    if to_regclass('public.' || tbl) is null then continue; end if;
    begin
      execute format(
        'alter table public.%I %s trigger user',
        tbl,
        case when enable then 'enable' else 'disable' end
      );
    exception
      when insufficient_privilege then null;
      when undefined_object then null;
      when undefined_table then null;
    end;
  end loop;
end;
$$;

revoke all on function public._ws_backup_toggle_data_triggers(boolean) from public, anon, authenticated;
grant execute on function public._ws_backup_toggle_data_triggers(boolean) to service_role;

create or replace function public.accounts_ensure_default_ledgers(input_org_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if input_org_id is null then return; end if;
  if not exists (select 1 from public.ledger_accounts where organization_id = input_org_id and account_type = 'cash') then
    insert into public.ledger_accounts(organization_id, account_type, name, is_default)
    values (input_org_id, 'cash', 'Cash', true);
  end if;
  if not exists (select 1 from public.ledger_accounts where organization_id = input_org_id and account_type = 'upi') then
    insert into public.ledger_accounts(organization_id, account_type, name, is_default)
    values (input_org_id, 'upi', 'UPI', true);
  end if;
  if not exists (select 1 from public.ledger_accounts where organization_id = input_org_id and account_type = 'bank') then
    insert into public.ledger_accounts(organization_id, account_type, name, is_default)
    values (input_org_id, 'bank', 'Bank', true);
  end if;
end;
$$;

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

  -- Chit/finance cashbook sync triggers use current_organization_id(), which is null
  -- for service_role restore and would insert ledger_accounts with a null org.
  perform public._ws_backup_toggle_data_triggers(false);

  begin
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

  perform public._ws_backup_toggle_data_triggers(true);
  return jsonb_build_object(
    'ok', true,
    'restored', to_jsonb(restored),
    'actorId', actor_id
  );
  exception when others then
    perform public._ws_backup_toggle_data_triggers(true);
    raise;
  end;
end;
$$;

revoke all on function public.restore_workspace_backup_json(uuid, jsonb, text[], uuid) from public, anon, authenticated;
grant execute on function public.restore_workspace_backup_json(uuid, jsonb, text[], uuid) to service_role;

create or replace function public._ws_backup_table_exists(tbl text)
returns boolean
language sql
stable
as $$
  select to_regclass('public.' || tbl) is not null;
$$;

create or replace function public._ws_backup_has_column(tbl text, col text)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = tbl
      and column_name = col
  );
$$;

create or replace function public._ws_backup_null_company_col(tbl text, col text, target_company uuid)
returns void
language plpgsql
as $$
begin
  if not public._ws_backup_table_exists(tbl) then return; end if;
  if not public._ws_backup_has_column(tbl, col) then return; end if;
  if not public._ws_backup_has_column(tbl, 'company_id') then return; end if;
  execute format('update public.%I set %I = null where company_id = $1', tbl, col)
    using target_company;
exception
  when undefined_table then null;
  when undefined_column then null;
end;
$$;

create or replace function public._ws_backup_delete_company(tbl text, target_company uuid, target_org uuid)
returns void
language plpgsql
as $$
begin
  if not public._ws_backup_table_exists(tbl) then return; end if;
  if public._ws_backup_has_column(tbl, 'company_id') then
    execute format('delete from public.%I where company_id = $1', tbl) using target_company;
  elsif tbl = 'acc_settings' and public._ws_backup_has_column(tbl, 'organization_id') then
    execute format('delete from public.%I where organization_id = $1', tbl) using target_org;
  end if;
exception
  when undefined_table then null;
  when undefined_column then null;
end;
$$;

create or replace function public._ws_backup_insert_rows(tbl text, rows jsonb, drop_keys text[] default '{}')
returns void
language plpgsql
as $$
declare
  elem jsonb;
  cleaned jsonb;
  k text;
  org_stamp uuid;
  company_stamp uuid;
begin
  if not public._ws_backup_table_exists(tbl) then return; end if;
  if rows is null or jsonb_typeof(rows) <> 'array' then return; end if;
  begin org_stamp := nullif(current_setting('myfin.backup_org', true), '')::uuid; exception when others then org_stamp := null; end;
  begin company_stamp := nullif(current_setting('myfin.backup_company', true), '')::uuid; exception when others then company_stamp := null; end;
  for elem in select value from jsonb_array_elements(rows)
  loop
    cleaned := elem;
    if drop_keys is not null then
      foreach k in array drop_keys loop
        cleaned := cleaned - k;
      end loop;
    end if;
    if org_stamp is not null and public._ws_backup_has_column(tbl, 'organization_id') then
      cleaned := cleaned || jsonb_build_object('organization_id', org_stamp);
    end if;
    if company_stamp is not null and public._ws_backup_has_column(tbl, 'company_id') then
      cleaned := cleaned || jsonb_build_object('company_id', company_stamp);
    end if;
    begin
      execute format(
        'insert into public.%I select * from jsonb_populate_record(null::public.%I, $1)',
        tbl, tbl
      ) using cleaned;
    exception
      when unique_violation then null;
      when not_null_violation then null;
      when foreign_key_violation then null;
      when undefined_table then null;
      when undefined_column then null;
    end;
  end loop;
end;
$$;

create or replace function public._ws_backup_insert_one(tbl text, row_json jsonb)
returns void
language plpgsql
as $$
begin
  if not public._ws_backup_table_exists(tbl) then return; end if;
  if row_json is null or row_json = 'null'::jsonb then return; end if;
  begin
    execute format(
      'insert into public.%I select * from jsonb_populate_record(null::public.%I, $1)',
      tbl, tbl
    ) using row_json;
  exception
    when unique_violation then null;
    when not_null_violation then null;
    when foreign_key_violation then null;
    when undefined_table then null;
    when undefined_column then null;
  end;
end;
$$;

create or replace function public._ws_backup_reattach_fk(tbl text, fk_col text, ref_tbl text, rows jsonb)
returns void
language plpgsql
as $$
declare
  elem jsonb;
  rid uuid;
  fk uuid;
begin
  if not public._ws_backup_table_exists(tbl) then return; end if;
  if not public._ws_backup_table_exists(ref_tbl) then return; end if;
  if not public._ws_backup_has_column(tbl, fk_col) then return; end if;
  if rows is null or jsonb_typeof(rows) <> 'array' then return; end if;
  for elem in select value from jsonb_array_elements(rows)
  loop
    begin
      rid := nullif(elem->>'id', '')::uuid;
      fk := nullif(elem->>fk_col, '')::uuid;
    exception when invalid_text_representation then
      continue;
    end;
    if rid is null or fk is null then continue; end if;
    begin
      execute format(
        'update public.%I t set %I = $1 where t.id = $2 and exists (select 1 from public.%I r where r.id = $1)',
        tbl, fk_col, ref_tbl
      ) using fk, rid;
    exception
      when foreign_key_violation then null;
      when undefined_table then null;
      when undefined_column then null;
    end;
  end loop;
end;
$$;

revoke all on function public._ws_backup_table_exists(text) from public, anon, authenticated;
revoke all on function public._ws_backup_has_column(text, text) from public, anon, authenticated;
revoke all on function public._ws_backup_null_company_col(text, text, uuid) from public, anon, authenticated;
revoke all on function public._ws_backup_delete_company(text, uuid, uuid) from public, anon, authenticated;
revoke all on function public._ws_backup_insert_rows(text, jsonb, text[]) from public, anon, authenticated;
revoke all on function public._ws_backup_insert_one(text, jsonb) from public, anon, authenticated;
revoke all on function public._ws_backup_reattach_fk(text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public._ws_backup_table_exists(text) to service_role;
grant execute on function public._ws_backup_has_column(text, text) to service_role;
grant execute on function public._ws_backup_null_company_col(text, text, uuid) to service_role;
grant execute on function public._ws_backup_delete_company(text, uuid, uuid) to service_role;
grant execute on function public._ws_backup_insert_rows(text, jsonb, text[]) to service_role;
grant execute on function public._ws_backup_insert_one(text, jsonb) to service_role;
grant execute on function public._ws_backup_reattach_fk(text, text, text, jsonb) to service_role;

-- After restore, last_number can lag restored vouchers (silent sequence skip / mixed pad).
create or replace function public._ws_backup_resync_acc_sequences(target_company_id uuid)
returns void
language plpgsql
as $$
declare
  org_id uuid;
  rec record;
begin
  select organization_id into org_id from public.acc_companies where id = target_company_id;
  if org_id is null then return; end if;

  for rec in
    select v.voucher_type,
           max((regexp_match(v.voucher_number, '(\d+)$'))[1]::int) as max_n
    from public.acc_vouchers v
    where v.company_id = target_company_id
      and v.voucher_number ~ '[0-9]+$'
    group by v.voucher_type
  loop
    if rec.max_n is null then continue; end if;
    insert into public.acc_sequences(organization_id, company_id, voucher_type, last_number)
    values (org_id, target_company_id, rec.voucher_type, rec.max_n)
    on conflict (company_id, voucher_type)
    do update set last_number = greatest(public.acc_sequences.last_number, excluded.last_number);
  end loop;

  if to_regclass('public.acc_trade_documents') is not null then
    for rec in
      select ('doc_' || d.doc_type) as voucher_type,
             max((regexp_match(d.doc_number, '(\d+)$'))[1]::int) as max_n
      from public.acc_trade_documents d
      where d.company_id = target_company_id
        and d.doc_number ~ '[0-9]+$'
      group by d.doc_type
    loop
      if rec.max_n is null then continue; end if;
      insert into public.acc_sequences(organization_id, company_id, voucher_type, last_number)
      values (org_id, target_company_id, rec.voucher_type, rec.max_n)
      on conflict (company_id, voucher_type)
      do update set last_number = greatest(public.acc_sequences.last_number, excluded.last_number);
    end loop;
  end if;
end;
$$;

revoke all on function public._ws_backup_resync_acc_sequences(uuid) from public, anon, authenticated;
grant execute on function public._ws_backup_resync_acc_sequences(uuid) to service_role;

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
  wipe_tables text[] := array[
    'acc_gst_lines',
    'acc_voucher_item_lines',
    'acc_stock_movements',
    'acc_voucher_attachments',
    'acc_einvoice_payloads',
    'acc_voucher_lines',
    'acc_vouchers',
    'acc_trade_document_lines',
    'acc_trade_documents',
    'acc_price_list_rates',
    'acc_price_lists',
    'acc_payroll_runs',
    'acc_payroll_days',
    'acc_payroll_leave',
    'acc_payroll_profiles',
    'acc_party_pipeline',
    'acc_collection_route_stops',
    'acc_collection_routes',
    'acc_compliance_filings',
    'acc_recurring_templates',
    'acc_counter_day_closes',
    'acc_bank_statement_lines',
    'acc_bank_statements',
    'acc_period_locks',
    'acc_items',
    'acc_item_categories',
    'acc_parties',
    'acc_coa',
    'acc_sequences',
    'acc_document_settings',
    'acc_inventory_settings',
    'acc_settings'
  ];
  tbl text;
  remaining integer;
  pass integer;
begin
  company_row := company_pack->'company';
  if company_row is null or company_row->>'id' is null then
    return;
  end if;
  target_company_id := (company_row->>'id')::uuid;
  perform set_config('myfin.backup_org', target_org_id::text, true);
  perform set_config('myfin.backup_company', target_company_id::text, true);

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

  -- Break self-FKs so deletes can proceed.
  perform public._ws_backup_null_company_col('acc_coa', 'parent_id', target_company_id);
  perform public._ws_backup_null_company_col('acc_item_categories', 'parent_id', target_company_id);
  perform public._ws_backup_null_company_col('acc_parties', 'price_list_id', target_company_id);
  perform public._ws_backup_null_company_col('acc_items', 'category_id', target_company_id);
  perform public._ws_backup_null_company_col('acc_voucher_item_lines', 'source_document_line_id', target_company_id);
  perform public._ws_backup_null_company_col('acc_voucher_item_lines', 'item_id', target_company_id);
  perform public._ws_backup_null_company_col('acc_trade_document_lines', 'source_line_id', target_company_id);
  perform public._ws_backup_null_company_col('acc_trade_document_lines', 'item_id', target_company_id);
  perform public._ws_backup_null_company_col('acc_trade_documents', 'source_document_id', target_company_id);
  perform public._ws_backup_null_company_col('acc_stock_movements', 'document_id', target_company_id);
  perform public._ws_backup_null_company_col('acc_stock_movements', 'document_line_id', target_company_id);
  perform public._ws_backup_null_company_col('acc_stock_movements', 'voucher_id', target_company_id);
  perform public._ws_backup_null_company_col('acc_stock_movements', 'voucher_item_line_id', target_company_id);
  perform public._ws_backup_null_company_col('acc_vouchers', 'reversed_voucher_id', target_company_id);
  perform public._ws_backup_null_company_col('acc_vouchers', 'original_voucher_id', target_company_id);
  perform public._ws_backup_null_company_col('acc_vouchers', 'party_id', target_company_id);
  perform public._ws_backup_null_company_col('acc_voucher_lines', 'party_id', target_company_id);
  perform public._ws_backup_null_company_col('acc_payroll_runs', 'pay_account_id', target_company_id);
  perform public._ws_backup_null_company_col('acc_recurring_templates', 'party_id', target_company_id);

  for pass in 1..30 loop
    remaining := 0;
    foreach tbl in array wipe_tables loop
      begin
        perform public._ws_backup_delete_company(tbl, target_company_id, target_org_id);
      exception
        when foreign_key_violation then remaining := remaining + 1;
      end;
    end loop;
    exit when remaining = 0;
  end loop;

  -- Insert parents first. Optional FKs are dropped, then reattached if the parent exists.
  perform public._ws_backup_insert_one('acc_settings', company_pack->'settings');
  perform public._ws_backup_insert_one('acc_document_settings', company_pack->'acc_document_settings');
  perform public._ws_backup_insert_one('acc_inventory_settings', company_pack->'acc_inventory_settings');

  perform public._ws_backup_insert_rows('acc_coa', company_pack->'acc_coa', array['parent_id']);
  perform public._ws_backup_reattach_fk('acc_coa', 'parent_id', 'acc_coa', company_pack->'acc_coa');

  perform public._ws_backup_insert_rows('acc_item_categories', company_pack->'acc_item_categories', array['parent_id']);
  perform public._ws_backup_reattach_fk('acc_item_categories', 'parent_id', 'acc_item_categories', company_pack->'acc_item_categories');

  perform public._ws_backup_insert_rows('acc_items', company_pack->'acc_items', array['category_id']);
  perform public._ws_backup_reattach_fk('acc_items', 'category_id', 'acc_item_categories', company_pack->'acc_items');

  perform public._ws_backup_insert_rows('acc_price_lists', company_pack->'acc_price_lists', array[]::text[]);
  perform public._ws_backup_insert_rows('acc_parties', company_pack->'acc_parties', array['price_list_id']);
  perform public._ws_backup_reattach_fk('acc_parties', 'price_list_id', 'acc_price_lists', company_pack->'acc_parties');
  perform public._ws_backup_insert_rows('acc_price_list_rates', company_pack->'acc_price_list_rates', array[]::text[]);

  perform public._ws_backup_insert_rows('acc_trade_documents', company_pack->'acc_trade_documents', array['source_document_id']);
  perform public._ws_backup_reattach_fk('acc_trade_documents', 'source_document_id', 'acc_trade_documents', company_pack->'acc_trade_documents');
  perform public._ws_backup_insert_rows('acc_trade_document_lines', company_pack->'acc_trade_document_lines', array['item_id', 'source_line_id']);
  perform public._ws_backup_reattach_fk('acc_trade_document_lines', 'item_id', 'acc_items', company_pack->'acc_trade_document_lines');
  perform public._ws_backup_reattach_fk('acc_trade_document_lines', 'source_line_id', 'acc_trade_document_lines', company_pack->'acc_trade_document_lines');

  perform public._ws_backup_insert_rows(
    'acc_vouchers',
    company_pack->'acc_vouchers',
    array['party_id', 'reversed_voucher_id', 'original_voucher_id']
  );
  perform public._ws_backup_reattach_fk('acc_vouchers', 'party_id', 'acc_parties', company_pack->'acc_vouchers');
  perform public._ws_backup_reattach_fk('acc_vouchers', 'reversed_voucher_id', 'acc_vouchers', company_pack->'acc_vouchers');
  perform public._ws_backup_reattach_fk('acc_vouchers', 'original_voucher_id', 'acc_vouchers', company_pack->'acc_vouchers');

  perform public._ws_backup_insert_rows('acc_voucher_lines', company_pack->'acc_voucher_lines', array['party_id']);
  perform public._ws_backup_reattach_fk('acc_voucher_lines', 'party_id', 'acc_parties', company_pack->'acc_voucher_lines');

  perform public._ws_backup_insert_rows(
    'acc_voucher_item_lines',
    company_pack->'acc_voucher_item_lines',
    array['item_id', 'source_document_line_id']
  );
  perform public._ws_backup_reattach_fk('acc_voucher_item_lines', 'item_id', 'acc_items', company_pack->'acc_voucher_item_lines');
  perform public._ws_backup_reattach_fk(
    'acc_voucher_item_lines',
    'source_document_line_id',
    'acc_trade_document_lines',
    company_pack->'acc_voucher_item_lines'
  );

  perform public._ws_backup_insert_rows(
    'acc_stock_movements',
    company_pack->'acc_stock_movements',
    array['voucher_id', 'voucher_item_line_id', 'document_id', 'document_line_id']
  );
  perform public._ws_backup_reattach_fk('acc_stock_movements', 'voucher_id', 'acc_vouchers', company_pack->'acc_stock_movements');
  perform public._ws_backup_reattach_fk('acc_stock_movements', 'voucher_item_line_id', 'acc_voucher_item_lines', company_pack->'acc_stock_movements');
  perform public._ws_backup_reattach_fk('acc_stock_movements', 'document_id', 'acc_trade_documents', company_pack->'acc_stock_movements');
  perform public._ws_backup_reattach_fk('acc_stock_movements', 'document_line_id', 'acc_trade_document_lines', company_pack->'acc_stock_movements');

  perform public._ws_backup_insert_rows('acc_gst_lines', company_pack->'acc_gst_lines', array[]::text[]);
  perform public._ws_backup_insert_rows('acc_party_pipeline', company_pack->'acc_party_pipeline', array[]::text[]);
  perform public._ws_backup_insert_rows('acc_payroll_profiles', company_pack->'acc_payroll_profiles', array[]::text[]);
  perform public._ws_backup_insert_rows('acc_payroll_days', company_pack->'acc_payroll_days', array[]::text[]);
  perform public._ws_backup_insert_rows('acc_payroll_leave', company_pack->'acc_payroll_leave', array[]::text[]);
  perform public._ws_backup_insert_rows('acc_payroll_runs', company_pack->'acc_payroll_runs', array['pay_account_id']);
  perform public._ws_backup_reattach_fk('acc_payroll_runs', 'pay_account_id', 'acc_coa', company_pack->'acc_payroll_runs');

  perform public._ws_backup_insert_rows('acc_sequences', company_pack->'acc_sequences', array[]::text[]);
  perform public._ws_backup_insert_rows('acc_voucher_attachments', company_pack->'acc_voucher_attachments', array[]::text[]);
  perform public._ws_backup_insert_rows('acc_period_locks', company_pack->'acc_period_locks', array[]::text[]);
  perform public._ws_backup_insert_rows('acc_recurring_templates', company_pack->'acc_recurring_templates', array['party_id']);
  perform public._ws_backup_reattach_fk('acc_recurring_templates', 'party_id', 'acc_parties', company_pack->'acc_recurring_templates');
  perform public._ws_backup_insert_rows('acc_collection_routes', company_pack->'acc_collection_routes', array[]::text[]);
  perform public._ws_backup_insert_rows('acc_collection_route_stops', company_pack->'acc_collection_route_stops', array[]::text[]);
  perform public._ws_backup_insert_rows('acc_compliance_filings', company_pack->'acc_compliance_filings', array[]::text[]);
  perform public._ws_backup_insert_rows('acc_counter_day_closes', company_pack->'acc_counter_day_closes', array[]::text[]);
  perform public._ws_backup_insert_rows('acc_bank_statements', company_pack->'acc_bank_statements', array[]::text[]);
  perform public._ws_backup_insert_rows('acc_bank_statement_lines', company_pack->'acc_bank_statement_lines', array['matched_voucher_line_id']);
  perform public._ws_backup_reattach_fk(
    'acc_bank_statement_lines',
    'matched_voucher_line_id',
    'acc_voucher_lines',
    company_pack->'acc_bank_statement_lines'
  );

  perform public._ws_backup_resync_acc_sequences(target_company_id);
end;
$$;

revoke all on function public.restore_accounts_company_from_backup(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.restore_accounts_company_from_backup(uuid, jsonb) to service_role;
