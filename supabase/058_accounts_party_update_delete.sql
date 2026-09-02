-- FinTrack Accounts: update, deactivate, and safe-delete parties.
-- Run AFTER 057_accounts_post_date_and_line_checks.sql.
-- Does not change voucher posting, ledger math, or Daily / Monthly / Chit / Cashbook.

create or replace function public.acc_party_is_used(input_org_id uuid, input_party_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.acc_vouchers
    where organization_id = input_org_id and party_id = input_party_id
  ) or exists (
    select 1 from public.acc_voucher_lines
    where organization_id = input_org_id and party_id = input_party_id
  );
$$;

create or replace function public.acc_update_party(
  input_id uuid,
  input_party_type text,
  input_name text,
  input_phone text default null,
  input_email text default null,
  input_address text default null,
  input_gstin text default null,
  input_notes text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  org_id uuid;
  existing public.acc_parties%rowtype;
begin
  org_id := public.acc_require_owner();
  if trim(coalesce(input_name, '')) = '' then raise exception 'Party name is required'; end if;
  if input_party_type not in ('customer', 'supplier', 'employee', 'agent', 'other') then
    raise exception 'Choose a valid party type';
  end if;

  select * into existing
    from public.acc_parties
    where id = input_id and organization_id = org_id;
  if not found then raise exception 'Party not found'; end if;

  if existing.party_type <> input_party_type and public.acc_party_is_used(org_id, input_id) then
    raise exception 'Party type cannot be changed because accounting transactions already exist for this party.';
  end if;

  update public.acc_parties
    set party_type = input_party_type,
        name = trim(input_name),
        phone = nullif(trim(coalesce(input_phone, '')), ''),
        email = nullif(trim(coalesce(input_email, '')), ''),
        address = nullif(trim(coalesce(input_address, '')), ''),
        gstin = nullif(trim(coalesce(input_gstin, '')), ''),
        notes = nullif(trim(coalesce(input_notes, '')), ''),
        updated_at = now()
    where id = input_id and organization_id = org_id;

  perform public.acc_write_audit(
    org_id, 'party', input_id, 'update',
    jsonb_build_object('name', existing.name, 'party_type', existing.party_type),
    jsonb_build_object('name', trim(input_name), 'party_type', input_party_type),
    null
  );
end;
$$;

create or replace function public.acc_delete_party(input_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  org_id uuid;
  existing public.acc_parties%rowtype;
begin
  org_id := public.acc_require_owner();
  select * into existing
    from public.acc_parties
    where id = input_id and organization_id = org_id;
  if not found then raise exception 'Party not found'; end if;

  if public.acc_party_is_used(org_id, input_id) then
    raise exception 'This party cannot be deleted because accounting transactions already exist for this party.';
  end if;

  delete from public.acc_parties where id = input_id and organization_id = org_id;
  perform public.acc_write_audit(
    org_id, 'party', input_id, 'delete',
    jsonb_build_object('name', existing.name, 'party_type', existing.party_type),
    null,
    null
  );
end;
$$;

create or replace function public.acc_set_party_active(input_id uuid, input_active boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  org_id uuid;
  existing public.acc_parties%rowtype;
begin
  org_id := public.acc_require_owner();
  select * into existing
    from public.acc_parties
    where id = input_id and organization_id = org_id;
  if not found then raise exception 'Party not found'; end if;

  update public.acc_parties
    set is_active = coalesce(input_active, true),
        updated_at = now()
    where id = input_id and organization_id = org_id;

  perform public.acc_write_audit(
    org_id, 'party', input_id,
    case when coalesce(input_active, true) then 'activate' else 'deactivate' end,
    jsonb_build_object('is_active', existing.is_active),
    jsonb_build_object('is_active', coalesce(input_active, true)),
    null
  );
end;
$$;

grant execute on function public.acc_party_is_used(uuid, uuid) to authenticated;
grant execute on function public.acc_update_party(uuid, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.acc_delete_party(uuid) to authenticated;
grant execute on function public.acc_set_party_active(uuid, boolean) to authenticated;
