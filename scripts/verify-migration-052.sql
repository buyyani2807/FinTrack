-- Verify 052_fintrack_accounts_double_entry.sql
select 'acc_settings' as check, count(*)::int as ok from information_schema.tables where table_schema = 'public' and table_name = 'acc_settings'
union all
select 'acc_coa', count(*)::int from information_schema.tables where table_schema = 'public' and table_name = 'acc_coa'
union all
select 'acc_vouchers', count(*)::int from information_schema.tables where table_schema = 'public' and table_name = 'acc_vouchers'
union all
select 'acc_voucher_lines', count(*)::int from information_schema.tables where table_schema = 'public' and table_name = 'acc_voucher_lines'
union all
select 'acc_audit_log', count(*)::int from information_schema.tables where table_schema = 'public' and table_name = 'acc_audit_log'
union all
select 'acc_period_locks', count(*)::int from information_schema.tables where table_schema = 'public' and table_name = 'acc_period_locks'
union all
select 'acc_post_voucher', count(*)::int from pg_proc where proname = 'acc_post_voucher'
union all
select 'acc_set_integration', count(*)::int from pg_proc where proname = 'acc_set_integration'
union all
select 'rls_vouchers', case when relrowsecurity then 1 else 0 end from pg_class where relname = 'acc_vouchers';
