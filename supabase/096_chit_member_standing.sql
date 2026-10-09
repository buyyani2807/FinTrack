-- Chit Fund member standing (Regular / Defaulter / Bankrupt). Paste in the Supabase SQL editor after 095.
-- Standing is a flag on the enrollment. It does not change chit_enrollments.status, so member counts,
-- bids, lifts, dividends, commission, and installments stay exactly as they are.

alter table public.chit_enrollments add column if not exists member_standing text not null default 'regular';
alter table public.chit_enrollments add column if not exists standing_note text;
alter table public.chit_enrollments add column if not exists standing_changed_at timestamptz;
alter table public.chit_enrollments add column if not exists standing_changed_by uuid references auth.users(id);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'chit_enrollments_member_standing_valid') then
    alter table public.chit_enrollments add constraint chit_enrollments_member_standing_valid
      check (member_standing in ('regular', 'defaulter', 'bankrupt'));
  end if;
end $$;

create or replace function public.chit_set_member_standing(input_enrollment_id uuid, input_standing text, input_note text)
returns void language plpgsql security definer set search_path = public
as $$
declare row public.chit_enrollments;
  next_standing text := lower(trim(coalesce(input_standing, '')));
  note_text text := nullif(trim(coalesce(input_note, '')), '');
begin
  if not public.chit_is_owner() then raise exception 'Only a financier can change a member''s standing'; end if;
  if next_standing not in ('regular', 'defaulter', 'bankrupt') then raise exception 'Invalid member standing'; end if;
  if next_standing in ('defaulter', 'bankrupt') and note_text is null then
    raise exception 'A reason is required to mark a member defaulter or bankrupt';
  end if;
  select * into row from public.chit_enrollments
    where id = input_enrollment_id and organization_id = public.current_organization_id();
  if not found then raise exception 'Member not found'; end if;
  if coalesce(row.member_standing, 'regular') = next_standing then raise exception 'This member already has that standing'; end if;
  update public.chit_enrollments set
    member_standing = next_standing,
    standing_note = coalesce(note_text, 'Marked regular by financier'),
    standing_changed_at = now(),
    standing_changed_by = auth.uid()
  where id = row.id and organization_id = row.organization_id;
  insert into public.chit_audit_log(organization_id, scheme_id, enrollment_id, action, before_data, after_data, actor_id)
  values (
    row.organization_id, row.scheme_id, row.id, 'member_standing',
    jsonb_build_object('member_standing', coalesce(row.member_standing, 'regular'), 'standing_note', row.standing_note),
    jsonb_build_object('member_standing', next_standing, 'standing_note', coalesce(note_text, 'Marked regular by financier')),
    auth.uid()
  );
end;
$$;
grant execute on function public.chit_set_member_standing(uuid, text, text) to authenticated;
