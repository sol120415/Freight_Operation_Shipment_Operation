-- =============================================================================
-- Operational reliability and centralized freight workflow.
--
-- Existing business references are intentionally preserved. Defaults and RPCs
-- below only affect newly created records.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Sequence-backed, Manila-year business references
-- -----------------------------------------------------------------------------
create sequence if not exists public.seller_ref_seq start 1;
create sequence if not exists public.pickup_ref_seq start 1;
create sequence if not exists public.manifest_ref_seq start 1;

create or replace function public.next_shipment_reference()
returns text
language sql
volatile
security definer
set search_path = public
as $$
  select 'SHP-' || to_char(timezone('Asia/Manila', now()), 'YY') || '-' ||
         lpad(nextval('public.shipments_ref_seq')::text, 6, '0');
$$;

create or replace function public.next_parcel_tracking_number()
returns text
language sql
volatile
security definer
set search_path = public
as $$
  select 'TRK-' || to_char(timezone('Asia/Manila', now()), 'YY') || '-' ||
         lpad(nextval('public.parcel_tracking_seq')::text, 6, '0');
$$;

create or replace function public.next_seller_reference()
returns text
language sql
volatile
security definer
set search_path = public
as $$
  select 'SEL-' || to_char(timezone('Asia/Manila', now()), 'YY') || '-' ||
         lpad(nextval('public.seller_ref_seq')::text, 6, '0');
$$;

create or replace function public.next_pickup_reference()
returns text
language sql
volatile
security definer
set search_path = public
as $$
  select 'PUP-' || to_char(timezone('Asia/Manila', now()), 'YY') || '-' ||
         lpad(nextval('public.pickup_ref_seq')::text, 6, '0');
$$;

create or replace function public.next_manifest_reference()
returns text
language sql
volatile
security definer
set search_path = public
as $$
  select 'MNF-' || to_char(timezone('Asia/Manila', now()), 'YY') || '-' ||
         lpad(nextval('public.manifest_ref_seq')::text, 6, '0');
$$;

create or replace function public.next_hbl_number()
returns text
language sql
volatile
security definer
set search_path = public
as $$
  select 'HBL-' || to_char(timezone('Asia/Manila', now()), 'YY') || '-' ||
         lpad(nextval('public.bol_ref_seq')::text, 6, '0');
$$;

-- Compatibility helper. MBL numbers are issued by carriers and must be entered.
create or replace function public.next_bol_number(p_bol_type text)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if upper(trim(p_bol_type)) <> 'HBL' then
    raise exception 'A carrier-issued MBL number must be recorded, not generated';
  end if;
  return public.next_hbl_number();
end;
$$;

alter table public.shipments
  alter column reference set default public.next_shipment_reference(),
  alter column tracking_number set default public.next_parcel_tracking_number();
alter table public.sellers
  alter column reference set default public.next_seller_reference();
alter table public.pickup_requests
  alter column reference set default public.next_pickup_reference();
alter table public.carrier_batches
  alter column reference set default public.next_manifest_reference();

-- -----------------------------------------------------------------------------
-- Data model additions
-- -----------------------------------------------------------------------------
alter table public.shipments
  add column if not exists external_tracking_number text,
  add column if not exists creation_source text not null default 'legacy'
    check (creation_source in ('legacy', 'booking', 'quick_intake', 'new_parcel', 'integration')),
  add column if not exists idempotency_key text;

create unique index if not exists shipments_creator_idempotency_uidx
  on public.shipments (created_by, idempotency_key)
  where idempotency_key is not null;
create unique index if not exists shipments_platform_external_tracking_uidx
  on public.shipments (platform, external_tracking_number)
  where external_tracking_number is not null and external_tracking_number <> '';

alter table public.pickup_requests
  add column if not exists expected_parcel_count int not null default 0
    check (expected_parcel_count >= 0),
  add column if not exists actual_parcel_count int
    check (actual_parcel_count is null or actual_parcel_count >= 0),
  add column if not exists idempotency_key text;

update public.pickup_requests
   set expected_parcel_count = parcel_count
 where expected_parcel_count = 0 and parcel_count > 0;

create unique index if not exists pickup_creator_idempotency_uidx
  on public.pickup_requests (created_by, idempotency_key)
  where idempotency_key is not null;

alter table public.carrier_batches
  add column if not exists idempotency_key text;
create unique index if not exists manifest_creator_idempotency_uidx
  on public.carrier_batches (created_by, idempotency_key)
  where idempotency_key is not null;

alter table public.carrier_batch_items
  add column if not exists status_before_manifest public.shipment_status;

