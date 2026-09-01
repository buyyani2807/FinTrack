-- Verify 053_accounts_small_business_coa.sql
select 'acc_seed_coa' as check, count(*)::int as ok from pg_proc where proname = 'acc_seed_coa'
union all
select 'service_income_code', count(*)::int from public.acc_coa where code = '4310'
union all
select 'professional_fees_code', count(*)::int from public.acc_coa where code = '5120';
