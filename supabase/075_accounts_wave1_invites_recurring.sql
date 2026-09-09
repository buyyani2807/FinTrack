-- 075 Accounts Wave 1: team invites by email, recurring voucher templates.
-- Apply after 074_acc_list_companies_gst_fields.sql.

create table if not exists public.acc_team_invites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role text not null check (role in ('accountant', 'viewer')),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'revoked', 'expired')),
  invite_token text not null unique,
  invited_by uuid references auth.users(id),
  accepted_user_id uuid references auth.users(id),
  note text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '14 days'),
  accepted_at timestamptz
);

create unique index if not exists acc_team_invites_pending_email_uidx
  on public.acc_team_invites (organization_id, lower(email))
  where status = 'pending';

create index if not exists acc_team_invites_org_idx
  on public.acc_team_invites (organization_id, status, created_at desc);

alter table public.acc_team_invites enable row level security;

drop policy if exists acc_team_invites_owner_read on public.acc_team_invites;
create policy acc_team_invites_owner_read on public.acc_team_invites
  for select to authenticated
  using (
    organization_id = public.current_organization_id()
    and public.can_accounts_admin()
  );

revoke insert, update, delete on public.acc_team_invites from authenticated, anon;

create table if not exists public.acc_recurring_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  company_id uuid not null references public.acc_companies(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('sale', 'expense', 'purchase', 'receipt', 'payment')),
  frequency text not null default 'monthly'
    check (frequency in ('weekly', 'monthly', 'quarterly', 'yearly')),
  next_run_on date not null,
  amount numeric(18, 2) not null default 0 check (amount >= 0),
  party_id uuid references public.acc_parties(id) on delete set null,
  narration text,
  mode text default 'cash',
  is_active boolean not null default true,
  last_run_on date,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists acc_recurring_templates_company_idx
  on public.acc_recurring_templates (company_id, is_active, next_run_on);

alter table public.acc_recurring_templates enable row level security;

drop policy if exists acc_recurring_templates_read on public.acc_recurring_templates;
create policy acc_recurring_templates_read on public.acc_recurring_templates
  for select to authenticated
  using (
    public.can_accounts_read()
    and company_id = nullif(current_setting('request.headers', true)::json->>'x-acc-company-id', '')::uuid
  );

revoke insert, update, delete on public.acc_recurring_templates from authenticated, anon;

-- Invite CA / accountant / viewer by email (assigns immediately if user exists)
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
      set status = 'accepted', accepted_user_id = existing_user_id, accepted_at = now()
      where organization_id = org_id and lower(email) = email_norm and status = 'pending';
    perform public.acc_write_audit(
      org_id, 'team_invite', existing_user_id, 'assign',
      null, jsonb_build_object('email', email_norm, 'role', role_norm, 'immediate', true),
      coalesce(nullif(trim(input_note), ''), 'Team role assigned by email'), null
    );
    return jsonb_build_object(
      'status', 'assigned',
      'email', email_norm,
      'role', role_norm,
      'userId', existing_user_id
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

create or replace function public.acc_list_team_invites()
returns jsonb language plpgsql security definer set search_path = public as $$
declare org_id uuid;
begin
  org_id := public.acc_require_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', i.id,
      'email', i.email,
      'role', i.role,
      'status', i.status,
      'note', i.note,
      'createdAt', i.created_at,
      'expiresAt', i.expires_at,
      'acceptedAt', i.accepted_at,
      'acceptedUserId', i.accepted_user_id
    ) order by i.created_at desc)
    from public.acc_team_invites i
    where i.organization_id = org_id
  ), '[]'::jsonb);
end;
$$;