alter table public.bills_of_lading
  add column if not exists document_version int not null default 1
    check (document_version > 0),
  add column if not exists issued_by uuid references public.profiles(id) on delete set null,
  add column if not exists approved_by uuid references public.profiles(id) on delete set null,
  add column if not exists finalized_at timestamptz;

create or replace function public.prepare_bol_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.bol_type = 'HBL' and nullif(trim(coalesce(new.bol_number, '')), '') is null then
    new.bol_number := public.next_hbl_number();
  elsif new.bol_type = 'MBL' and nullif(trim(coalesce(new.bol_number, '')), '') is null then
    raise exception 'Enter the MBL number issued by the ocean carrier';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prepare_bol_number on public.bills_of_lading;
create trigger trg_prepare_bol_number
  before insert on public.bills_of_lading
  for each row execute function public.prepare_bol_number();

-- New writes must contain a real COD amount when the COD service is selected.
-- NOT VALID preserves old rows that may need manual cleanup.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.shipments'::regclass
       and conname = 'shipments_cod_amount_required'
  ) then
    alter table public.shipments
      add constraint shipments_cod_amount_required
      check (upper(coalesce(service_type, '')) <> 'COD' or cod_amount > 0)
      not valid;
  end if;
end;
$$;

-- Immutable parcel snapshots make a finalized handover independently auditable.
create table if not exists public.handover_items (
  id uuid primary key default gen_random_uuid(),
  handover_id uuid not null references public.handovers(id) on delete restrict,
  parcel_id uuid references public.shipments(id) on delete set null,
  parcel_reference text not null,
  tracking_number text,
  seller_id uuid references public.sellers(id) on delete set null,
  seller_name text,
  consignee text,
  destination text,
  weight_kg numeric(12,2) not null default 0,
  cod_amount numeric(12,2) not null default 0,
  status_at_handover public.shipment_status not null,
  created_at timestamptz not null default now(),
  unique (handover_id, parcel_reference)
);

create index if not exists handover_items_handover_idx
  on public.handover_items (handover_id, created_at);
alter table public.handover_items enable row level security;
drop policy if exists "handover items: ops read" on public.handover_items;
create policy "handover items: ops read"
  on public.handover_items for select
  using (public.is_ops());

create or replace function public.prevent_handover_item_changes()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Finalized handover snapshots cannot be changed or deleted';
end;
$$;

drop trigger if exists trg_handover_items_immutable on public.handover_items;
create trigger trg_handover_items_immutable
  before update or delete on public.handover_items
  for each row execute function public.prevent_handover_item_changes();

-- -----------------------------------------------------------------------------
-- Seller update hardening. PostgreSQL combines permissive policies with OR, so
-- the old broad policy unintentionally bypassed the Registered-only policy.
-- -----------------------------------------------------------------------------
-- Direct creation and staff updates are closed. Security-definer workflow RPCs
-- below are now the only operational write path; seller edits stay narrowly scoped.
drop policy if exists "shipments: ops write" on public.shipments;
drop policy if exists "shipments: seller insert own" on public.shipments;
drop policy if exists "shipments: staff update" on public.shipments;

drop policy if exists "batches: ops insert" on public.carrier_batches;
drop policy if exists "batches: staff or ops draft update" on public.carrier_batches;
drop policy if exists "batch_items: ops manage" on public.carrier_batch_items;
drop policy if exists "handovers: staff insert" on public.handovers;

drop policy if exists "shipments: seller edit own registered" on public.shipments;
create policy "shipments: seller edit own registered"
  on public.shipments for update
  using (
    seller_id = public.current_seller_id()
    and status = 'Registered'::public.shipment_status
  )
  with check (
    seller_id = public.current_seller_id()
    and status = 'Registered'::public.shipment_status
  );

create or replace function public.guard_seller_parcel_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_role() = 'Seller'::public.app_role then
    if old.status <> 'Registered'::public.shipment_status
       or old.seller_id is distinct from public.current_seller_id() then
      raise exception 'Sellers may only edit their own registered parcels';
    end if;

    if (to_jsonb(new) - array['consignee', 'recipient_phone', 'destination', 'description', 'weight_kg', 'updated_at'])
       is distinct from
       (to_jsonb(old) - array['consignee', 'recipient_phone', 'destination', 'description', 'weight_kg', 'updated_at']) then
      raise exception 'Sellers may only edit recipient, parcel description, destination, and weight details';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_seller_parcel_update on public.shipments;
create trigger trg_guard_seller_parcel_update
  before update on public.shipments
  for each row execute function public.guard_seller_parcel_update();

