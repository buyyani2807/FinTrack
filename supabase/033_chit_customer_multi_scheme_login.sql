-- One Chit portal login can open every scheme this member is enrolled in.
-- PIN verification, portal IDs, prize, commission, and dividend math stay the same.

create or replace function public.chit_customer_membership_list(input_enrollment_id uuid)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare enrollment public.chit_enrollments%rowtype; member public.chit_members%rowtype; phone_digits text;
begin
  select * into enrollment from public.chit_enrollments where id = input_enrollment_id;
  if enrollment.id is null then return '[]'::jsonb; end if;
  select * into member from public.chit_members where id = enrollment.member_id;
  phone_digits := regexp_replace(coalesce(member.phone, ''), '[^0-9]', '', 'g');
  return coalesce((
    select jsonb_agg(item order by item->>'schemeName')
    from (
      select jsonb_build_object(
        'enrollmentId', e.id,
        'schemeId', s.id,
        'schemeName', s.name,
        'chitType', coalesce(s.chit_type, 'auction'),
        'ticketNumber', e.ticket_number,
        'schemeStatus', s.status,
        'chitValue', s.chit_value,
        'selected', e.id = enrollment.id
      ) as item
      from public.chit_enrollments e
      join public.chit_schemes s on s.id = e.scheme_id
      join public.chit_members om on om.id = e.member_id
      where e.organization_id = enrollment.organization_id
        and e.status in ('active', 'completed')
        and (
          e.member_id = enrollment.member_id
          or (
            length(phone_digits) >= 8
            and regexp_replace(coalesce(om.phone, ''), '[^0-9]', '', 'g') = phone_digits
          )
        )
    ) listed
  ), '[]'::jsonb);
end;
$$;
revoke execute on function public.chit_customer_membership_list(uuid) from public, anon, authenticated;

create or replace function public.chit_customer_dashboard(input_enrollment_id uuid)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare enrollment public.chit_enrollments%rowtype; member public.chit_members%rowtype;
  credential public.chit_member_portal_credentials%rowtype; s public.chit_schemes%rowtype;
  payload jsonb; is_eligible boolean; installment_rows jsonb; memberships jsonb;
