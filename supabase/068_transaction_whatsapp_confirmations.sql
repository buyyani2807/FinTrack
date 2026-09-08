-- Transaction WhatsApp confirmations: idempotent log + confirmation toggles in reminder_settings.
-- Extends existing receipts/WhatsApp settings; does not change finance or chit business logic.

alter table public.organizations
  alter column reminder_settings set default
  '{"monthly":{"7":true,"3":true,"1":true,"0":true},"chit":{"7":true,"3":true,"1":true,"0":true},"confirmations":{"daily_account":true,"monthly_account":true,"chit_lift":true}}'::jsonb;

update public.organizations
set reminder_settings = coalesce(reminder_settings, '{}'::jsonb)
  || jsonb_build_object(
    'confirmations',
    coalesce(reminder_settings->'confirmations', '{}'::jsonb)
      || jsonb_build_object(
        'daily_account', coalesce((reminder_settings->'confirmations'->>'daily_account')::boolean, true),
        'monthly_account', coalesce((reminder_settings->'confirmations'->>'monthly_account')::boolean, true),
        'chit_lift', coalesce((reminder_settings->'confirmations'->>'chit_lift')::boolean, true)
      )
  )
where reminder_settings is null
   or reminder_settings->'confirmations' is null
   or reminder_settings->'confirmations'->>'daily_account' is null
   or reminder_settings->'confirmations'->>'monthly_account' is null
   or reminder_settings->'confirmations'->>'chit_lift' is null;

create table if not exists public.transaction_confirmation_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_type text not null check (event_type in (
    'daily_account_opened',
    'monthly_account_opened',
    'chit_lift'
  )),
  source_id uuid not null,
  status text not null default 'pending' check (status in (
    'pending',
    'opened',
    'skipped_no_phone',
    'failed'
  )),
  sent_by uuid references auth.users(id),
  sent_at timestamptz,
  resend_count integer not null default 0,
  last_resent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique (organization_id, event_type, source_id)
);

create index if not exists transaction_confirmation_log_lookup_idx
  on public.transaction_confirmation_log(organization_id, event_type, source_id);

alter table public.transaction_confirmation_log enable row level security;

drop policy if exists "owners and members read confirmation log" on public.transaction_confirmation_log;
create policy "owners and members read confirmation log"
  on public.transaction_confirmation_log for select
  using (
    organization_id = public.current_organization_id()
    and public.is_active_finance_member()
  );

-- Claim first send (idempotent). Returns true only when this call inserts the row.
create or replace function public.claim_transaction_confirmation(
  input_event_type text,
  input_source_id uuid
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  if not public.is_active_finance_member() then
    raise exception 'Not authorized';
  end if;
  if input_event_type not in ('daily_account_opened', 'monthly_account_opened', 'chit_lift') then
    raise exception 'Invalid confirmation event type';
  end if;
  insert into public.transaction_confirmation_log(
    organization_id, event_type, source_id, status, sent_by
  ) values (
    public.current_organization_id(), input_event_type, input_source_id, 'pending', auth.uid()
  )
  on conflict (organization_id, event_type, source_id) do nothing
  returning id into new_id;
  return new_id is not null;
end;
$$;

create or replace function public.update_transaction_confirmation_status(
  input_event_type text,
  input_source_id uuid,
  input_status text,
  input_error text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_active_finance_member() then
    raise exception 'Not authorized';
  end if;
  if input_status not in ('opened', 'skipped_no_phone', 'failed', 'pending') then
    raise exception 'Invalid confirmation status';
  end if;
  update public.transaction_confirmation_log set
    status = input_status,
    sent_at = case when input_status = 'opened' then coalesce(sent_at, now()) else sent_at end,
    last_error = nullif(trim(input_error), ''),
    sent_by = coalesce(sent_by, auth.uid())
  where organization_id = public.current_organization_id()
    and event_type = input_event_type
    and source_id = input_source_id;
end;
$$;

create or replace function public.record_transaction_confirmation_resend(
  input_event_type text,
  input_source_id uuid,
  input_status text default 'opened',
  input_error text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_active_finance_member() then
    raise exception 'Not authorized';
  end if;
  if input_status not in ('opened', 'skipped_no_phone', 'failed') then
    raise exception 'Invalid confirmation status';
  end if;
  insert into public.transaction_confirmation_log(
    organization_id, event_type, source_id, status, sent_by, sent_at, resend_count, last_resent_at, last_error
  ) values (
    public.current_organization_id(), input_event_type, input_source_id, input_status, auth.uid(),
    case when input_status = 'opened' then now() else null end,
    1, now(), nullif(trim(input_error), '')
  )
  on conflict (organization_id, event_type, source_id) do update set
    status = excluded.status,
    resend_count = public.transaction_confirmation_log.resend_count + 1,
    last_resent_at = now(),
    sent_at = case
      when excluded.status = 'opened' then coalesce(public.transaction_confirmation_log.sent_at, now())
      else public.transaction_confirmation_log.sent_at
    end,
    last_error = excluded.last_error,
    sent_by = auth.uid();
end;
$$;

grant execute on function public.claim_transaction_confirmation(text, uuid) to authenticated;
grant execute on function public.update_transaction_confirmation_status(text, uuid, text, text) to authenticated;
grant execute on function public.record_transaction_confirmation_resend(text, uuid, text, text) to authenticated;
