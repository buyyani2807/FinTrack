-- Add this member's auction installment history to the Chit customer dashboard.
-- Does not change prize, commission, dividend, login, or session behavior.

create or replace function public.chit_customer_dashboard(input_enrollment_id uuid)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare enrollment public.chit_enrollments%rowtype; member public.chit_members%rowtype;
  credential public.chit_member_portal_credentials%rowtype; s public.chit_schemes%rowtype;
  payload jsonb; is_eligible boolean; installment_rows jsonb;
begin
  select * into enrollment from public.chit_enrollments where id = input_enrollment_id;
  if enrollment.id is null then raise exception 'Member not found'; end if;
  select * into member from public.chit_members where id = enrollment.member_id;
  select * into credential from public.chit_member_portal_credentials where enrollment_id = enrollment.id;
  select * into s from public.chit_schemes where id = enrollment.scheme_id;
  if s.chit_type = 'fixed' then
    return jsonb_build_object(
      'portalId', credential.portal_id, 'enrollmentId', enrollment.id,
      'ticketNumber', enrollment.ticket_number, 'memberName', member.full_name,
      'phone', member.phone, 'address', member.address, 'scheme', to_jsonb(s),
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

create or replace function public.chit_customer_payment_history(input_session_token text)
returns jsonb language plpgsql security definer set search_path = public, extensions
as $$
declare session_row public.chit_member_portal_sessions%rowtype; dashboard jsonb;
begin
  select * into session_row from public.chit_member_portal_sessions
    where token_hash = encode(digest(trim(input_session_token), 'sha256'), 'hex') and expires_at > now();
  if session_row.enrollment_id is null then raise exception 'Your Chit session has expired. Sign in again.'; end if;
  dashboard := public.chit_customer_dashboard(session_row.enrollment_id);
  return jsonb_build_object(
    'installments', coalesce(dashboard->'installments', '[]'::jsonb),
    'payments', coalesce(dashboard->'payments', dashboard->'installments', dashboard->'fixedPayments', dashboard->'predefinedPayments', '[]'::jsonb),
    'fixedPayments', coalesce(dashboard->'fixedPayments', '[]'::jsonb),
    'predefinedPayments', coalesce(dashboard->'predefinedPayments', '[]'::jsonb)
  );
end;
$$;
grant execute on function public.chit_customer_payment_history(text) to anon, authenticated;
