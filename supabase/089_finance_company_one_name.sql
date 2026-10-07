-- Company 1 and the finance business are the same books.
-- Rename the placeholder primary company to the finance workspace name
-- and archive the empty extra company created with that name.
-- Trading companies that already have their own names are left as they are.
-- Run after 088_finance_company_sync.sql.

create or replace function public.acc_finance_books_company_id(input_org_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  finance_name text;
  company_id uuid;
  primary_id uuid;
  primary_name text;
  named_id uuid;
  dup_id uuid;
  started date;
  fy integer;
begin
  select nullif(trim(o.name), '') into finance_name
  from public.organizations o
  where o.id = input_org_id;
  if finance_name is null then
    return public.acc_primary_company_id(input_org_id);
  end if;

  select c.id, c.name into primary_id, primary_name
  from public.acc_companies c
  where c.organization_id = input_org_id
    and c.is_primary
    and c.status = 'active'
  limit 1;

  -- "Company 1" is the placeholder opened with the books. It is the finance
  -- business, so the list should show the finance name once.
  if primary_id is not null and lower(trim(primary_name)) = 'company 1' then
    for dup_id in
      select c.id
      from public.acc_companies c
      where c.organization_id = input_org_id
        and c.status = 'active'
        and c.id <> primary_id
        and lower(trim(c.name)) = lower(finance_name)
    loop
      if not exists (
        select 1 from public.acc_vouchers v
        where v.company_id = dup_id and v.status <> 'cancelled'
      ) and not exists (
        select 1 from public.acc_parties p where p.company_id = dup_id
      ) and not exists (
        select 1 from public.acc_bank_statements b where b.company_id = dup_id
      ) then
        update public.acc_companies
          set status = 'archived', updated_at = now()
          where id = dup_id;
        perform public.acc_write_audit(
          input_org_id, 'company', dup_id, 'archive',
          jsonb_build_object('status', 'active', 'name', finance_name),
          jsonb_build_object('status', 'archived'),
          'Removed the extra finance company that duplicated Company 1',
          dup_id
        );
      end if;
    end loop;

    select c.id into named_id
    from public.acc_companies c
    where c.organization_id = input_org_id
      and c.status = 'active'
      and c.id <> primary_id
      and lower(trim(c.name)) = lower(finance_name)
    limit 1;

    if named_id is not null
       and not exists (
         select 1 from public.acc_vouchers v
         where v.company_id = primary_id and v.status <> 'cancelled'
       )
       and exists (
         select 1 from public.acc_vouchers v
         where v.company_id = named_id and v.status <> 'cancelled'
       )
    then
      update public.acc_companies
        set is_primary = false, status = 'archived', updated_at = now()
        where id = primary_id;
      update public.acc_companies
        set is_primary = true, updated_at = now()
        where id = named_id;
      update public.acc_settings
        set company_name = finance_name, updated_at = now()
        where organization_id = input_org_id;
      return named_id;
    end if;

    if named_id is null then
      update public.acc_companies
        set name = finance_name, updated_at = now()
        where id = primary_id;
      update public.acc_settings
        set company_name = finance_name, updated_at = now()
        where organization_id = input_org_id
          and (company_name is null or lower(trim(company_name)) = 'company 1');
      perform public.acc_seed_coa_for_company(input_org_id, primary_id);
      perform public.acc_write_audit(
        input_org_id, 'company', primary_id, 'rename',
        jsonb_build_object('name', primary_name),
        jsonb_build_object('name', finance_name),
        'Primary company renamed from Company 1 to the finance business',
        primary_id
      );
      return primary_id;
    end if;
  end if;

  select c.id into company_id
  from public.acc_companies c
  where c.organization_id = input_org_id
    and c.status = 'active'
    and lower(trim(c.name)) = lower(finance_name)
  order by c.is_primary desc, c.created_at
  limit 1;
  if company_id is not null then
    perform public.acc_seed_coa_for_company(input_org_id, company_id);
    return company_id;
  end if;

  select c.books_started_on, c.fy_start_month into started, fy
  from public.acc_companies c
  where c.organization_id = input_org_id and c.is_primary
  limit 1;

  insert into public.acc_companies(
    organization_id, name, fy_start_month, books_started_on, is_primary, status, created_by
  ) values (
    input_org_id,
    finance_name,
    coalesce(fy, 4),
    coalesce(started, current_date),
    false,
    'active',
    auth.uid()
  )
  returning id into company_id;

  perform public.acc_seed_coa_for_company(input_org_id, company_id);
  perform public.acc_write_audit(
    input_org_id, 'company', company_id, 'create', null,
    jsonb_build_object('name', finance_name),
    'Finance company books opened for integration sync',
    company_id
  );
  return company_id;
end;
$$;

revoke all on function public.acc_finance_books_company_id(uuid) from public, anon, authenticated;

do $$
declare org_id uuid;
begin
  for org_id in select id from public.organizations loop
    perform public.acc_finance_books_company_id(org_id);
  end loop;
end $$;

notify pgrst, 'reload schema';
