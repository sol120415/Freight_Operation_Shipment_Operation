-- =============================================================================
-- Repair migration for environments where the parcel workflow migrations were
-- recorded as applied but their schema changes are missing.
--
-- This is intentionally idempotent. It restores the columns and tracking-link
-- objects required by the application, then reloads PostgREST's schema cache.
-- =============================================================================

alter table public.shipments
  add column if not exists expected_delivery_date date,
  add column if not exists delivery_method text,
  add column if not exists received_at timestamptz,
  add column if not exists booked_at timestamptz,
  add column if not exists manifested_at timestamptz,
  add column if not exists handover_at timestamptz;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.shipments'::regclass
       and conname = 'shipments_delivery_method_allowed_check'
  ) then
    alter table public.shipments
      add constraint shipments_delivery_method_allowed_check
      check (delivery_method is null or delivery_method in ('Pickup', 'Drop-off'));
  end if;
end;
$$;

-- Preserve the parcel while removing only impossible historical dates.
update public.shipments
   set expected_delivery_date = null
 where expected_delivery_date is not null
   and expected_delivery_date < (created_at at time zone 'Asia/Manila')::date;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conrelid = 'public.shipments'::regclass
       and conname = 'shipments_expected_delivery_not_past'
  ) then
    alter table public.shipments
      add constraint shipments_expected_delivery_not_past
      check (
        expected_delivery_date is null
        or expected_delivery_date >= (created_at at time zone 'Asia/Manila')::date
      );
  end if;
end;
$$;

create index if not exists shipments_delivery_method_idx
  on public.shipments (delivery_method);

create table if not exists public.parcel_tracking_links (
  id uuid primary key default gen_random_uuid(),
  parcel_id uuid not null references public.shipments (id) on delete cascade,
  token_hash text not null unique,
  label text not null default '',
  created_by uuid references public.profiles (id) on delete set null,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists parcel_tracking_links_parcel_idx
  on public.parcel_tracking_links (parcel_id);
create index if not exists parcel_tracking_links_active_idx
  on public.parcel_tracking_links (parcel_id)
  where revoked_at is null;

alter table public.parcel_tracking_links enable row level security;

create or replace function public.get_parcel_by_tracking_token(
  p_token_hash text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link   public.parcel_tracking_links%rowtype;
  v_parcel public.shipments%rowtype;
begin
  if p_token_hash is null or p_token_hash = '' then
    return jsonb_build_object('ok', false);
  end if;

  select * into v_link
    from public.parcel_tracking_links
   where token_hash = p_token_hash
     and revoked_at is null
     and (expires_at is null or expires_at > now());

  if not found then
    return jsonb_build_object('ok', false);
  end if;

  select * into v_parcel
    from public.shipments
   where id = v_link.parcel_id;

  if not found then
    return jsonb_build_object('ok', false);
  end if;

  return jsonb_build_object(
    'ok', true,
    'parcel', jsonb_build_object(
      'tracking_number', v_parcel.tracking_number,
      'reference', v_parcel.reference,
      'status', v_parcel.status,
      'delivery_method', v_parcel.delivery_method,
      'platform', v_parcel.platform,
      'origin', v_parcel.origin,
      'destination', v_parcel.destination,
      'expected_delivery_date', v_parcel.expected_delivery_date,
      'created_at', v_parcel.created_at,
      'updated_at', v_parcel.updated_at
    ),
    'events', coalesce((
      select jsonb_agg(e order by e.created_at)
        from (
          select status, message, location, event_type, level, created_at
            from public.shipment_tracking_logs
           where shipment_id = v_parcel.id
           order by created_at asc
        ) e
    ), '[]'::jsonb)
  );
end;
$$;

grant execute on function public.get_parcel_by_tracking_token(text)
  to anon, authenticated, service_role;

notify pgrst, 'reload schema';
