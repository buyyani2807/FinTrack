-- Expose accounts_access_role() to authenticated clients for UI gating.
-- Run after 070_commercialization_foundations.sql.

grant execute on function public.accounts_access_role() to authenticated;
grant execute on function public.can_accounts_read() to authenticated;
grant execute on function public.can_accounts_write() to authenticated;
grant execute on function public.can_accounts_admin() to authenticated;
