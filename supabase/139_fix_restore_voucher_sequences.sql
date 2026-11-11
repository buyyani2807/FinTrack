-- Restore left acc_sequences.last_number behind restored sales (SALE-00003 collision).
-- Run in SQL editor. Safe to re-run. Fixes Counter immediately; also future restores.

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


-- Skip voucher numbers that already exist (restore can leave last_number behind).
create or replace function public.acc_next_number(input_company_id uuid, input_type text)
returns text language plpgsql security definer set search_path = public as $$
declare
  seq integer;
  prefix text;
  org_id uuid;
  voucher_no text;
  pad integer;
  attempts integer := 0;
begin
  select organization_id into org_id from public.acc_companies where id = input_company_id;
  if org_id is null then raise exception 'Accounts company not found'; end if;
  prefix := case input_type
    when 'receipt' then 'RCPT'
    when 'payment' then 'PAY'
    when 'contra' then 'CON'
    when 'journal' then 'JNL'
    when 'sales' then 'SALE'
    when 'purchase' then 'PUR'
    when 'credit_note' then 'CN'
    when 'debit_note' then 'DN'
    else 'VCH'
  end;
  select coalesce(max(char_length((regexp_match(v.voucher_number, '(\d+)$'))[1])), 6)
    into pad
  from public.acc_vouchers v
  where v.company_id = input_company_id
    and v.voucher_type = input_type
    and v.voucher_number ~ ('^' || prefix || '-[0-9]+$');
  if pad is null or pad < 1 then pad := 6; end if;

  loop
    attempts := attempts + 1;
    insert into public.acc_sequences(organization_id, company_id, voucher_type, last_number)
    values (org_id, input_company_id, input_type, 1)
    on conflict (company_id, voucher_type)
    do update set last_number = public.acc_sequences.last_number + 1
    returning last_number into seq;
    voucher_no := prefix || '-' || lpad(seq::text, pad, '0');
    exit when not exists (
      select 1 from public.acc_vouchers v
      where v.company_id = input_company_id
        and (
          v.voucher_number = voucher_no
          or (
            v.voucher_number ~ ('^' || prefix || '-[0-9]+$')
            and (regexp_match(v.voucher_number, '(\d+)$'))[1]::bigint = seq
          )
        )
    );
    if attempts > 10000 then
      raise exception 'Could not allocate a unique % voucher number', prefix;
    end if;
  end loop;
  return voucher_no;
end;
$$;

create or replace function public.acc_next_document_number(input_company_id uuid, input_doc_type text)
returns text language plpgsql security definer set search_path = public as $$
declare
  seq integer;
  prefix text;
  org_id uuid;
  doc_no text;
  pad integer;
  attempts integer := 0;
begin
  select organization_id into org_id from public.acc_companies where id = input_company_id;
  if org_id is null then raise exception 'Accounts company not found'; end if;
  prefix := case input_doc_type
    when 'quotation' then 'QT'
    when 'sales_order' then 'SO'
    when 'delivery_challan' then 'DC'
    when 'purchase_order' then 'PO'
    when 'goods_receipt' then 'GRN'
    else 'DOC'
  end;
  select coalesce(max(char_length((regexp_match(d.doc_number, '(\d+)$'))[1])), 5)
    into pad
  from public.acc_trade_documents d
  where d.company_id = input_company_id
    and d.doc_type = input_doc_type
    and d.doc_number ~ ('^' || prefix || '-[0-9]+$');
  if pad is null or pad < 1 then pad := 5; end if;

  loop
    attempts := attempts + 1;
    insert into public.acc_sequences(organization_id, company_id, voucher_type, last_number)
    values (org_id, input_company_id, 'doc_' || input_doc_type, 1)
    on conflict (company_id, voucher_type)
    do update set last_number = public.acc_sequences.last_number + 1
    returning last_number into seq;
    doc_no := prefix || '-' || lpad(seq::text, pad, '0');
    exit when not exists (
      select 1 from public.acc_trade_documents d
      where d.company_id = input_company_id
        and d.doc_type = input_doc_type
        and (
          d.doc_number = doc_no
          or (
            d.doc_number ~ ('^' || prefix || '-[0-9]+$')
            and (regexp_match(d.doc_number, '(\d+)$'))[1]::bigint = seq
          )
        )
    );
    if attempts > 10000 then
      raise exception 'Could not allocate a unique % document number', prefix;
    end if;
  end loop;
  return doc_no;
end;
$$;


-- Unstick Counter now: bump last_number to the highest live voucher/doc number.
select public._ws_backup_resync_acc_sequences(id) from public.acc_companies;
