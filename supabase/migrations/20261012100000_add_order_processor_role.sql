-- Incremental migration for deployments that already applied the first
-- operational-role migration before the OrderProcessor role was requested.
alter type public.app_role add value if not exists 'OrderProcessor';
