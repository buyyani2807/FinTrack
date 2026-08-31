-- DO NOT RUN. Pilot backfill: multiple payments on one day are kept on purpose.
-- Re-enable only if FinTrack later requires one payment per account per date.

do $$
begin
  raise exception
    '046b is deferred. Duplicate payment days from existing-account backfill are kept. Do not delete them.';
end $$;
