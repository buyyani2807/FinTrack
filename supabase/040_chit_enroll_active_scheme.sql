-- Allow enrolling replacement members on active schemes when under capacity.
-- Matches chit_delete_enrolled_member (034), which already allows removal from active schemes.
-- Run after 039_upcoming_chit_payments_rpc.sql.

create or replace function public.chit_enroll_member(
  input_scheme_id uuid, input_member_id uuid, input_ticket_number integer,
  input_guarantor_name text, input_guarantor_phone text, input_guarantor_address text default null,
  input_security_deposit numeric default 0
) returns uuid language plpgsql security definer set search_path = public
as $$
declare
  org_id uuid;
  enrollment_id uuid;
  scheme_status text;
  scheme_type text;
  configured_members integer;
  enrolled_members integer;
begin
  if not public.chit_is_owner() then
    raise exception 'Only a financier can enroll Chit Fund members';
  end if;

  select organization_id, status, member_count, chit_type
    into org_id, scheme_status, configured_members, scheme_type
  from public.chit_schemes
  where id = input_scheme_id
    and organization_id = public.current_organization_id();

  if org_id is null then raise exception 'Scheme not found'; end if;
  if scheme_status not in ('draft', 'active') then
    raise exception 'Members can only be enrolled while a scheme is draft or active';
  end if;
  if scheme_status = 'active' and exists (
    select 1 from public.chit_cycles where scheme_id = input_scheme_id
  ) then
    raise exception 'Members cannot be added after monthly bids have been recorded';
  end if;
  if not exists (
    select 1 from public.chit_members where id = input_member_id and organization_id = org_id
  ) then
    raise exception 'Chit Fund member not found';
  end if;
  if exists (
    select 1 from public.chit_enrollments
    where scheme_id = input_scheme_id and member_id = input_member_id
  ) then
    raise exception 'This member is already enrolled in this scheme';
  end if;

  select count(*) into enrolled_members
  from public.chit_enrollments
  where scheme_id = input_scheme_id and status = 'active';
  if enrolled_members >= configured_members then
    raise exception 'The scheme already has its configured member count';
  end if;
  if input_ticket_number <= 0
    or nullif(trim(input_guarantor_name), '') is null
    or nullif(trim(input_guarantor_phone), '') is null then
    raise exception 'Ticket and guarantor details are required';
  end if;
  if exists (
    select 1 from public.chit_enrollments
    where scheme_id = input_scheme_id and ticket_number = input_ticket_number
  ) then
    raise exception 'Ticket number % is already used in this scheme', input_ticket_number;
  end if;

  insert into public.chit_enrollments(
    organization_id, scheme_id, member_id, ticket_number,
    guarantor_name, guarantor_phone, guarantor_address, security_deposit_amount, created_by
  ) values (
    org_id, input_scheme_id, input_member_id, input_ticket_number,
    trim(input_guarantor_name), trim(input_guarantor_phone),
    nullif(trim(input_guarantor_address), ''), input_security_deposit, auth.uid()
  ) returning id into enrollment_id;

  -- Active Fixed / Predefined schemes already have payment schedules; seed rows for the new member.
  if scheme_status = 'active' and scheme_type in ('fixed', 'fixed_predefined_bid') then
    perform public.chit_build_member_payment_schedules(input_scheme_id);
  end if;

  insert into public.chit_audit_log(
    organization_id, scheme_id, enrollment_id, action, after_data, actor_id
  ) values (
    org_id, input_scheme_id, enrollment_id, 'chit_member_enrolled',
    jsonb_build_object(
      'member_id', input_member_id,
      'ticket_number', input_ticket_number,
      'scheme_status', scheme_status
    ),
    auth.uid()
  );

  return enrollment_id;
end;
$$;

grant execute on function public.chit_enroll_member(uuid,uuid,integer,text,text,text,numeric) to authenticated;