-- -----------------------------------------------------------------------------
-- One atomic parcel creation operation used by every interface.
-- -----------------------------------------------------------------------------
create or replace function public.create_parcel(
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
declare
  v_role public.app_role;
  v_seller_id uuid;
  v_seller public.sellers%rowtype;
  v_client_id uuid;
  v_platform public.delivery_platform;
  v_status public.shipment_status;
  v_parcel public.shipments%rowtype;
  v_warning text;
  v_progress int;
begin
  v_role := public.current_role();
  if v_role is null then
    return jsonb_build_object('ok', false, 'error', 'Authentication is required');
  end if;

  if p_source not in ('booking', 'quick_intake', 'new_parcel', 'integration') then
    return jsonb_build_object('ok', false, 'error', 'Unknown parcel creation source');
  end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) < 8 then
    return jsonb_build_object('ok', false, 'error', 'A valid request key is required');
  end if;
  if nullif(trim(coalesce(p_consignee, '')), '') is null
     or nullif(trim(coalesce(p_destination, '')), '') is null then
    return jsonb_build_object('ok', false, 'error', 'Recipient and destination are required');
  end if;
  if coalesce(p_weight_kg, 0) < 0 or coalesce(p_cod_amount, 0) < 0
     or coalesce(p_shipping_fee, 0) < 0 then
    return jsonb_build_object('ok', false, 'error', 'Amounts and weight cannot be negative');
  end if;
  if p_expected_delivery_date is not null
     and p_expected_delivery_date < timezone('Asia/Manila', now())::date then
    return jsonb_build_object('ok', false, 'error', 'Expected delivery date cannot be in the past');
  end if;

  select * into v_parcel
    from public.shipments
   where created_by = auth.uid() and idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object(
      'ok', true, 'duplicate', true, 'id', v_parcel.id,
      'reference', v_parcel.reference,
      'tracking_number', v_parcel.tracking_number
    );
  end if;

  if v_role = 'Seller'::public.app_role then
    v_seller_id := public.current_seller_id();
    if v_seller_id is null then
      return jsonb_build_object('ok', false, 'error',
        'Your login is not linked to an active seller account');
    end if;
  elsif v_role in ('SuperAdmin'::public.app_role, 'Admin'::public.app_role) then
    v_seller_id := p_seller_id;
  else
    return jsonb_build_object('ok', false, 'error', 'You are not allowed to create parcels');
  end if;

  if v_seller_id is not null then
    select * into v_seller from public.sellers
     where id = v_seller_id and is_active and archived_at is null;
    if not found then
      return jsonb_build_object('ok', false, 'error', 'The selected seller is not active');
    end if;
  end if;

  begin
    v_platform := p_platform::public.delivery_platform;
    v_status := p_initial_status::public.shipment_status;
  exception when invalid_text_representation then
    return jsonb_build_object('ok', false, 'error', 'Unknown platform or initial status');
  end;

  if v_status not in ('Registered', 'Booked', 'Intake') then
    return jsonb_build_object('ok', false, 'error', 'Invalid initial parcel status');
  end if;
  if p_delivery_method not in ('Pickup', 'Drop-off') then
    return jsonb_build_object('ok', false, 'error', 'Choose Pickup or Drop-off');
  end if;
  if upper(trim(coalesce(p_service_type, ''))) = 'COD'
     and coalesce(p_cod_amount, 0) <= 0 then
    return jsonb_build_object('ok', false, 'error', 'COD amount must be greater than zero');
  end if;

  if nullif(trim(coalesce(p_customer_email, '')), '') is not null then
    select id into v_client_id from public.profiles
     where lower(email) = lower(trim(p_customer_email))
       and role in ('Customer'::public.app_role, 'Citizen'::public.app_role)
       and is_active
     limit 1;
    if v_client_id is null then
      v_warning := 'Recipient email is not linked to an active customer account.';
    end if;
  end if;

  v_progress := case v_status when 'Registered' then 5 when 'Booked' then 8 else 10 end;

  insert into public.shipments (
    client_name, consignee, origin, destination, mode, status, platform,
    delivery_method, cargo_type, weight_kg, cod_amount, shipping_fee,
    description, dimensions, recipient_phone, expected_delivery_date,
    external_tracking_number, seller_id, client_id, created_by, progress,
    creation_source, idempotency_key, current_location, received_at, booked_at
  ) values (
    coalesce(v_seller.name, nullif(trim(coalesce(p_client_name, '')), ''), 'Walk-in / Unassigned'),
    nullif(trim(p_consignee), ''),
    coalesce(nullif(trim(p_origin), ''), 'Branch Hub'),
    trim(p_destination), 'Road', v_status, v_platform,
    p_delivery_method, 'Parcel', greatest(coalesce(p_weight_kg, 0), 0),
    greatest(coalesce(p_cod_amount, 0), 0), p_shipping_fee,
    nullif(trim(coalesce(p_description, '')), ''),
    nullif(trim(coalesce(p_dimensions, '')), ''),
    nullif(trim(coalesce(p_recipient_phone, '')), ''), p_expected_delivery_date,
    nullif(trim(coalesce(p_external_tracking_number, '')), ''),
    v_seller_id, v_client_id, auth.uid(), v_progress,
    p_source, p_idempotency_key,
    coalesce(nullif(trim(p_origin), ''), 'Branch Hub'),
    case when v_status = 'Intake' then now() else null end,
    case when v_status = 'Booked' then now() else null end
  ) returning * into v_parcel;

  insert into public.shipment_tracking_logs
    (shipment_id, event_type, level, message, location, status, created_by)
  values (
    v_parcel.id,
    case when p_source = 'booking' then 'booking' else 'system' end,
    'info',
    case p_source
      when 'booking' then 'Parcel booking created'
      when 'quick_intake' then 'Parcel received through quick intake'
      else 'Parcel registered via ' || p_delivery_method
    end,
    v_parcel.origin, v_status, auth.uid()
  );

  return jsonb_build_object(
    'ok', true, 'duplicate', false, 'id', v_parcel.id,
    'reference', v_parcel.reference,
    'tracking_number', v_parcel.tracking_number,
    'warning', v_warning
  );
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'error',
      'That external tracking number is already registered for this platform');
