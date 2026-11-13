-- 144: Supervisor PIN override for Counter voids and returns by a cashier.
-- Safe to re-run. Apply after 143. Deploy the client together with it: without the
-- client, a cashier simply cannot void or return (the server refuses).
--
-- Owner decision (13 Nov 2026): a cashier may not void a completed Counter bill or
-- post a Counter return on their own. A supervisor enters the company's supervisor
-- PIN on the till. The server checks it, locks the PIN for 15 minutes after 5 wrong
-- tries, records the approval, and the approval is good for one action for 2 minutes.
-- Owners and accountants are unaffected.

-- ---------------------------------------------------------------------------
-- Storage. Neither table is readable or writable directly by app users except the
-- override log, which owners and accountants may read for audit.
-- ---------------------------------------------------------------------------
create table if not exists public.acc_counter_supervisor_pins (
  company_id uuid primary key references public.acc_companies(id) on delete cascade,
  organization_id uuid not null,
  pin_hash text not null,
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  updated_by uuid,
  updated_at timestamptz not null default now()
);
alter table public.acc_counter_supervisor_pins enable row level security;
revoke all on public.acc_counter_supervisor_pins from anon, authenticated;

create table if not exists public.acc_counter_overrides (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  company_id uuid not null references public.acc_companies(id) on delete cascade,
  action text not null check (action in ('void', 'return')),
  voucher_id uuid,
  reason text,
  requested_by uuid not null,
  approved_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  used_voucher_id uuid
);
create index if not exists acc_counter_overrides_open_idx
  on public.acc_counter_overrides(requested_by, company_id, action)
  where used_at is null;
alter table public.acc_counter_overrides enable row level security;
revoke insert, update, delete on public.acc_counter_overrides from anon, authenticated;
grant select on public.acc_counter_overrides to authenticated;
drop policy if exists acc_counter_overrides_read on public.acc_counter_overrides;
create policy acc_counter_overrides_read on public.acc_counter_overrides
  for select to authenticated
  using (
    organization_id = public.current_organization_id()
    and public.acc_can_access_company(company_id)
    and coalesce(public.accounts_access_role() in ('owner', 'accountant'), false)
  );

-- ---------------------------------------------------------------------------
-- Owner sets or changes the supervisor PIN for the open company.
-- ---------------------------------------------------------------------------
create or replace function public.acc_set_counter_supervisor_pin(
  input_pin text,
  input_company_id uuid default null
) returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  org_id uuid;
  target_company uuid;
  pin text := trim(coalesce(input_pin, ''));
begin
  org_id := public.acc_require_admin();
  target_company := public.acc_require_company(input_company_id);
  if pin !~ '^[0-9]{4,8}$' then
    raise exception 'Supervisor PIN must be 4 to 8 digits';
  end if;
  insert into public.acc_counter_supervisor_pins(company_id, organization_id, pin_hash, failed_attempts, locked_until, updated_by, updated_at)
  values (target_company, org_id, crypt(pin, gen_salt('bf')), 0, null, auth.uid(), now())
  on conflict (company_id) do update
    set pin_hash = excluded.pin_hash, failed_attempts = 0, locked_until = null,
        updated_by = excluded.updated_by, updated_at = now();
  perform public.acc_write_audit(
    org_id, 'settings', target_company, 'counter_supervisor_pin', null, null,
    'Counter supervisor PIN set', target_company
  );
end;
$$;
grant execute on function public.acc_set_counter_supervisor_pin(text, uuid) to authenticated;

-- Whether a PIN is set (never returns the PIN). Any Accounts writer may ask.
create or replace function public.acc_counter_supervisor_pin_status(
  input_company_id uuid default null
) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  target_company uuid;
  row_data public.acc_counter_supervisor_pins%rowtype;
begin
  target_company := public.acc_require_company(input_company_id);
  select * into row_data from public.acc_counter_supervisor_pins where company_id = target_company;
  return jsonb_build_object(
    'set', found,
    'lockedUntil', case when found and row_data.locked_until > now() then row_data.locked_until end,
    'updatedAt', case when found then row_data.updated_at end
  );
