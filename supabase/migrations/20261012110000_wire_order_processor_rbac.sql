-- Make OrderProcessor a first-class operations user even when the earlier
-- operational-role migration was already applied.

create or replace function public.is_ops()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_role() in (
    'SuperAdmin', 'Admin', 'OperationsSupervisor', 'PickupCoordinator',
    'IntakeClerk', 'OrderProcessor', 'Dispatcher', 'HandoverOfficer',
    'ExceptionOfficer', 'FinanceOps', 'DocumentOfficer', 'CarrierRelations'
  ), false);
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin_or_above();
$$;

create or replace function public.can_manage_sellers()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_role() in (
    'SuperAdmin', 'Admin', 'OperationsSupervisor', 'PickupCoordinator'
  ), false);
$$;

create or replace function public.can_manage_pickups()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_role() in (
    'SuperAdmin', 'Admin', 'OperationsSupervisor', 'PickupCoordinator', 'IntakeClerk'
  ), false);
$$;

create or replace function public.can_manage_documents()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_role() in (
    'SuperAdmin', 'Admin', 'OperationsSupervisor', 'Dispatcher', 'DocumentOfficer'
  ), false);
$$;

grant execute on function public.can_manage_sellers() to authenticated, service_role;
grant execute on function public.can_manage_pickups() to authenticated, service_role;
grant execute on function public.can_manage_documents() to authenticated, service_role;

drop policy if exists "sellers: staff manage" on public.sellers;
drop policy if exists "sellers: task manage" on public.sellers;
create policy "sellers: task manage"
  on public.sellers for all
  using (public.can_manage_sellers())
  with check (public.can_manage_sellers());

drop policy if exists "pickups: staff manage" on public.pickup_requests;
drop policy if exists "pickups: task manage" on public.pickup_requests;
create policy "pickups: task manage"
  on public.pickup_requests for all
  using (public.can_manage_pickups())
  with check (public.can_manage_pickups());

drop policy if exists "bol: staff manage" on public.bills_of_lading;
drop policy if exists "bol: task manage" on public.bills_of_lading;
create policy "bol: task manage"
  on public.bills_of_lading for all
  using (public.can_manage_documents())
  with check (public.can_manage_documents());

drop policy if exists "tracking: staff or carrier insert" on public.shipment_tracking_logs;
drop policy if exists "tracking: staff insert" on public.shipment_tracking_logs;
revoke insert on public.shipment_tracking_logs from anon, authenticated;

do $$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'create_parcel_internal'
     and p.pronargs = 20;
  if v_def is not null then
    v_def := replace(
      v_def,
      'elsif v_role in (''SuperAdmin''::public.app_role, ''Admin''::public.app_role, ''OperationsSupervisor''::public.app_role, ''PickupCoordinator''::public.app_role, ''IntakeClerk''::public.app_role, ''Dispatcher''::public.app_role, ''DocumentOfficer''::public.app_role) then',
      'elsif v_role in (''SuperAdmin''::public.app_role, ''Admin''::public.app_role, ''OperationsSupervisor''::public.app_role, ''PickupCoordinator''::public.app_role, ''IntakeClerk''::public.app_role, ''OrderProcessor''::public.app_role, ''Dispatcher''::public.app_role, ''DocumentOfficer''::public.app_role) then'
    );
    v_def := replace(
      v_def,
      'elsif v_role in (''SuperAdmin''::public.app_role, ''Admin''::public.app_role) then',
      'elsif v_role in (''SuperAdmin''::public.app_role, ''Admin''::public.app_role, ''OperationsSupervisor''::public.app_role, ''PickupCoordinator''::public.app_role, ''IntakeClerk''::public.app_role, ''OrderProcessor''::public.app_role, ''Dispatcher''::public.app_role, ''DocumentOfficer''::public.app_role) then'
    );
    execute v_def;
  end if;

  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'can_update_parcel_status'
     and p.pronargs = 2;
  if v_def is not null then
    v_def := replace(
      v_def,
      'if v_role in (''PickupCoordinator'', ''IntakeClerk'') then',
      'if v_role in (''PickupCoordinator'', ''IntakeClerk'', ''OrderProcessor'') then'
    );
    execute v_def;
  end if;
end;
$$;

notify pgrst, 'reload schema';
