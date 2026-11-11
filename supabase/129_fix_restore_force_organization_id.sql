-- Force organization_id on finance/cashbook/chit restore inserts.
-- Run in Supabase SQL editor after 126-128.

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

      -- Force organization_id: populate_recordset can leave it null if the key is missing.
      insert into public.ledger_accounts
      select r.*
      from jsonb_array_elements(coalesce(cashbook->'ledger_accounts', '[]'::jsonb)) elem,
           lateral jsonb_populate_record(
             null::public.ledger_accounts,
             elem || jsonb_build_object('organization_id', target_org_id)
           ) r;
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
