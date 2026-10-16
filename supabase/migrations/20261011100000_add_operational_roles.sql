-- Add the operational staff roles before any later migration references them.
-- PostgreSQL requires enum labels to commit in a separate migration before
-- functions can safely use them.
alter type public.app_role add value if not exists 'OperationsSupervisor';
alter type public.app_role add value if not exists 'PickupCoordinator';
alter type public.app_role add value if not exists 'IntakeClerk';
alter type public.app_role add value if not exists 'OrderProcessor';
alter type public.app_role add value if not exists 'Dispatcher';
alter type public.app_role add value if not exists 'HandoverOfficer';
alter type public.app_role add value if not exists 'ExceptionOfficer';
alter type public.app_role add value if not exists 'FinanceOps';
alter type public.app_role add value if not exists 'DocumentOfficer';
alter type public.app_role add value if not exists 'CarrierRelations';
alter type public.app_role add value if not exists 'Courier';