create or replace function public.acc_revoke_team_invite(input_invite_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare org_id uuid;
begin
  org_id := public.acc_require_admin();
  update public.acc_team_invites
    set status = 'revoked'
    where id = input_invite_id and organization_id = org_id and status = 'pending';
end;
$$;

-- Claim pending invites for the signed-in user's email (CA accepted signup)
create or replace function public.acc_claim_team_invites()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  user_email text;
  claimed int := 0;
  rec record;
begin
  if uid is null then raise exception 'Not signed in'; end if;
  select lower(email) into user_email from auth.users where id = uid;
  if user_email is null then return jsonb_build_object('claimed', 0); end if;

  for rec in
    select *
    from public.acc_team_invites
    where lower(email) = user_email
      and status = 'pending'
      and expires_at > now()
  loop
    insert into public.acc_user_roles(organization_id, user_id, role, created_by)
    values (rec.organization_id, uid, rec.role, coalesce(rec.invited_by, uid))
    on conflict (organization_id, user_id) do update
      set role = excluded.role;
    update public.acc_team_invites
      set status = 'accepted', accepted_user_id = uid, accepted_at = now()
      where id = rec.id;
    claimed := claimed + 1;
  end loop;

  update public.acc_team_invites
    set status = 'expired'
    where lower(email) = user_email and status = 'pending' and expires_at <= now();

  return jsonb_build_object('claimed', claimed);
end;
$$;

grant execute on function public.acc_invite_team_member(text, text, text) to authenticated;
grant execute on function public.acc_list_team_invites() to authenticated;
grant execute on function public.acc_revoke_team_invite(uuid) to authenticated;
grant execute on function public.acc_claim_team_invites() to authenticated;

-- Recurring templates CRUD
create or replace function public.acc_upsert_recurring_template(
  input_id uuid default null,
  input_name text default null,
  input_kind text default 'sale',
  input_frequency text default 'monthly',
  input_next_run_on date default null,
  input_amount numeric default 0,
  input_party_id uuid default null,
  input_narration text default null,
  input_mode text default 'cash',
  input_is_active boolean default true,
  input_company_id uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  org_id uuid;
  company_uuid uuid;
  row_id uuid;
  nm text;
begin
  if not public.can_accounts_write() then
    raise exception 'Accounts write access is required';
  end if;
  org_id := public.current_organization_id();
  company_uuid := public.acc_require_company(input_company_id);
  nm := nullif(trim(input_name), '');
  if nm is null then raise exception 'Template name is required'; end if;
  if coalesce(input_kind, '') not in ('sale', 'expense', 'purchase', 'receipt', 'payment') then
    raise exception 'Choose a valid recurring kind';
  end if;
  if coalesce(input_frequency, '') not in ('weekly', 'monthly', 'quarterly', 'yearly') then
    raise exception 'Choose a valid frequency';
  end if;
  if input_next_run_on is null then raise exception 'Next run date is required'; end if;
  if coalesce(input_amount, 0) < 0 then raise exception 'Amount cannot be negative'; end if;

  if input_id is null then
    insert into public.acc_recurring_templates(
      organization_id, company_id, name, kind, frequency, next_run_on, amount,
      party_id, narration, mode, is_active, created_by
    ) values (
      org_id, company_uuid, nm, input_kind, input_frequency, input_next_run_on, coalesce(input_amount, 0),
      input_party_id, nullif(trim(input_narration), ''), coalesce(nullif(trim(input_mode), ''), 'cash'),
      coalesce(input_is_active, true), auth.uid()
    ) returning id into row_id;
  else
    update public.acc_recurring_templates
      set name = nm,
          kind = input_kind,
          frequency = input_frequency,
          next_run_on = input_next_run_on,
          amount = coalesce(input_amount, 0),
          party_id = input_party_id,
          narration = nullif(trim(input_narration), ''),
          mode = coalesce(nullif(trim(input_mode), ''), 'cash'),
          is_active = coalesce(input_is_active, true),
          updated_at = now()
      where id = input_id and organization_id = org_id and company_id = company_uuid
      returning id into row_id;
    if row_id is null then raise exception 'Recurring template not found'; end if;
  end if;
  return row_id;
end;
$$;

create or replace function public.acc_delete_recurring_template(
  input_id uuid,
  input_company_id uuid default null
) returns void language plpgsql security definer set search_path = public as $$
declare org_id uuid; company_uuid uuid;
begin
  if not public.can_accounts_write() then raise exception 'Accounts write access is required'; end if;
  org_id := public.current_organization_id();
  company_uuid := public.acc_require_company(input_company_id);
  delete from public.acc_recurring_templates
  where id = input_id and organization_id = org_id and company_id = company_uuid;
end;
$$;

create or replace function public.acc_mark_recurring_run(
  input_id uuid,
  input_run_on date default null,
  input_company_id uuid default null
) returns date language plpgsql security definer set search_path = public as $$
declare
  org_id uuid;
  company_uuid uuid;
  tmpl public.acc_recurring_templates%rowtype;
  run_on date;
  next_on date;
begin
  if not public.can_accounts_write() then raise exception 'Accounts write access is required'; end if;
  org_id := public.current_organization_id();
  company_uuid := public.acc_require_company(input_company_id);
  select * into tmpl from public.acc_recurring_templates
  where id = input_id and organization_id = org_id and company_id = company_uuid;
  if tmpl.id is null then raise exception 'Recurring template not found'; end if;
  run_on := coalesce(input_run_on, current_date);
  next_on := case tmpl.frequency
    when 'weekly' then run_on + 7
    when 'quarterly' then (run_on + interval '3 months')::date
    when 'yearly' then (run_on + interval '1 year')::date
    else (run_on + interval '1 month')::date
  end;
  update public.acc_recurring_templates
    set last_run_on = run_on, next_run_on = next_on, updated_at = now()
    where id = tmpl.id;
  return next_on;
end;
$$;

grant execute on function public.acc_upsert_recurring_template(uuid, text, text, text, date, numeric, uuid, text, text, boolean, uuid) to authenticated;
grant execute on function public.acc_delete_recurring_template(uuid, uuid) to authenticated;
grant execute on function public.acc_mark_recurring_run(uuid, date, uuid) to authenticated;
