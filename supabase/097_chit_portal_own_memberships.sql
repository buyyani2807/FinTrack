-- The Chit portal scheme list showed other members' tickets when they shared a phone number.
-- A phone match now only joins a duplicate profile of the same person (same phone and same name).

create or replace function public.chit_customer_membership_list(input_enrollment_id uuid)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare enrollment public.chit_enrollments%rowtype; member public.chit_members%rowtype; phone_digits text; member_name text;
begin
  select * into enrollment from public.chit_enrollments where id = input_enrollment_id;
  if enrollment.id is null then return '[]'::jsonb; end if;
  select * into member from public.chit_members where id = enrollment.member_id;
  phone_digits := regexp_replace(coalesce(member.phone, ''), '[^0-9]', '', 'g');
  member_name := lower(regexp_replace(trim(coalesce(member.full_name, '')), '\s+', ' ', 'g'));
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
            and member_name <> ''
            and regexp_replace(coalesce(om.phone, ''), '[^0-9]', '', 'g') = phone_digits
            and lower(regexp_replace(trim(coalesce(om.full_name, '')), '\s+', ' ', 'g')) = member_name
          )
        )
    ) listed
  ), '[]'::jsonb);
end;
$$;
revoke execute on function public.chit_customer_membership_list(uuid) from public, anon, authenticated;
