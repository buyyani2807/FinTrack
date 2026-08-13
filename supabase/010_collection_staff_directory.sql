-- Run AFTER 009_collection_agents.sql.
-- Stores the staff login email for the Financer's Collection Staff directory.
alter table public.profiles add column if not exists email text;
create unique index if not exists profiles_organization_email_key on public.profiles(organization_id, lower(email)) where email is not null;
