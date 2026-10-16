-- =============================================================================
-- Activate the freight-planning tables for the study scope.
--
-- The parcel hub workflow remains unchanged. This migration makes the existing
-- load_plans and containers tables usable again for route planning,
-- consolidation, and deconsolidation, with server-side authorization and
-- capacity checks.
-- =============================================================================

alter table public.load_plans
  add column if not exists route_name text,
  add column if not exists carrier_name text,
  add column if not exists transport_mode text,
  add column if not exists incoterms text,
  add column if not exists transit_time_days numeric(8,2),
  add column if not exists estimated_cost_php numeric(14,2),
  add column if not exists co2_reduction_percent numeric(6,2),
  add column if not exists risk_score text,
  add column if not exists key_advantage text;

create sequence if not exists public.freight_plan_ref_seq start 1;
create sequence if not exists public.mbl_ref_seq start 1;

create or replace function public.next_freight_plan_reference()
returns text
language sql
volatile
security definer
set search_path = public
as $$
  select 'PLAN-' || to_char(timezone('Asia/Manila', now()), 'YY') || '-' ||
         lpad(nextval('public.freight_plan_ref_seq')::text, 6, '0');
$$;

create or replace function public.next_mbl_number()
returns text
language sql
volatile
security definer
set search_path = public
as $$
  select 'MBL-' || to_char(timezone('Asia/Manila', now()), 'YY') || '-' ||
         lpad(nextval('public.mbl_ref_seq')::text, 6, '0');
$$;

create or replace function public.can_manage_freight_planning()
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

revoke execute on function public.next_freight_plan_reference() from public, anon, authenticated;
revoke execute on function public.next_mbl_number() from public, anon, authenticated;
grant execute on function public.next_freight_plan_reference() to service_role;
grant execute on function public.next_mbl_number() to service_role;
grant execute on function public.can_manage_freight_planning() to authenticated, service_role;

-- The original reliability migration required an externally supplied MBL.
-- Keep that value when present, but generate one when the operator leaves it
-- blank so the study workflow is fully automated.
create or replace function public.next_bol_number(p_bol_type text)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if upper(trim(p_bol_type)) = 'MBL' then
    return public.next_mbl_number();
  elsif upper(trim(p_bol_type)) = 'HBL' then
    return public.next_hbl_number();
  end if;
  raise exception 'Bill of Lading type must be HBL or MBL';
end;
$$;

create or replace function public.prepare_bol_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if nullif(trim(coalesce(new.bol_number, '')), '') is null then
    new.bol_number := public.next_bol_number(new.bol_type::text);
  end if;
  return new;
end;
$$;

