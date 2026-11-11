-- Fix ambiguous company_id in Accounts restore helper.
-- Run in Supabase SQL editor after 126/127.

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
  begin delete from public.acc_voucher_item_lines t where t.company_id = target_company_id; exception when undefined_table then null; end;
  begin delete from public.acc_stock_movements t where t.company_id = target_company_id; exception when undefined_table then null; end;
  begin delete from public.acc_voucher_lines t where t.company_id = target_company_id; exception when undefined_table then null; end;
  begin delete from public.acc_vouchers t where t.company_id = target_company_id; exception when undefined_table then null; end;
  begin delete from public.acc_items t where t.company_id = target_company_id; exception when undefined_table then null; end;
  begin delete from public.acc_item_categories t where t.company_id = target_company_id; exception when undefined_table then null; end;
  begin delete from public.acc_parties t where t.company_id = target_company_id; exception when undefined_table then null; end;
  begin delete from public.acc_coa t where t.company_id = target_company_id; exception when undefined_table then null; end;
  begin delete from public.acc_settings t where t.company_id = target_company_id; exception when undefined_table then null; end;

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
    insert into public.acc_parties
    select * from jsonb_populate_recordset(null::public.acc_parties, coalesce(company_pack->'acc_parties', '[]'::jsonb));
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
end;
$$;

revoke all on function public.restore_accounts_company_from_backup(uuid, jsonb) from public, anon, authenticated;
