-- Allow an Accounts owner or accountant to change a party's type.
-- The party id stays the same. Vouchers, balances, and locked periods are not rewritten.
-- Paste in the Supabase SQL editor after 092.

create or replace function public.acc_update_party(
  input_id uuid,
  input_party_type text,
  input_name text,
  input_phone text default null,
  input_email text default null,
  input_address text default null,
  input_gstin text default null,
  input_notes text default null,
  input_company_id uuid default null,
  input_state_code text default null,
  input_gst_registration text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  org_id uuid;
  active_company_id uuid;
  existing public.acc_parties%rowtype;
  next_type text;
  actor_name text;
  actor_email text;
begin
  org_id := public.acc_require_owner();
  active_company_id := public.acc_require_company(input_company_id);
  next_type := nullif(trim(coalesce(input_party_type, '')), '');
  if next_type is null then
    raise exception 'Choose a party type';
  end if;
  if next_type not in ('customer', 'supplier', 'employee', 'agent', 'other') then
    raise exception 'Choose a valid party type';
  end if;
  if trim(coalesce(input_name, '')) = '' then
    raise exception 'Party name is required';
  end if;

  select * into existing
    from public.acc_parties p
    where p.id = input_id
      and p.organization_id = org_id
      and p.company_id = active_company_id;
  if not found then
    raise exception 'Party not found';
  end if;

  select full_name into actor_name from public.profiles where id = auth.uid();
  select email into actor_email from auth.users where id = auth.uid();

  -- Classification only. This does not update vouchers, ledger lines, or locked periods.
  update public.acc_parties
    set party_type = next_type,
        name = trim(input_name),
        phone = nullif(trim(coalesce(input_phone, '')), ''),
        email = nullif(trim(coalesce(input_email, '')), ''),
        address = nullif(trim(coalesce(input_address, '')), ''),
        gstin = nullif(trim(coalesce(input_gstin, '')), ''),
        notes = nullif(trim(coalesce(input_notes, '')), ''),
        state_code = nullif(trim(coalesce(input_state_code, '')), ''),
        gst_registration = nullif(trim(coalesce(input_gst_registration, '')), ''),
        updated_at = now()
    where id = input_id
      and organization_id = org_id
      and company_id = active_company_id;

  if existing.party_type is distinct from next_type then
    perform public.acc_write_audit(
      org_id, 'party', input_id, 'party_type',
      jsonb_build_object(
        'party_id', input_id,
        'company_id', active_company_id,
        'party_type', existing.party_type,
        'name', existing.name
      ),
      jsonb_build_object(
        'party_id', input_id,
        'company_id', active_company_id,
        'party_type', next_type,
        'name', trim(input_name),
        'actor_name', actor_name,
        'actor_email', actor_email,
        'source', 'accounts_party_edit'
      ),
      'Party classification updated. Historical vouchers, balances, and ledger entries were not changed.',
      active_company_id
    );
  else
    perform public.acc_write_audit(
      org_id, 'party', input_id, 'update',
      jsonb_build_object('name', existing.name, 'party_type', existing.party_type),
      jsonb_build_object('name', trim(input_name), 'party_type', next_type),
      null,
      active_company_id
    );
  end if;
end;
$$;

grant execute on function public.acc_update_party(uuid, text, text, text, text, text, text, text, uuid, text, text) to authenticated;
