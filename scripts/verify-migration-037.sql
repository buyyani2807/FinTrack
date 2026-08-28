-- Run in Supabase SQL Editor after 037_fix_portal_id_random_bytes.sql

select 'fintrack_random_portal_id uses extensions.gen_random_bytes' as check_name,
  case when pg_get_functiondef(p.oid) like '%extensions.gen_random_bytes%' then 1 else 0 end as ok
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fintrack_random_portal_id';

select 'pgcrypto in extensions schema' as check_name,
  case when exists (
    select 1 from pg_extension e
    join pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'pgcrypto' and n.nspname = 'extensions'
  ) then 1 else 0 end as ok;
