-- =============================================================================
-- Task-scoped operational roles.
--
-- Admin/SuperAdmin remain backward-compatible full-access roles. New roles are
-- scoped in the application permission matrix and in these database helpers so
-- an authenticated client cannot use an unrelated workflow RPC directly.
-- =============================================================================

create or replace function public.is_ops()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_role() in (
    'SuperAdmin', 'Admin', 'OperationsSupervisor', 'PickupCoordinator',
    'IntakeClerk', 'OrderProcessor', 'Dispatcher', 'HandoverOfficer', 'ExceptionOfficer',
    'FinanceOps', 'DocumentOfficer', 'CarrierRelations'
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

-- Legacy policies use is_staff() as an administrator-level write gate. Keep
-- that helper narrow, then grant new operational roles only the writes their
-- job requires through task-specific helpers and policies below.
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

create or replace function public.can_create_manifest()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_role() in (
    'SuperAdmin', 'Admin', 'OperationsSupervisor', 'Dispatcher'
  ), false);
$$;

create or replace function public.can_manage_manifest()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_role() in (
    'SuperAdmin', 'Admin', 'OperationsSupervisor', 'Dispatcher'
  ), false);
$$;

create or replace function public.can_finalize_handover()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_role() in (
    'SuperAdmin', 'Admin', 'OperationsSupervisor', 'HandoverOfficer'
  ), false);
$$;

create or replace function public.can_move_parcel(p_parcel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_role() in (
    'SuperAdmin', 'Admin', 'OperationsSupervisor', 'PickupCoordinator',
    'IntakeClerk', 'Dispatcher', 'ExceptionOfficer', 'CarrierRelations'
  ), false);
$$;

