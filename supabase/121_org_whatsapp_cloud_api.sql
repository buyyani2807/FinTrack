-- WhatsApp Business Cloud API (per-organization connection + send log).
-- Run once in the Supabase SQL editor after 120. Safe to re-run.

create table if not exists public.org_whatsapp_connections (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  waba_id text not null default '',
  phone_number_id text not null default '',
  display_phone text not null default '',
  access_token_encrypted text not null default '',
  token_expires_at timestamptz,
  status text not null default 'disconnected'
    check (status in ('disconnected', 'connected', 'error')),
  status_detail text not null default '',
  webhook_verify_token text not null default '',
  opted_out_phones text[] not null default '{}',
  sends_this_month integer not null default 0 check (sends_this_month >= 0),
  sends_month_key text not null default '',
  connected_at timestamptz,
  connected_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.whatsapp_message_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  to_phone text not null,
  template_key text not null default '',
  kind text not null default 'send',
  meta_message_id text not null default '',
  status text not null default 'queued'
    check (status in ('queued', 'sent', 'delivered', 'read', 'failed', 'manual')),
  error text not null default '',
  source_type text not null default '',
  source_id text not null default '',
  idempotency_key text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists whatsapp_message_log_idempotency_uidx
  on public.whatsapp_message_log (organization_id, idempotency_key)
  where idempotency_key <> '';

create index if not exists whatsapp_message_log_org_created_idx
  on public.whatsapp_message_log (organization_id, created_at desc);

create index if not exists whatsapp_message_log_meta_id_idx
  on public.whatsapp_message_log (meta_message_id)
  where meta_message_id <> '';

alter table public.org_whatsapp_connections enable row level security;
alter table public.whatsapp_message_log enable row level security;

-- Owners manage connection metadata via service role from Vercel APIs.
-- Authenticated clients may read connection status (never the encrypted token) and their org's log.
revoke all on public.org_whatsapp_connections from anon, authenticated;
revoke all on public.whatsapp_message_log from anon, authenticated;
grant select on public.org_whatsapp_connections to authenticated;
grant select on public.whatsapp_message_log to authenticated;

drop policy if exists "owners read whatsapp connection" on public.org_whatsapp_connections;
create policy "owners read whatsapp connection" on public.org_whatsapp_connections
  for select to authenticated
  using (
    organization_id = (select organization_id from public.profiles where id = auth.uid())
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.organization_id = org_whatsapp_connections.organization_id
        and p.role = 'owner' and p.is_active is true
    )
  );

drop policy if exists "members read whatsapp log" on public.whatsapp_message_log;
create policy "members read whatsapp log" on public.whatsapp_message_log
  for select to authenticated
  using (
    organization_id = (select organization_id from public.profiles where id = auth.uid())
  );

-- RPC: public connection status without exposing the encrypted token.
create or replace function public.whatsapp_connection_status()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  org uuid;
  row public.org_whatsapp_connections%rowtype;
begin
  if uid is null then
    return jsonb_build_object('connected', false, 'status', 'auth');
  end if;
  select organization_id into org from public.profiles where id = uid and is_active is true;
  if org is null then
    return jsonb_build_object('connected', false, 'status', 'no_org');
  end if;
  select * into row from public.org_whatsapp_connections where organization_id = org;
  if not found or row.status is distinct from 'connected' or coalesce(row.phone_number_id, '') = '' then
    return jsonb_build_object(
      'connected', false,
      'status', coalesce(row.status, 'disconnected'),
      'displayPhone', coalesce(row.display_phone, ''),
      'detail', coalesce(row.status_detail, ''),
      'sendsThisMonth', coalesce(row.sends_this_month, 0)
    );
  end if;
  return jsonb_build_object(
    'connected', true,
    'status', row.status,
    'displayPhone', row.display_phone,
    'wabaId', row.waba_id,
    'phoneNumberId', row.phone_number_id,
    'connectedAt', row.connected_at,
    'sendsThisMonth', row.sends_this_month,
    'detail', row.status_detail
  );
end;
$$;

revoke all on function public.whatsapp_connection_status() from public;
grant execute on function public.whatsapp_connection_status() to authenticated;
