-- One Chit portal login per member. Tickets of the same member (same profile, or same phone and
-- same name) share one portal ID and PIN, and that login opens all of the member's schemes.
-- Run after 097_chit_portal_own_memberships.sql.

create or replace function public.chit_person_key(input_member_id uuid)
returns text language sql stable security definer set search_path = public
as $$
  select case
    when length(regexp_replace(coalesce(m.phone, ''), '[^0-9]', '', 'g')) >= 8 and trim(coalesce(m.full_name, '')) <> ''
      then m.organization_id::text || '|' || regexp_replace(coalesce(m.phone, ''), '[^0-9]', '', 'g')
        || '|' || lower(regexp_replace(trim(m.full_name), '\s+', ' ', 'g'))
    else m.id::text
  end
  from public.chit_members m where m.id = input_member_id;
$$;
revoke execute on function public.chit_person_key(uuid) from public, anon, authenticated;

-- A shared login needs the same portal ID on several tickets.
do $$
declare constraint_name text;
begin
  for constraint_name in
    select conname from pg_constraint
    where conrelid = 'public.chit_member_portal_credentials'::regclass and contype = 'u'
  loop
    execute format('alter table public.chit_member_portal_credentials drop constraint %I', constraint_name);
  end loop;
end $$;
create index if not exists chit_member_portal_credentials_portal_id_idx
  on public.chit_member_portal_credentials(portal_id);

-- Existing members: keep the login of their earliest ticket and use it for every ticket.
with keyed as (
  select c.enrollment_id, c.portal_id, c.pin_hash, e.enrolled_at, public.chit_person_key(e.member_id) as person_key
  from public.chit_member_portal_credentials c
  join public.chit_enrollments e on e.id = c.enrollment_id
), canonical as (
  select distinct on (person_key) person_key, portal_id, pin_hash
  from keyed order by person_key, enrolled_at, enrollment_id
)
update public.chit_member_portal_credentials c
set portal_id = canonical.portal_id, pin_hash = canonical.pin_hash,
    failed_attempts = 0, locked_until = null, updated_at = now()
from keyed join canonical on canonical.person_key = keyed.person_key
where c.enrollment_id = keyed.enrollment_id and c.portal_id <> canonical.portal_id;

with canonical as (
  select distinct on (public.chit_person_key(e.member_id))
    public.chit_person_key(e.member_id) as person_key, c.portal_id, c.pin_hash
  from public.chit_member_portal_credentials c
  join public.chit_enrollments e on e.id = c.enrollment_id
  order by public.chit_person_key(e.member_id), e.enrolled_at, c.enrollment_id
)
insert into public.chit_member_portal_credentials(enrollment_id, organization_id, portal_id, pin_hash, failed_attempts, locked_until, updated_at)
select e.id, e.organization_id, canonical.portal_id, canonical.pin_hash, 0, null, now()
from public.chit_enrollments e
join canonical on canonical.person_key = public.chit_person_key(e.member_id)
where not exists (select 1 from public.chit_member_portal_credentials c where c.enrollment_id = e.id);

