-- Shared member editing and safe draft-only deletion for every Chit type.
create or replace function public.chit_update_enrolled_member(
  input_enrollment_id uuid, input_member_name text, input_member_phone text,
  input_member_address text, input_guarantor_name text,
  input_guarantor_phone text, input_guarantor_address text,
  input_security_deposit numeric
) returns void language plpgsql security definer set search_path = public
as $$
declare enrollment public.chit_enrollments%rowtype;
begin
  if not public.chit_is_owner() then raise exception 'Only a financier can edit Chit Fund members'; end if;
  select e.* into enrollment
  from public.chit_enrollments e
  where e.id = input_enrollment_id
    and e.organization_id = public.current_organization_id();
  if enrollment.id is null then raise exception 'Chit Fund member not found'; end if;
  if nullif(trim(input_member_name), '') is null or nullif(trim(input_member_phone), '') is null then
    raise exception 'Member name and phone are required';
  end if;
  if nullif(trim(input_guarantor_name), '') is null or nullif(trim(input_guarantor_phone), '') is null then
    raise exception 'Guarantor name and phone are required';
  end if;
  if input_security_deposit < 0 then raise exception 'Security deposit cannot be negative'; end if;
  update public.chit_members set full_name = trim(input_member_name),
    phone = trim(input_member_phone), address = nullif(trim(input_member_address), ''),
    updated_at = now()
  where id = enrollment.member_id and organization_id = enrollment.organization_id;
  update public.chit_enrollments set guarantor_name = trim(input_guarantor_name),
    guarantor_phone = trim(input_guarantor_phone),
    guarantor_address = nullif(trim(input_guarantor_address), ''),
    security_deposit_amount = round(input_security_deposit, 2)
  where id = enrollment.id;
  insert into public.chit_audit_log(
    organization_id, scheme_id, enrollment_id, action, after_data, actor_id
  ) values (
    enrollment.organization_id, enrollment.scheme_id, enrollment.id,
    'chit_member_updated',
    jsonb_build_object('member_name', trim(input_member_name), 'member_phone', trim(input_member_phone)),
    auth.uid()
  );
end;
$$;
grant execute on function public.chit_update_enrolled_member(uuid,text,text,text,text,text,text,numeric) to authenticated;

create or replace function public.chit_delete_enrolled_member(input_enrollment_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare enrollment public.chit_enrollments%rowtype; scheme_status text; member_id_value uuid;
begin
  if not public.chit_is_owner() then raise exception 'Only a financier can delete Chit Fund members'; end if;
  select * into enrollment
  from public.chit_enrollments
  where id = input_enrollment_id
    and organization_id = public.current_organization_id();
  if enrollment.id is null then raise exception 'Chit Fund member not found'; end if;
  select status into scheme_status
  from public.chit_schemes
  where id = enrollment.scheme_id
    and organization_id = enrollment.organization_id;
  if scheme_status <> 'draft' then raise exception 'Members can only be deleted from draft schemes'; end if;
  if exists (select 1 from public.chit_bids where enrollment_id = enrollment.id)
    or exists (select 1 from public.chit_installments where enrollment_id = enrollment.id)
    or exists (select 1 from public.fixed_chit_lifts where enrollment_id = enrollment.id)
    or exists (select 1 from public.fixed_chit_payments where enrollment_id = enrollment.id)
    or exists (select 1 from public.predefined_chit_schedule where enrollment_id = enrollment.id)
    or exists (select 1 from public.predefined_chit_payments where enrollment_id = enrollment.id) then
    raise exception 'This member has historical Chit activity and cannot be deleted';
  end if;
  member_id_value := enrollment.member_id;
  insert into public.chit_audit_log(
    organization_id, scheme_id, enrollment_id, action, before_data, actor_id
  ) values (
    enrollment.organization_id, enrollment.scheme_id, enrollment.id,
    'chit_member_deleted', to_jsonb(enrollment), auth.uid()
  );
  delete from public.chit_enrollments where id = enrollment.id;
  if not exists (select 1 from public.chit_enrollments where member_id = member_id_value) then
    delete from public.chit_members where id = member_id_value;
  end if;
end;
$$;
grant execute on function public.chit_delete_enrolled_member(uuid) to authenticated;
