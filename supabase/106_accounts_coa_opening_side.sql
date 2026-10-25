-- 106 Fix ambiguous opening_side in acc_update_coa.
-- Apply in the Supabase SQL editor after 105.
-- Symptom when company setup renames Bank, or any ledger is saved:
--   ERROR: column reference "opening_side" is ambiguous

create or replace function public.acc_update_coa(
  input_id uuid,
  input_code text,
  input_name text,
  input_opening numeric default 0,
  input_opening_side text default 'debit',
  input_is_active boolean default true,
  input_company_id uuid default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  org_id uuid;
  active_company_id uuid;
  account public.acc_coa;
  opening_amt numeric;
  next_opening_side text;
begin
  org_id := public.acc_require_owner();
  active_company_id := public.acc_require_company(input_company_id);
  select * into account
    from public.acc_coa c
    where c.id = input_id and c.organization_id = org_id and c.company_id = active_company_id;
  if account.id is null then raise exception 'Account not found'; end if;
  if trim(coalesce(input_code, '')) = '' or trim(coalesce(input_name, '')) = '' then
    raise exception 'Account code and name are required';
  end if;
  if account.is_system and trim(input_code) <> account.code then
    raise exception 'System account codes cannot be changed';
  end if;
  opening_amt := round(coalesce(input_opening, 0), 2);
  if opening_amt < 0 then raise exception 'Opening balance cannot be negative'; end if;
  next_opening_side := case
    when input_opening_side in ('debit', 'credit') then input_opening_side
    else account.opening_side
  end;
  update public.acc_coa as ledger
    set code = trim(input_code),
        name = trim(input_name),
        opening_balance = opening_amt,
        opening_side = next_opening_side,
        is_active = coalesce(input_is_active, true)
    where ledger.id = account.id;
  perform public.acc_write_audit(org_id, 'coa', account.id, 'update',
    jsonb_build_object('code', account.code, 'name', account.name),
    jsonb_build_object('code', trim(input_code), 'name', trim(input_name)),
    null, active_company_id);
end;
$$;

grant execute on function public.acc_update_coa(uuid, text, text, numeric, text, boolean, uuid) to authenticated;

notify pgrst, 'reload schema';
