-- Stamp company/org on Accounts restore rows; disable stock/voucher triggers;
-- so sales in a safety checkpoint come back. Run in SQL editor.

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
end;
$$;

revoke all on function public.restore_accounts_company_from_backup(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.restore_accounts_company_from_backup(uuid, jsonb) to service_role;
