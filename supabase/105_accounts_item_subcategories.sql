-- Item subcategories. Top-level categories stay as they are.
-- Apply in the Supabase SQL editor. Existing category saves keep working.

alter table public.acc_item_categories
  add column if not exists parent_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'acc_item_categories_parent_id_fkey'
  ) then
    alter table public.acc_item_categories
      add constraint acc_item_categories_parent_id_fkey
      foreign key (parent_id) references public.acc_item_categories(id) on delete restrict;
  end if;
end $$;

create index if not exists acc_item_categories_parent_idx
  on public.acc_item_categories (company_id, parent_id);

drop function if exists public.acc_upsert_item_category(uuid, text, uuid);

create function public.acc_upsert_item_category(
  input_id uuid default null,
  input_name text default null,
  input_company_id uuid default null,
  input_parent_id uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  org_id uuid;
  active_company_id uuid;
  nm text;
  new_id uuid;
begin
  org_id := public.acc_require_owner();
  active_company_id := public.acc_require_company(input_company_id);
  nm := nullif(trim(coalesce(input_name, '')), '');
  if nm is null then raise exception 'Category name is required'; end if;
  if input_parent_id is not null then
    if input_parent_id = input_id then
      raise exception 'A category cannot be its own subcategory';
    end if;
    if not exists (
      select 1 from public.acc_item_categories
      where id = input_parent_id
        and organization_id = org_id
        and company_id = active_company_id
        and parent_id is null
    ) then
      raise exception 'Choose a category for this subcategory';
    end if;
    if input_id is not null and exists (
      select 1 from public.acc_item_categories
      where organization_id = org_id and company_id = active_company_id and parent_id = input_id
    ) then
      raise exception 'A category with subcategories cannot itself be a subcategory';
    end if;
  end if;
  if input_id is null then
    insert into public.acc_item_categories (organization_id, company_id, name, parent_id)
    values (org_id, active_company_id, nm, input_parent_id)
    returning id into new_id;
  else
    update public.acc_item_categories
      set name = nm,
          parent_id = coalesce(input_parent_id, parent_id),
          updated_at = now()
    where id = input_id and organization_id = org_id and company_id = active_company_id
    returning id into new_id;
    if new_id is null then raise exception 'Category not found'; end if;
  end if;
  return new_id;
end;
$$;

grant execute on function public.acc_upsert_item_category(uuid, text, uuid, uuid) to authenticated;

create or replace function public.acc_delete_item_category(
  input_id uuid,
  input_company_id uuid default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  org_id uuid;
  active_company_id uuid;
begin
  org_id := public.acc_require_owner();
  active_company_id := public.acc_require_company(input_company_id);
  if exists (
    select 1 from public.acc_item_categories
    where organization_id = org_id and company_id = active_company_id and parent_id = input_id
  ) then
    raise exception 'Category has subcategories and cannot be deleted.';
  end if;
  if exists (
    select 1 from public.acc_items
    where organization_id = org_id and company_id = active_company_id and category_id = input_id
  ) then
    raise exception 'Category is used by items and cannot be deleted.';
  end if;
  delete from public.acc_item_categories
  where id = input_id and organization_id = org_id and company_id = active_company_id;
  if not found then raise exception 'Category not found'; end if;
end;
$$;

notify pgrst, 'reload schema';
