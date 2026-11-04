-- Create company by copying masters (+ closing balances as openings) from another company.
-- Close / reopen (archive / unarchive).
-- Apply after 117. Safe to re-run.

create or replace function public.acc_unarchive_company(
  input_company_id uuid,
  input_reason text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  org_id uuid;
  company public.acc_companies%rowtype;
begin
  org_id := public.acc_require_admin();
  select * into company
    from public.acc_companies c
   where c.id = input_company_id and c.organization_id = org_id;
  if company.id is null then raise exception 'Company not found'; end if;
  if company.status <> 'archived' then return; end if;
  if exists (
    select 1 from public.acc_companies o
    where o.organization_id = org_id
      and o.status = 'active'
      and lower(o.name) = lower(company.name)
      and o.id <> company.id
  ) then
    raise exception 'An active company already uses this name. Rename before reopening.';
  end if;
  update public.acc_companies
     set status = 'active', updated_at = now()
   where id = company.id;
  perform public.acc_write_audit(
    org_id, 'company', company.id, 'unarchive',
    jsonb_build_object('status', 'archived'),
    jsonb_build_object('status', 'active'),
    coalesce(nullif(trim(input_reason), ''), 'Company reopened'),
    company.id
  );
end;
$$;

grant execute on function public.acc_unarchive_company(uuid, text) to authenticated;

create or replace function public.acc_create_company_from(
  input_name text,
  input_source_company_id uuid,
  input_books_started_on date default null,
  input_as_of date default null,
  input_fy_start_month integer default 4,
  input_pan text default null,
  input_copy_coa boolean default true,
  input_copy_parties boolean default true,
  input_copy_items boolean default true,
  input_copy_document_settings boolean default true,
  input_copy_openings boolean default true
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  org_id uuid;
  source public.acc_companies%rowtype;
  new_company_id uuid;
  nm text;
  normalized_pan text;
  books_on date;
  as_of date;
  src record;
  new_id uuid;
  parent_new uuid;
  capital_id uuid;
  ar_id uuid;
  ap_id uuid;
  od numeric;
  oc numeric;
  td numeric;
  tc numeric;
  signed_bal numeric;
  amt numeric;
  side text;
  pl_net numeric := 0;
  party_bal numeric;
  stock_qty numeric;
  open_rate numeric;
  lines jsonb;
  narr text;
  has_opening boolean;
  debit_open numeric := 0;
  credit_open numeric := 0;
  imbalance numeric;
  cap_amt numeric;
  cap_side text;
begin
  org_id := public.acc_require_admin();
  nm := nullif(trim(input_name), '');
  if nm is null then raise exception 'Company name is required'; end if;
  if input_source_company_id is null then raise exception 'Choose a company to copy from'; end if;

  select * into source
    from public.acc_companies c
   where c.id = input_source_company_id and c.organization_id = org_id;
  if source.id is null then raise exception 'Source company not found'; end if;
  if not public.acc_can_access_company(source.id) then
    raise exception 'You do not have access to the source company';
  end if;

  if exists (
    select 1 from public.acc_companies
    where organization_id = org_id and lower(name) = lower(nm) and status = 'active'
  ) then
    raise exception 'A company with this name already exists';
  end if;

  books_on := coalesce(input_books_started_on, current_date);
  as_of := coalesce(input_as_of, (books_on - 1));
  if as_of >= books_on then
    raise exception 'Closing date must be before the new books start date';
  end if;

  normalized_pan := public.acc_assert_pan(input_pan);

  insert into public.acc_companies(
    organization_id, name, fy_start_month, books_started_on, is_primary, status, pan, created_by
  ) values (
    org_id, nm, coalesce(input_fy_start_month, source.fy_start_month, 4), books_on,
    false, 'active', normalized_pan, auth.uid()
  ) returning id into new_company_id;

  perform public.acc_seed_coa_for_company(org_id, new_company_id);

  if coalesce(input_copy_coa, true) then
    for src in
      select * from public.acc_coa c
      where c.organization_id = org_id and c.company_id = source.id
      order by c.code
    loop
      update public.acc_coa t
         set name = src.name,
             account_type = src.account_type,
             is_active = src.is_active,
             opening_balance = 0,
             opening_side = 'debit'
       where t.company_id = new_company_id and t.code = src.code;

      if not found then
        insert into public.acc_coa(
          organization_id, company_id, code, name, group_type, account_type,
          is_system, is_active, opening_balance, opening_side
        ) values (
          org_id, new_company_id, src.code, src.name, src.group_type, src.account_type,
          false, src.is_active, 0, 'debit'
        );
      end if;
    end loop;

    for src in
      select child.code as child_code, parent.code as parent_code
        from public.acc_coa child
        join public.acc_coa parent on parent.id = child.parent_id
       where child.company_id = source.id and child.parent_id is not null
    loop
      update public.acc_coa t
         set parent_id = (
           select p.id from public.acc_coa p
            where p.company_id = new_company_id and p.code = src.parent_code
            limit 1
         )
       where t.company_id = new_company_id and t.code = src.child_code;
    end loop;
  end if;

  if coalesce(input_copy_parties, true) then
    for src in
      select * from public.acc_parties p
      where p.organization_id = org_id and p.company_id = source.id
      order by p.name
    loop
      insert into public.acc_parties(
        organization_id, company_id, party_type, name, phone, email, address,
        gstin, state_code, gst_registration, notes, is_active,
        credit_limit, credit_days
      ) values (
        org_id, new_company_id, src.party_type, src.name, src.phone, src.email, src.address,
        src.gstin, src.state_code, src.gst_registration, src.notes, src.is_active,
        src.credit_limit, src.credit_days
      );
    end loop;
  end if;

  if coalesce(input_copy_items, true) then
    for src in
      select * from public.acc_item_categories c
      where c.organization_id = org_id and c.company_id = source.id and c.parent_id is null
      order by lower(c.name)
    loop
      insert into public.acc_item_categories(organization_id, company_id, name, is_active)
      values (org_id, new_company_id, src.name, src.is_active);
    end loop;

    for src in
      select child.*, parent.name as parent_name
        from public.acc_item_categories child
        join public.acc_item_categories parent on parent.id = child.parent_id
       where child.organization_id = org_id and child.company_id = source.id and child.parent_id is not null
       order by lower(child.name)
    loop
      select id into parent_new from public.acc_item_categories
       where company_id = new_company_id and name = src.parent_name and parent_id is null
       limit 1;
      insert into public.acc_item_categories(organization_id, company_id, name, is_active, parent_id)
      values (org_id, new_company_id, src.name, src.is_active, parent_new);
    end loop;

    for src in
      select i.*, cat.name as category_name, pcat.name as parent_category_name
        from public.acc_items i
        left join public.acc_item_categories cat on cat.id = i.category_id
        left join public.acc_item_categories pcat on pcat.id = cat.parent_id
       where i.organization_id = org_id and i.company_id = source.id
       order by lower(i.name)
    loop
      parent_new := null;
      if src.category_name is not null then
        if src.parent_category_name is not null then
          select child.id into parent_new
            from public.acc_item_categories child
            join public.acc_item_categories parent on parent.id = child.parent_id
           where child.company_id = new_company_id
             and child.name = src.category_name
             and parent.name = src.parent_category_name
           limit 1;
        else
          select id into parent_new from public.acc_item_categories
           where company_id = new_company_id and name = src.category_name and parent_id is null
           limit 1;
        end if;
      end if;

      stock_qty := 0;
      open_rate := coalesce(src.opening_rate, nullif(src.purchase_price, 0), nullif(src.selling_price, 0));

      if coalesce(input_copy_openings, true) and src.item_type = 'product' then
        select coalesce(sum(m.quantity_delta), 0) into stock_qty
          from public.acc_stock_movements m
         where m.organization_id = org_id
           and m.company_id = source.id
           and m.item_id = src.id
           and m.movement_date <= as_of;
        select exists (
          select 1 from public.acc_stock_movements m
           where m.organization_id = org_id and m.company_id = source.id
             and m.item_id = src.id and m.reason = 'opening'
             and m.movement_date <= as_of
        ) into has_opening;
        if not has_opening then
          stock_qty := round(stock_qty + coalesce(src.opening_stock, 0), 3);
        end if;
        if stock_qty < 0 then stock_qty := 0; end if;
      end if;

      insert into public.acc_items(
        organization_id, company_id, item_type, name, sku, category_id, unit, description,
        selling_price, purchase_price, gst_rate, hsn_sac,
        opening_stock, opening_stock_date, opening_rate, reorder_level, is_active,
        brand, barcode, batch_no, expiry_date
      ) values (
        org_id, new_company_id, src.item_type, src.name, src.sku, parent_new, src.unit, src.description,
        src.selling_price, src.purchase_price, src.gst_rate, src.hsn_sac,
        case when coalesce(input_copy_openings, true) then stock_qty else 0 end,
        case when coalesce(input_copy_openings, true) and stock_qty <> 0 then books_on else null end,
        open_rate,
        src.reorder_level, src.is_active,
        src.brand, src.barcode, src.batch_no, src.expiry_date
      ) returning id into new_id;

      if coalesce(input_copy_openings, true) and stock_qty <> 0 then
        insert into public.acc_stock_movements(
          organization_id, company_id, item_id, movement_date, quantity_delta, reason, note, created_by
        ) values (
          org_id, new_company_id, new_id, books_on, stock_qty, 'opening',
          'Opening stock copied from ' || source.name || ' as of ' || as_of::text, auth.uid()
        );
      end if;
    end loop;
  end if;

  if coalesce(input_copy_document_settings, true) then
    insert into public.acc_document_settings (
      company_id, organization_id, business_address, business_phone, business_email, logo_data_url,
      upi_id, upi_payee_name, bank_name, bank_account_number, bank_ifsc, invoice_template, show_upi_qr,
      invoice_terms, quotation_terms, credit_control, overdue_block_days, updated_at, updated_by
    )
    select
      new_company_id, org_id, d.business_address, d.business_phone, d.business_email, d.logo_data_url,
      d.upi_id, d.upi_payee_name, d.bank_name, d.bank_account_number, d.bank_ifsc, d.invoice_template, d.show_upi_qr,
      d.invoice_terms, d.quotation_terms, d.credit_control, d.overdue_block_days, now(), auth.uid()
    from public.acc_document_settings d
    where d.company_id = source.id
    on conflict (company_id) do update set
      business_address = excluded.business_address,
      business_phone = excluded.business_phone,
      business_email = excluded.business_email,
      logo_data_url = excluded.logo_data_url,
      upi_id = excluded.upi_id,
      upi_payee_name = excluded.upi_payee_name,
      bank_name = excluded.bank_name,
      bank_account_number = excluded.bank_account_number,
      bank_ifsc = excluded.bank_ifsc,
      invoice_template = excluded.invoice_template,
      show_upi_qr = excluded.show_upi_qr,
      invoice_terms = excluded.invoice_terms,
      quotation_terms = excluded.quotation_terms,
      credit_control = excluded.credit_control,
      overdue_block_days = excluded.overdue_block_days,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by;
  end if;

  if coalesce(input_copy_openings, true) and coalesce(input_copy_coa, true) then
    select id into capital_id from public.acc_coa where company_id = new_company_id and code = '3000' limit 1;
    select id into ar_id from public.acc_coa where company_id = new_company_id and code = '1100' limit 1;
    select id into ap_id from public.acc_coa where company_id = new_company_id and code = '2000' limit 1;

    for src in
      select
        s.code,
        s.group_type,
        coalesce(s.opening_balance, 0) as opening_balance,
        coalesce(s.opening_side, 'debit') as opening_side,
        coalesce((
          select sum(vl.debit) from public.acc_voucher_lines vl
            join public.acc_vouchers v on v.id = vl.voucher_id
           where vl.coa_id = s.id
             and v.company_id = source.id
             and v.status in ('posted', 'reversed')
             and v.voucher_date <= as_of
        ), 0) as period_debit,
        coalesce((
          select sum(vl.credit) from public.acc_voucher_lines vl
            join public.acc_vouchers v on v.id = vl.voucher_id
           where vl.coa_id = s.id
             and v.company_id = source.id
             and v.status in ('posted', 'reversed')
             and v.voucher_date <= as_of
        ), 0) as period_credit
      from public.acc_coa s
      where s.company_id = source.id
    loop
      if coalesce(input_copy_parties, true) and src.code in ('1100', '2000') then
        update public.acc_coa
           set opening_balance = 0, opening_side = 'debit'
         where company_id = new_company_id and code = src.code;
        continue;
      end if;

      if src.group_type in ('income', 'expense') then
        continue;
      end if;

      od := case when src.opening_side = 'credit' then 0 else src.opening_balance end;
      oc := case when src.opening_side = 'credit' then src.opening_balance else 0 end;
      td := od + src.period_debit;
      tc := oc + src.period_credit;
      if src.group_type = 'asset' then
        signed_bal := round(td - tc, 2);
        side := case when signed_bal >= 0 then 'debit' else 'credit' end;
      else
        signed_bal := round(tc - td, 2);
        side := case when signed_bal >= 0 then 'credit' else 'debit' end;
      end if;
      amt := abs(signed_bal);
      update public.acc_coa
         set opening_balance = amt, opening_side = side
       where company_id = new_company_id and code = src.code;
    end loop;

    -- Net profit/(loss) through as_of → Capital.
    select round(coalesce(sum(
      case
        when s.group_type = 'income' then
          (case when coalesce(s.opening_side, 'credit') = 'credit' then coalesce(s.opening_balance, 0)
                else -coalesce(s.opening_balance, 0) end)
          + coalesce((
              select sum(vl.credit - vl.debit) from public.acc_voucher_lines vl
                join public.acc_vouchers v on v.id = vl.voucher_id
               where vl.coa_id = s.id and v.company_id = source.id
                 and v.status in ('posted', 'reversed') and v.voucher_date <= as_of
            ), 0)
        when s.group_type = 'expense' then
          -((case when coalesce(s.opening_side, 'debit') = 'debit' then coalesce(s.opening_balance, 0)
                  else -coalesce(s.opening_balance, 0) end)
            + coalesce((
                select sum(vl.debit - vl.credit) from public.acc_voucher_lines vl
                  join public.acc_vouchers v on v.id = vl.voucher_id
                 where vl.coa_id = s.id and v.company_id = source.id
                   and v.status in ('posted', 'reversed') and v.voucher_date <= as_of
              ), 0))
        else 0
      end
    ), 0), 2)
    into pl_net
    from public.acc_coa s
    where s.company_id = source.id;

    if capital_id is not null and coalesce(pl_net, 0) <> 0 then
      select coalesce(opening_balance, 0), coalesce(opening_side, 'credit')
        into cap_amt, cap_side
        from public.acc_coa where id = capital_id;
      if cap_side = 'credit' then
        signed_bal := round(cap_amt + pl_net, 2);
      else
        signed_bal := round(-cap_amt + pl_net, 2);
      end if;
      update public.acc_coa
         set opening_balance = abs(signed_bal),
             opening_side = case when signed_bal >= 0 then 'credit' else 'debit' end
       where id = capital_id;
    end if;

    if coalesce(input_copy_parties, true) and ar_id is not null and ap_id is not null and capital_id is not null then
      for src in
        select
          sp.party_type,
          sp.name,
          tp.id as target_party_id,
          round(coalesce((
            select sum(vl.debit - vl.credit)
              from public.acc_voucher_lines vl
              join public.acc_vouchers v on v.id = vl.voucher_id
              join public.acc_coa c on c.id = vl.coa_id
             where v.company_id = source.id
               and v.status in ('posted', 'reversed')
               and v.voucher_date <= as_of
               and vl.party_id = sp.id
               and c.account_type = 'receivable'
          ), 0), 2) as customer_bal,
          round(coalesce((
            select sum(vl.credit - vl.debit)
              from public.acc_voucher_lines vl
              join public.acc_vouchers v on v.id = vl.voucher_id
              join public.acc_coa c on c.id = vl.coa_id
             where v.company_id = source.id
               and v.status in ('posted', 'reversed')
               and v.voucher_date <= as_of
               and vl.party_id = sp.id
               and c.account_type = 'payable'
          ), 0), 2) as supplier_bal
        from public.acc_parties sp
        join public.acc_parties tp
          on tp.company_id = new_company_id
         and tp.party_type = sp.party_type
         and lower(tp.name) = lower(sp.name)
         and coalesce(tp.phone, '') = coalesce(sp.phone, '')
        where sp.company_id = source.id
          and sp.party_type in ('customer', 'supplier')
      loop
        party_bal := case when src.party_type = 'customer' then src.customer_bal else src.supplier_bal end;
        if party_bal is null or party_bal <= 0 then continue; end if;
        narr := 'Opening balance — ' || src.name;
        if src.party_type = 'customer' then
          lines := jsonb_build_array(
            jsonb_build_object('coa_id', ar_id, 'party_id', src.target_party_id, 'debit', party_bal, 'credit', 0, 'description', narr),
            jsonb_build_object('coa_id', capital_id, 'debit', 0, 'credit', party_bal, 'description', narr)
          );
        else
          lines := jsonb_build_array(
            jsonb_build_object('coa_id', capital_id, 'debit', party_bal, 'credit', 0, 'description', narr),
            jsonb_build_object('coa_id', ap_id, 'party_id', src.target_party_id, 'debit', 0, 'credit', party_bal, 'description', narr)
          );
        end if;
        begin
          perform public.acc_post_voucher(
            'journal', books_on, narr, lines, src.target_party_id,
            'accounts', 'party_opening', null, new_company_id, null, null, null
          );
        exception when others then
          null;
        end;
      end loop;
    end if;

    select
      coalesce(sum(case when opening_side = 'debit' then opening_balance else 0 end), 0),
      coalesce(sum(case when opening_side = 'credit' then opening_balance else 0 end), 0)
    into debit_open, credit_open
    from public.acc_coa
    where company_id = new_company_id;

    imbalance := round(debit_open - credit_open, 2);
    if capital_id is not null and imbalance <> 0 then
      select coalesce(opening_balance, 0), coalesce(opening_side, 'credit')
        into cap_amt, cap_side
        from public.acc_coa where id = capital_id;
      -- Positive imbalance (more debit) → add credit on capital; negative → add debit.
      if imbalance > 0 then
        if cap_side = 'credit' then
          signed_bal := round(cap_amt + imbalance, 2);
        else
          signed_bal := round(-cap_amt + imbalance, 2);
        end if;
      else
        if cap_side = 'debit' then
          signed_bal := round(-cap_amt + imbalance, 2);
        else
          signed_bal := round(cap_amt + imbalance, 2);
        end if;
      end if;
      update public.acc_coa
         set opening_balance = abs(signed_bal),
             opening_side = case when signed_bal >= 0 then 'credit' else 'debit' end
       where id = capital_id;
    end if;
  end if;

  perform public.acc_write_audit(
    org_id, 'company', new_company_id, 'create_from',
    null,
    jsonb_build_object(
      'name', nm,
      'sourceCompanyId', source.id,
      'sourceName', source.name,
      'asOf', as_of,
      'booksStartedOn', books_on,
      'copyCoa', coalesce(input_copy_coa, true),
      'copyParties', coalesce(input_copy_parties, true),
      'copyItems', coalesce(input_copy_items, true),
      'copyDocumentSettings', coalesce(input_copy_document_settings, true),
      'copyOpenings', coalesce(input_copy_openings, true)
    ),
    'Company created by copy',
    new_company_id
  );

  return new_company_id;
end;
$$;

grant execute on function public.acc_create_company_from(
  text, uuid, date, date, integer, text, boolean, boolean, boolean, boolean, boolean
) to authenticated;

notify pgrst, 'reload schema';
