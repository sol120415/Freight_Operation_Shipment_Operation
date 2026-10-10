-- Close three defense-in-depth gaps found during the pre-release security review:
-- 1. Sellers may only register parcels for their own normal seller workflow.
-- 2. Location changes are atomic and never write an old status back over a newer one.
-- 3. Internal implementation functions are not callable through the public API.

alter function public.create_parcel(
  text, text, text, text, text, text, uuid, text, text, text,
  text, text, numeric, numeric, numeric, text, text, text, date, text
) rename to create_parcel_internal;

revoke all on function public.create_parcel_internal(
  text, text, text, text, text, text, uuid, text, text, text,
  text, text, numeric, numeric, numeric, text, text, text, date, text
) from public, anon, authenticated, service_role;

create function public.create_parcel(
  p_source text,
  p_idempotency_key text,
  p_consignee text,
  p_destination text,
  p_platform text,
  p_delivery_method text,
  p_seller_id uuid default null,
  p_customer_email text default null,
  p_client_name text default null,
  p_origin text default 'Branch Hub',
  p_initial_status text default 'Registered',
  p_service_type text default 'Standard',
  p_weight_kg numeric default 0,
  p_cod_amount numeric default 0,
  p_shipping_fee numeric default null,
  p_description text default null,
  p_dimensions text default null,
  p_recipient_phone text default null,
  p_expected_delivery_date date default null,
  p_external_tracking_number text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_role() = 'Seller'::public.app_role
     and (p_source <> 'new_parcel' or p_initial_status <> 'Registered') then
    return jsonb_build_object(
      'ok', false,
      'error', 'Sellers may only register new parcels. Operations staff must confirm booking or intake.'
    );
  end if;

  return public.create_parcel_internal(
    p_source,
    p_idempotency_key,
    p_consignee,
    p_destination,
    p_platform,
    p_delivery_method,
    p_seller_id,
    p_customer_email,
    p_client_name,
    p_origin,
    p_initial_status,
    p_service_type,
    p_weight_kg,
    p_cod_amount,
    p_shipping_fee,
    p_description,
    p_dimensions,
    p_recipient_phone,
    p_expected_delivery_date,
    p_external_tracking_number
  );
end;
$$;

revoke all on function public.create_parcel(
  text, text, text, text, text, text, uuid, text, text, text,
  text, text, numeric, numeric, numeric, text, text, text, date, text
) from public, anon;
grant execute on function public.create_parcel(
  text, text, text, text, text, text, uuid, text, text, text,
  text, text, numeric, numeric, numeric, text, text, text, date, text
) to authenticated, service_role;

create function public.update_parcel_location(
  p_parcel_id uuid,
  p_location text default null,
  p_hub_id uuid default null,
  p_description text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parcel public.shipments%rowtype;
  v_hub_name text;
  v_location text;
begin
  if not public.is_admin_or_above() then
    return jsonb_build_object('ok', false, 'error',
      'Only operations staff can change parcel locations');
  end if;

  select * into v_parcel
    from public.shipments
   where id = p_parcel_id
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Parcel not found');
  end if;

  if p_hub_id is not null then
    select name into v_hub_name
      from public.hubs
     where id = p_hub_id;
    if not found then
      return jsonb_build_object('ok', false, 'error', 'Hub not found');
    end if;
  end if;

  v_location := coalesce(nullif(trim(coalesce(p_location, '')), ''), v_hub_name);
  if v_location is null then
    return jsonb_build_object('ok', false, 'error', 'Choose a hub or enter a location');
  end if;

  update public.shipments
     set current_location = v_location,
         current_hub_id = p_hub_id
   where id = p_parcel_id;

  insert into public.shipment_tracking_logs
    (shipment_id, event_type, level, message, location, status, created_by)
  values (
    p_parcel_id,
    'location',
    'info',
    coalesce(nullif(trim(coalesce(p_description, '')), ''),
      'Current location set to ' || v_location),
    v_location,
    v_parcel.status,
    auth.uid()
  );

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.update_parcel_location(uuid, text, uuid, text)
  from public, anon;
grant execute on function public.update_parcel_location(uuid, text, uuid, text)
  to authenticated, service_role;
