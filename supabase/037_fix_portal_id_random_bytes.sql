-- Fix customer/chit portal ID generation on Supabase.
-- pgcrypto functions (gen_random_bytes) live in the extensions schema, not public.
-- Without this, enable_customer_portal fails with:
--   function gen_random_bytes(integer) does not exist

create extension if not exists pgcrypto with schema extensions;

create or replace function public.fintrack_random_portal_id(prefix text)
returns text
language plpgsql volatile set search_path = public, extensions
as $$
declare
  candidate text;
  attempt integer := 0;
begin
  if prefix not in ('FT', 'CF') then
    raise exception 'Invalid portal prefix';
  end if;
  loop
    attempt := attempt + 1;
    if attempt > 30 then
      raise exception 'Could not generate a unique portal ID';
    end if;
    candidate := prefix || '-' || upper(encode(extensions.gen_random_bytes(4), 'hex'));
    if prefix = 'FT' then
      exit when not exists (
        select 1 from public.customer_portal_credentials where portal_id = candidate
      );
    else
      exit when not exists (
        select 1 from public.chit_member_portal_credentials where portal_id = candidate
      );
    end if;
  end loop;
  return candidate;
end;
$$;