-- Enabling the portal on a ticket joins the member's existing login and keeps its PIN.
create or replace function public.enable_chit_member_portal(input_enrollment_id uuid, new_pin text)
returns text language plpgsql security definer set search_path = public, extensions
as $$
declare public_id text; pin_value text; org_id uuid; person text; own_id text;
begin
  if not public.chit_is_owner() then raise exception 'Only a financier can manage the Chit customer portal'; end if;
  if not new_pin ~ '^[0-9]{6,}$' then raise exception 'PIN must be at least 6 digits'; end if;
  select organization_id, public.chit_person_key(member_id) into org_id, person
    from public.chit_enrollments
    where id = input_enrollment_id and organization_id = public.current_organization_id();
  if org_id is null then raise exception 'Member not found'; end if;
  select portal_id into own_id from public.chit_member_portal_credentials where enrollment_id = input_enrollment_id;
  if own_id is not null then
    update public.chit_member_portal_credentials
      set pin_hash = crypt(new_pin, gen_salt('bf')), failed_attempts = 0, locked_until = null, updated_at = now()
      where portal_id = own_id and organization_id = org_id;
    return own_id;
  end if;
  select c.portal_id, c.pin_hash into public_id, pin_value
    from public.chit_member_portal_credentials c
    join public.chit_enrollments e on e.id = c.enrollment_id
    where e.organization_id = org_id and public.chit_person_key(e.member_id) = person
    order by e.enrolled_at, c.enrollment_id
    limit 1;
  if public_id is null then
    public_id := public.fintrack_random_portal_id('CF');
    pin_value := crypt(new_pin, gen_salt('bf'));
  end if;
  insert into public.chit_member_portal_credentials(enrollment_id, organization_id, portal_id, pin_hash, failed_attempts, locked_until, updated_at)
  values(input_enrollment_id, org_id, public_id, pin_value, 0, null, now());
  return public_id;
end;
$$;
grant execute on function public.enable_chit_member_portal(uuid, text) to authenticated;

-- Reset PIN applies to the member's whole login.
create or replace function public.reset_chit_member_portal_pin(input_enrollment_id uuid, new_pin text)
returns void language plpgsql security definer set search_path = public, extensions
as $$
declare own_id text; org_id uuid;
begin
  if not public.chit_is_owner() then raise exception 'Only a financier can manage the Chit customer portal'; end if;
  if not new_pin ~ '^[0-9]{6,}$' then raise exception 'PIN must be at least 6 digits'; end if;
  select organization_id into org_id from public.chit_enrollments
    where id = input_enrollment_id and organization_id = public.current_organization_id();
  if org_id is null then raise exception 'Member not found'; end if;
  select portal_id into own_id from public.chit_member_portal_credentials where enrollment_id = input_enrollment_id;
  if own_id is null then raise exception 'Chit customer portal is not enabled for this member'; end if;
  update public.chit_member_portal_credentials
    set pin_hash = crypt(new_pin, gen_salt('bf')), failed_attempts = 0, locked_until = null, updated_at = now()
    where portal_id = own_id and organization_id = org_id;
end;
$$;
grant execute on function public.reset_chit_member_portal_pin(uuid, text) to authenticated;

create or replace function public.chit_customer_portal_login(input_portal_id text, input_pin text)
returns jsonb language plpgsql security definer set search_path = public, extensions
as $$
declare credential public.chit_member_portal_credentials%rowtype; session_token text;
begin
  select c.* into credential
    from public.chit_member_portal_credentials c
    join public.chit_enrollments e on e.id = c.enrollment_id
    where c.portal_id = upper(trim(input_portal_id))
    order by (e.status = 'active') desc, e.enrolled_at, c.enrollment_id
    limit 1;
  if credential.enrollment_id is null then raise exception 'Invalid portal ID or PIN'; end if;
  if credential.locked_until is not null and credential.locked_until > now() then raise exception 'Too many attempts. Try again in 15 minutes'; end if;
  if credential.pin_hash <> crypt(input_pin, credential.pin_hash) then
    update public.chit_member_portal_credentials set failed_attempts = failed_attempts + 1,
      locked_until = case when failed_attempts + 1 >= 5 then now() + interval '15 minutes' else null end
      where portal_id = credential.portal_id;
    raise exception 'Invalid portal ID or PIN';
  end if;
  update public.chit_member_portal_credentials set failed_attempts = 0, locked_until = null where portal_id = credential.portal_id;
  session_token := encode(gen_random_bytes(24), 'hex');
  insert into public.chit_member_portal_sessions(token_hash, enrollment_id, expires_at)
  values(encode(digest(session_token, 'sha256'), 'hex'), credential.enrollment_id, now() + interval '12 hours');
  return public.chit_customer_dashboard(credential.enrollment_id) || jsonb_build_object('sessionToken', session_token);
end;
$$;
grant execute on function public.chit_customer_portal_login(text, text) to anon, authenticated;
