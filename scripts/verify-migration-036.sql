-- Run in Supabase SQL Editor to confirm 036_prelaunch_hardening.sql is applied.
-- Every check should return at least one row. Empty result = migration missing or incomplete.

-- 1. Core functions from 036
select 'provision_financier' as check_name, count(*) as ok
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'provision_financier'
having count(*) >= 1;

select 'fintrack_random_portal_id' as check_name, count(*) as ok
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'fintrack_random_portal_id'
having count(*) >= 1;

-- 2. is_financier_owner should reference is_active (function body contains is_active)
select 'is_financier_owner checks is_active' as check_name,
  case when pg_get_functiondef(p.oid) ilike '%is_active%' then 1 else 0 end as ok
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'is_financier_owner';

-- 3. pin_hash must NOT be selectable by authenticated on customer_portal_credentials
select 'pin_hash hidden from authenticated' as check_name,
  case when count(*) = 0 then 1 else 0 end as ok
from information_schema.column_privileges
where table_schema = 'public'
  and table_name = 'customer_portal_credentials'
  and column_name = 'pin_hash'
  and grantee = 'authenticated'
  and privilege_type = 'SELECT';

-- 4. Owner-only portal credential policy
select 'owner portal credential policy' as check_name, count(*) as ok
from pg_policies
where schemaname = 'public'
  and tablename = 'customer_portal_credentials'
  and policyname = 'owners read portal credential metadata'
having count(*) >= 1;

-- 5. provision_financier accepts invite_code (3-arg signature)
select 'provision_financier 3-arg' as check_name, count(*) as ok
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'provision_financier'
  and pg_catalog.pg_get_function_identity_arguments(p.oid) like '%invite_code%'
having count(*) >= 1;

-- Summary: if all five queries above return ok = 1, migration 036 is applied.
