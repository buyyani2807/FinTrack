-- FinTrack AI: per-user limits on calls to Google Gemini.
--
-- /api/accounts/bill-scan and /api/accounts/bookkeeper (Tell FinTrack, AI setup, migration mapping)
-- take one unit here for the signed-in user before calling Gemini. A user past the limit gets
-- "try again" instead of another paid call, which protects the Gemini bill and quota if a login
-- is misused. Only the user id, the kind of call and a count per minute are stored: no prompts,
-- bill photos, or business data.
-- Run once in the Supabase SQL editor after 099. Safe to re-run.

create table if not exists public.ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('bill_scan', 'bookkeeper')),
  window_start timestamptz not null,
  calls integer not null default 0 check (calls >= 0),
  primary key (user_id, kind, window_start)
);

alter table public.ai_usage enable row level security;
revoke all on public.ai_usage from anon, authenticated;

create or replace function public.ai_take_quota(input_kind text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  this_minute timestamptz := date_trunc('minute', now());
  per_minute integer;
  per_day integer;
  minute_calls integer;
  day_calls integer;
  oldest timestamptz;
begin
  if uid is null then
    return jsonb_build_object('allowed', false, 'scope', 'auth', 'retryAfter', 0);
  end if;
  if input_kind = 'bill_scan' then
    per_minute := 10;
    per_day := 200;
  elsif input_kind = 'bookkeeper' then
    per_minute := 20;
    per_day := 300;
  else
    raise exception 'Unknown AI call';
  end if;

  -- One check at a time per user and kind, so parallel requests cannot slip past the limit.
  perform pg_advisory_xact_lock(hashtext('ai_take_quota:' || uid::text || ':' || input_kind));

  select coalesce(sum(u.calls), 0), min(u.window_start)
    into day_calls, oldest
    from public.ai_usage u
   where u.user_id = uid and u.kind = input_kind and u.window_start > now() - interval '1 day';

  select coalesce(max(u.calls), 0)
    into minute_calls
    from public.ai_usage u
   where u.user_id = uid and u.kind = input_kind and u.window_start = this_minute;

  if minute_calls >= per_minute then
    return jsonb_build_object(
      'allowed', false,
      'scope', 'minute',
      'retryAfter', greatest(1, ceil(extract(epoch from (this_minute + interval '1 minute' - now())))::integer)
    );
  end if;
  if day_calls >= per_day then
    return jsonb_build_object(
      'allowed', false,
      'scope', 'day',
      'retryAfter', greatest(60, ceil(extract(epoch from (oldest + interval '1 day' - now())))::integer)
    );
  end if;

  insert into public.ai_usage (user_id, kind, window_start, calls)
  values (uid, input_kind, this_minute, 1)
  on conflict (user_id, kind, window_start) do update set calls = public.ai_usage.calls + 1;

  delete from public.ai_usage u
   where u.user_id = uid and u.kind = input_kind and u.window_start < now() - interval '2 days';

  return jsonb_build_object('allowed', true, 'remainingToday', per_day - day_calls - 1);
end;
$$;

revoke all on function public.ai_take_quota(text) from public, anon;
grant execute on function public.ai_take_quota(text) to authenticated;
