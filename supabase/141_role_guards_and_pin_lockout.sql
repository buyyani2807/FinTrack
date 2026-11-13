-- 141: Role-guard and PIN-lockout fixes from the 13 Nov 2026 staging role QA.
-- Safe to re-run. Apply after 140, together with the client change in
-- src/lib/financeRepository.js (customerPortalLogin / chitCustomerPortalLogin now
-- throw when the RPC returns { error }). Deploy the client first.
--
-- 1. accounts_access_role() is NULL for users with no Accounts role (collection
--    agents). can_accounts_admin/write/read compared NULL = 'owner', which is NULL,
--    and `if not NULL then raise` never raises. Agents could create Accounts
--    companies and toggle accounting integration. Make the checks NULL-safe.
-- 2. acc_set_integration used the write guard, so accountants and cashiers could
--    switch org-wide integration. It is an owner action.
-- 3. Customer, chit member and agent PIN logins raised right after counting a
--    failed attempt, which rolled the count back. Lockout never triggered.

create or replace function public.can_accounts_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.accounts_access_role() = 'owner', false);
$$;
grant execute on function public.can_accounts_admin() to authenticated;

create or replace function public.can_accounts_write()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.accounts_access_role() in ('owner', 'accountant', 'cashier'), false);
$$;
grant execute on function public.can_accounts_write() to authenticated;

create or replace function public.can_accounts_read()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.accounts_access_role() in ('owner', 'accountant', 'viewer', 'cashier'), false);
$$;
grant execute on function public.can_accounts_read() to authenticated;

create or replace function public.acc_set_integration(input_enabled boolean)
returns void language plpgsql security definer set search_path = public as $$
declare org_id uuid;
declare previous boolean;
begin
  org_id := public.acc_require_admin();
  perform public.acc_initialize(null, current_date);
  select integration_enabled into previous from public.acc_settings where organization_id = org_id;
  update public.acc_settings
    set integration_enabled = coalesce(input_enabled, false), updated_at = now(), updated_by = auth.uid()
    where organization_id = org_id;
  perform public.acc_write_audit(
    org_id, 'settings', org_id, 'integration',
    jsonb_build_object('integration_enabled', previous),
    jsonb_build_object('integration_enabled', coalesce(input_enabled, false)),
    case when input_enabled then 'Accounting integration enabled' else 'Accounting integration disabled' end
  );
end;
$$;
grant execute on function public.acc_set_integration(boolean) to authenticated;

create or replace function public.customer_portal_login(input_portal_id text, input_pin text)
returns jsonb language plpgsql security definer set search_path = public, extensions
as $$
declare credential public.customer_portal_credentials%rowtype; result jsonb;
begin
  select * into credential from public.customer_portal_credentials where portal_id = upper(trim(input_portal_id));
  if not found then raise exception 'Invalid portal ID or PIN'; end if;
  if credential.locked_until is not null and credential.locked_until > now() then raise exception 'Too many attempts. Try again in 15 minutes'; end if;
  if credential.pin_hash <> crypt(input_pin, credential.pin_hash) then
    update public.customer_portal_credentials set failed_attempts = failed_attempts + 1,
      locked_until = case when failed_attempts + 1 >= 5 then now() + interval '15 minutes' else null end where finance_account_id = credential.finance_account_id;
    -- Return instead of raise: a raise would roll back the failed-attempt counter.
    return jsonb_build_object('error', case when credential.failed_attempts + 1 >= 5
      then 'Too many attempts. Try again in 15 minutes' else 'Invalid portal ID or PIN' end);
  end if;
  update public.customer_portal_credentials set failed_attempts = 0, locked_until = null where finance_account_id = credential.finance_account_id;
  select jsonb_build_object('id', a.id, 'portalId', credential.portal_id, 'customerName', c.full_name, 'phone', c.phone,
    'address', c.address, 'kind', a.kind, 'startDate', a.start_date, 'collectionAmount', a.collection_amount,
    'disbursedAmount', a.disbursed_amount, 'dailyCollection', a.daily_collection, 'principal', a.principal,
    'annualRate', a.monthly_interest_rate, 'penaltyRate', a.penalty_rate,
    'rateChanges', coalesce((select jsonb_agg(jsonb_build_object('effectiveDate', r.effective_date, 'annualRate', r.monthly_interest_rate)) from public.rate_changes r where r.finance_account_id = a.id), '[]'::jsonb),
    'transactions', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'date', p.paid_on, 'mode', p.mode, 'amount', p.total_amount, 'interestAmount', p.interest_amount, 'principalAmount', p.principal_amount, 'penaltyAmount', p.penalty_amount, 'ref', p.payment_reference, 'notes', p.notes) order by p.paid_on desc) from public.payments p where p.finance_account_id = a.id), '[]'::jsonb)) into result
  from public.finance_accounts a join public.customers c on c.id = a.customer_id where a.id = credential.finance_account_id;
  return result;
end;
$$;
grant execute on function public.customer_portal_login(text, text) to anon, authenticated;

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
    -- Return instead of raise: a raise would roll back the failed-attempt counter.
    return jsonb_build_object('error', case when credential.failed_attempts + 1 >= 5
      then 'Too many attempts. Try again in 15 minutes' else 'Invalid portal ID or PIN' end);
  end if;
  update public.chit_member_portal_credentials set failed_attempts = 0, locked_until = null where portal_id = credential.portal_id;
  session_token := encode(gen_random_bytes(24), 'hex');
  insert into public.chit_member_portal_sessions(token_hash, enrollment_id, expires_at)
  values(encode(digest(session_token, 'sha256'), 'hex'), credential.enrollment_id, now() + interval '12 hours');
  return public.chit_customer_dashboard(credential.enrollment_id) || jsonb_build_object('sessionToken', session_token);
end;
$$;
grant execute on function public.chit_customer_portal_login(text, text) to anon, authenticated;

create or replace function public.agent_portal_login(input_portal_id text, input_pin text)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  credential public.agent_portal_credentials%rowtype;
  staff_role text;
  staff_active boolean;
begin
  select * into credential
  from public.agent_portal_credentials
  where portal_id = upper(trim(input_portal_id));
  if not found then
    raise exception 'Invalid agent ID or PIN';
  end if;
  if credential.locked_until is not null and credential.locked_until > now() then
    raise exception 'Too many attempts. Try again in 15 minutes';
  end if;
  if credential.pin_hash <> extensions.crypt(input_pin, credential.pin_hash) then
    update public.agent_portal_credentials
    set failed_attempts = failed_attempts + 1,
        locked_until = case when failed_attempts + 1 >= 5 then now() + interval '15 minutes' else null end,
        updated_at = now()
    where profile_id = credential.profile_id;
    -- Return null instead of raise: a raise would roll back the failed-attempt counter.
    -- /api/auth/agent-login already answers 401 when no profile id comes back.
    return null;
  end if;
  select role, is_active into staff_role, staff_active
  from public.profiles
  where id = credential.profile_id;
  if staff_role is distinct from 'staff' then
    raise exception 'Invalid agent ID or PIN';
  end if;
  if staff_active is not true then
    raise exception 'This account has been disabled. Contact your financier.';
  end if;
  update public.agent_portal_credentials
  set failed_attempts = 0, locked_until = null, updated_at = now()
  where profile_id = credential.profile_id;
  return credential.profile_id;
end;
$$;
revoke all on function public.agent_portal_login(text, text) from public, anon, authenticated;
grant execute on function public.agent_portal_login(text, text) to service_role;