begin
  select * into enrollment from public.chit_enrollments where id = input_enrollment_id;
  if enrollment.id is null then raise exception 'Member not found'; end if;
  select * into member from public.chit_members where id = enrollment.member_id;
  select * into credential from public.chit_member_portal_credentials where enrollment_id = enrollment.id;
  select * into s from public.chit_schemes where id = enrollment.scheme_id;
  memberships := public.chit_customer_membership_list(enrollment.id);
  if s.chit_type = 'fixed' then
    return jsonb_build_object(
      'portalId', credential.portal_id, 'enrollmentId', enrollment.id,
      'ticketNumber', enrollment.ticket_number, 'memberName', member.full_name,
      'phone', member.phone, 'address', member.address, 'scheme', to_jsonb(s),
      'memberships', memberships,
      'fixedLift', coalesce((select to_jsonb(l) from public.fixed_chit_lifts l where l.enrollment_id = enrollment.id and l.status = 'completed'), 'null'::jsonb),
      'fixedPayments', coalesce((select jsonb_agg(to_jsonb(p) order by p.payment_month) from public.fixed_chit_payments p where p.enrollment_id = enrollment.id), '[]'::jsonb),
      'payments', coalesce((select jsonb_agg(to_jsonb(p) order by p.payment_month) from public.fixed_chit_payments p where p.enrollment_id = enrollment.id), '[]'::jsonb),
      'auction', null, 'bids', '[]'::jsonb, 'wins', '[]'::jsonb, 'eligible', false, 'bidModel', null
    );
  elsif s.chit_type = 'fixed_predefined_bid' then
    return jsonb_build_object(
      'portalId', credential.portal_id, 'enrollmentId', enrollment.id,
      'ticketNumber', enrollment.ticket_number, 'memberName', member.full_name,
      'phone', member.phone, 'address', member.address, 'scheme', to_jsonb(s),
      'memberships', memberships,
      'predefinedMonth', coalesce((select to_jsonb(ps) from public.predefined_chit_schedule ps where ps.enrollment_id = enrollment.id and ps.status = 'completed'), 'null'::jsonb),
      'predefinedPayments', coalesce((select jsonb_agg(to_jsonb(pp) order by pp.payment_month) from public.predefined_chit_payments pp where pp.enrollment_id = enrollment.id), '[]'::jsonb),
      'payments', coalesce((select jsonb_agg(to_jsonb(pp) order by pp.payment_month) from public.predefined_chit_payments pp where pp.enrollment_id = enrollment.id), '[]'::jsonb),
      'auction', null, 'bids', '[]'::jsonb, 'wins', '[]'::jsonb, 'eligible', false, 'bidModel', null
    );
  end if;
  payload := public.chit_live_auction_payload(enrollment.scheme_id);
  select coalesce((m->>'eligible')::boolean, false) into is_eligible
    from jsonb_array_elements(payload->'members') m
    where m->>'enrollment_id' = enrollment.id::text limit 1;
  select coalesce(jsonb_agg(
    to_jsonb(i) || jsonb_build_object(
      'payment_month', c.cycle_number,
      'cycle_number', c.cycle_number,
      'cycle_date', c.cycle_date
    )
    order by c.cycle_number
  ), '[]'::jsonb)
    into installment_rows
    from public.chit_installments i
    join public.chit_cycles c on c.id = i.cycle_id
    where i.enrollment_id = enrollment.id;
  return jsonb_build_object(
    'portalId', credential.portal_id, 'enrollmentId', enrollment.id,
    'ticketNumber', enrollment.ticket_number, 'memberName', member.full_name,
    'phone', member.phone, 'address', member.address,
    'scheme', coalesce(payload->'scheme', '{}'::jsonb) || jsonb_build_object('chit_type', s.chit_type),
    'memberships', memberships,
    'auction', payload->'auction', 'leadingBid', payload->'leading_bid',
    'latestBid', payload->'latest_bid', 'bids', payload->'bids',
    'bidModel', payload->'bid_model', 'eligible', coalesce(is_eligible, false),
    'installments', installment_rows,
    'payments', installment_rows,
    'wins', coalesce((
      select jsonb_agg(jsonb_build_object('month', c.cycle_number, 'bidAmount', b.bid_amount, 'bidDate', c.cycle_date, 'status', 'Winner') order by c.cycle_number)
      from public.chit_bids b join public.chit_cycles c on c.id = b.cycle_id
      where c.scheme_id = enrollment.scheme_id and b.enrollment_id = enrollment.id and b.status = 'winner'
    ), '[]'::jsonb)
  );
end;
$$;
revoke execute on function public.chit_customer_dashboard(uuid) from public, anon, authenticated;