end;
$$;
grant execute on function public.acc_counter_supervisor_pin_status(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Cashier asks for an override. Returns { overrideId } or { error }.
-- A wrong PIN returns instead of raising so the failed-attempt count is kept.
-- ---------------------------------------------------------------------------
create or replace function public.acc_counter_override(
  input_pin text,
  input_action text,
  input_voucher_id uuid default null,
  input_reason text default null,
  input_company_id uuid default null
) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  org_id uuid;
  target_company uuid;
  credential public.acc_counter_supervisor_pins%rowtype;
  override_id uuid;
begin
  target_company := public.acc_require_company(input_company_id);
  org_id := public.current_organization_id();
  if input_action not in ('void', 'return') then
    raise exception 'Unknown Counter override';
  end if;
  if input_action = 'void' then
    if input_voucher_id is null or not exists (
      select 1 from public.acc_vouchers v
      where v.id = input_voucher_id and v.company_id = target_company
        and v.source_type = 'pos_counter' and v.status = 'posted'
    ) then
      raise exception 'That Counter bill was not found or is already voided';
    end if;
  end if;

  select * into credential from public.acc_counter_supervisor_pins where company_id = target_company;
  if not found then
    return jsonb_build_object('error', 'No supervisor PIN is set for this company. Ask the owner to set one in Accounts → Setup.');
  end if;
  if credential.locked_until is not null and credential.locked_until > now() then
    return jsonb_build_object('error', 'Too many wrong PINs. Try again in 15 minutes.');
  end if;
  if credential.pin_hash <> crypt(coalesce(input_pin, ''), credential.pin_hash) then
    update public.acc_counter_supervisor_pins
      set failed_attempts = failed_attempts + 1,
          locked_until = case when failed_attempts + 1 >= 5 then now() + interval '15 minutes' else null end
      where company_id = target_company;
    return jsonb_build_object('error', case when credential.failed_attempts + 1 >= 5
      then 'Too many wrong PINs. Try again in 15 minutes.' else 'Wrong supervisor PIN' end);
  end if;

  update public.acc_counter_supervisor_pins set failed_attempts = 0, locked_until = null where company_id = target_company;
  insert into public.acc_counter_overrides(organization_id, company_id, action, voucher_id, reason, requested_by, expires_at)
  values (org_id, target_company, input_action, input_voucher_id, nullif(trim(coalesce(input_reason, '')), ''), auth.uid(), now() + interval '2 minutes')
  returning id into override_id;
  perform public.acc_write_audit(
    org_id, 'counter_override', override_id, input_action, null,
    jsonb_build_object('voucher_id', input_voucher_id, 'requested_by', auth.uid()),
    coalesce(nullif(trim(coalesce(input_reason, '')), ''), 'Supervisor PIN approved'), target_company
  );
  return jsonb_build_object('overrideId', override_id);
end;
$$;
grant execute on function public.acc_counter_override(text, text, uuid, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Cashier voucher guard (replaces 143): Counter sales as before; a Counter return
-- or a void needs an unused, unexpired override from this cashier.
-- ---------------------------------------------------------------------------
create or replace function public.acc_cashier_guard_voucher()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  override_id uuid;
begin
  if not public.acc_is_cashier() then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' then
    if new.source_type is distinct from 'pos_counter' or new.voucher_type not in ('sales', 'credit_note') then
      raise exception 'A cashier can only post Counter sales and returns';
    end if;
    if new.voucher_type = 'credit_note' then
      select o.id into override_id
        from public.acc_counter_overrides o
        where o.requested_by = auth.uid() and o.company_id = new.company_id
          and o.action = 'return' and o.used_at is null and o.expires_at > now()
        order by o.approved_at
        limit 1
        for update;
      if override_id is null then
        raise exception 'A Counter return needs the supervisor PIN';
      end if;
      update public.acc_counter_overrides set used_at = now(), used_voucher_id = new.id where id = override_id;
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.source_type is distinct from 'pos_counter'
       or new.source_type is distinct from 'pos_counter'
       or new.voucher_type is distinct from old.voucher_type then
      raise exception 'A cashier can only change Counter bills';
    end if;
    if old.status = 'posted' and new.status in ('cancelled', 'reversed') then
      select o.id into override_id
        from public.acc_counter_overrides o
        where o.requested_by = auth.uid() and o.company_id = old.company_id
          and o.action = 'void' and o.voucher_id = old.id
          and o.used_at is null and o.expires_at > now()
        order by o.approved_at
        limit 1
        for update;
      if override_id is null then
        raise exception 'Voiding a Counter bill needs the supervisor PIN';
      end if;
      update public.acc_counter_overrides set used_at = now(), used_voucher_id = old.id where id = override_id;
    end if;
    return new;
  end if;

  raise exception 'A cashier cannot delete vouchers';
end;
$$;
