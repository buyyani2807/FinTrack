-- 115 Counter Phase 2: cashier role for till staff.
-- Cashier can post (Charge) like accountant; UI limits them to Counter.
-- Void / day-close stay owner or accountant in the app.
-- Apply after 114. Safe to re-run.

do $$
declare constraint_name text;
begin
  select c.conname into constraint_name
  from pg_constraint c
  join pg_class rel on rel.oid = c.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'acc_user_roles'
    and c.contype = 'c'
    and pg_get_constraintdef(c.oid) ilike '%role%';
  if constraint_name is not null then
    execute format('alter table public.acc_user_roles drop constraint %I', constraint_name);
  end if;
end $$;

alter table public.acc_user_roles
  add constraint acc_user_roles_role_check
  check (role in ('accountant', 'viewer', 'cashier'));

do $$
declare constraint_name text;
begin
  if to_regclass('public.acc_team_invites') is null then
    return;
  end if;
  select c.conname into constraint_name
  from pg_constraint c
  join pg_class rel on rel.oid = c.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'acc_team_invites'
    and c.contype = 'c'
    and pg_get_constraintdef(c.oid) ilike '%role%';
  if constraint_name is not null then
    execute format('alter table public.acc_team_invites drop constraint %I', constraint_name);
  end if;
  begin
    alter table public.acc_team_invites
      add constraint acc_team_invites_role_check
      check (role in ('accountant', 'viewer', 'cashier'));
  exception
    when duplicate_object then null;
  end;
end $$;

create or replace function public.can_accounts_read()
returns boolean language sql stable security definer set search_path = public as $$
  select public.accounts_access_role() in ('owner', 'accountant', 'viewer', 'cashier');
$$;

create or replace function public.can_accounts_write()
returns boolean language sql stable security definer set search_path = public as $$
  select public.accounts_access_role() in ('owner', 'accountant', 'cashier');
$$;

create or replace function public.acc_require_owner()
returns uuid language plpgsql stable security definer set search_path = public as $$
declare org_id uuid;
begin
  if not public.can_accounts_write() then
    raise exception 'Accounting is available only to the business owner, accountant, or cashier';
  end if;
  org_id := public.current_organization_id();
  if org_id is null then raise exception 'No organisation in session'; end if;
  return org_id;
end;
$$;

create or replace function public.acc_set_user_role(input_user_id uuid, input_role text)
returns void language plpgsql security definer set search_path = public as $$
declare org_id uuid := public.acc_require_admin();
begin
  if input_role is null or input_role = '' then
    delete from public.acc_user_roles where organization_id = org_id and user_id = input_user_id;
    perform public.acc_write_audit(org_id, 'acc_user_role', input_user_id, 'role_cleared', null, null, null);
    return;
  end if;
  if input_role not in ('accountant', 'viewer', 'cashier') then
    raise exception 'Role must be accountant, viewer, or cashier';
  end if;
  insert into public.acc_user_roles(organization_id, user_id, role, created_by)
  values (org_id, input_user_id, input_role, auth.uid())
  on conflict (organization_id, user_id) do update
    set role = excluded.role;
  perform public.acc_write_audit(org_id, 'acc_user_role', input_user_id, 'role_set', null, jsonb_build_object('role', input_role), null);
end;
$$;

-- Keep 108 invite behaviour; only broaden allowed roles to include cashier.
create or replace function public.acc_invite_team_member(
  input_email text,
  input_role text,
  input_note text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  org_id uuid;
  email_norm text;
  role_norm text;
  existing_user_id uuid;
  invite_id uuid;
  token text;
  expires timestamptz;
begin
  org_id := public.acc_require_admin();
  email_norm := lower(trim(coalesce(input_email, '')));
  role_norm := lower(trim(coalesce(input_role, '')));
  if email_norm is null or email_norm !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Enter a valid email address';
  end if;
  if role_norm not in ('accountant', 'viewer', 'cashier') then
    raise exception 'Role must be accountant, viewer, or cashier';
  end if;

  select id into existing_user_id
  from auth.users
  where lower(email) = email_norm
  limit 1;

  if existing_user_id is not null then
    if existing_user_id = auth.uid() then
      raise exception 'You already have owner access';
    end if;
    insert into public.acc_user_roles(organization_id, user_id, role, created_by)
    values (org_id, existing_user_id, role_norm, auth.uid())
    on conflict (organization_id, user_id) do update
      set role = excluded.role, created_by = auth.uid();

    update public.acc_team_invites
      set role = role_norm,
          status = 'accepted',
          accepted_user_id = existing_user_id,
          accepted_at = now(),
          note = coalesce(nullif(trim(input_note), ''), note),
          invited_by = auth.uid()
      where organization_id = org_id and lower(email) = email_norm and status = 'pending'
      returning id into invite_id;

    if invite_id is null then
      insert into public.acc_team_invites(
        organization_id, email, role, invite_token, invited_by, note,
        expires_at, status, accepted_user_id, accepted_at
      ) values (
        org_id, email_norm, role_norm, encode(gen_random_bytes(24), 'hex'), auth.uid(),
        nullif(trim(input_note), ''), now(), 'accepted', existing_user_id, now()
      )
      returning id into invite_id;
    end if;

    perform public.acc_write_audit(
      org_id, 'team_invite', existing_user_id, 'assign',
      null, jsonb_build_object('email', email_norm, 'role', role_norm, 'immediate', true),
      coalesce(nullif(trim(input_note), ''), 'Team role assigned by email'), null
    );
    return jsonb_build_object(
      'status', 'assigned',
      'email', email_norm,
      'role', role_norm,
      'userId', existing_user_id,
      'inviteId', invite_id
    );
  end if;

  token := encode(gen_random_bytes(24), 'hex');
  expires := now() + interval '14 days';

  update public.acc_team_invites
    set role = role_norm,
        invite_token = token,
        note = nullif(trim(input_note), ''),
        expires_at = expires,
        invited_by = auth.uid(),
        status = 'pending',
        accepted_user_id = null,
        accepted_at = null
    where organization_id = org_id and lower(email) = email_norm and status = 'pending'
    returning id into invite_id;

  if invite_id is null then
    insert into public.acc_team_invites(organization_id, email, role, invite_token, invited_by, note, expires_at)
    values (org_id, email_norm, role_norm, token, auth.uid(), nullif(trim(input_note), ''), expires)
    returning id into invite_id;
  end if;

  perform public.acc_write_audit(
    org_id, 'team_invite', invite_id, 'invite',
    null, jsonb_build_object('email', email_norm, 'role', role_norm),
    coalesce(nullif(trim(input_note), ''), 'Pending team invite created'), null
  );

  return jsonb_build_object(
    'status', 'pending',
    'email', email_norm,
    'role', role_norm,
    'inviteId', invite_id,
    'inviteToken', token,
    'expiresAt', expires
  );
end;
$$;

grant execute on function public.acc_invite_team_member(text, text, text) to authenticated;

notify pgrst, 'reload schema';
