-- =============================================================================
-- Fix the workflow version of update_parcel_status().
--
-- 20260918 fixed the composite-row argument passed to notify_parcel_event(),
-- but 20260929 recreated update_parcel_status() and reintroduced the old
-- `(select * from public.shipments ...)` expression. PostgreSQL treats that
-- as a multi-column scalar subquery and raises:
--   subquery must return only one column
--
-- Keep the workflow rules from 20260929, but pass a shipments row variable to
-- notify_parcel_event(). This migration is intentionally after all workflow
-- migrations so it repairs both existing databases and fresh resets.
-- =============================================================================

create or replace function public.update_parcel_status(
  p_parcel_id   uuid,
  p_status      text,
  p_location    text default null,
  p_hub_id      uuid default null,
  p_description text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role    public.app_role;
  v_parcel  public.shipments%rowtype;
  v_updated public.shipments%rowtype;
  v_new     public.shipment_status;
  v_old     public.shipment_status;
  v_level   text := 'info';
  v_progress int;
  v_message text;
  v_loc     text;
begin
  select role into v_role from public.profiles where id = auth.uid();
  if v_role is null or v_role not in ('SuperAdmin', 'Admin') then
    return jsonb_build_object('ok', false, 'error',
      'Only administrators can change parcel status');
  end if;

  begin
    v_new := p_status::public.shipment_status;
  exception when invalid_text_representation then
    return jsonb_build_object('ok', false, 'error', 'Unknown parcel status');
  end;

  select * into v_parcel from public.shipments where id = p_parcel_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Parcel not found');
  end if;
  v_old := v_parcel.status;

  if v_old = v_new and p_location is null and p_hub_id is null then
    return jsonb_build_object('ok', false, 'error', 'Parcel already has this status');
  end if;

  -- Terminal states are final (except location-only updates).
  if v_old = 'Delivered' and v_new <> 'Delivered' then
    return jsonb_build_object('ok', false, 'error',
      'Delivered parcels are final and cannot be moved back');
  end if;
  if v_old = 'Cancelled' and v_new <> 'Cancelled' then
    return jsonb_build_object('ok', false, 'error',
      'Cancelled parcels are final and cannot be reactivated');
  end if;

  -- ---- Workflow order enforcement (required steps cannot be skipped) ----
  if v_new = 'Batched' and v_old = 'Registered' then
    return jsonb_build_object('ok', false, 'error',
      'Parcel must be received (pickup / drop-off) or booked before it can be manifested');
  end if;

  if v_new = 'Handed Over' and v_old = 'Registered' then
    return jsonb_build_object('ok', false, 'error',
      'Parcel must be received, booked and manifested before handover');
  end if;

  if v_new in ('In Transit', 'At Destination Hub', 'Out for Delivery', 'Delivered')
     and v_old not in ('Handed Over', 'In Transit', 'At Destination Hub', 'Out for Delivery', 'Delivered') then
    return jsonb_build_object('ok', false, 'error',
      'Parcel must be handed over to the delivery partner before it can move into transit');
  end if;

  if v_new = 'Delivered'
     and v_old not in ('Handed Over', 'In Transit', 'At Destination Hub', 'Out for Delivery') then
    return jsonb_build_object('ok', false, 'error',
      'Parcel can only be delivered after handover into the delivery network');
  end if;

  if v_new in ('Registered', 'Booked', 'Pickup Scheduled', 'Picked Up', 'Dropped Off',
               'Intake', 'At Origin Hub', 'Batched', 'Handed Over')
     and v_old in ('In Transit', 'At Destination Hub', 'Out for Delivery', 'Delivered') then
    return jsonb_build_object('ok', false, 'error',
      'Parcel has already left the hub and cannot be moved back to ' || v_new);
  end if;

  v_progress := case v_new
    when 'Registered' then 5
    when 'Booked' then 8
    when 'Pickup Scheduled' then 15
    when 'Picked Up' then 25
    when 'Dropped Off' then 30
    when 'At Origin Hub' then 40
    when 'Batched' then 45
    when 'Handed Over' then 50
    when 'In Transit' then 55
    when 'At Destination Hub' then 70
    when 'Out for Delivery' then 85
    when 'Delivered' then 100
    when 'Delivery Failed' then 90
    when 'Returned' then 60
    when 'Intake' then 10
    else 0
  end;

  v_level := case
    when v_new in ('Delivery Failed', 'Cancelled') then 'error'
    when v_new = 'Returned' then 'warning'
    when v_new = 'Delivered' then 'success'
    else 'info'
  end;

  v_loc := coalesce(p_location,
    (select h.name from public.hubs h where h.id = coalesce(p_hub_id, v_parcel.current_hub_id)));

  update public.shipments
     set status           = v_new,
         current_location = coalesce(p_location, current_location),
         current_hub_id   = coalesce(p_hub_id, current_hub_id),
         progress         = v_progress,
         received_at      = case
           when v_new in ('Pickup Scheduled', 'Picked Up', 'Dropped Off', 'Intake', 'At Origin Hub')
            and received_at is null then now()
           else received_at end,
         booked_at        = case
           when v_new = 'Booked' and booked_at is null then now()
           else booked_at end,
         manifested_at    = case
           when v_new = 'Batched' and manifested_at is null then now()
           else manifested_at end,
         handover_at      = case
           when v_new = 'Handed Over' and handover_at is null then now()
           else handover_at end
   where id = p_parcel_id;

  if v_new = 'Handed Over' then
    v_message := 'Your parcel ' || coalesce(v_parcel.tracking_number, v_parcel.reference) ||
      ' has been successfully handed over to our delivery partner.' ||
      case when v_loc is not null then ' Current location: ' || v_loc || '.' else '' end;
  else
    v_message := coalesce(p_description,
      'Status changed from ' || v_old || ' to ' || v_new);
  end if;

  insert into public.shipment_tracking_logs
    (shipment_id, event_type, level, message, location, status, created_by)
  values
    (p_parcel_id, 'status', v_level, v_message, v_loc, v_new, auth.uid());

  -- A row variable is a single composite value. `(select * ...)` is a
  -- multi-column subquery and cannot be passed as this function argument.
  select * into v_updated from public.shipments where id = p_parcel_id;

  perform public.notify_parcel_event(
    v_updated,
    case when v_new = 'Handed Over' then 'Parcel Handed Over' else 'Parcel Update' end,
    v_message
  );

  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.update_parcel_status(uuid, text, text, uuid, text)
  from anon, public;
grant execute on function public.update_parcel_status(uuid, text, text, uuid, text)
  to authenticated, service_role;

