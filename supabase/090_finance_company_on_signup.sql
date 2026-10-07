-- Create the finance company when the business account is created.
-- Copy cashbook rows into that company only when integration is on and Sync runs.
-- Run after 089_finance_company_one_name.sql.

alter table public.acc_companies
  add column if not exists is_finance_books boolean not null default false;

create unique index if not exists acc_companies_one_finance_books_idx
  on public.acc_companies (organization_id)
  where is_finance_books and status = 'active';

-- Opens the finance company's Accounts entry. Does not copy cashbook rows.
create or replace function public.acc_open_finance_company(input_org_id uuid, input_name text default null)
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
  make_primary boolean;
begin
  select coalesce(nullif(trim(input_name), ''), nullif(trim(o.name), ''))
    into finance_name
  from public.organizations o
  where o.id = input_org_id;
  if finance_name is null then
    return public.acc_primary_company_id(input_org_id);
  end if;

  select c.id into company_id
  from public.acc_companies c
  where c.organization_id = input_org_id
    and c.status = 'active'
    and c.is_finance_books
  limit 1;
  if company_id is not null then
    update public.acc_companies
      set name = finance_name, updated_at = now()
      where id = company_id
        and lower(trim(name)) = 'company 1';
    perform public.acc_seed_coa_for_company(input_org_id, company_id);
    return company_id;
  end if;

  select c.id, c.name into primary_id, primary_name
  from public.acc_companies c
  where c.organization_id = input_org_id
    and c.is_primary
    and c.status = 'active'
  limit 1;

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
          set status = 'archived', is_finance_books = false, updated_at = now()
          where id = dup_id;
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
        set is_primary = false, is_finance_books = false, status = 'archived', updated_at = now()
        where id = primary_id;
      update public.acc_companies
        set is_primary = true, is_finance_books = true, updated_at = now()
        where id = named_id;
      company_id := named_id;
    elsif named_id is null then
      update public.acc_companies
        set name = finance_name, is_finance_books = true, updated_at = now()
        where id = primary_id;
      update public.acc_settings
        set company_name = finance_name, updated_at = now()
        where organization_id = input_org_id
          and (company_name is null or lower(trim(company_name)) = 'company 1');
      company_id := primary_id;
    end if;
  end if;

  if company_id is null then
    select c.id into company_id
    from public.acc_companies c
    where c.organization_id = input_org_id
      and c.status = 'active'
      and lower(trim(c.name)) = lower(finance_name)
    order by c.is_primary desc, c.created_at
    limit 1;
    if company_id is not null then
      update public.acc_companies
        set is_finance_books = false, updated_at = now()
        where organization_id = input_org_id
          and id <> company_id
          and is_finance_books;
      update public.acc_companies
        set is_finance_books = true, updated_at = now()
        where id = company_id;
    end if;
  end if;

  if company_id is null then
    select c.books_started_on, c.fy_start_month into started, fy
    from public.acc_companies c
    where c.organization_id = input_org_id and c.is_primary
    limit 1;
    make_primary := primary_id is null and not exists (
      select 1 from public.acc_companies c
      where c.organization_id = input_org_id and c.is_primary
    );
    insert into public.acc_companies(
      organization_id, name, fy_start_month, books_started_on, is_primary, is_finance_books, status, created_by
    ) values (
      input_org_id,
      finance_name,
      coalesce(fy, 4),
      coalesce(started, current_date),
      make_primary,
      true,
      'active',
      auth.uid()
    )
    returning id into company_id;
    perform public.acc_write_audit(
      input_org_id, 'company', company_id, 'create', null,
      jsonb_build_object('name', finance_name),
      'Finance company opened with the business account',
      company_id
    );
  end if;

  perform public.acc_seed_coa_for_company(input_org_id, company_id);
  insert into public.acc_settings(organization_id, company_name, books_started_on)
  values (
    input_org_id,
    case when coalesce((select c.is_primary from public.acc_companies c where c.id = company_id), false)
      then finance_name else null end,
    coalesce(started, current_date)
  )
  on conflict (organization_id) do nothing;
  return company_id;
