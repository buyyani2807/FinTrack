-- Owner-only member and scheme deletion that preserves paid financial history.
-- Run after 033_chit_customer_multi_scheme_login.sql.

create or replace function public.chit_delete_enrolled_member(input_enrollment_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare enrollment public.chit_enrollments%rowtype; member_id_value uuid;
begin
  if not public.chit_is_owner() then raise exception 'Only a financier can delete Chit Fund members'; end if;
  select * into enrollment
  from public.chit_enrollments
  where id = input_enrollment_id
    and organization_id = public.current_organization_id();
  if enrollment.id is null then raise exception 'Chit Fund member not found'; end if;

  if exists (
    select 1 from public.chit_cycles
    where scheme_id = enrollment.scheme_id
  ) then
    raise exception 'This scheme has recorded monthly bids. Members cannot be removed because existing dividends and installments depend on the current member list';
  end if;
  if exists (
    select 1 from public.chit_bids where enrollment_id = enrollment.id
  ) then
    raise exception 'This member has auction bid history and cannot be deleted';
  end if;
  if exists (
    select 1 from public.chit_cycles
    where winning_enrollment_id = enrollment.id
  ) then
    raise exception 'This member has won a monthly bid and cannot be deleted';
  end if;
  if exists (
    select 1 from public.chit_installments
    where enrollment_id = enrollment.id and amount_paid > 0
  ) or exists (
    select 1 from public.fixed_chit_payments
    where enrollment_id = enrollment.id and amount_paid > 0
  ) or exists (
    select 1 from public.predefined_chit_payments
    where enrollment_id = enrollment.id and amount_paid > 0
  ) then
    raise exception 'This member has paid Chit records and cannot be deleted';
  end if;
  if exists (
    select 1 from public.fixed_chit_lifts
    where enrollment_id = enrollment.id and status = 'completed'
  ) then
    raise exception 'This member has a completed Fixed Chit lift and cannot be deleted';
  end if;
  if exists (
    select 1 from public.predefined_chit_schedule
    where enrollment_id = enrollment.id and status = 'completed'
  ) then
    raise exception 'This member has a completed predefined-bid assignment and cannot be deleted';
  end if;
  if exists (
    select 1 from public.chit_payouts where enrollment_id = enrollment.id
  ) or exists (
    select 1 from public.chit_security_deposits where enrollment_id = enrollment.id
  ) then
    raise exception 'This member has payout or security-deposit records and cannot be deleted';
  end if;
  if exists (
    select 1
    from public.chit_live_auction_bids b
    join public.chit_live_auctions a on a.id = b.auction_id
    where b.enrollment_id = enrollment.id and a.status = 'finalized'
  ) then
    raise exception 'This member has finalized live-auction bids and cannot be deleted';
  end if;

  member_id_value := enrollment.member_id;
  insert into public.chit_audit_log(
    organization_id, scheme_id, enrollment_id, action, before_data, actor_id
  ) values (
    enrollment.organization_id, enrollment.scheme_id, enrollment.id,
    'chit_member_deleted', to_jsonb(enrollment), auth.uid()
  );

  update public.chit_live_auctions
    set winning_enrollment_id = null, winning_bid_amount = null, updated_at = now()
    where winning_enrollment_id = enrollment.id
      and status in ('open', 'paused');
  delete from public.chit_live_auction_bids
    where enrollment_id = enrollment.id
      and auction_id in (
        select id from public.chit_live_auctions
        where scheme_id = enrollment.scheme_id and status in ('open', 'paused', 'cancelled')
      );
  delete from public.chit_installments
    where enrollment_id = enrollment.id and amount_paid = 0;
  delete from public.fixed_chit_payments
    where enrollment_id = enrollment.id and amount_paid = 0;
  delete from public.predefined_chit_payments
    where enrollment_id = enrollment.id and amount_paid = 0;

  delete from public.chit_enrollments where id = enrollment.id;
  if not exists (select 1 from public.chit_enrollments where member_id = member_id_value) then
    delete from public.chit_members where id = member_id_value;
  end if;
end;
$$;
grant execute on function public.chit_delete_enrolled_member(uuid) to authenticated;

create or replace function public.chit_delete_scheme(input_scheme_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare scheme public.chit_schemes%rowtype; orphan_member uuid;
begin
  if not public.chit_is_owner() then raise exception 'Only a financier can delete Chit Fund schemes'; end if;
  select * into scheme
  from public.chit_schemes
  where id = input_scheme_id
    and organization_id = public.current_organization_id();
  if scheme.id is null then raise exception 'Chit Fund scheme not found'; end if;

  if exists (select 1 from public.chit_cycles where scheme_id = scheme.id) then
    raise exception 'This scheme has recorded monthly bids or auctions and cannot be deleted';
  end if;
  if exists (
    select 1 from public.chit_live_auctions
    where scheme_id = scheme.id and status = 'finalized'
  ) then
    raise exception 'This scheme has a finalized live auction and cannot be deleted';
  end if;
  if exists (
    select 1 from public.fixed_chit_lifts
    where scheme_id = scheme.id and status = 'completed'
  ) or exists (
    select 1 from public.predefined_chit_schedule
    where scheme_id = scheme.id and status = 'completed'
  ) then
    raise exception 'This scheme has completed lifts or assigned months and cannot be deleted';
  end if;
  if exists (
    select 1 from public.chit_installments i
    join public.chit_cycles c on c.id = i.cycle_id
    where c.scheme_id = scheme.id and i.amount_paid > 0
  ) or exists (
    select 1 from public.fixed_chit_payments
    where scheme_id = scheme.id and amount_paid > 0
  ) or exists (
    select 1 from public.predefined_chit_payments
    where scheme_id = scheme.id and amount_paid > 0
  ) then
    raise exception 'This scheme has paid Chit records and cannot be deleted';
  end if;
  if exists (
    select 1 from public.chit_payouts p
    join public.chit_cycles c on c.id = p.cycle_id
    where c.scheme_id = scheme.id
  ) or exists (
    select 1 from public.chit_security_deposits where scheme_id = scheme.id
  ) then
    raise exception 'This scheme has payout or security-deposit records and cannot be deleted';
  end if;

  insert into public.chit_audit_log(
    organization_id, scheme_id, action, before_data, actor_id
  ) values (
    scheme.organization_id, scheme.id, 'chit_scheme_deleted', to_jsonb(scheme), auth.uid()
  );

  delete from public.chit_live_auction_bids
    where auction_id in (select id from public.chit_live_auctions where scheme_id = scheme.id);
  delete from public.chit_live_auctions where scheme_id = scheme.id;
  delete from public.chit_installments
    where cycle_id in (select id from public.chit_cycles where scheme_id = scheme.id)
      and amount_paid = 0;
  delete from public.fixed_chit_payments where scheme_id = scheme.id and amount_paid = 0;
  delete from public.predefined_chit_payments where scheme_id = scheme.id and amount_paid = 0;
  delete from public.fixed_chit_lifts where scheme_id = scheme.id and status = 'pending';
  delete from public.predefined_chit_schedule where scheme_id = scheme.id and status = 'pending';

  for orphan_member in
    select member_id from public.chit_enrollments where scheme_id = scheme.id
  loop
    delete from public.chit_enrollments where scheme_id = scheme.id and member_id = orphan_member;
    if not exists (select 1 from public.chit_enrollments where member_id = orphan_member) then
      delete from public.chit_members where id = orphan_member;
    end if;
  end loop;

  delete from public.chit_schemes where id = scheme.id;
end;
$$;
grant execute on function public.chit_delete_scheme(uuid) to authenticated;
