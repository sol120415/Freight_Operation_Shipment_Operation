-- Historical migration-ledger marker.
--
-- Do not rename or transfer authentication accounts in a schema migration.
-- Operational users must be invited or provisioned separately with their own
-- password and verification flow. Keeping this version as a no-op lets
-- Supabase reconcile environments where the migration number is already in
-- the remote ledger without introducing a shared-password account takeover.
do $$
begin
  null;
end;
$$;