end;
$$;

revoke all on function public.acc_open_finance_company(uuid, text) from public, anon, authenticated;

-- Sync looks up the company created with the business. It does not create one.
create or replace function public.acc_finance_books_company_id(input_org_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare company_id uuid;
begin
  select c.id into company_id
  from public.acc_companies c
  where c.organization_id = input_org_id
    and c.status = 'active'
    and c.is_finance_books
  limit 1;
  return company_id;
end;
$$;

revoke all on function public.acc_finance_books_company_id(uuid) from public, anon, authenticated;

create or replace function public.provision_financier(
  workspace_name text,
  display_name text,
  invite_code text default null
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  org_id uuid;
  user_id uuid;
  required_invite text;
begin
  user_id := auth.uid();
  if user_id is null then
    raise exception 'Authentication required';
  end if;
  if exists (select 1 from public.profiles where id = user_id) then
    raise exception 'Workspace already provisioned for this account';
  end if;
  if nullif(trim(workspace_name), '') is null or nullif(trim(display_name), '') is null then
    raise exception 'Business name and display name are required';
  end if;

  required_invite := nullif(trim(current_setting('app.fintrack_signup_invite_code', true)), '');
  if required_invite is not null and coalesce(trim(invite_code), '') <> required_invite then
    raise exception 'Invalid invite code';
  end if;

  insert into public.organizations(name)
  values (trim(workspace_name))
  returning id into org_id;

  insert into public.profiles(id, organization_id, full_name, role, is_active)
  values (user_id, org_id, trim(display_name), 'owner', true);

  perform public.acc_open_finance_company(org_id, trim(workspace_name));
  return org_id;
end;
$$;

grant execute on function public.provision_financier(text, text, text) to authenticated;

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
    ) order by c.is_primary desc, lower(c.name))
    from public.acc_companies c
    where c.organization_id = org_id
  ), '[]'::jsonb);
end;
$$;

grant execute on function public.acc_list_companies() to authenticated;

create or replace function public.acc_sync_operations()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  org_id uuid;
  active_company_id uuid;
  enabled boolean;
  grouped record;
  lines jsonb;
  cash_in numeric;
  cash_out numeric;
  upi_in numeric;
  upi_out numeric;
  bank_in numeric;
  bank_out numeric;
  total_in numeric;
  total_out numeric;
  recv uuid;
  capital uuid;
  other_income uuid;
  other_expense uuid;
  opening_already numeric;
  created integer := 0;
  skipped integer := 0;
  skip_reason text;
