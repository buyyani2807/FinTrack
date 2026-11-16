-- 151: Workspace backup and restore cover the payroll tables added in 149 and 150.
-- Safe to re-run. Apply after 150. Deploy the API together with it (api/_lib/workspaceBackup.js
-- now writes these tables into each backup).
--
-- Before this, restoring an Accounts company deleted its employees and put them back, and the
-- delete cascaded to advances, staff details, pay history, settlements, punches, leave requests
-- and staff logins, none of which were in the backup. They were lost.
--
-- In the backup file, and restored from it:
--   acc_payroll_holidays, acc_payroll_staff, acc_payroll_revisions, acc_payroll_advances,
--   acc_payroll_advance_recoveries, acc_payroll_settlements, acc_payroll_punches,
--   acc_payroll_leave_requests
--   (acc_payroll_profiles and acc_payroll_days were already covered; their new columns come along.)
--
-- Deliberately NOT in the backup file, but kept across a restore:
--   acc_staff_portal_credentials   PIN hashes. A 6-digit PIN hash in a downloadable file could be guessed offline.
--   acc_staff_portal_sessions      sign-in sessions.
--   acc_payroll_punch_photos       selfies; large, and removed after 90 days anyway.
-- A restore holds these aside and puts them back for every employee and punch that exists afterwards.
-- Restoring into a workspace that never had them leaves staff logins to be issued again.
--
-- The function below is the 139 version with those additions and nothing else changed.

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
    'acc_payroll_punch_photos',
    'acc_payroll_punches',
    'acc_payroll_leave_requests',
    'acc_payroll_settlements',
    'acc_payroll_revisions',
    'acc_payroll_staff',
    'acc_payroll_advance_recoveries',
    'acc_payroll_advances',
    'acc_payroll_holidays',
    'acc_staff_portal_credentials',
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
  keep_logins jsonb := '[]'::jsonb;
  keep_sessions jsonb := '[]'::jsonb;
  keep_photos jsonb := '[]'::jsonb;
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

  -- Staff logins, their sessions and punch selfies are never written to a backup file
  -- (PIN hashes and photos stay in the database). Deleting the company's employees below
  -- would cascade them away, so hold them here and put them back once the employees are restored.
  if public._ws_backup_table_exists('acc_staff_portal_credentials') then
    execute 'select coalesce(jsonb_agg(to_jsonb(c)), ''[]''::jsonb) from public.acc_staff_portal_credentials c where c.company_id = $1'
      into keep_logins using target_company_id;
    execute 'select coalesce(jsonb_agg(to_jsonb(s)), ''[]''::jsonb)
               from public.acc_staff_portal_sessions s
               join public.acc_staff_portal_credentials c on c.party_id = s.party_id
              where c.company_id = $1 and s.expires_at > now()'
      into keep_sessions using target_company_id;
  end if;
  if public._ws_backup_table_exists('acc_payroll_punch_photos') then
    execute 'select coalesce(jsonb_agg(to_jsonb(f)), ''[]''::jsonb) from public.acc_payroll_punch_photos f where f.company_id = $1'
      into keep_photos using target_company_id;
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

  -- Payroll phase 1 and 3 (149, 150). A backup taken before these existed has none of these keys,
  -- and each call below then does nothing.
  perform public._ws_backup_insert_rows('acc_payroll_holidays', company_pack->'acc_payroll_holidays', array[]::text[]);
  perform public._ws_backup_insert_rows('acc_payroll_staff', company_pack->'acc_payroll_staff', array[]::text[]);
  perform public._ws_backup_insert_rows('acc_payroll_revisions', company_pack->'acc_payroll_revisions', array[]::text[]);
  perform public._ws_backup_insert_rows('acc_payroll_advances', company_pack->'acc_payroll_advances', array['voucher_id']);
  perform public._ws_backup_reattach_fk('acc_payroll_advances', 'voucher_id', 'acc_vouchers', company_pack->'acc_payroll_advances');
  perform public._ws_backup_insert_rows('acc_payroll_advance_recoveries', company_pack->'acc_payroll_advance_recoveries', array[]::text[]);
  perform public._ws_backup_insert_rows('acc_payroll_settlements', company_pack->'acc_payroll_settlements', array['voucher_id']);
  perform public._ws_backup_reattach_fk('acc_payroll_settlements', 'voucher_id', 'acc_vouchers', company_pack->'acc_payroll_settlements');
  perform public._ws_backup_insert_rows('acc_payroll_punches', company_pack->'acc_payroll_punches', array[]::text[]);
  perform public._ws_backup_insert_rows('acc_payroll_leave_requests', company_pack->'acc_payroll_leave_requests', array[]::text[]);
  -- Held back above. A login or photo whose employee or punch is not in the backup is dropped by its foreign key.
  perform public._ws_backup_insert_rows('acc_staff_portal_credentials', keep_logins, array[]::text[]);
  perform public._ws_backup_insert_rows('acc_staff_portal_sessions', keep_sessions, array[]::text[]);
  perform public._ws_backup_insert_rows('acc_payroll_punch_photos', keep_photos, array[]::text[]);

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

notify pgrst, 'reload schema';
