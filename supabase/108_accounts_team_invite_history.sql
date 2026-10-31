-- Fix: when the invitee already has a login, role was assigned but no invite row
-- appeared in Setup → Accounts access roles. Always keep a visible invite history row.
-- Safe to re-run. Apply after 075 / 107.

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
  if role_norm not in ('accountant', 'viewer') then
    raise exception 'Role must be accountant or viewer';
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