begin
  org_id := public.acc_require_owner();
  select integration_enabled into enabled from public.acc_settings where organization_id = org_id;
  if not coalesce(enabled, false) then
    return jsonb_build_object('created', 0, 'skipped', 0, 'integration', false);
  end if;
  active_company_id := public.acc_finance_books_company_id(org_id);
  if active_company_id is null then
    return jsonb_build_object(
      'created', 0,
      'skipped', 0,
      'integration', true,
      'skip_reason', 'The finance company is not in Accounts yet'
    );
  end if;

  for grouped in
    select source_type, source_id, min(entry_date) as entry_date, min(description) as description,
           coalesce(sum(money_in) filter (where la.account_type = 'cash'), 0) as cash_in,
           coalesce(sum(money_out) filter (where la.account_type = 'cash'), 0) as cash_out,
           coalesce(sum(money_in) filter (where la.account_type = 'upi'), 0) as upi_in,
           coalesce(sum(money_out) filter (where la.account_type = 'upi'), 0) as upi_out,
           coalesce(sum(money_in) filter (where la.account_type = 'bank'), 0) as bank_in,
           coalesce(sum(money_out) filter (where la.account_type = 'bank'), 0) as bank_out,
           coalesce(sum(money_in), 0) as money_in,
           coalesce(sum(money_out), 0) as money_out,
           min(fa.kind) as finance_kind
    from public.cashbook_entries e
    join public.ledger_accounts la on la.id = e.ledger_account_id
    left join public.finance_accounts fa on fa.id = e.finance_account_id
    where e.organization_id = org_id and e.source_type is not null and e.source_id is not null
    group by source_type, source_id
  loop
    if exists (
      select 1 from public.acc_vouchers v
      where v.company_id = active_company_id and v.source_type = grouped.source_type
        and v.source_transaction_id = grouped.source_id and v.status = 'posted'
    ) then
      continue;
    end if;

    cash_in := grouped.cash_in;
    cash_out := grouped.cash_out;
    upi_in := grouped.upi_in;
    upi_out := grouped.upi_out;
    bank_in := grouped.bank_in;
    bank_out := grouped.bank_out;
    total_in := grouped.money_in;
    total_out := grouped.money_out;
    recv := case
      when grouped.source_type like 'chit_%' or grouped.source_type like '%payout%' or grouped.source_type like '%lift%'
        then public.acc_coa_id(org_id, '1130', active_company_id)
      when grouped.finance_kind = 'monthly' then public.acc_coa_id(org_id, '1120', active_company_id)
      when grouped.finance_kind = 'daily' then public.acc_coa_id(org_id, '1110', active_company_id)
      else public.acc_coa_id(org_id, '1100', active_company_id)
    end;
    lines := '[]'::jsonb;

    if grouped.source_type = 'finance_payment'
      or (grouped.source_type like 'chit_%' and grouped.source_type not like '%payout%' and grouped.source_type not like '%lift%' and total_in > 0) then
      if cash_in > 0 then lines := lines || jsonb_build_array(jsonb_build_object('coa_id', public.acc_coa_id(org_id, '1000', active_company_id), 'debit', cash_in, 'credit', 0)); end if;
      if upi_in > 0 then lines := lines || jsonb_build_array(jsonb_build_object('coa_id', public.acc_coa_id(org_id, '1010', active_company_id), 'debit', upi_in, 'credit', 0)); end if;
      if bank_in > 0 then lines := lines || jsonb_build_array(jsonb_build_object('coa_id', public.acc_coa_id(org_id, '1020', active_company_id), 'debit', bank_in, 'credit', 0)); end if;
      lines := lines || jsonb_build_array(jsonb_build_object('coa_id', recv, 'debit', 0, 'credit', total_in));
      begin
        perform public.acc_post_voucher('receipt', grouped.entry_date, grouped.description, lines, null, case when grouped.source_type like 'chit_%' then 'chit' else 'finance' end, grouped.source_type, grouped.source_id, active_company_id, null);
        created := created + 1;
      exception when others then
        skipped := skipped + 1;
        if skip_reason is null then skip_reason := sqlerrm; end if;
      end;

    elsif grouped.source_type = 'finance_disbursement' then
      lines := jsonb_build_array(jsonb_build_object('coa_id', recv, 'debit', total_out, 'credit', 0));
      if cash_out > 0 then lines := lines || jsonb_build_array(jsonb_build_object('coa_id', public.acc_coa_id(org_id, '1000', active_company_id), 'debit', 0, 'credit', cash_out)); end if;
      if upi_out > 0 then lines := lines || jsonb_build_array(jsonb_build_object('coa_id', public.acc_coa_id(org_id, '1010', active_company_id), 'debit', 0, 'credit', upi_out)); end if;
      if bank_out > 0 then lines := lines || jsonb_build_array(jsonb_build_object('coa_id', public.acc_coa_id(org_id, '1020', active_company_id), 'debit', 0, 'credit', bank_out)); end if;
      begin
        perform public.acc_post_voucher('payment', grouped.entry_date, grouped.description, lines, null, 'finance', grouped.source_type, grouped.source_id, active_company_id, null);
        created := created + 1;
      exception when others then
        skipped := skipped + 1;
        if skip_reason is null then skip_reason := sqlerrm; end if;
      end;

    elsif grouped.source_type like '%payout%' or grouped.source_type like '%lift%' then
      lines := jsonb_build_array(jsonb_build_object('coa_id', recv, 'debit', total_out, 'credit', 0));
      if cash_out > 0 then lines := lines || jsonb_build_array(jsonb_build_object('coa_id', public.acc_coa_id(org_id, '1000', active_company_id), 'debit', 0, 'credit', cash_out)); end if;
      if upi_out > 0 then lines := lines || jsonb_build_array(jsonb_build_object('coa_id', public.acc_coa_id(org_id, '1010', active_company_id), 'debit', 0, 'credit', upi_out)); end if;
      if bank_out > 0 then lines := lines || jsonb_build_array(jsonb_build_object('coa_id', public.acc_coa_id(org_id, '1020', active_company_id), 'debit', 0, 'credit', bank_out)); end if;
      begin
        perform public.acc_post_voucher('payment', grouped.entry_date, grouped.description, lines, null, 'chit', grouped.source_type, grouped.source_id, active_company_id, null);
        created := created + 1;
      exception when others then
        skipped := skipped + 1;
        if skip_reason is null then skip_reason := sqlerrm; end if;
      end;

    elsif grouped.source_type = 'expense'
      or (grouped.source_type = 'manual' and total_out > 0 and total_in = 0) then
      other_expense := public.acc_coa_id(org_id, '5990', active_company_id);
      lines := jsonb_build_array(jsonb_build_object('coa_id', other_expense, 'debit', total_out, 'credit', 0));
      if cash_out > 0 then lines := lines || jsonb_build_array(jsonb_build_object('coa_id', public.acc_coa_id(org_id, '1000', active_company_id), 'debit', 0, 'credit', cash_out)); end if;
      if upi_out > 0 then lines := lines || jsonb_build_array(jsonb_build_object('coa_id', public.acc_coa_id(org_id, '1010', active_company_id), 'debit', 0, 'credit', upi_out)); end if;
      if bank_out > 0 then lines := lines || jsonb_build_array(jsonb_build_object('coa_id', public.acc_coa_id(org_id, '1020', active_company_id), 'debit', 0, 'credit', bank_out)); end if;
      begin
        perform public.acc_post_voucher('payment', grouped.entry_date, grouped.description, lines, null, 'cashbook', grouped.source_type, grouped.source_id, active_company_id, null);
        created := created + 1;
      exception when others then
        skipped := skipped + 1;
        if skip_reason is null then skip_reason := sqlerrm; end if;
      end;

    elsif grouped.source_type = 'manual' and total_in > 0 and total_out = 0 then
      other_income := public.acc_coa_id(org_id, '4100', active_company_id);
      if cash_in > 0 then lines := lines || jsonb_build_array(jsonb_build_object('coa_id', public.acc_coa_id(org_id, '1000', active_company_id), 'debit', cash_in, 'credit', 0)); end if;
      if upi_in > 0 then lines := lines || jsonb_build_array(jsonb_build_object('coa_id', public.acc_coa_id(org_id, '1010', active_company_id), 'debit', upi_in, 'credit', 0)); end if;
      if bank_in > 0 then lines := lines || jsonb_build_array(jsonb_build_object('coa_id', public.acc_coa_id(org_id, '1020', active_company_id), 'debit', bank_in, 'credit', 0)); end if;
      lines := lines || jsonb_build_array(jsonb_build_object('coa_id', other_income, 'debit', 0, 'credit', total_in));
      begin
        perform public.acc_post_voucher('receipt', grouped.entry_date, grouped.description, lines, null, 'cashbook', grouped.source_type, grouped.source_id, active_company_id, null);
        created := created + 1;
      exception when others then
        skipped := skipped + 1;
        if skip_reason is null then skip_reason := sqlerrm; end if;
      end;

    elsif grouped.source_type = 'transfer' then
      if cash_in > 0 then lines := lines || jsonb_build_array(jsonb_build_object('coa_id', public.acc_coa_id(org_id, '1000', active_company_id), 'debit', cash_in, 'credit', 0)); end if;
      if upi_in > 0 then lines := lines || jsonb_build_array(jsonb_build_object('coa_id', public.acc_coa_id(org_id, '1010', active_company_id), 'debit', upi_in, 'credit', 0)); end if;
      if bank_in > 0 then lines := lines || jsonb_build_array(jsonb_build_object('coa_id', public.acc_coa_id(org_id, '1020', active_company_id), 'debit', bank_in, 'credit', 0)); end if;
      if cash_out > 0 then lines := lines || jsonb_build_array(jsonb_build_object('coa_id', public.acc_coa_id(org_id, '1000', active_company_id), 'debit', 0, 'credit', cash_out)); end if;
      if upi_out > 0 then lines := lines || jsonb_build_array(jsonb_build_object('coa_id', public.acc_coa_id(org_id, '1010', active_company_id), 'debit', 0, 'credit', upi_out)); end if;
      if bank_out > 0 then lines := lines || jsonb_build_array(jsonb_build_object('coa_id', public.acc_coa_id(org_id, '1020', active_company_id), 'debit', 0, 'credit', bank_out)); end if;
      begin
        perform public.acc_post_voucher('contra', grouped.entry_date, grouped.description, lines, null, 'cashbook', grouped.source_type, grouped.source_id, active_company_id, null);
        created := created + 1;
      exception when others then
        skipped := skipped + 1;
        if skip_reason is null then skip_reason := sqlerrm; end if;
      end;

    elsif grouped.source_type = 'opening_balance' and total_in > 0 then
      select coalesce(c.opening_balance, 0) into opening_already
      from public.acc_coa c
      where c.id = case
        when cash_in > 0 then public.acc_coa_id(org_id, '1000', active_company_id)
        when upi_in > 0 then public.acc_coa_id(org_id, '1010', active_company_id)
        else public.acc_coa_id(org_id, '1020', active_company_id)
      end;
      if coalesce(opening_already, 0) <> 0 then
        skipped := skipped + 1;
        if skip_reason is null then skip_reason := 'Opening is already on the Accounts ledger'; end if;
      else
        capital := public.acc_coa_id(org_id, '3000', active_company_id);
        if cash_in > 0 then lines := lines || jsonb_build_array(jsonb_build_object('coa_id', public.acc_coa_id(org_id, '1000', active_company_id), 'debit', cash_in, 'credit', 0)); end if;
        if upi_in > 0 then lines := lines || jsonb_build_array(jsonb_build_object('coa_id', public.acc_coa_id(org_id, '1010', active_company_id), 'debit', upi_in, 'credit', 0)); end if;
        if bank_in > 0 then lines := lines || jsonb_build_array(jsonb_build_object('coa_id', public.acc_coa_id(org_id, '1020', active_company_id), 'debit', bank_in, 'credit', 0)); end if;
        lines := lines || jsonb_build_array(jsonb_build_object('coa_id', capital, 'debit', 0, 'credit', total_in));
        begin
          perform public.acc_post_voucher('journal', grouped.entry_date, grouped.description, lines, null, 'cashbook', grouped.source_type, grouped.source_id, active_company_id, null);
          created := created + 1;
        exception when others then
          skipped := skipped + 1;
          if skip_reason is null then skip_reason := sqlerrm; end if;
        end;
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'created', created,
    'skipped', skipped,
    'skip_reason', skip_reason,
    'integration', true,
    'company_id', active_company_id,
    'company_name', (select c.name from public.acc_companies c where c.id = active_company_id)
  );
