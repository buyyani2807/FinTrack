-- Verify FT-035 / FT-037 pieces from 051_ft035_ft037_live_bid_and_chit_payout_mode.sql
-- Each row should show ok = 1.

select 'chit_validate_live_bid_amount 5-arg' as check_name, count(*) as ok
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'chit_validate_live_bid_amount'
  and pg_get_function_identity_arguments(p.oid) = 'numeric, numeric, numeric, numeric, numeric';

select 'chit_record_monthly_bid from_live flag' as check_name, count(*) as ok
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'chit_record_monthly_bid'
  and pg_get_function_identity_arguments(p.oid) like '%boolean%';

select 'chit_end_live_auction mode args' as check_name, count(*) as ok
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'chit_end_live_auction'
  and pg_get_function_identity_arguments(p.oid) like '%payment_mode%';

select 'chit_finalize_fixed_lift mode args' as check_name, count(*) as ok
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'chit_finalize_fixed_lift'
  and pg_get_function_identity_arguments(p.oid) like '%payment_mode%';

select 'chit_finalize_predefined_month mode args' as check_name, count(*) as ok
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'chit_finalize_predefined_month'
  and pg_get_function_identity_arguments(p.oid) like '%payment_mode%';

select 'accounts_sync_chit_payout mode args' as check_name, count(*) as ok
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'accounts_sync_chit_payout'
  and pg_get_function_identity_arguments(p.oid) like '%payment_mode%';

select 'fixed_chit_lifts.payout_mode' as check_name, count(*) as ok
from information_schema.columns
where table_schema = 'public' and table_name = 'fixed_chit_lifts' and column_name = 'payout_mode';

select 'predefined_chit_schedule.payout_mode' as check_name, count(*) as ok
from information_schema.columns
where table_schema = 'public' and table_name = 'predefined_chit_schedule' and column_name = 'payout_mode';

select 'chit_cycles.payout_mode' as check_name, count(*) as ok
from information_schema.columns
where table_schema = 'public' and table_name = 'chit_cycles' and column_name = 'payout_mode';

-- Old one-arg end auction should be gone (PostgREST ambiguity)
select 'no legacy chit_end_live_auction(uuid-only)' as check_name,
  case when count(*) = 0 then 1 else 0 end as ok
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'chit_end_live_auction'
  and pg_get_function_identity_arguments(p.oid) = 'uuid';
