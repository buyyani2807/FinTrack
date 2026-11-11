-- Insert acc_parties without price_list_id, then attach only if the list exists.
-- Run in Supabase SQL editor (staging/production).

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
  -- Catch undefined_column: some tables (e.g. acc_settings) are org-scoped and have no company_id.
  begin delete from public.acc_gst_lines t where t.company_id = target_company_id; exception when undefined_table then null; when undefined_column then null; end;
  begin
    update public.acc_voucher_item_lines t
      set source_document_line_id = null
      where t.company_id = target_company_id;
  exception when undefined_table then null; when undefined_column then null; end;
  begin delete from public.acc_voucher_item_lines t where t.company_id = target_company_id; exception when undefined_table then null; when undefined_column then null; end;
  begin
    update public.acc_stock_movements t
      set document_id = null, document_line_id = null
      where t.company_id = target_company_id;
  exception when undefined_table then null; when undefined_column then null; end;
  begin delete from public.acc_stock_movements t where t.company_id = target_company_id; exception when undefined_table then null; when undefined_column then null; end;
  begin delete from public.acc_voucher_lines t where t.company_id = target_company_id; exception when undefined_table then null; when undefined_column then null; end;
  begin delete from public.acc_vouchers t where t.company_id = target_company_id; exception when undefined_table then null; when undefined_column then null; end;
  -- Trade docs reference acc_items / acc_parties — clear before items/parties.
  begin
    update public.acc_trade_document_lines t
      set source_line_id = null, item_id = null
      where t.company_id = target_company_id;
  exception when undefined_table then null; when undefined_column then null; end;
  begin delete from public.acc_trade_document_lines t where t.company_id = target_company_id; exception when undefined_table then null; when undefined_column then null; end;
  begin
    update public.acc_trade_documents t set source_document_id = null where t.company_id = target_company_id;
  exception when undefined_table then null; when undefined_column then null; end;
  begin delete from public.acc_trade_documents t where t.company_id = target_company_id; exception when undefined_table then null; when undefined_column then null; end;
  begin delete from public.acc_price_list_rates t where t.company_id = target_company_id; exception when undefined_table then null; when undefined_column then null; end;
  begin
    update public.acc_parties t set price_list_id = null where t.company_id = target_company_id;
  exception when undefined_table then null; when undefined_column then null; end;
  begin delete from public.acc_price_lists t where t.company_id = target_company_id; exception when undefined_table then null; when undefined_column then null; end;
  begin delete from public.acc_items t where t.company_id = target_company_id; exception when undefined_table then null; when undefined_column then null; end;
  begin delete from public.acc_item_categories t where t.company_id = target_company_id; exception when undefined_table then null; when undefined_column then null; end;
  begin delete from public.acc_party_pipeline t where t.company_id = target_company_id; exception when undefined_table then null; when undefined_column then null; end;
  -- Payroll references parties + COA pay accounts.
  begin delete from public.acc_payroll_runs t where t.company_id = target_company_id; exception when undefined_table then null; when undefined_column then null; end;
  begin delete from public.acc_payroll_days t where t.company_id = target_company_id; exception when undefined_table then null; when undefined_column then null; end;
  begin delete from public.acc_payroll_leave t where t.company_id = target_company_id; exception when undefined_table then null; when undefined_column then null; end;
  begin delete from public.acc_payroll_profiles t where t.company_id = target_company_id; exception when undefined_table then null; when undefined_column then null; end;
  begin delete from public.acc_parties t where t.company_id = target_company_id; exception when undefined_table then null; when undefined_column then null; end;
  begin
    update public.acc_coa t set parent_id = null where t.company_id = target_company_id;
  exception when undefined_table then null; when undefined_column then null; end;
  begin delete from public.acc_coa t where t.company_id = target_company_id; exception when undefined_table then null; when undefined_column then null; end;
  -- acc_settings is org-scoped (no company_id).
  begin delete from public.acc_settings s where s.organization_id = target_org_id; exception when undefined_table then null; when undefined_column then null; end;
  begin delete from public.acc_document_settings t where t.company_id = target_company_id; exception when undefined_table then null; when undefined_column then null; end;
  begin delete from public.acc_inventory_settings t where t.company_id = target_company_id; exception when undefined_table then null; when undefined_column then null; end;

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
  -- Older backups include party.price_list_id but not the price list rows.
  begin
    insert into public.acc_parties
    select r.*
    from jsonb_array_elements(coalesce(company_pack->'acc_parties', '[]'::jsonb)) elem,
         lateral jsonb_populate_record(
           null::public.acc_parties,
           elem || jsonb_build_object('price_list_id', null)
         ) r;
    update public.acc_parties p
    set price_list_id = (elem->>'price_list_id')::uuid
    from jsonb_array_elements(coalesce(company_pack->'acc_parties', '[]'::jsonb)) elem
    where p.id = (elem->>'id')::uuid
      and nullif(elem->>'price_list_id', '') is not null
      and exists (
        select 1 from public.acc_price_lists pl
        where pl.id = (elem->>'price_list_id')::uuid
      );
  exception when undefined_table then null; when undefined_column then null; end;
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