create or replace function public.chit_customer_select_membership(input_session_token text, input_enrollment_id uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions
as $$
declare session_row public.chit_member_portal_sessions%rowtype; allowed boolean;
begin
  select * into session_row from public.chit_member_portal_sessions
    where token_hash = encode(digest(trim(input_session_token), 'sha256'), 'hex') and expires_at > now();
  if session_row.enrollment_id is null then raise exception 'Your Chit session has expired. Sign in again.'; end if;
  select exists (
    select 1
    from jsonb_array_elements(public.chit_customer_membership_list(session_row.enrollment_id)) membership
    where (membership->>'enrollmentId')::uuid = input_enrollment_id
  ) into allowed;
  if not coalesce(allowed, false) then raise exception 'You can only open your own chit schemes'; end if;
  update public.chit_member_portal_sessions
    set enrollment_id = input_enrollment_id
    where token_hash = session_row.token_hash;
  return public.chit_customer_dashboard(input_enrollment_id);
end;
$$;
grant execute on function public.chit_customer_select_membership(text, uuid) to anon, authenticated;

create or replace function public.chit_create_member(
  member_name text, member_phone text, member_address text default null,
  member_aadhaar_ciphertext text default null, member_pan_ciphertext text default null
) returns uuid language plpgsql security definer set search_path = public, vault, extensions
as $$
declare org_id uuid; member_id uuid; aadhaar_value text; pan_value text; phone_digits text;
begin
  if not public.chit_is_owner() then raise exception 'Only a financier can manage Chit Fund members'; end if;
  select organization_id into org_id from public.profiles where id = auth.uid();
  if nullif(trim(member_name), '') is null or nullif(trim(member_phone), '') is null then raise exception 'Member name and phone are required'; end if;
  phone_digits := regexp_replace(trim(member_phone), '[^0-9]', '', 'g');
  if length(phone_digits) >= 8 then
    select id into member_id
      from public.chit_members
      where organization_id = org_id
        and regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') = phone_digits
      order by created_at asc
      limit 1;
    if member_id is not null then return member_id; end if;
  end if;
  aadhaar_value := nullif(trim(member_aadhaar_ciphertext), '');
  pan_value := nullif(upper(trim(member_pan_ciphertext)), '');
  if aadhaar_value is not null and aadhaar_value !~ '^[0-9]{12}$' then raise exception 'Aadhaar must contain exactly 12 digits'; end if;
  if pan_value is not null and pan_value !~ '^[A-Z]{5}[0-9]{4}[A-Z]$' then raise exception 'PAN format is invalid'; end if;
  insert into public.chit_members(organization_id, full_name, phone, address, aadhaar_ciphertext, pan_ciphertext)
  values(
    org_id, trim(member_name), trim(member_phone), nullif(trim(member_address), ''),
    public.chit_encrypt_kyc_value(aadhaar_value), public.chit_encrypt_kyc_value(pan_value)
  ) returning id into member_id;
  return member_id;
end;
$$;
grant execute on function public.chit_create_member(text,text,text,text,text) to authenticated;

create or replace function public.chit_enroll_member(
  input_scheme_id uuid, input_member_id uuid, input_ticket_number integer,
  input_guarantor_name text, input_guarantor_phone text, input_guarantor_address text default null,
  input_security_deposit numeric default 0
) returns uuid language plpgsql security definer set search_path = public
as $$
declare org_id uuid; enrollment_id uuid; scheme_status text; configured_members integer; enrolled_members integer;
begin
  if not public.chit_is_owner() then raise exception 'Only a financier can enroll Chit Fund members'; end if;
  select organization_id, status, member_count into org_id, scheme_status, configured_members from public.chit_schemes where id = input_scheme_id and organization_id = public.current_organization_id();
  if org_id is null then raise exception 'Scheme not found'; end if;
  if scheme_status <> 'draft' then raise exception 'Members can only be enrolled while a scheme is in draft'; end if;
  if not exists (select 1 from public.chit_members where id = input_member_id and organization_id = org_id) then raise exception 'Chit Fund member not found'; end if;
  if exists (select 1 from public.chit_enrollments where scheme_id = input_scheme_id and member_id = input_member_id) then
    raise exception 'This member is already enrolled in this scheme';
  end if;
  select count(*) into enrolled_members from public.chit_enrollments where scheme_id = input_scheme_id and status = 'active';
  if enrolled_members >= configured_members then raise exception 'The scheme already has its configured member count'; end if;
  if input_ticket_number <= 0 or nullif(trim(input_guarantor_name), '') is null or nullif(trim(input_guarantor_phone), '') is null then raise exception 'Ticket and guarantor details are required'; end if;
  insert into public.chit_enrollments(organization_id, scheme_id, member_id, ticket_number, guarantor_name, guarantor_phone, guarantor_address, security_deposit_amount, created_by)
  values(org_id, input_scheme_id, input_member_id, input_ticket_number, trim(input_guarantor_name), trim(input_guarantor_phone), nullif(trim(input_guarantor_address), ''), input_security_deposit, auth.uid()) returning id into enrollment_id;
  return enrollment_id;
end;
$$;
grant execute on function public.chit_enroll_member(uuid,uuid,integer,text,text,text,numeric) to authenticated;