end;
$$;


grant execute on function public.acc_sync_operations() to authenticated;

create or replace function public.update_organization_receipt_settings(
  input_company_name text default null,
  input_company_address text default null,
  input_company_phone text default null,
  input_company_email text default null,
  input_company_logo_url text default null,
  input_receipt_footer text default null,
  input_receipt_terms text default null,
  input_whatsapp_templates jsonb default null,
  input_reminder_settings jsonb default null
) returns void language plpgsql security definer set search_path = public
as $$
declare
  org_id uuid;
  finance_name text;
begin
  if not public.is_financier_owner() then
    raise exception 'Only a financier can update organization settings';
  end if;
  org_id := public.current_organization_id();
  finance_name := nullif(trim(input_company_name), '');
  update public.organizations set
    name = coalesce(finance_name, name),
    company_address = coalesce(input_company_address, company_address),
    company_phone = coalesce(input_company_phone, company_phone),
    company_email = coalesce(input_company_email, company_email),
    company_logo_url = coalesce(input_company_logo_url, company_logo_url),
    receipt_footer = coalesce(input_receipt_footer, receipt_footer),
    receipt_terms = coalesce(input_receipt_terms, receipt_terms),
    whatsapp_templates = coalesce(input_whatsapp_templates, whatsapp_templates),
    reminder_settings = coalesce(input_reminder_settings, reminder_settings)
  where id = org_id;
  if finance_name is not null then
    update public.acc_companies
      set name = finance_name, updated_at = now()
      where organization_id = org_id
        and status = 'active'
        and is_finance_books
        and lower(trim(name)) is distinct from lower(finance_name)
        and not exists (
          select 1 from public.acc_companies other
          where other.organization_id = org_id
            and other.status = 'active'
            and other.is_finance_books = false
            and lower(trim(other.name)) = lower(finance_name)
        );
  end if;