create or replace function public.can_update_parcel_status(
  p_parcel_id uuid,
  p_status text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role public.app_role := public.current_role();
  v_assigned uuid;
begin
  if v_role in ('SuperAdmin', 'Admin', 'OperationsSupervisor') then
    return true;
  end if;

  if v_role in ('PickupCoordinator', 'IntakeClerk', 'OrderProcessor') then
    return p_status in (
      'Booked', 'Pickup Scheduled', 'Picked Up', 'Dropped Off',
      'Intake', 'At Origin Hub', 'Pickup Failed', 'Damaged', 'Lost', 'Cancelled'
    );
  end if;

  if v_role = 'Dispatcher' then
    return p_status in ('Booked', 'Batched', 'Cancelled');
  end if;

  if v_role = 'HandoverOfficer' then
    return p_status = 'Handed Over';
  end if;

  if v_role = 'ExceptionOfficer' then
    return p_status in (
      'Pickup Failed', 'Delivery Failed', 'Damaged', 'Lost', 'Delayed',
      'Customs Hold', 'Returned', 'Cancelled', 'Archived', 'Out for Delivery'
    );
  end if;

  if v_role = 'CarrierRelations' then
    return p_status in (
      'In Transit', 'At Destination Hub', 'Out for Delivery', 'Delivered',
      'Delivery Failed', 'Delayed', 'Customs Hold', 'Returned', 'Damaged', 'Lost'
    );
  end if;

  if v_role = 'Courier' then
    select courier_profile_id into v_assigned
      from public.shipments where id = p_parcel_id;
    return v_assigned = auth.uid() and p_status in (
      'In Transit', 'At Destination Hub', 'Out for Delivery',
      'Delivered', 'Delivery Failed', 'Delayed', 'Returned'
    );
  end if;

  return false;
end;
$$;

create or replace function public.can_post_tracking(p_shipment_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role public.app_role := public.current_role();
  v_assigned uuid;
begin
  if v_role in ('SuperAdmin', 'Admin', 'OperationsSupervisor', 'ExceptionOfficer', 'CarrierRelations') then
    return true;
  end if;
  if v_role = 'Courier' then
    select courier_profile_id into v_assigned
      from public.shipments where id = p_shipment_id;
    return v_assigned = auth.uid();
  end if;
  return false;
end;
$$;

grant execute on function public.can_create_manifest() to authenticated, service_role;
grant execute on function public.can_manage_manifest() to authenticated, service_role;
grant execute on function public.can_finalize_handover() to authenticated, service_role;
grant execute on function public.can_move_parcel(uuid) to authenticated, service_role;
grant execute on function public.can_update_parcel_status(uuid, text) to authenticated, service_role;
grant execute on function public.can_post_tracking(uuid) to authenticated, service_role;
grant execute on function public.can_manage_sellers() to authenticated, service_role;
grant execute on function public.can_manage_pickups() to authenticated, service_role;
grant execute on function public.can_manage_documents() to authenticated, service_role;

-- Direct table writes that are still used by server actions get the same
-- job-specific checks as the application permission matrix.
drop policy if exists "sellers: staff manage" on public.sellers;
create policy "sellers: task manage"
  on public.sellers for all
  using (public.can_manage_sellers())
  with check (public.can_manage_sellers());

drop policy if exists "pickups: staff manage" on public.pickup_requests;
create policy "pickups: task manage"
  on public.pickup_requests for all
  using (public.can_manage_pickups())
  with check (public.can_manage_pickups());

drop policy if exists "bol: staff manage" on public.bills_of_lading;
create policy "bol: task manage"
  on public.bills_of_lading for all
  using (public.can_manage_documents())
  with check (public.can_manage_documents());

alter table public.shipments
  add column if not exists courier_profile_id uuid references public.profiles(id) on delete set null;
create index if not exists shipments_courier_profile_idx
  on public.shipments (courier_profile_id, status)
  where courier_profile_id is not null;

-- Courier accounts may see only parcels assigned to them. Internal staff keep
-- the existing whole-hub visibility supplied by is_ops().
drop policy if exists "shipments: scoped read" on public.shipments;
create policy "shipments: scoped read"
  on public.shipments for select
  using (
    public.is_ops()
    or courier_profile_id = auth.uid()
    or client_id = auth.uid()
    or seller_id = public.current_seller_id()
  );

drop policy if exists "tracking: read if shipment visible" on public.shipment_tracking_logs;
create policy "tracking: read if shipment visible"
  on public.shipment_tracking_logs for select
  using (
    exists (
      select 1 from public.shipments s
      where s.id = shipment_id
        and (
          public.is_ops()
          or s.courier_profile_id = auth.uid()
          or s.client_id = auth.uid()
          or s.seller_id = public.current_seller_id()
        )
    )
  );

-- Tracking writes must go through the checked SECURITY DEFINER RPCs. Direct
-- inserts could otherwise forge created_by or bypass update throttling.
drop policy if exists "tracking: staff or carrier insert" on public.shipment_tracking_logs;
drop policy if exists "tracking: staff insert" on public.shipment_tracking_logs;
revoke insert on public.shipment_tracking_logs from anon, authenticated;

-- Update existing SECURITY DEFINER workflows in place. This keeps their
-- atomic behavior, idempotency, notifications, and audit history while adding
-- task-specific role checks at the database boundary.
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
      'elsif v_role in (''SuperAdmin''::public.app_role, ''Admin''::public.app_role) then',
      'elsif v_role in (''SuperAdmin''::public.app_role, ''Admin''::public.app_role, ''OperationsSupervisor''::public.app_role, ''PickupCoordinator''::public.app_role, ''IntakeClerk''::public.app_role, ''OrderProcessor''::public.app_role, ''Dispatcher''::public.app_role, ''DocumentOfficer''::public.app_role) then'
    );
    execute v_def;
  end if;

  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'update_parcel_status'
     and p.pronargs = 5;
  if v_def is not null then
    v_def := replace(v_def, 'if not public.is_admin_or_above() then', 'if not public.can_update_parcel_status(p_parcel_id, p_status) then');
    execute v_def;
  end if;

  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'create_manifest'
     and p.pronargs = 3;
  if v_def is not null then
    v_def := replace(v_def, 'if not public.is_admin_or_above() then', 'if not public.can_create_manifest() then');
    execute v_def;
  end if;

  for v_def in
    select pg_get_functiondef(p.oid)
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('mark_manifest_ready', 'release_manifest')
       and p.pronargs = 1
  loop
    v_def := replace(v_def, 'if not public.is_admin_or_above() then', 'if not public.can_manage_manifest() then');
    execute v_def;
  end loop;

  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'finalize_handover'
     and p.pronargs = 4;
  if v_def is not null then
    v_def := replace(v_def, 'if not public.is_admin_or_above() then', 'if not public.can_finalize_handover() then');
    execute v_def;
  end if;

  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'post_tracking_update'
     and p.pronargs = 7;
  if v_def is not null then
    v_def := replace(v_def, 'if not public.is_admin_or_above() then', 'if not public.can_post_tracking(p_shipment_id) then');
    execute v_def;
  end if;

  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'update_parcel_location'
     and p.pronargs = 4;
  if v_def is not null then
    v_def := replace(v_def, 'if not public.is_admin_or_above() then', 'if not public.can_move_parcel(p_parcel_id) then');
    execute v_def;
  end if;
end;
$$;

notify pgrst, 'reload schema';