end;
$$;

-- -----------------------------------------------------------------------------
-- Exact parcel transition matrix and atomic history update.
-- -----------------------------------------------------------------------------
create or replace function public.update_parcel_status(
  p_parcel_id uuid,
  p_status text,
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
  v_new public.shipment_status;
  v_allowed boolean := false;
  v_level text := 'info';
  v_progress int;
  v_message text;
  v_location text;
begin
  if not public.is_admin_or_above() then
    return jsonb_build_object('ok', false, 'error',
      'Only administrators can change parcel status');
  end if;

  begin
    v_new := p_status::public.shipment_status;
  exception when invalid_text_representation then
    return jsonb_build_object('ok', false, 'error', 'Unknown parcel status');
  end;

  select * into v_parcel from public.shipments
   where id = p_parcel_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Parcel not found');
  end if;

  if v_parcel.status = v_new then
    if p_location is null and p_hub_id is null then
      return jsonb_build_object('ok', false, 'error', 'Parcel already has this status');
    end if;
    v_allowed := true;
  else
    v_allowed := case v_parcel.status
      when 'Registered' then v_new in ('Booked', 'Pickup Scheduled', 'Dropped Off', 'Intake', 'Cancelled', 'Pickup Failed')
      when 'Booked' then v_new in ('Pickup Scheduled', 'Picked Up', 'Dropped Off', 'Intake', 'At Origin Hub', 'Batched', 'Cancelled', 'Pickup Failed')
      when 'Pickup Scheduled' then v_new in ('Picked Up', 'Pickup Failed', 'Cancelled')
      when 'Pickup Failed' then v_new in ('Pickup Scheduled', 'Cancelled')
      when 'Picked Up' then v_new in ('Booked', 'At Origin Hub', 'Intake', 'Damaged', 'Lost', 'Cancelled')
      when 'Dropped Off' then v_new in ('Booked', 'At Origin Hub', 'Intake', 'Damaged', 'Lost', 'Cancelled')
      when 'Intake' then v_new in ('Booked', 'At Origin Hub', 'Batched', 'Damaged', 'Lost', 'Cancelled')
      when 'At Origin Hub' then v_new in ('Booked', 'Batched', 'Damaged', 'Lost', 'Cancelled')
      when 'Batched' then v_new in ('Handed Over', 'Damaged', 'Lost', 'Cancelled')
      when 'Handed Over' then v_new in ('In Transit', 'Delivery Failed', 'Damaged', 'Lost', 'Returned')
      when 'In Transit' then v_new in ('At Destination Hub', 'Out for Delivery', 'Delivery Failed', 'Delayed', 'Customs Hold', 'Damaged', 'Lost', 'Returned')
      when 'Delayed' then v_new in ('In Transit', 'At Destination Hub', 'Out for Delivery', 'Damaged', 'Lost', 'Returned')
      when 'Customs Hold' then v_new in ('In Transit', 'Returned', 'Cancelled')
      when 'At Destination Hub' then v_new in ('Out for Delivery', 'Delivery Failed', 'Damaged', 'Lost', 'Returned')
      when 'Out for Delivery' then v_new in ('Delivered', 'Delivery Failed', 'Damaged', 'Lost', 'Returned')
      when 'Delivery Failed' then v_new in ('Out for Delivery', 'Returned', 'Cancelled')
      when 'Damaged' then v_new in ('Returned', 'Archived')
      when 'Lost' then v_new = 'Archived'
      when 'Delivered' then v_new = 'Archived'
      when 'Returned' then v_new = 'Archived'
      when 'Cancelled' then v_new = 'Archived'
      else false
    end;
  end if;

  if not v_allowed then
    return jsonb_build_object('ok', false, 'error',
      'Transition from ' || v_parcel.status || ' to ' || v_new || ' is not allowed');
  end if;

  v_progress := case v_new
    when 'Registered' then 5 when 'Booked' then 8
    when 'Pickup Scheduled' then 15 when 'Picked Up' then 25
    when 'Dropped Off' then 30 when 'Intake' then 30
    when 'At Origin Hub' then 40 when 'Batched' then 45
    when 'Handed Over' then 50 when 'In Transit' then 55
    when 'Returned' then 60 when 'At Destination Hub' then 70
    when 'Out for Delivery' then 85 when 'Delivery Failed' then 90
    when 'Delivered' then 100 else v_parcel.progress
  end;
  v_level := case
    when v_new in ('Pickup Failed', 'Delivery Failed', 'Damaged', 'Lost', 'Cancelled') then 'error'
    when v_new in ('Returned', 'Delayed', 'Customs Hold') then 'warning'
    when v_new = 'Delivered' then 'success'
    else 'info'
  end;
  v_location := coalesce(p_location,
    (select name from public.hubs where id = coalesce(p_hub_id, v_parcel.current_hub_id)),
    v_parcel.current_location);

  update public.shipments
     set status = v_new,
         current_location = coalesce(p_location, current_location),
         current_hub_id = coalesce(p_hub_id, current_hub_id),
         progress = v_progress,
         received_at = case when v_new in ('Picked Up', 'Dropped Off', 'Intake', 'At Origin Hub') and received_at is null then now() else received_at end,
         booked_at = case when v_new = 'Booked' and booked_at is null then now() else booked_at end,
          manifested_at = case when v_new = 'Batched' and manifested_at is null then now() else manifested_at end,
          handover_at = case when v_new = 'Handed Over' and handover_at is null then now() else handover_at end,
          cancel_reason = case when v_new = 'Cancelled' then nullif(trim(coalesce(p_description, '')), '') else cancel_reason end,
          archived_at = case when v_new = 'Archived' then now() else archived_at end
   where id = p_parcel_id;

  v_message := coalesce(nullif(trim(coalesce(p_description, '')), ''),
    'Status changed from ' || v_parcel.status || ' to ' || v_new);
  if v_new = 'Cancelled' and nullif(trim(coalesce(p_description, '')), '') is not null then
    v_message := 'Parcel cancelled: ' || trim(p_description);
  end if;
  if v_new = 'Handed Over' then
    v_message := 'Your parcel ' || coalesce(v_parcel.tracking_number, v_parcel.reference) ||
      ' has been successfully handed over to our delivery partner.' ||
      case when v_location is not null then ' Current location: ' || v_location || '.' else '' end;
  end if;

  insert into public.shipment_tracking_logs
    (shipment_id, event_type, level, message, location, status, created_by)
  values (p_parcel_id, 'status', v_level, v_message, v_location, v_new, auth.uid());

  perform public.notify_parcel_event(
    (select s from public.shipments s where s.id = p_parcel_id),
    case when v_new = 'Handed Over' then 'Parcel Handed Over' else 'Parcel Update' end,
    v_message
  );
  return jsonb_build_object('ok', true);
end;
$$;

-- -----------------------------------------------------------------------------
-- Atomic manifest creation and handover finalization.
-- -----------------------------------------------------------------------------
create or replace function public.create_manifest(
  p_platform text,
  p_parcel_ids uuid[],
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_platform public.delivery_platform;
  v_batch public.carrier_batches%rowtype;
  v_count int;
  v_weight numeric;
begin
  if not public.is_admin_or_above() then
    return jsonb_build_object('ok', false, 'error', 'Only administrators can create manifests');
  end if;
  if coalesce(cardinality(p_parcel_ids), 0) = 0 then
    return jsonb_build_object('ok', false, 'error', 'Select at least one parcel');
  end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) < 8 then
    return jsonb_build_object('ok', false, 'error', 'A valid request key is required');
  end if;
  begin
    v_platform := p_platform::public.delivery_platform;
  exception when invalid_text_representation then
    return jsonb_build_object('ok', false, 'error', 'Unknown delivery platform');
  end;

  select * into v_batch from public.carrier_batches
   where created_by = auth.uid() and idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('ok', true, 'duplicate', true,
      'id', v_batch.id, 'reference', v_batch.reference);
  end if;

  perform 1 from public.shipments
   where id = any(p_parcel_ids) order by id for update;

  select count(distinct id), coalesce(sum(weight_kg), 0)
    into v_count, v_weight
    from public.shipments where id = any(p_parcel_ids);
  if v_count <> cardinality(p_parcel_ids) then
    return jsonb_build_object('ok', false, 'error', 'One or more selected parcels do not exist');
  end if;
  if exists (
    select 1 from public.shipments
     where id = any(p_parcel_ids)
       and (platform <> v_platform or status not in (
         'Booked', 'Picked Up', 'Dropped Off', 'Intake', 'At Origin Hub'
       ))
  ) then
    return jsonb_build_object('ok', false, 'error',
      'Every parcel must match the platform and be received or booked');
  end if;
  if exists (
    select 1 from public.carrier_batch_items i
    join public.carrier_batches b on b.id = i.batch_id
     where i.shipment_id = any(p_parcel_ids) and b.status in ('Draft', 'Ready')
  ) then
    return jsonb_build_object('ok', false, 'error',
      'One or more parcels already belong to an active manifest');
  end if;

  insert into public.carrier_batches
    (platform, status, parcel_count, total_weight_kg, created_by, idempotency_key)
  values (v_platform, 'Draft', v_count, v_weight, auth.uid(), p_idempotency_key)
  returning * into v_batch;

  insert into public.carrier_batch_items
    (batch_id, shipment_id, sequence_no, status_before_manifest)
  select v_batch.id, id, row_number() over (order by created_at, id), status
    from public.shipments where id = any(p_parcel_ids);

  update public.shipments
     set status = 'Batched', manifested_at = now(), progress = 45
   where id = any(p_parcel_ids);

  insert into public.shipment_tracking_logs
    (shipment_id, event_type, level, message, status, created_by)
  select id, 'status', 'info', 'Parcel added to manifest ' || v_batch.reference,
         'Batched', auth.uid()
    from public.shipments where id = any(p_parcel_ids);

  return jsonb_build_object('ok', true, 'duplicate', false,
    'id', v_batch.id, 'reference', v_batch.reference);
end;
$$;

create or replace function public.mark_manifest_ready(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch public.carrier_batches%rowtype;
  v_item_count int;
begin
  if not public.is_admin_or_above() then
    return jsonb_build_object('ok', false, 'error', 'Only administrators can ready manifests');
  end if;

  select * into v_batch from public.carrier_batches
   where id = p_batch_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Manifest not found');
  end if;
  if v_batch.status = 'Ready' then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;
  if v_batch.status <> 'Draft' then
    return jsonb_build_object('ok', false, 'error', 'Only Draft manifests can be marked Ready');
  end if;

  select count(*) into v_item_count from public.carrier_batch_items
   where batch_id = p_batch_id;
  if v_item_count = 0 or v_item_count <> v_batch.parcel_count then
    return jsonb_build_object('ok', false, 'error', 'Manifest parcel count is inconsistent');
  end if;
  if exists (
    select 1 from public.carrier_batch_items i
    join public.shipments s on s.id = i.shipment_id
     where i.batch_id = p_batch_id and s.status <> 'Batched'
  ) then
    return jsonb_build_object('ok', false, 'error', 'Every parcel must still belong to this manifest');
  end if;

  update public.carrier_batches set status = 'Ready' where id = p_batch_id;
  return jsonb_build_object('ok', true, 'duplicate', false);
end;
$$;

create or replace function public.release_manifest(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch public.carrier_batches%rowtype;
begin
  if not public.is_admin_or_above() then
    return jsonb_build_object('ok', false, 'error', 'Only administrators can release manifests');
  end if;

  select * into v_batch from public.carrier_batches
   where id = p_batch_id for update;
  if not found then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;
  if v_batch.status <> 'Draft' then
    return jsonb_build_object('ok', false, 'error', 'Only Draft manifests can be released');
  end if;
  if exists (
    select 1 from public.carrier_batch_items i
    join public.shipments s on s.id = i.shipment_id
     where i.batch_id = p_batch_id and s.status <> 'Batched'
  ) then
    return jsonb_build_object('ok', false, 'error', 'A parcel has already moved beyond this manifest');
  end if;

  update public.shipments s
     set status = coalesce(i.status_before_manifest, 'Intake'::public.shipment_status),
         manifested_at = null,
         progress = case coalesce(i.status_before_manifest, 'Intake'::public.shipment_status)
           when 'Booked' then 8 when 'Picked Up' then 25 when 'Dropped Off' then 30
           when 'At Origin Hub' then 40 else 30 end
    from public.carrier_batch_items i
   where i.batch_id = p_batch_id and i.shipment_id = s.id;

  insert into public.shipment_tracking_logs
    (shipment_id, event_type, level, message, status, created_by)
  select i.shipment_id, 'status', 'warning',
         'Removed from draft manifest ' || v_batch.reference,
         coalesce(i.status_before_manifest, 'Intake'::public.shipment_status), auth.uid()
    from public.carrier_batch_items i where i.batch_id = p_batch_id;

  delete from public.carrier_batches where id = p_batch_id;
  return jsonb_build_object('ok', true, 'duplicate', false);
end;
$$;

create or replace function public.finalize_handover(
  p_batch_id uuid,
  p_rider_name text,
  p_rider_phone text default null,
  p_notes text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch public.carrier_batches%rowtype;
  v_handover public.handovers%rowtype;
  v_item public.shipments%rowtype;
  v_message text;
begin
  if not public.is_admin_or_above() then
    return jsonb_build_object('ok', false, 'error', 'Only administrators can finalize handovers');
  end if;
  if nullif(trim(p_rider_name), '') is null then
    return jsonb_build_object('ok', false, 'error', 'Rider name is required');
  end if;

  select * into v_batch from public.carrier_batches
   where id = p_batch_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Manifest not found');
  end if;
  if v_batch.status = 'Handed Over' then
    select * into v_handover from public.handovers
     where batch_id = p_batch_id order by handed_over_at desc limit 1;
    return jsonb_build_object('ok', true, 'duplicate', true,
      'batch_id', p_batch_id, 'handover_id', v_handover.id);
  end if;
  if v_batch.status <> 'Ready' then
    return jsonb_build_object('ok', false, 'error', 'Only Ready manifests can be handed over');
  end if;
  if exists (
    select 1 from public.carrier_batch_items i
    join public.shipments s on s.id = i.shipment_id
     where i.batch_id = p_batch_id and s.status <> 'Batched'
  ) then
    return jsonb_build_object('ok', false, 'error',
      'Every parcel must still be manifested before handover');
  end if;

  insert into public.handovers
    (batch_id, platform, rider_name, rider_phone, parcel_count, notes, handed_over_by)
  values (
    v_batch.id, v_batch.platform, trim(p_rider_name),
    nullif(trim(coalesce(p_rider_phone, '')), ''), v_batch.parcel_count,
    nullif(trim(coalesce(p_notes, '')), ''), auth.uid()
  ) returning * into v_handover;

  insert into public.handover_items (
    handover_id, parcel_id, parcel_reference, tracking_number, seller_id,
    seller_name, consignee, destination, weight_kg, cod_amount, status_at_handover
  )
  select v_handover.id, s.id, s.reference, s.tracking_number, s.seller_id,
         se.name, s.consignee, s.destination, s.weight_kg, s.cod_amount, 'Handed Over'
    from public.carrier_batch_items i
    join public.shipments s on s.id = i.shipment_id
    left join public.sellers se on se.id = s.seller_id
   where i.batch_id = v_batch.id;

  update public.shipments s
     set status = 'Handed Over', handover_at = now(), progress = 50
    from public.carrier_batch_items i
   where i.batch_id = v_batch.id and i.shipment_id = s.id;

  insert into public.shipment_tracking_logs
    (shipment_id, event_type, level, message, location, status, created_by)
  select s.id, 'status', 'info',
         'Your parcel ' || coalesce(s.tracking_number, s.reference) ||
         ' has been successfully handed over to our delivery partner.' ||
         case when s.current_location is not null then ' Current location: ' || s.current_location || '.' else '' end,
         s.current_location, 'Handed Over', auth.uid()
    from public.carrier_batch_items i
    join public.shipments s on s.id = i.shipment_id
   where i.batch_id = v_batch.id;

  for v_item in
    select s.* from public.carrier_batch_items i
    join public.shipments s on s.id = i.shipment_id
    where i.batch_id = v_batch.id
  loop
    v_message := 'Your parcel ' || coalesce(v_item.tracking_number, v_item.reference) ||
      ' has been successfully handed over to our delivery partner.';
    perform public.notify_parcel_event(v_item, 'Parcel Handed Over', v_message);
  end loop;

  update public.carrier_batches
     set status = 'Handed Over', rider_name = trim(p_rider_name),
         rider_phone = nullif(trim(coalesce(p_rider_phone, '')), ''),
         handover_notes = nullif(trim(coalesce(p_notes, '')), ''),
         handed_over_by = auth.uid(), handed_over_at = now()
   where id = v_batch.id;

  return jsonb_build_object('ok', true, 'duplicate', false,
    'batch_id', v_batch.id, 'handover_id', v_handover.id);
end;
$$;

-- GPS updates remain supported, but this legacy function can no longer bypass
-- the controlled status-transition operation above.
create or replace function public.post_tracking_update(
  p_shipment_id uuid,
  p_message text,
  p_location text,
  p_lat double precision default null,
  p_lng double precision default null,
  p_progress int default null,
  p_status public.shipment_status default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parcel public.shipments%rowtype;
begin
  if not public.is_admin_or_above() then
    return jsonb_build_object('ok', false, 'error', 'Only administrators can post tracking updates');
  end if;
  if p_status is not null then
    return jsonb_build_object('ok', false, 'error', 'Use the controlled parcel status operation');
  end if;
  if p_lat is not null and p_lng is not null
     and (p_lat < 4.2 or p_lat > 21.5 or p_lng < 116.0 or p_lng > 127.0) then
    return jsonb_build_object('ok', false, 'error', 'Coordinates must be inside the Philippines');
  end if;
  if p_progress is not null and (p_progress < 0 or p_progress > 100) then
    return jsonb_build_object('ok', false, 'error', 'Progress must be from 0 to 100');
  end if;

  select * into v_parcel from public.shipments
   where id = p_shipment_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Parcel not found');
  end if;

  update public.shipments
     set current_location = coalesce(p_location, current_location),
         current_lat = coalesce(p_lat, current_lat),
         current_lng = coalesce(p_lng, current_lng),
         progress = coalesce(p_progress, progress)
   where id = p_shipment_id;

  insert into public.shipment_tracking_logs
    (shipment_id, event_type, level, message, location, lat, lng, status, created_by)
  values (
    p_shipment_id, 'gps', 'info', coalesce(nullif(trim(p_message), ''), 'Courier location update'),
    coalesce(p_location, v_parcel.current_location), p_lat, p_lng, v_parcel.status, auth.uid()
  );
  return jsonb_build_object('ok', true);
end;
$$;

-- Broaden audit coverage for operational master data and custody records.
drop trigger if exists trg_audit_sellers on public.sellers;
create trigger trg_audit_sellers after insert or update or delete on public.sellers
  for each row execute function public.log_audit();
drop trigger if exists trg_audit_pickups on public.pickup_requests;
create trigger trg_audit_pickups after insert or update or delete on public.pickup_requests
  for each row execute function public.log_audit();
drop trigger if exists trg_audit_carrier_batches on public.carrier_batches;
create trigger trg_audit_carrier_batches after insert or update or delete on public.carrier_batches
  for each row execute function public.log_audit();
drop trigger if exists trg_audit_handovers on public.handovers;
create trigger trg_audit_handovers after insert or update or delete on public.handovers
  for each row execute function public.log_audit();
drop trigger if exists trg_audit_handover_items on public.handover_items;
create trigger trg_audit_handover_items after insert or update or delete on public.handover_items
  for each row execute function public.log_audit();

revoke execute on function public.create_parcel(text, text, text, text, text, text, uuid, text, text, text, text, text, numeric, numeric, numeric, text, text, text, date, text) from public, anon;
revoke execute on function public.create_manifest(text, uuid[], text) from public, anon;
revoke execute on function public.mark_manifest_ready(uuid) from public, anon;
revoke execute on function public.release_manifest(uuid) from public, anon;
revoke execute on function public.finalize_handover(uuid, text, text, text) from public, anon;
revoke execute on function public.next_shipment_reference() from public, anon, authenticated;
revoke execute on function public.next_parcel_tracking_number() from public, anon, authenticated;
revoke execute on function public.next_manifest_reference() from public, anon, authenticated;
revoke execute on function public.next_hbl_number() from public, anon, authenticated;

grant execute on function public.next_seller_reference() to authenticated, service_role;
grant execute on function public.next_pickup_reference() to authenticated, service_role;
grant execute on function public.next_shipment_reference() to service_role;
grant execute on function public.next_parcel_tracking_number() to service_role;
grant execute on function public.next_manifest_reference() to service_role;
grant execute on function public.next_hbl_number() to service_role;
grant execute on function public.create_parcel(text, text, text, text, text, text, uuid, text, text, text, text, text, numeric, numeric, numeric, text, text, text, date, text) to authenticated, service_role;
grant execute on function public.create_manifest(text, uuid[], text) to authenticated, service_role;
grant execute on function public.mark_manifest_ready(uuid) to authenticated, service_role;
grant execute on function public.release_manifest(uuid) to authenticated, service_role;
grant execute on function public.finalize_handover(uuid, text, text, text) to authenticated, service_role;

notify pgrst, 'reload schema';