end;
$$;

grant execute on function public.update_organization_receipt_settings(text, text, text, text, text, text, text, jsonb, jsonb) to authenticated;

create or replace function public.acc_initialize(input_company_name text default null, input_books_started_on date default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  org_id uuid;
  company_id uuid;
  finance_name text;
begin
  org_id := public.acc_require_owner();
  select nullif(trim(o.name), '') into finance_name
  from public.organizations o
  where o.id = org_id;
  insert into public.acc_settings(organization_id, company_name, books_started_on)
  values (org_id, nullif(trim(input_company_name), ''), coalesce(input_books_started_on, current_date))
  on conflict (organization_id) do update set
    company_name = coalesce(excluded.company_name, public.acc_settings.company_name),
    books_started_on = coalesce(public.acc_settings.books_started_on, excluded.books_started_on),
    updated_at = now(),
    updated_by = auth.uid();
  company_id := public.acc_primary_company_id(org_id);
  if company_id is null then
    company_id := public.acc_open_finance_company(org_id, coalesce(nullif(trim(input_company_name), ''), finance_name));
    if input_books_started_on is not null then
      update public.acc_companies
        set books_started_on = coalesce(books_started_on, input_books_started_on), updated_at = now()
        where id = company_id;
    end if;
  elsif nullif(trim(input_company_name), '') is not null
        and exists (select 1 from public.acc_companies c where c.id = company_id and c.is_finance_books) then
    update public.acc_companies
      set name = trim(input_company_name),
          books_started_on = coalesce(books_started_on, input_books_started_on),
          updated_at = now()
      where id = company_id;
  end if;
  perform public.acc_seed_coa_for_company(org_id, company_id);
  perform public.acc_write_audit(org_id, 'settings', org_id, 'initialize', null, jsonb_build_object('company_name', input_company_name), 'Books opened', company_id);
  return jsonb_build_object('ok', true, 'company_id', company_id);
end;
$$;

grant execute on function public.acc_initialize(text, date) to authenticated;

-- Existing businesses get the finance company entry now. Cashbook rows stay unsynced until Sync.
do $$
declare org_id uuid;
begin
  for org_id in select id from public.organizations loop
    perform public.acc_open_finance_company(org_id);
  end loop;
end $$;

notify pgrst, 'reload schema';
