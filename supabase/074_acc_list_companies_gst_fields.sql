-- 074 Restore GST fields on acc_list_companies (regression in 072).
-- Apply after 073_accounts_market_ready.sql. Safe to re-run.

create or replace function public.acc_list_companies()
returns jsonb language plpgsql security definer set search_path = public as $$
declare org_id uuid;
begin
  org_id := public.current_organization_id();
  if org_id is null then raise exception 'No organisation in session'; end if;
  if not public.can_accounts_read() then
    raise exception 'Accounts access is required to list companies';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id,
      'name', c.name,
      'fyStartMonth', c.fy_start_month,
      'booksStartedOn', c.books_started_on,
      'status', c.status,
      'isPrimary', c.is_primary,
      'createdAt', c.created_at,
      'updatedAt', c.updated_at,
      'gstRegistration', c.gst_registration,
      'gstin', c.gstin,
      'legalName', c.legal_name,
      'stateCode', c.state_code,
      'stateName', c.state_name
    ) order by c.is_primary desc, c.created_at)
    from public.acc_companies c
    where c.organization_id = org_id
  ), '[]'::jsonb);
end;
$$;

grant execute on function public.acc_list_companies() to authenticated;
