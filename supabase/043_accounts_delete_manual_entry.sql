-- Allow owner to delete manual cashbook entries (expenses, capital, salary, etc.).
-- Run after 041_accounts_cashbook.sql if Delete in Cashbook does nothing.

create or replace function public.accounts_delete_manual_entry(input_entry_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare deleted integer;
begin
  if not public.is_financier_owner() then raise exception 'Only a financier can delete cashbook entries'; end if;
  delete from public.cashbook_entries
  where id = input_entry_id
    and organization_id = public.current_organization_id()
    and is_editable = true;
  get diagnostics deleted = row_count;
  if deleted = 0 then
    raise exception 'This transaction cannot be deleted. Synced FinTrack entries must be changed on the original record.';
  end if;
end;
$$;
grant execute on function public.accounts_delete_manual_entry(uuid) to authenticated;
