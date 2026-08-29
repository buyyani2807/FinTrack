-- Run in Supabase SQL Editor after 038_digital_receipts_and_reminders.sql

select 'organizations.company_address column' as check_name,
  case when exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'organizations' and column_name = 'company_address'
  ) then 1 else 0 end as ok;

select 'payments.receipt_number column' as check_name,
  case when exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'payments' and column_name = 'receipt_number'
  ) then 1 else 0 end as ok;

select 'fintrack_next_receipt_number function' as check_name,
  case when exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'fintrack_next_receipt_number'
  ) then 1 else 0 end as ok;

select 'update_organization_receipt_settings function' as check_name,
  case when exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'update_organization_receipt_settings'
  ) then 1 else 0 end as ok;

select 'payment_reminder_log table' as check_name,
  case when exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'payment_reminder_log'
  ) then 1 else 0 end as ok;