create or replace function public.create_freight_load_plan(
  p_origin text,
  p_destination text,
  p_transport_mode text,
  p_incoterms text,
  p_route_name text,
  p_carrier_name text,
  p_transit_time_days numeric,
  p_estimated_cost_php numeric,
  p_co2_reduction_percent numeric,
  p_risk_score text,
  p_key_advantage text,
  p_max_weight_kg numeric,
  p_max_volume_cbm numeric,
  p_shipment_ids uuid[] default '{}'
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.load_plans%rowtype;
  v_count int := coalesce(cardinality(p_shipment_ids), 0);
  v_weight numeric := 0;
  v_volume numeric := 0;
begin
  if not public.can_manage_freight_planning() then
    return jsonb_build_object('ok', false, 'error', 'You are not allowed to save freight plans');
  end if;
  if nullif(trim(coalesce(p_origin, '')), '') is null
     or nullif(trim(coalesce(p_destination, '')), '') is null then
    return jsonb_build_object('ok', false, 'error', 'Origin and destination are required');
  end if;
  if p_max_weight_kg is null or p_max_weight_kg <= 0
     or p_max_volume_cbm is null or p_max_volume_cbm <= 0 then
    return jsonb_build_object('ok', false, 'error', 'Planning capacity must be greater than zero');
  end if;
  if p_shipment_ids is not null and v_count > 0 then
    perform 1 from public.shipments where id = any(p_shipment_ids) for update;
    if exists (
      select 1 from public.shipments
       where id = any(p_shipment_ids)
         and status not in ('Booked', 'Picked Up', 'Dropped Off', 'At Origin Hub', 'Intake')
    ) then
      return jsonb_build_object('ok', false, 'error', 'A selected shipment is not eligible for freight planning');
    end if;
    select coalesce(sum(weight_kg), 0), coalesce(sum(volume_cbm), 0)
      into v_weight, v_volume
      from public.shipments
     where id = any(p_shipment_ids);
    if (select count(distinct id) from public.shipments where id = any(p_shipment_ids)) <> v_count then
      return jsonb_build_object('ok', false, 'error', 'One or more selected shipments do not exist');
    end if;
    if v_weight > p_max_weight_kg or v_volume > p_max_volume_cbm then
      return jsonb_build_object('ok', false, 'error', 'Selected shipments exceed the planning capacity');
    end if;
  end if;

  insert into public.load_plans (
    reference, status, vehicle_ref, origin, destination,
    max_weight_kg, max_volume_cbm, planned_weight_kg, planned_volume_cbm,
    utilization_pct, route_name, carrier_name, transport_mode, incoterms,
    transit_time_days, estimated_cost_php, co2_reduction_percent, risk_score,
    key_advantage, ml_score, ml_rationale, created_by
  ) values (
    public.next_freight_plan_reference(), 'Draft',
    nullif(trim(coalesce(p_carrier_name, '')), ''), trim(p_origin), trim(p_destination),
    p_max_weight_kg, p_max_volume_cbm, v_weight, v_volume,
    least(100, greatest(
      case when p_max_weight_kg > 0 then (v_weight / p_max_weight_kg) * 100 else 0 end,
      case when p_max_volume_cbm > 0 then (v_volume / p_max_volume_cbm) * 100 else 0 end
    )), nullif(trim(coalesce(p_route_name, '')), ''),
    nullif(trim(coalesce(p_carrier_name, '')), ''),
    nullif(trim(coalesce(p_transport_mode, '')), ''),
    nullif(trim(coalesce(p_incoterms, '')), ''),
    p_transit_time_days, p_estimated_cost_php, p_co2_reduction_percent,
    nullif(trim(coalesce(p_risk_score, '')), ''),
    nullif(trim(coalesce(p_key_advantage, '')), ''),
    case when p_risk_score = 'Low' then 90 when p_risk_score = 'Medium' then 70 else 50 end,
    concat_ws(' | ', nullif(trim(coalesce(p_route_name, '')), ''),
      nullif(trim(coalesce(p_carrier_name, '')), ''),
      nullif(trim(coalesce(p_key_advantage, '')), '')),
    auth.uid()
  ) returning * into v_plan;

  if v_count > 0 then
    insert into public.load_plan_items (plan_id, shipment_id, sequence_no)
    select v_plan.id, s.id, row_number() over (order by s.created_at, s.id)
      from public.shipments s
     where s.id = any(p_shipment_ids);
  end if;

  return jsonb_build_object('ok', true, 'id', v_plan.id, 'reference', v_plan.reference);
end;
$$;

create or replace function public.create_freight_consolidation(
  p_container_type text,
  p_load_type text,
  p_max_volume_cbm numeric,
  p_max_weight_kg numeric,
  p_origin text,
  p_destination text,
  p_shipment_ids uuid[]
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_container public.containers%rowtype;
  v_load_type public.load_type;
  v_count int := coalesce(cardinality(p_shipment_ids), 0);
  v_weight numeric := 0;
  v_volume numeric := 0;
begin
  if not public.can_manage_freight_planning() then
    return jsonb_build_object('ok', false, 'error', 'You are not allowed to consolidate shipments');
  end if;
  if v_count = 0 then
    return jsonb_build_object('ok', false, 'error', 'Select at least one shipment to consolidate');
  end if;
  if p_max_weight_kg is null or p_max_weight_kg <= 0
     or p_max_volume_cbm is null or p_max_volume_cbm <= 0 then
    return jsonb_build_object('ok', false, 'error', 'Container capacity must be greater than zero');
  end if;
  begin
    v_load_type := p_load_type::public.load_type;
  exception when invalid_text_representation then
    return jsonb_build_object('ok', false, 'error', 'Choose LCL or FCL');
  end;

  perform 1 from public.shipments where id = any(p_shipment_ids) for update;
  if exists (
    select 1 from public.shipments
     where id = any(p_shipment_ids)
       and status not in ('Booked', 'Picked Up', 'Dropped Off', 'At Origin Hub', 'Intake')
  ) then
    return jsonb_build_object('ok', false, 'error', 'A selected shipment is not eligible for consolidation');
  end if;
  select coalesce(sum(weight_kg), 0), coalesce(sum(volume_cbm), 0)
    into v_weight, v_volume
    from public.shipments where id = any(p_shipment_ids);
  if (select count(distinct id) from public.shipments where id = any(p_shipment_ids)) <> v_count then
    return jsonb_build_object('ok', false, 'error', 'One or more selected shipments do not exist');
  end if;
  if v_weight > p_max_weight_kg or v_volume > p_max_volume_cbm then
    return jsonb_build_object('ok', false, 'error', 'Selected shipments exceed the container capacity');
  end if;
  if exists (
    select 1
      from public.container_shipments cs
      join public.containers c on c.id = cs.container_id
     where cs.shipment_id = any(p_shipment_ids)
       and c.status <> 'Deconsolidated'
  ) then
    return jsonb_build_object('ok', false, 'error', 'A selected shipment is already in an active consolidation');
  end if;

  insert into public.containers (
    reference, container_type, load_type, max_volume_cbm, max_weight_kg,
    current_volume_cbm, current_weight_kg, origin, destination, status, created_by
  ) values (
    public.next_container_reference(), coalesce(nullif(trim(p_container_type), ''), 'Freight Consolidation'),
    v_load_type, p_max_volume_cbm, p_max_weight_kg, v_volume, v_weight,
    nullif(trim(coalesce(p_origin, '')), ''), nullif(trim(coalesce(p_destination, '')), ''),
    'Planned', auth.uid()
  ) returning * into v_container;

  insert into public.container_shipments (container_id, shipment_id)
  select v_container.id, id from public.shipments where id = any(p_shipment_ids);

  insert into public.shipment_tracking_logs
    (shipment_id, event_type, level, message, location, created_by)
  select id, 'system', 'info', 'Shipment consolidated into ' || v_container.reference,
         nullif(trim(coalesce(p_origin, '')), ''), auth.uid()
    from public.shipments where id = any(p_shipment_ids);

  return jsonb_build_object('ok', true, 'id', v_container.id, 'reference', v_container.reference);
end;
$$;

create or replace function public.deconsolidate_freight_shipment(
  p_container_id uuid,
  p_shipment_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_container public.containers%rowtype;
  v_weight numeric := 0;
  v_volume numeric := 0;
begin
  if not public.can_manage_freight_planning() then
    return jsonb_build_object('ok', false, 'error', 'You are not allowed to deconsolidate shipments');
  end if;
  select * into v_container from public.containers where id = p_container_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Consolidation not found');
  end if;
  if v_container.status in ('In Transit', 'Deconsolidated') then
    return jsonb_build_object('ok', false, 'error', 'This consolidation can no longer be changed');
  end if;
  if not exists (
    select 1 from public.container_shipments
     where container_id = p_container_id and shipment_id = p_shipment_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'Shipment is not in this consolidation');
  end if;

  delete from public.container_shipments
   where container_id = p_container_id and shipment_id = p_shipment_id;
  select coalesce(sum(s.weight_kg), 0), coalesce(sum(s.volume_cbm), 0)
    into v_weight, v_volume
    from public.container_shipments cs
    join public.shipments s on s.id = cs.shipment_id
   where cs.container_id = p_container_id;

  update public.containers
     set current_weight_kg = v_weight,
         current_volume_cbm = v_volume,
         status = case when not exists (
           select 1 from public.container_shipments where container_id = p_container_id
         ) then 'Deconsolidated' else status end
   where id = p_container_id;

  insert into public.shipment_tracking_logs
    (shipment_id, event_type, level, message, location, created_by)
  values (
    p_shipment_id, 'system', 'info', 'Shipment deconsolidated from ' || v_container.reference,
    v_container.destination, auth.uid()
  );

  return jsonb_build_object('ok', true);
end;
$$;

-- Replace legacy broad policies. Planning data is visible only to planning
-- roles, and all writes must go through the checked SECURITY DEFINER RPCs.
drop policy if exists "load_plans: ops read" on public.load_plans;
drop policy if exists "load_plans: ops insert draft" on public.load_plans;
drop policy if exists "load_plans: staff or draft owner update" on public.load_plans;
drop policy if exists "load_plans: staff or draft delete" on public.load_plans;
create policy "load_plans: planning read"
  on public.load_plans for select
  using (public.can_manage_freight_planning());

drop policy if exists "load_plan_items: ops manage" on public.load_plan_items;
create policy "load_plan_items: planning read"
  on public.load_plan_items for select
  using (public.can_manage_freight_planning());

drop policy if exists "containers: authenticated read" on public.containers;
drop policy if exists "containers: staff manage" on public.containers;
create policy "containers: planning read"
  on public.containers for select
  using (public.can_manage_freight_planning());

drop policy if exists "container_shipments: authenticated read" on public.container_shipments;
drop policy if exists "container_shipments: staff manage" on public.container_shipments;
create policy "container_shipments: planning read"
  on public.container_shipments for select
  using (public.can_manage_freight_planning());

revoke insert, update, delete on public.load_plans from authenticated;
revoke insert, update, delete on public.load_plan_items from authenticated;
revoke insert, update, delete on public.containers from authenticated;
revoke insert, update, delete on public.container_shipments from authenticated;

-- These generators are internal implementation details of triggers/RPCs.
revoke execute on function public.next_bol_number(text) from public, anon, authenticated;
revoke execute on function public.next_container_reference() from public, anon, authenticated;
grant execute on function public.next_bol_number(text) to service_role;
grant execute on function public.next_container_reference() to service_role;

revoke execute on function public.create_freight_load_plan(text, text, text, text, text, text, numeric, numeric, numeric, text, text, numeric, numeric, uuid[]) from public, anon;
revoke execute on function public.create_freight_consolidation(text, text, numeric, numeric, text, text, uuid[]) from public, anon;
revoke execute on function public.deconsolidate_freight_shipment(uuid, uuid) from public, anon;
grant execute on function public.create_freight_load_plan(text, text, text, text, text, text, numeric, numeric, numeric, text, text, numeric, numeric, uuid[]) to authenticated, service_role;
grant execute on function public.create_freight_consolidation(text, text, numeric, numeric, text, text, uuid[]) to authenticated, service_role;
grant execute on function public.deconsolidate_freight_shipment(uuid, uuid) to authenticated, service_role;
