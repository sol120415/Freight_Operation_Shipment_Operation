-- =============================================================================
-- COMBINED DATABASE SCHEME (auto-generated)
-- Pinagsamang lahat ng supabase/migrations/*.sql + supabase/seed.sql, in order.
-- Para sa fresh local DB: paste-and-run.
-- =============================================================================


-- ============================================================================
-- SOURCE: supabase/migrations/0001_initial_schema.sql
-- ============================================================================

-- =============================================================================
-- Freight Operations & Shipment Execution Subsystem
-- Supabase / PostgreSQL schema
--
-- Apply in the Supabase SQL Editor (or `supabase db push`).
-- Ordering: extensions -> enums -> tables -> indexes -> RBAC helpers
--           -> RLS policies -> realtime -> triggers -> auth hook.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enumerated types
-- ---------------------------------------------------------------------------
create type app_role       as enum ('Admin', 'Dispatcher', 'Planner', 'Carrier', 'Client');
create type transport_mode as enum ('Ocean', 'Air', 'Road', 'Rail');
create type shipment_status as enum (
  'Booked', 'In Transit', 'Customs Hold', 'Delivered', 'Cancelled', 'Delayed'
);
create type container_status as enum (
  'Planned', 'Loading in Progress', 'Sealed & Staged', 'In Transit', 'Deconsolidated'
);
create type bol_type        as enum ('HBL', 'MBL');
create type po_status       as enum ('Open', 'In Transit', 'Customs Hold', 'Delivered', 'Closed', 'Cancelled');
create type load_type       as enum ('LCL', 'FCL');

-- =============================================================================
-- PROFILES (RBAC) — 1:1 with auth.users
-- =============================================================================
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text,
  email       text,
  role        app_role not null default 'Client',
  org_name    text,
  is_active   boolean not null default true,
  invited_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.profiles is 'User profile + role. Row is created automatically on signup.';

-- =============================================================================
-- SHIPMENTS
-- =============================================================================
create table public.shipments (
  id               uuid primary key default gen_random_uuid(),
  reference        text unique not null,             -- e.g. SHP-2026-8801
  tracking_number  text unique,
  client_name      text not null,
  shipper          text,
  consignee        text,
  origin           text not null,
  destination      text not null,
  mode             transport_mode not null,
  status           shipment_status not null default 'Booked',
  etd              date,
  eta              date,
  container_no     text,
  cargo_type       text,                              -- e.g. 'FCL 40HQ', 'Air Express'
  vessel           text,
  carrier          text,
  po_number        text,
  weight_kg        numeric(12,2) default 0,
  volume_cbm       numeric(12,2) default 0,
  hazard_class     text default 'None',
  incoterms        text,
  current_location text,
  current_lat      double precision,
  current_lng      double precision,
  progress         int not null default 0 check (progress between 0 and 100),
  -- Ownership / RBAC scoping
  client_id        uuid references public.profiles (id) on delete set null,
  carrier_id       uuid references public.profiles (id) on delete set null,
  created_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index shipments_status_idx  on public.shipments (status);
create index shipments_mode_idx    on public.shipments (mode);
create index shipments_client_idx  on public.shipments (client_id);
create index shipments_carrier_idx on public.shipments (carrier_id);
create index shipments_po_idx      on public.shipments (po_number);

-- =============================================================================
-- SHIPMENT TRACKING LOGS  (Supabase Realtime source)
-- =============================================================================
create table public.shipment_tracking_logs (
  id          uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.shipments (id) on delete cascade,
  event_type  text not null default 'status',        -- status | gps | telemetry | system | booking
  message     text not null,
  level       text not null default 'info',          -- info | success | warning | error
  lat         double precision,
  lng         double precision,
  location    text,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);

create index tracking_logs_shipment_idx on public.shipment_tracking_logs (shipment_id, created_at desc);

-- =============================================================================
-- CONTAINERS  (Consolidation / Deconsolidation)
-- =============================================================================
create table public.containers (
  id                 uuid primary key default gen_random_uuid(),
  reference          text unique not null,            -- e.g. CONT-40HQ-1029
  container_type     text not null,                   -- '40ft High Cube Container'
  load_type          load_type not null default 'FCL',
  max_volume_cbm     numeric(12,2) not null,
  max_weight_kg      numeric(12,2) not null,
  current_volume_cbm numeric(12,2) not null default 0,
  current_weight_kg  numeric(12,2) not null default 0,
  origin             text,
  destination        text,
  vessel             text,
  status             container_status not null default 'Planned',
  created_by         uuid references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- Junction: which shipments are consolidated into which container.
create table public.container_shipments (
  container_id uuid not null references public.containers (id) on delete cascade,
  shipment_id  uuid not null references public.shipments (id) on delete cascade,
  loaded_at    timestamptz not null default now(),
  primary key (container_id, shipment_id)
);

-- Utilization can never exceed a container's capacity.
alter table public.containers
  add constraint containers_within_capacity
  check (
    current_weight_kg between 0 and max_weight_kg
    and current_volume_cbm between 0 and max_volume_cbm
  );

-- =============================================================================
-- BILLS OF LADING  (House / Master)
-- =============================================================================
create table public.bills_of_lading (
  id                 uuid primary key default gen_random_uuid(),
  bol_number         text unique not null,            -- HBL-2026-90112 / MBL-...
  bol_type           bol_type not null,
  shipment_id        uuid references public.shipments (id) on delete set null,
  master_bol_id      uuid references public.bills_of_lading (id) on delete set null, -- HBLs point to their MBL
  shipper_name       text,
  consignee_name     text,
  notify_party       text,
  vessel_name        text,
  voyage_no          text,
  port_of_loading    text,
  port_of_discharge  text,
  place_of_delivery  text,
  container_number   text,
  seal_number        text,
  total_weight_kg    numeric(12,2),
  total_volume_cbm   numeric(12,2),
  goods_description  text,
  freight_terms      text,                            -- Prepaid / Collect
  issued_date        date,
  created_by         uuid references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index bol_shipment_idx on public.bills_of_lading (shipment_id);
create index bol_master_idx   on public.bills_of_lading (master_bol_id);

-- =============================================================================
-- PURCHASE ORDERS + line items
-- =============================================================================
create table public.purchase_orders (
  id           uuid primary key default gen_random_uuid(),
  po_number    text unique not null,
  client_name  text not null,
  vendor       text,
  currency     text not null default 'PHP',
  total_amount numeric(14,2) not null default 0,
  status       po_status not null default 'Open',
  shipment_id  uuid references public.shipments (id) on delete set null,
  client_id    uuid references public.profiles (id) on delete set null,
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.purchase_order_items (
  id           uuid primary key default gen_random_uuid(),
  po_id        uuid not null references public.purchase_orders (id) on delete cascade,
  sku          text not null,
  name         text not null,
  qty_ordered  numeric(12,2) not null default 0,
  qty_shipped  numeric(12,2) not null default 0,
  unit_price   numeric(12,2) not null default 0,
  created_at   timestamptz not null default now()
);

create index po_items_po_idx on public.purchase_order_items (po_id);
create index po_shipment_idx on public.purchase_orders (shipment_id);

-- =============================================================================
-- ML LOAD PLANS (maker–checker)
-- =============================================================================
create type load_plan_status as enum ('Draft', 'Approved', 'Rejected');

create table public.load_plans (
  id                 uuid primary key default gen_random_uuid(),
  reference          text not null unique,
  status             load_plan_status not null default 'Draft',
  vehicle_ref        text,
  origin             text,
  destination        text,
  max_weight_kg      numeric(12,2) not null default 20000,
  max_volume_cbm     numeric(12,3) not null default 60,
  planned_weight_kg  numeric(12,2) not null default 0,
  planned_volume_cbm numeric(12,3) not null default 0,
  utilization_pct    numeric(5,2) not null default 0
                       check (utilization_pct >= 0 and utilization_pct <= 100),
  ml_score           numeric(5,2),
  ml_rationale       text,
  created_by         uuid references public.profiles (id) on delete set null,
  approved_by        uuid references public.profiles (id) on delete set null,
  approved_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table public.load_plan_items (
  id          uuid primary key default gen_random_uuid(),
  plan_id     uuid not null references public.load_plans (id) on delete cascade,
  shipment_id uuid not null references public.shipments (id) on delete cascade,
  sequence_no int not null default 1,
  created_at  timestamptz not null default now(),
  unique (plan_id, shipment_id)
);

create index load_plans_status_idx on public.load_plans (status);
create index load_plan_items_plan_idx on public.load_plan_items (plan_id);

-- =============================================================================
-- RBAC HELPER FUNCTIONS
-- =============================================================================
-- SECURITY DEFINER so policies can read the caller's role without recursion.
create or replace function public.current_role()
returns app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_role() in ('Admin', 'Dispatcher'), false);
$$;

create or replace function public.is_ops()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    public.current_role() in ('Admin', 'Dispatcher', 'Planner'),
    false
  );
$$;

create or replace function public.can_approve_load_plans()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_staff();
$$;

-- =============================================================================
-- ATOMIC TRACKING UPDATE
-- Inserts the tracking log and updates the shipment position/status in a single
-- database call. Centralizes authorization (staff, or the assigned carrier)
-- and the Philippine-bounds guard so they cannot be bypassed by an RLS misconfig.
-- =============================================================================
create or replace function public.post_tracking_update(
  p_shipment_id uuid,
  p_message text,
  p_location text,
  p_lat double precision default null,
  p_lng double precision default null,
  p_progress int default null,
  p_status shipment_status default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role  public.app_role;
  v_ship  public.shipments%rowtype;
  v_level text;
begin
  select role into v_role
    from public.profiles
    where id = auth.uid();

  select * into v_ship
    from public.shipments
    where id = p_shipment_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Shipment not found');
  end if;

  -- Authorization: staff, or the carrier assigned to this shipment only.
  if v_role is null or (
    v_role not in ('Admin', 'Dispatcher')
    and not (v_role = 'Carrier' and v_ship.carrier_id = auth.uid())
  ) then
    return jsonb_build_object('ok', false, 'error', 'Your role cannot post tracking updates');
  end if;

  -- Protective bounds: domestic Philippine tracking only.
  if p_lat is not null and p_lng is not null
     and (p_lat < 4.2 or p_lat > 21.5 or p_lng < 116.0 or p_lng > 127.0) then
    return jsonb_build_object('ok', false, 'error', 'Coordinates must be inside the Philippines');
  end if;

  v_level := case when p_status = 'Customs Hold'::shipment_status then 'warning' else 'info' end;

  insert into public.shipment_tracking_logs
    (shipment_id, event_type, level, message, location, lat, lng, created_by)
  values
    (p_shipment_id, 'gps', v_level, p_message, p_location, p_lat, p_lng, auth.uid());

  update public.shipments
     set current_location = coalesce(p_location, current_location),
         current_lat      = coalesce(p_lat, current_lat),
         current_lng      = coalesce(p_lng, current_lng),
         progress         = coalesce(p_progress, progress),
         status           = coalesce(p_status, status)
   where id = p_shipment_id;

  return jsonb_build_object('ok', true);
end;
$$;

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================
alter table public.profiles              enable row level security;
alter table public.shipments             enable row level security;
alter table public.shipment_tracking_logs enable row level security;
alter table public.containers            enable row level security;
alter table public.container_shipments   enable row level security;
alter table public.bills_of_lading       enable row level security;
alter table public.purchase_orders       enable row level security;
alter table public.purchase_order_items  enable row level security;
alter table public.load_plans            enable row level security;
alter table public.load_plan_items       enable row level security;

-- ---- profiles ----
create policy "profiles: read own or ops reads all"
  on public.profiles for select
  using (id = auth.uid() or public.is_ops());

create policy "profiles: update own"
  on public.profiles for update
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and role = (select p.role from public.profiles p where p.id = auth.uid())
  );

create policy "profiles: admin manages all"
  on public.profiles for all
  using (public.current_role() = 'Admin')
  with check (public.current_role() = 'Admin');

-- ---- shipments ----
-- Ops (Admin/Dispatcher/Planner) see everything. Carriers/Clients scoped.
create policy "shipments: scoped read"
  on public.shipments for select
  using (
    public.is_ops()
    or carrier_id = auth.uid()
    or client_id = auth.uid()
  );

create policy "shipments: ops write"
  on public.shipments for insert
  with check (public.is_ops());

create policy "shipments: staff or carrier update"
  on public.shipments for update
  using (public.is_staff() or carrier_id = auth.uid())
  with check (public.is_staff() or carrier_id = auth.uid());

create policy "shipments: admin delete"
  on public.shipments for delete
  using (public.current_role() = 'Admin');

-- ---- tracking logs ----
create policy "tracking: read if shipment visible"
  on public.shipment_tracking_logs for select
  using (
    exists (
      select 1 from public.shipments s
      where s.id = shipment_id
        and (public.is_ops() or s.carrier_id = auth.uid() or s.client_id = auth.uid())
    )
  );

create policy "tracking: staff or carrier insert"
  on public.shipment_tracking_logs for insert
  with check (
    public.is_staff()
    or exists (select 1 from public.shipments s where s.id = shipment_id and s.carrier_id = auth.uid())
  );

-- ---- containers (staff only manage; clients/carriers read) ----
create policy "containers: authenticated read"
  on public.containers for select
  using (auth.uid() is not null);

create policy "containers: staff manage"
  on public.containers for all
  using (public.is_staff())
  with check (public.is_staff());

create policy "container_shipments: authenticated read"
  on public.container_shipments for select
  using (auth.uid() is not null);

create policy "container_shipments: staff manage"
  on public.container_shipments for all
  using (public.is_staff())
  with check (public.is_staff());

-- ---- bills of lading ----
create policy "bol: read if shipment visible or ops"
  on public.bills_of_lading for select
  using (
    public.is_ops()
    or exists (
      select 1 from public.shipments s
      where s.id = shipment_id
        and (s.carrier_id = auth.uid() or s.client_id = auth.uid())
    )
  );

create policy "bol: staff manage"
  on public.bills_of_lading for all
  using (public.is_staff())
  with check (public.is_staff());

-- ---- purchase orders ----
create policy "po: scoped read"
  on public.purchase_orders for select
  using (public.is_ops() or client_id = auth.uid());

create policy "po: staff manage"
  on public.purchase_orders for all
  using (public.is_staff())
  with check (public.is_staff());

create policy "po_items: read if po visible"
  on public.purchase_order_items for select
  using (
    exists (
      select 1 from public.purchase_orders p
      where p.id = po_id and (public.is_ops() or p.client_id = auth.uid())
    )
  );

create policy "po_items: staff manage"
  on public.purchase_order_items for all
  using (public.is_staff())
  with check (public.is_staff());

-- ---- load plans (maker–checker) ----
create policy "load_plans: ops read"
  on public.load_plans for select
  using (public.is_ops());

create policy "load_plans: ops insert draft"
  on public.load_plans for insert
  with check (public.is_ops() and status = 'Draft');

create policy "load_plans: staff or draft owner update"
  on public.load_plans for update
  using (public.is_staff() or (public.is_ops() and status = 'Draft'))
  with check (public.is_staff() or (public.is_ops() and status = 'Draft'));

create policy "load_plans: staff or draft delete"
  on public.load_plans for delete
  using (
    public.is_staff()
    or (public.is_ops() and status = 'Draft' and created_by = auth.uid())
  );

create policy "load_plan_items: ops manage"
  on public.load_plan_items for all
  using (
    public.is_staff()
    or exists (
      select 1 from public.load_plans lp
      where lp.id = plan_id and public.is_ops() and lp.status = 'Draft'
    )
  )
  with check (
    public.is_staff()
    or exists (
      select 1 from public.load_plans lp
      where lp.id = plan_id and public.is_ops() and lp.status = 'Draft'
    )
  );

-- =============================================================================
-- REALTIME — publish the tables the UI subscribes to
-- =============================================================================
alter publication supabase_realtime add table public.shipments;
alter publication supabase_realtime add table public.shipment_tracking_logs;
alter publication supabase_realtime add table public.containers;

-- =============================================================================
-- TRIGGERS
-- =============================================================================
-- updated_at maintenance
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_shipments_touch   before update on public.shipments        for each row execute function public.touch_updated_at();
create trigger trg_containers_touch  before update on public.containers       for each row execute function public.touch_updated_at();
create trigger trg_bol_touch         before update on public.bills_of_lading  for each row execute function public.touch_updated_at();
create trigger trg_po_touch          before update on public.purchase_orders  for each row execute function public.touch_updated_at();
create trigger trg_profiles_touch    before update on public.profiles         for each row execute function public.touch_updated_at();
create trigger trg_load_plans_touch  before update on public.load_plans       for each row execute function public.touch_updated_at();

-- Auto-create a profile row when a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested text := coalesce(new.raw_user_meta_data ->> 'role', 'Client');
  resolved public.app_role;
begin
  -- Self-service signup may only claim untrusted roles. Staff roles
  -- (Admin/Dispatcher/Planner) are provisioned by an administrator only;
  -- any other requested role demotes to Client.
  resolved := case requested
    when 'Carrier' then 'Carrier'::public.app_role
    else 'Client'::public.app_role
  end;

  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    resolved
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================================================
-- PRIVILEGES — mirror hosted Supabase defaults so PostgREST can serve the
-- tables/functions through the REST + Realtime endpoints. Row-level security
-- (RLS policies above) still governs which rows/functions each role may use.
-- =============================================================================
grant usage on schema public to anon, authenticated, service_role;

grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;

alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public
  grant execute on functions to anon, authenticated, service_role;


-- ============================================================================
-- SOURCE: supabase/migrations/0002_enterprise_hardening.sql
-- ============================================================================

-- =============================================================================
-- Enterprise hardening: indexing, constraints, audit log, reference sequences,
-- least-privilege grants, deactivation lockout. Idempotent for live DBs.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Extensions
-- ---------------------------------------------------------------------------
create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- 2) Missing indexes for hot query paths
-- ---------------------------------------------------------------------------
create index if not exists shipments_created_idx
  on public.shipments (created_at desc);
create index if not exists shipments_status_created_idx
  on public.shipments (status, created_at desc);
create index if not exists shipments_client_created_idx
  on public.shipments (client_id, created_at desc);
create index if not exists shipments_carrier_created_idx
  on public.shipments (carrier_id, created_at desc);
create index if not exists shipments_mode_created_idx
  on public.shipments (mode, created_at desc);

-- Trigram GIN so the header search (reference / tracking / PO / client)
-- and the tracking ?q= filter stay fast on ILIKE '%term%'.
create index if not exists shipments_search_gin
  on public.shipments using gin (
    reference gin_trgm_ops,
    tracking_number gin_trgm_ops,
    po_number gin_trgm_ops,
    client_name gin_trgm_ops
  );

create index if not exists profiles_role_active_idx
  on public.profiles (role, is_active);
create index if not exists profiles_invited_by_idx
  on public.profiles (invited_by);

create index if not exists containers_created_idx
  on public.containers (created_at desc);
create index if not exists containers_status_idx
  on public.containers (status);

create index if not exists bol_created_idx
  on public.bills_of_lading (created_at desc);

create index if not exists po_created_idx
  on public.purchase_orders (created_at desc);
create index if not exists po_client_status_idx
  on public.purchase_orders (client_id, status);

create index if not exists load_plans_created_idx
  on public.load_plans (created_at desc);

-- ---------------------------------------------------------------------------
-- 3) Check constraints (NOT VALID: existing rows untouched, new rows enforced)
-- ---------------------------------------------------------------------------
alter table public.shipments
  add constraint shipments_non_negative
  check (weight_kg >= 0 and volume_cbm >= 0) not valid;

alter table public.shipments
  add constraint shipments_domestic_bounds
  check (
    (current_lat is not null and current_lat between 4.2 and 21.5)
    or current_lat is null
  ) not valid;

alter table public.shipments
  add constraint shipments_domestic_bounds_lng
  check (
    (current_lng is not null and current_lng between 116.0 and 127.0)
    or current_lng is null
  ) not valid;

alter table public.purchase_order_items
  add constraint po_items_non_negative
  check (qty_ordered >= 0 and qty_shipped >= 0 and unit_price >= 0) not valid;

-- ---------------------------------------------------------------------------
-- 4) Sequence-backed reference generation (no more Math.random collisions)
-- ---------------------------------------------------------------------------
create sequence if not exists public.shipments_ref_seq start 1000;
create sequence if not exists public.bol_ref_seq start 1000;
create sequence if not exists public.containers_ref_seq start 1000;

create or replace function public.next_shipment_reference()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select 'SHP-' || to_char(now(), 'YYYY') || '-' || nextval('public.shipments_ref_seq');
$$;

create or replace function public.next_bol_number(p_bol_type text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select
    case when upper(p_bol_type) = 'MBL' then 'MBL' else 'HBL' end
    || '-' || to_char(now(), 'YYYY') || '-'
    || nextval('public.bol_ref_seq');
$$;

create or replace function public.next_container_reference()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select 'CONT-' || to_char(now(), 'YYYY') || '-' || nextval('public.containers_ref_seq');
$$;

-- ---------------------------------------------------------------------------
-- 5) Audit log with a shared trigger
-- ---------------------------------------------------------------------------
create table if not exists public.audit_logs (
  id         bigint generated always as identity primary key,
  table_name text not null,
  record_id  uuid,
  action     text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  actor_id   uuid,
  old_data   jsonb,
  new_data   jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_actor_idx
  on public.audit_logs (actor_id, created_at desc);
create index if not exists audit_logs_table_idx
  on public.audit_logs (table_name, created_at desc);

alter table public.audit_logs enable row level security;
-- No RLS policies: only the SECURITY DEFINER trigger (caller: postgres) writes.
revoke all on public.audit_logs from anon, authenticated;

create or replace function public.log_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.audit_logs (table_name, record_id, action, actor_id, new_data)
    values (tg_table_name, new.id, tg_op, auth.uid(), to_jsonb(new));
  elsif tg_op = 'UPDATE' then
    insert into public.audit_logs (table_name, record_id, action, actor_id, old_data, new_data)
    values (tg_table_name, new.id, tg_op, auth.uid(), to_jsonb(old), to_jsonb(new));
  elsif tg_op = 'DELETE' then
    insert into public.audit_logs (table_name, record_id, action, actor_id, old_data)
    values (tg_table_name, old.id, tg_op, auth.uid(), to_jsonb(old));
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_audit_shipments on public.shipments;
create trigger trg_audit_shipments
  after insert or update or delete on public.shipments
  for each row execute function public.log_audit();
drop trigger if exists trg_audit_containers on public.containers;
create trigger trg_audit_containers
  after insert or update or delete on public.containers
  for each row execute function public.log_audit();
drop trigger if exists trg_audit_bol on public.bills_of_lading;
create trigger trg_audit_bol
  after insert or update or delete on public.bills_of_lading
  for each row execute function public.log_audit();
drop trigger if exists trg_audit_po on public.purchase_orders;
create trigger trg_audit_po
  after insert or update or delete on public.purchase_orders
  for each row execute function public.log_audit();
drop trigger if exists trg_audit_profiles on public.profiles;
create trigger trg_audit_profiles
  after insert or update or delete on public.profiles
  for each row execute function public.log_audit();
drop trigger if exists trg_audit_load_plans on public.load_plans;
create trigger trg_audit_load_plans
  after insert or update or delete on public.load_plans
  for each row execute function public.log_audit();

-- ---------------------------------------------------------------------------
-- 6) Deactivation lockout: an inactive profile resolves to NULL role, so every
--    RLS policy and gate refusibly denies data access immediately.
-- ---------------------------------------------------------------------------
create or replace function public.current_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select case when is_active then role else null end
    from public.profiles
   where id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- 7) Least-privilege grants
-- ---------------------------------------------------------------------------
-- No anonymous table/sequence access. RLS predicates still need the pure
-- helper functions, so keep those executable by anon/authenticated only.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from public;

alter default privileges in schema public
  revoke all on tables from anon;
alter default privileges in schema public
  revoke all on sequences from anon;
alter default privileges in schema public
  revoke execute on functions from public;
alter default privileges in schema public
  revoke execute on functions from anon;

grant execute on function public.current_role()
  to anon, authenticated, service_role;
grant execute on function public.is_staff()
  to anon, authenticated, service_role;
grant execute on function public.is_ops()
  to anon, authenticated, service_role;
grant execute on function public.can_approve_load_plans()
  to anon, authenticated, service_role;

-- Mutation/RPC functions: authenticated sessions only.
grant execute on function public.post_tracking_update(
  uuid, text, text, double precision, double precision, int, public.shipment_status
) to authenticated, service_role;
grant execute on function public.next_shipment_reference()
  to authenticated, service_role;
grant execute on function public.next_bol_number(text)
  to authenticated, service_role;
grant execute on function public.next_container_reference()
  to authenticated, service_role;

-- ============================================================================
-- SOURCE: supabase/migrations/0003_integrations.sql
-- ============================================================================

-- =============================================================================
-- Integration support: idempotent CRM/webhook ingestion ledger. Idempotent.
-- =============================================================================
create table if not exists public.webhook_events (
  id               bigint generated always as identity primary key,
  source           text not null,
  event_type       text not null,
  idempotency_key  text not null,
  payload          jsonb not null,
  status           text not null default 'received'
                     check (status in ('received', 'processed', 'failed')),
  error            text,
  created_at       timestamptz not null default now(),
  processed_at     timestamptz,
  unique (source, idempotency_key)
);

create index if not exists webhook_events_status_idx
  on public.webhook_events (status, created_at desc);

alter table public.webhook_events enable row level security;
-- Only the SECURITY DEFINER RPCs write; no direct client access.
revoke all on public.webhook_events from anon, authenticated;

-- ---------------------------------------------------------------------------
-- CRM purchase order ingestion with idempotency. Returns ok / duplicate / error.
-- ---------------------------------------------------------------------------
create or replace function public.ingest_crm_po(
  p_idempotency_key text,
  p_po_number       text,
  p_client_name     text,
  p_vendor          text,
  p_currency        text,
  p_total_amount    numeric,
  p_client_email    text,
  p_items           jsonb,   -- [{sku,name,qty_ordered,unit_price}]
  p_notes           text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item    jsonb;
  v_po_id   uuid;
  v_client  uuid;
  v_count   int;
begin
  -- Idempotency: skip if this source/key combination was already applied.
  select count(*) into v_count from public.webhook_events
    where idempotency_key = p_idempotency_key and source = 'crm'
      and status <> 'failed';
  if v_count > 0 then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;

  insert into public.webhook_events (source, event_type, idempotency_key, payload)
  values ('crm', 'po.upsert', p_idempotency_key, jsonb_build_object(
    'po_number', p_po_number, 'client_name', p_client_name, 'vendor', p_vendor,
    'currency', p_currency, 'total_amount', p_total_amount,
    'client_email', p_client_email, 'items', p_items
  ));

  -- Match an existing client profile by email if possible.
  select id into v_client from public.profiles
    where email = p_client_email and role = 'Client' limit 1;

  insert into public.purchase_orders
    (po_number, client_name, vendor, currency, total_amount, client_id,
     created_by, status)
  values
    (p_po_number, p_client_name, p_vendor,
     coalesce(nullif(p_currency, ''), 'PHP'), coalesce(p_total_amount, 0),
     v_client, v_client, 'Open')
  returning id into v_po_id;

  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    insert into public.purchase_order_items
      (po_id, sku, name, qty_ordered, qty_shipped, unit_price)
    values (
      v_po_id,
      coalesce(v_item ->> 'sku', ''),
      coalesce(v_item ->> 'name', ''),
      coalesce((v_item ->> 'qty_ordered')::numeric, 0),
      0,
      coalesce((v_item ->> 'unit_price')::numeric, 0)
    );
  end loop;

  update public.webhook_events
     set status = 'processed', processed_at = now()
   where source = 'crm' and idempotency_key = p_idempotency_key;

  return jsonb_build_object('ok', true, 'duplicate', false, 'po_id', v_po_id);
end;
$$;

grant execute on function public.ingest_crm_po(
  text, text, text, text, text, numeric, text, jsonb, text
) to service_role;

-- ============================================================================
-- SOURCE: supabase/migrations/0004_remove_vessel_ports.sql
-- ============================================================================

-- =============================================================================
-- Remove vessel & port-of-call fields. The operating model is now the simpler
-- Branch Hub → Handover to J&T flow, so ocean/port metadata is no longer used.
-- Idempotent for live DBs.
-- =============================================================================

alter table public.shipments
  drop column if exists vessel;

alter table public.containers
  drop column if exists vessel;

alter table public.bills_of_lading
  drop column if exists vessel_name,
  drop column if exists voyage_no,
  drop column if exists port_of_loading,
  drop column if exists port_of_discharge,
  drop column if exists place_of_delivery;


-- ============================================================================
-- SOURCE: supabase/migrations/0005_drop_off_hub.sql
-- ============================================================================

-- =============================================================================
-- Pivot to E-Commerce Authorized Drop-Off Hub operations ("Airship Express").
--
-- The heavy multimodal freight model (containers, load plans, ports, global
-- routing) is retired. The hub's core loop is now:
--   Seller pickup / walk-in intake  →  booking with delivery platform
--   →  courier batching  →  handover to third-party carrier (end of scope).
--
-- This migration is ADDITIVE: it adds the hub-specific tables/columns and
-- leaves existing freight tables in place (dormant) so no historical data is
-- destroyed. Idempotent for live DBs.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- New enums
-- ---------------------------------------------------------------------------
create type delivery_platform as enum (
  'J&T Express',
  'Flash Express',
  'LBC Express',
  'GoGo Xpress',
  'Shopee Drop-Off',
  'Lazada Drop-Off',
  'TikTok Shop Drop-Off',
  'Custom Partner'
);

create type pickup_status as enum (
  'Scheduled',
  'In Transit',
  'Received',
  'No Show',
  'Cancelled'
);

create type batch_status as enum (
  'Draft',
  'Ready',
  'Handed Over'
);

-- Extend the parcel lifecycle with hub-local stages. Existing freight status
-- values remain in the enum for backward compatibility but are no longer used.
alter type shipment_status add value if not exists 'Intake';
alter type shipment_status add value if not exists 'Batched';
alter type shipment_status add value if not exists 'Handed Over';
alter type shipment_status add value if not exists 'Archived';

-- ---------------------------------------------------------------------------
-- SELLERS — regular high-volume sellers the hub services
-- ---------------------------------------------------------------------------
create table public.sellers (
  id               uuid primary key default gen_random_uuid(),
  reference        text unique not null,        -- SELL-2026-0001
  name             text not null,
  contact_person   text,
  phone            text,
  email            text,
  address          text,
  pickup_frequency text,                        -- Daily / Weekly / On-demand
  notes            text,
  is_active        boolean not null default true,
  created_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index sellers_name_idx on public.sellers (name);

-- ---------------------------------------------------------------------------
-- PICKUP REQUESTS — scheduled/recorded pickups for regular sellers
-- ---------------------------------------------------------------------------
create table public.pickup_requests (
  id           uuid primary key default gen_random_uuid(),
  reference    text unique not null,            -- PKUP-2026-0001
  seller_id    uuid not null references public.sellers (id) on delete cascade,
  scheduled_at timestamptz not null,
  status       pickup_status not null default 'Scheduled',
  parcel_count int not null default 0 check (parcel_count >= 0),
  notes        text,
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index pickup_requests_seller_idx on public.pickup_requests (seller_id, scheduled_at desc);
create index pickup_requests_status_idx on public.pickup_requests (status);

-- ---------------------------------------------------------------------------
-- SHIPMENTS — now a local parcel / booking record
-- (adds platform + seller + lifecycle columns; freight columns stay dormant)
-- ---------------------------------------------------------------------------
alter table public.shipments
  add column if not exists platform     delivery_platform not null default 'Custom Partner',
  add column if not exists seller_id    uuid references public.sellers (id) on delete set null,
  add column if not exists service_type text not null default 'Standard',  -- Standard / COD / etc.
  add column if not exists cod_amount   numeric(12,2) not null default 0,
  add column if not exists cancel_reason text,
  add column if not exists archived_at  timestamptz;

alter table public.shipments
  add constraint shipments_cod_amount_check check (cod_amount >= 0);

create index shipments_platform_idx on public.shipments (platform);
create index shipments_archived_idx  on public.shipments (archived_at) where archived_at is not null;

-- ---------------------------------------------------------------------------
-- CARRIER BATCHES — parcels grouped per partner courier platform
-- ---------------------------------------------------------------------------
create table public.carrier_batches (
  id                uuid primary key default gen_random_uuid(),
  reference         text unique not null,       -- BATCH-2026-0001
  platform          delivery_platform not null,
  status            batch_status not null default 'Draft',
  parcel_count      int not null default 0 check (parcel_count >= 0),
  total_weight_kg   numeric(12,2) not null default 0,
  rider_name        text,
  rider_phone       text,
  handover_notes    text,
  handed_over_by    uuid references public.profiles (id) on delete set null,
  handed_over_at    timestamptz,
  created_by        uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index carrier_batches_platform_idx on public.carrier_batches (platform, status);

-- Junction: parcels contained in a batch.
create table public.carrier_batch_items (
  id          uuid primary key default gen_random_uuid(),
  batch_id    uuid not null references public.carrier_batches (id) on delete cascade,
  shipment_id uuid not null references public.shipments (id) on delete cascade,
  sequence_no int not null default 1,
  created_at  timestamptz not null default now(),
  unique (batch_id, shipment_id)
);

create index carrier_batch_items_batch_idx   on public.carrier_batch_items (batch_id);
create index carrier_batch_items_shipment_idx on public.carrier_batch_items (shipment_id);

-- ---------------------------------------------------------------------------
-- HANDOVERS — immutable sign-off log when a batch goes to the carrier rider
-- ---------------------------------------------------------------------------
create table public.handovers (
  id             uuid primary key default gen_random_uuid(),
  batch_id       uuid references public.carrier_batches (id) on delete set null,
  platform       delivery_platform not null,
  rider_name     text not null,
  rider_phone    text,
  parcel_count   int not null default 0 check (parcel_count >= 0),
  notes          text,
  handed_over_by uuid references public.profiles (id) on delete set null,
  handed_over_at timestamptz not null default now(),
  created_at     timestamptz not null default now()
);

create index handovers_batch_idx on public.handovers (batch_id);
create index handovers_date_idx  on public.handovers (handed_over_at desc);

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================
alter table public.sellers           enable row level security;
alter table public.pickup_requests   enable row level security;
alter table public.carrier_batches   enable row level security;
alter table public.carrier_batch_items enable row level security;
alter table public.handovers         enable row level security;

-- ---- sellers ----
create policy "sellers: ops read"
  on public.sellers for select
  using (public.is_ops());
create policy "sellers: staff manage"
  on public.sellers for all
  using (public.is_staff())
  with check (public.is_staff());

-- ---- pickup_requests ----
create policy "pickups: ops read"
  on public.pickup_requests for select
  using (public.is_ops());
create policy "pickups: staff manage"
  on public.pickup_requests for all
  using (public.is_staff())
  with check (public.is_staff());

-- ---- carrier_batches ----
create policy "batches: ops read"
  on public.carrier_batches for select
  using (public.is_ops());
create policy "batches: ops insert"
  on public.carrier_batches for insert
  with check (public.is_ops());
create policy "batches: staff or ops draft update"
  on public.carrier_batches for update
  using (public.is_staff() or (public.is_ops() and status = 'Draft'))
  with check (public.is_staff() or (public.is_ops() and status = 'Draft'));

-- ---- carrier_batch_items ----
create policy "batch_items: ops read"
  on public.carrier_batch_items for select
  using (public.is_ops());
create policy "batch_items: ops manage"
  on public.carrier_batch_items for all
  using (public.is_staff() or public.is_ops())
  with check (public.is_staff() or public.is_ops());

-- ---- handovers ----
create policy "handovers: ops read"
  on public.handovers for select
  using (public.is_ops());
create policy "handovers: staff insert"
  on public.handovers for insert
  with check (public.is_staff());

-- ---------------------------------------------------------------------------
-- REALTIME — the tables the hub UI subscribes to
-- ---------------------------------------------------------------------------
do $$
declare
  _pub text := 'supabase_realtime';
  _tbl text;
begin
  foreach _tbl in array array['public.shipments', 'public.carrier_batches', 'public.handovers'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = _pub and schemaname = split_part(_tbl, '.', 1)
        and tablename = split_part(_tbl, '.', 2)
    ) then
      execute format('alter publication %I add table %s', _pub, _tbl);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- TRIGGERS — updated_at maintenance for the new tables
-- ---------------------------------------------------------------------------
create trigger trg_sellers_touch          before update on public.sellers           for each row execute function public.touch_updated_at();
create trigger trg_pickups_touch          before update on public.pickup_requests   for each row execute function public.touch_updated_at();
create trigger trg_carrier_batches_touch  before update on public.carrier_batches   for each row execute function public.touch_updated_at();


-- ============================================================================
-- SOURCE: supabase/migrations/20260806_planner_rbac.sql
-- ============================================================================

-- =============================================================================
-- Planner role + ML load plans (maker–checker). Idempotent for live DB.
-- Does NOT include enterprise invite-only / audit / is_active bans.
-- =============================================================================

-- 1) Enum: Planner
do $$
begin
  if not exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'app_role' and e.enumlabel = 'Planner'
  ) then
    alter type public.app_role add value 'Planner' after 'Dispatcher';
  end if;
end $$;

-- 2) Enum: load_plan_status
do $$
begin
  if not exists (select 1 from pg_type where typname = 'load_plan_status') then
    create type public.load_plan_status as enum ('Draft', 'Approved', 'Rejected');
  end if;
end $$;

-- 3) Helpers
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_role() in ('Admin', 'Dispatcher'), false);
$$;

create or replace function public.is_ops()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    public.current_role() in ('Admin', 'Dispatcher', 'Planner'),
    false
  );
$$;

create or replace function public.can_approve_load_plans()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_staff();
$$;

-- Safe signup role mapping (invalid metadata → Client, no cast abort).
-- Self-service signup may only claim untrusted roles; staff roles are
-- provisioned by an administrator only.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested text := coalesce(new.raw_user_meta_data ->> 'role', 'Client');
  resolved public.app_role;
begin
  resolved := case requested
    when 'Carrier' then 'Carrier'::public.app_role
    else 'Client'::public.app_role
  end;

  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    resolved
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- 4) Tables
create table if not exists public.load_plans (
  id                 uuid primary key default gen_random_uuid(),
  reference          text not null unique,
  status             public.load_plan_status not null default 'Draft',
  vehicle_ref        text,
  origin             text,
  destination        text,
  max_weight_kg      numeric(12,2) not null default 20000,
  max_volume_cbm     numeric(12,3) not null default 60,
  planned_weight_kg  numeric(12,2) not null default 0,
  planned_volume_cbm numeric(12,3) not null default 0,
  utilization_pct    numeric(5,2) not null default 0
                       check (utilization_pct >= 0 and utilization_pct <= 100),
  ml_score           numeric(5,2),
  ml_rationale       text,
  created_by         uuid references public.profiles (id) on delete set null,
  approved_by        uuid references public.profiles (id) on delete set null,
  approved_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table if not exists public.load_plan_items (
  id          uuid primary key default gen_random_uuid(),
  plan_id     uuid not null references public.load_plans (id) on delete cascade,
  shipment_id uuid not null references public.shipments (id) on delete cascade,
  sequence_no int not null default 1,
  created_at  timestamptz not null default now(),
  unique (plan_id, shipment_id)
);

create index if not exists load_plans_status_idx on public.load_plans (status);
create index if not exists load_plan_items_plan_idx on public.load_plan_items (plan_id);

drop trigger if exists trg_load_plans_touch on public.load_plans;
create trigger trg_load_plans_touch
  before update on public.load_plans
  for each row execute function public.touch_updated_at();

-- 5) Refresh shipment/read policies to include Planner via is_ops()
alter table public.load_plans enable row level security;
alter table public.load_plan_items enable row level security;

drop policy if exists "shipments: scoped read" on public.shipments;
create policy "shipments: scoped read"
  on public.shipments for select
  using (
    public.is_ops()
    or carrier_id = auth.uid()
    or client_id = auth.uid()
  );

drop policy if exists "shipments: staff write" on public.shipments;
drop policy if exists "shipments: ops write" on public.shipments;
create policy "shipments: ops write"
  on public.shipments for insert
  with check (public.is_ops());

drop policy if exists "profiles: read own or staff reads all" on public.profiles;
drop policy if exists "profiles: read own or ops reads all" on public.profiles;
create policy "profiles: read own or ops reads all"
  on public.profiles for select
  using (id = auth.uid() or public.is_ops());

drop policy if exists "tracking: read if shipment visible" on public.shipment_tracking_logs;
create policy "tracking: read if shipment visible"
  on public.shipment_tracking_logs for select
  using (
    exists (
      select 1 from public.shipments s
      where s.id = shipment_id
        and (public.is_ops() or s.carrier_id = auth.uid() or s.client_id = auth.uid())
    )
  );

drop policy if exists "bol: read if shipment visible or staff" on public.bills_of_lading;
drop policy if exists "bol: read if shipment visible or ops" on public.bills_of_lading;
create policy "bol: read if shipment visible or ops"
  on public.bills_of_lading for select
  using (
    public.is_ops()
    or exists (
      select 1 from public.shipments s
      where s.id = shipment_id
        and (s.carrier_id = auth.uid() or s.client_id = auth.uid())
    )
  );

drop policy if exists "po: scoped read" on public.purchase_orders;
create policy "po: scoped read"
  on public.purchase_orders for select
  using (public.is_ops() or client_id = auth.uid());

drop policy if exists "po_items: read if po visible" on public.purchase_order_items;
create policy "po_items: read if po visible"
  on public.purchase_order_items for select
  using (
    exists (
      select 1 from public.purchase_orders p
      where p.id = po_id and (public.is_ops() or p.client_id = auth.uid())
    )
  );

-- Lock self role escalation on profile update
drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own"
  on public.profiles for update
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and role = (select p.role from public.profiles p where p.id = auth.uid())
  );

-- Load plans RLS
drop policy if exists "load_plans: ops read" on public.load_plans;
create policy "load_plans: ops read"
  on public.load_plans for select
  using (public.is_ops());

drop policy if exists "load_plans: ops insert draft" on public.load_plans;
create policy "load_plans: ops insert draft"
  on public.load_plans for insert
  with check (public.is_ops() and status = 'Draft');

drop policy if exists "load_plans: staff or draft owner update" on public.load_plans;
create policy "load_plans: staff or draft owner update"
  on public.load_plans for update
  using (
    public.is_staff()
    or (public.is_ops() and status = 'Draft')
  )
  with check (
    public.is_staff()
    or (public.is_ops() and status = 'Draft')
  );

drop policy if exists "load_plans: staff or draft delete" on public.load_plans;
create policy "load_plans: staff or draft delete"
  on public.load_plans for delete
  using (
    public.is_staff()
    or (public.is_ops() and status = 'Draft' and created_by = auth.uid())
  );

drop policy if exists "load_plan_items: ops manage" on public.load_plan_items;
create policy "load_plan_items: ops manage"
  on public.load_plan_items for all
  using (
    public.is_staff()
    or exists (
      select 1 from public.load_plans lp
      where lp.id = plan_id and public.is_ops() and lp.status = 'Draft'
    )
  )
  with check (
    public.is_staff()
    or exists (
      select 1 from public.load_plans lp
      where lp.id = plan_id and public.is_ops() and lp.status = 'Draft'
    )
  );


-- ============================================================================
-- SOURCE: supabase/migrations/20260822_add_seller_enum.sql
-- ============================================================================

-- =============================================================================
-- Add Seller role to app_role enum (split from 20260823_parcel_platform).
-- Isolated so Customer + parcel platform ops run in correct sequence:
-- 20260822_add_seller_enum -> 20260823_parcel_platform.
-- Idempotent via IF NOT EXISTS so re-runs are safe.
-- =============================================================================

alter type public.app_role add value if not exists 'Seller';
alter type public.app_role add value if not exists 'Customer';


-- ============================================================================
-- SOURCE: supabase/migrations/20260823_parcel_platform.sql
-- ============================================================================

-- =============================================================================
-- Parcel Management & Tracking platform upgrade (additive, idempotent).
--
-- Introduces the three-tier role model on top of the existing RBAC:
--   ADMIN    -> existing 'Admin' (+ legacy staff roles keep working)
--   SELLER   -> new 'Seller' app_role; a profile is linked to sellers row
--   CUSTOMER -> new 'Customer' app_role ('Client' remains a supported alias)
--
-- Also adds: parcel lifecycle statuses, hubs/facilities, in-app notifications,
-- PKG-YYYY-NNNNNN tracking numbers, an atomic status-update RPC that writes
-- tracking events + notifications, seller archiving columns, and RLS for all
-- of the above. No existing tables or data are destroyed.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Roles
-- ---------------------------------------------------------------------------
-- Seller + Customer enum values moved to 20260822_add_seller_enum.sql
-- to avoid "unsafe use of new value" in same transaction as RLS policies.
-- (Postgres requires enum ADD VALUE to be committed before use.)

-- ---------------------------------------------------------------------------
-- 2) Parcel lifecycle statuses (additive; legacy values stay valid)
-- ---------------------------------------------------------------------------
alter type public.shipment_status add value if not exists 'Registered';
alter type public.shipment_status add value if not exists 'Pickup Scheduled';
alter type public.shipment_status add value if not exists 'Picked Up';
alter type public.shipment_status add value if not exists 'Dropped Off';
alter type public.shipment_status add value if not exists 'At Origin Hub';
alter type public.shipment_status add value if not exists 'At Destination Hub';
alter type public.shipment_status add value if not exists 'Out for Delivery';
alter type public.shipment_status add value if not exists 'Delivery Failed';
alter type public.shipment_status add value if not exists 'Returned';

-- ---------------------------------------------------------------------------
-- 3) HUBS / FACILITIES — event-based location tracking anchors
-- ---------------------------------------------------------------------------
create table if not exists public.hubs (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  code       text unique,
  address    text,
  city       text,
  province   text,
  contact    text,
  is_active  boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists hubs_name_idx on public.hubs (name);
create index if not exists hubs_active_idx on public.hubs (is_active);

-- ---------------------------------------------------------------------------
-- 4) Column additions
-- ---------------------------------------------------------------------------
-- profiles: link Seller-role users to their sellers record
alter table public.profiles
  add column if not exists seller_id uuid references public.sellers (id) on delete set null;
create index if not exists profiles_seller_idx on public.profiles (seller_id);

-- sellers: archive workflow + richer profile + activity stamp
alter table public.sellers
  add column if not exists business_name text,
  add column if not exists archived_at   timestamptz,
  add column if not exists last_activity_at timestamptz;

-- shipments: parcel attributes + current hub + expected delivery
alter table public.shipments
  add column if not exists description            text,
  add column if not exists dimensions             text,
  add column if not exists shipping_fee           numeric(12,2),
  add column if not exists recipient_phone        text,
  add column if not exists expected_delivery_date date,
  add column if not exists delivery_method        text check (delivery_method in ('Pickup', 'Drop-off')),
  add column if not exists received_at            timestamptz,
  add column if not exists booked_at              timestamptz,
  add column if not exists manifested_at          timestamptz,
  add column if not exists handover_at            timestamptz,
  add column if not exists current_hub_id         uuid references public.hubs (id) on delete set null;

create index if not exists shipments_seller_created_idx
  on public.shipments (seller_id, created_at desc);
create index if not exists shipments_hub_idx
  on public.shipments (current_hub_id);
create index if not exists shipments_tracking_number_idx
  on public.shipments (tracking_number);

-- tracking logs: status at the time of the event (tracking timeline source)
alter table public.shipment_tracking_logs
  add column if not exists status public.shipment_status;

-- ---------------------------------------------------------------------------
-- 5) Tracking number sequence: PKG-2026-000001
-- ---------------------------------------------------------------------------
create sequence if not exists public.parcel_tracking_seq start 1;

create or replace function public.next_parcel_tracking_number()
returns text
language sql
security definer
set search_path = public
as $$
  select 'PKG-' || to_char(now(), 'YYYY') || '-' ||
         lpad(nextval('public.parcel_tracking_seq')::text, 6, '0');
$$;

-- ---------------------------------------------------------------------------
-- 6) NOTIFICATIONS — in-app, per-user
-- ---------------------------------------------------------------------------
create table if not exists public.notifications (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  parcel_id       uuid references public.shipments (id) on delete cascade,
  tracking_number text,
  title           text not null,
  message         text not null,
  status          text,
  is_read         boolean not null default false,
  created_at      timestamptz not null default now()
);

create index if not exists notifications_user_idx
  on public.notifications (user_id, is_read, created_at desc);
create index if not exists notifications_parcel_idx
  on public.notifications (parcel_id);

alter table public.notifications enable row level security;

create policy "notifications: read own"
  on public.notifications for select
  using (user_id = auth.uid());
create policy "notifications: update own"
  on public.notifications for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
-- Inserts happen exclusively through SECURITY DEFINER paths (triggers/RPC).

-- ---------------------------------------------------------------------------
-- 7) RBAC helpers for the new roles
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_role() = 'Admin', false);
$$;

-- Caller is an active Seller linked to a live (non-archived) seller account.
create or replace function public.current_seller_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.seller_id
    from public.profiles p
   where p.id = auth.uid()
     and p.role = 'Seller'
     and p.is_active
     and p.seller_id is not null
     and exists (select 1 from public.sellers s where s.id = p.seller_id and s.is_active);
$$;

grant execute on function public.is_admin() to anon, authenticated, service_role;
grant execute on function public.current_seller_id() to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8) RLS — extend existing tables to the new roles
-- ---------------------------------------------------------------------------
-- sellers: a Seller reads (and edits contact info of) their own record.
drop policy if exists "sellers: own seller read" on public.sellers;
create policy "sellers: own seller read"
  on public.sellers for select
  using (id = public.current_seller_id());

drop policy if exists "sellers: own seller contact update" on public.sellers;
create policy "sellers: own seller contact update"
  on public.sellers for update
  using (id = public.current_seller_id())
  with check (id = public.current_seller_id());

-- parcels: Seller sees/creates own parcels; Customer keeps client_id scoping.
drop policy if exists "shipments: seller own" on public.shipments;
create policy "shipments: seller own"
  on public.shipments for select
  using (seller_id = public.current_seller_id());

drop policy if exists "shipments: customer own" on public.shipments;
create policy "shipments: customer own"
  on public.shipments for select
  using (
    client_id = auth.uid()
    and coalesce(public.current_role() in ('Customer', 'Client'), false)
  );

drop policy if exists "shipments: seller insert own" on public.shipments;
create policy "shipments: seller insert own"
  on public.shipments for insert
  with check (
    seller_id = public.current_seller_id()
    and client_id is null  -- recipients are linked by staff only
  );

drop policy if exists "shipments: seller edit own registered" on public.shipments;
create policy "shipments: seller edit own registered"
  on public.shipments for update
  using (
    seller_id = public.current_seller_id()
    and status::text = 'Registered'  -- text compare: new enum value, safe in-txn
  )
  with check (seller_id = public.current_seller_id());

-- tracking timeline visibility follows parcel visibility.
drop policy if exists "tracking: seller of shipment" on public.shipment_tracking_logs;
create policy "tracking: seller of shipment"
  on public.shipment_tracking_logs for select
  using (
    exists (
      select 1 from public.shipments s
      where s.id = shipment_id
        and s.seller_id = public.current_seller_id()
    )
  );

-- hubs: every authenticated user can read facilities; staff manage them.
alter table public.hubs enable row level security;
create policy "hubs: authenticated read"
  on public.hubs for select
  using (auth.uid() is not null);
create policy "hubs: staff manage"
  on public.hubs for all
  using (public.is_staff())
  with check (public.is_staff());

-- audit logs: admin read-only access through RLS.
revoke all on public.audit_logs from anon, authenticated;
grant select on public.audit_logs to authenticated;
drop policy if exists "audit_logs: admin read" on public.audit_logs;
create policy "audit_logs: admin read"
  on public.audit_logs for select
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 9) NOTIFICATION GENERATION + SELLER ACTIVITY (definer-side triggers)
-- ---------------------------------------------------------------------------
-- Notify the parcel's seller account owner and/or assigned customer whenever
-- a parcel is registered. Status-change notifications are raised inside
-- update_parcel_status() below.
create or replace function public.notify_parcel_event(
  p_parcel public.shipments,
  p_title text,
  p_message text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Seller account owner (profile linked via profiles.seller_id).
  insert into public.notifications (user_id, parcel_id, tracking_number, title, message, status)
  select p.id, p_parcel.id, p_parcel.tracking_number, p_title, p_message,
         p_parcel.status::text
    from public.profiles p
   where p.seller_id = p_parcel.seller_id
     and p.role = 'Seller';

  -- Assigned customer/recipient account.
  if p_parcel.client_id is not null then
    insert into public.notifications (user_id, parcel_id, tracking_number, title, message, status)
    values (p_parcel.client_id, p_parcel.id, p_parcel.tracking_number, p_title, p_message,
            p_parcel.status::text);
  end if;
end;
$$;

create or replace function public.on_parcel_registered()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.notify_parcel_event(
    new,
    'Parcel Registered',
    'Parcel ' || coalesce(new.tracking_number, new.reference) ||
      ' has been registered' ||
      case when new.seller_id is not null then ' for shipment.' else '.' end
  );
  return new;
end;
$$;

drop trigger if exists trg_parcel_registered on public.shipments;
create trigger trg_parcel_registered
  after insert on public.shipments
  for each row execute function public.on_parcel_registered();

-- Keep sellers.last_activity_at fresh on any parcel movement.
create or replace function public.touch_seller_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seller uuid;
begin
  v_seller := coalesce(new.seller_id, old.seller_id);
  if v_seller is not null then
    update public.sellers set last_activity_at = now() where id = v_seller;
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_seller_activity on public.shipments;
create trigger trg_seller_activity
  after insert or update or delete on public.shipments
  for each row execute function public.touch_seller_activity();

drop trigger if exists trg_audit_sellers on public.sellers;
create trigger trg_audit_sellers
  after insert or update or delete on public.sellers
  for each row execute function public.log_audit();

drop trigger if exists trg_hubs_touch on public.hubs;
create trigger trg_hubs_touch before update on public.hubs
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 10) ATOMIC STATUS UPDATE RPC — permission-checked, single round trip.
-- Updates the parcel, appends the tracking event, refreshes the hub/location,
-- raises notifications, and returns {ok, error} like post_tracking_update.
-- ---------------------------------------------------------------------------
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
  v_new     public.shipment_status;
  v_level   text := 'info';
  v_progress int;
begin
  select role into v_role from public.profiles where id = auth.uid();
  if v_role is null or v_role not in ('Admin', 'Dispatcher', 'Planner') then
    return jsonb_build_object('ok', false, 'error',
      'Only operations staff can change parcel status');
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
  if v_parcel.status = v_new and p_location is null and p_hub_id is null then
    return jsonb_build_object('ok', false, 'error', 'Parcel already has this status');
  end if;

  v_progress := case v_new
    when 'Registered' then 5
    when 'Pickup Scheduled' then 15
    when 'Picked Up' then 25
    when 'Dropped Off' then 30
    when 'At Origin Hub' then 40
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

  update public.shipments
     set status          = v_new,
         current_location = coalesce(p_location, current_location),
         current_hub_id   = coalesce(p_hub_id, current_hub_id),
         progress         = v_progress
   where id = p_parcel_id;

  insert into public.shipment_tracking_logs
    (shipment_id, event_type, level, message, location, status, created_by)
  values
    (p_parcel_id, 'status', v_level,
     coalesce(p_description,
       'Status changed from ' || v_parcel.status || ' to ' || v_new),
     coalesce(p_location,
       (select h.name from public.hubs h where h.id = coalesce(p_hub_id, v_parcel.current_hub_id))),
     v_new,
     auth.uid());

  perform public.notify_parcel_event(
    (select * from public.shipments where id = p_parcel_id),
    'Parcel Update',
    'Parcel ' || coalesce(v_parcel.tracking_number, v_parcel.reference) ||
      ' is now ' || replace(v_new, '_', ' ') || '.' ||
      case when p_location is not null then ' Current location: ' || p_location || '.' else '' end
  );

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.update_parcel_status(uuid, text, text, uuid, text)
  to authenticated, service_role;
grant execute on function public.notify_parcel_event(public.shipments, text, text)
  to service_role;
grant execute on function public.next_parcel_tracking_number()
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 11) Seed default hubs (only when empty)
-- ---------------------------------------------------------------------------
insert into public.hubs (name, code, city, province, address)
select * from (values
  ('Manila Distribution Hub', 'HUB-MNL', 'Manila', 'Metro Manila', 'Port Area, Manila'),
  ('Bulacan Sorting Hub', 'HUB-BUL', 'Malolos', 'Bulacan', 'McArthur Hwy, Malolos'),
  ('Cebu Distribution Hub', 'HUB-CEB', 'Cebu City', 'Cebu', 'North Reclamation Area'),
  ('Davao Distribution Hub', 'HUB-DVO', 'Davao City', 'Davao del Sur', 'Bajada, Davao City')
) as seed(name, code, city, province, address)
where not exists (select 1 from public.hubs limit 1);

-- ---------------------------------------------------------------------------
-- 13) Signup trigger: new self-service accounts default to the Customer role.
-- (Staff/Seller roles are provisioned by an administrator only.)
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested text := coalesce(new.raw_user_meta_data ->> 'role', 'Customer');
  resolved public.app_role;
begin
  resolved := case requested
    when 'Carrier' then 'Carrier'::public.app_role
    else 'Customer'::public.app_role
  end;

  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    resolved
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 12) Realtime — notify UIs of new notification rows
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
exception
  when undefined_table then null; -- publication missing on fresh local DBs
end $$;


-- ============================================================================
-- SOURCE: supabase/migrations/20260824_role_consolidation.sql
-- ============================================================================

-- =============================================================================
-- Role consolidation: strip Dispatcher / Planner / Client / Carrier.
--
-- Canonical roles are now: Admin, Seller, Customer.
--   * Former Dispatcher/Planner/Carrier accounts -> deactivated (Admin power
--     is deliberately NOT granted to them).
--   * Former Client accounts -> remapped to Customer (same access tier).
--   * RLS helpers is_staff()/is_ops() collapse to Admin-only, which instantly
--     tightens every policy that references them.
--   * RLS clauses keyed on the removed Carrier role are rewritten.
--   * update_parcel_status()/post_tracking_update() authorization narrows to
--     Admin only.
--
-- NOTE 1: PostgreSQL cannot drop enum labels; the removed values remain
--         defined but the application no longer assigns or accepts them
--         (parseAppRole rejects unknown values).
-- NOTE 2: courier platforms (J&T, LBC, ...) remain first-class data via the
--         shipments.platform / carrier_batches tables — they were never users.
-- Idempotent for live DBs.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Remap / lock out legacy-role profiles
-- ---------------------------------------------------------------------------
update public.profiles
   set is_active = false
 where role in ('Dispatcher', 'Planner', 'Carrier')
   and is_active;

update public.profiles set role = 'Admin'    where role in ('Dispatcher', 'Planner');
update public.profiles set role = 'Customer' where role = 'Client';

-- ---------------------------------------------------------------------------
-- 2) RBAC helpers: staff/ops collapse to Admin-only
-- ---------------------------------------------------------------------------
create or replace function public.current_role()
returns app_role
language sql
stable
security definer
set search_path = public
as $$
  select case when is_active then role else null end
    from public.profiles
   where id = auth.uid();
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_role() = 'Admin', false);
$$;

create or replace function public.is_ops()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_role() = 'Admin', false);
$$;

create or replace function public.can_approve_load_plans()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_staff();
$$;

grant execute on function public.current_role()
  to anon, authenticated, service_role;
grant execute on function public.is_staff()
  to anon, authenticated, service_role;
grant execute on function public.is_ops()
  to anon, authenticated, service_role;
grant execute on function public.can_approve_load_plans()
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3) Signup trigger: new self-service accounts default to Customer
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    'Customer'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 4) Rewrite RLS policies that keyed access on the removed Carrier role.
--    (External courier platforms are data — shipments.platform / batches.)
-- ---------------------------------------------------------------------------
drop policy if exists "shipments: scoped read" on public.shipments;
create policy "shipments: scoped read"
  on public.shipments for select
  using (
    public.is_ops()
    or client_id = auth.uid()
    or seller_id = public.current_seller_id()
  );

drop policy if exists "shipments: staff or carrier update" on public.shipments;
create policy "shipments: staff update"
  on public.shipments for update
  using (public.is_staff() or seller_id = public.current_seller_id())
  with check (public.is_staff() or seller_id = public.current_seller_id());

drop policy if exists "tracking: read if shipment visible" on public.shipment_tracking_logs;
create policy "tracking: read if shipment visible"
  on public.shipment_tracking_logs for select
  using (
    exists (
      select 1 from public.shipments s
      where s.id = shipment_id
        and (
          public.is_ops()
          or s.client_id = auth.uid()
          or s.seller_id = public.current_seller_id()
        )
    )
  );

drop policy if exists "tracking: staff or carrier insert" on public.shipment_tracking_logs;
create policy "tracking: staff insert"
  on public.shipment_tracking_logs for insert
  with check (public.is_staff());

-- ---------------------------------------------------------------------------
-- 5) Legacy GPS tracking RPC: Admin-only authorization
-- ---------------------------------------------------------------------------
create or replace function public.post_tracking_update(
  p_shipment_id uuid,
  p_message text,
  p_location text,
  p_lat double precision default null,
  p_lng double precision default null,
  p_progress int default null,
  p_status shipment_status default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role  public.app_role;
  v_ship  public.shipments%rowtype;
  v_level text;
begin
  select role into v_role from public.profiles where id = auth.uid();
  if v_role is null or v_role <> 'Admin' then
    return jsonb_build_object('ok', false, 'error',
      'Only administrators can post tracking updates');
  end if;

  select * into v_ship from public.shipments where id = p_shipment_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Shipment not found');
  end if;

  -- Protective bounds: domestic Philippine tracking only.
  if p_lat is not null and p_lng is not null
     and (p_lat < 4.2 or p_lat > 21.5 or p_lng < 116.0 or p_lng > 127.0) then
    return jsonb_build_object('ok', false, 'error', 'Coordinates must be inside the Philippines');
  end if;

  v_level := case when p_status = 'Delivery Failed'::shipment_status then 'error' else 'info' end;

  insert into public.shipment_tracking_logs
    (shipment_id, event_type, level, message, location, lat, lng, created_by)
  values
    (p_shipment_id, 'gps', v_level, p_message, p_location, p_lat, p_lng, auth.uid());

  update public.shipments
     set current_location = coalesce(p_location, current_location),
         current_lat      = coalesce(p_lat, current_lat),
         current_lng      = coalesce(p_lng, current_lng),
         progress         = coalesce(p_progress, progress),
         status           = coalesce(p_status, status)
   where id = p_shipment_id;

  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.post_tracking_update(
  uuid, text, text, double precision, double precision, int, public.shipment_status
) from anon, public;
grant execute on function public.post_tracking_update(
  uuid, text, text, double precision, double precision, int, public.shipment_status
) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6) Atomic status-update RPC: Admin-only authorization
-- ---------------------------------------------------------------------------
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
  v_new     public.shipment_status;
  v_level   text := 'info';
  v_progress int;
begin
  select role into v_role from public.profiles where id = auth.uid();
  if v_role is null or v_role <> 'Admin' then
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
  if v_parcel.status = v_new and p_location is null and p_hub_id is null then
    return jsonb_build_object('ok', false, 'error', 'Parcel already has this status');
  end if;

  v_progress := case v_new
    when 'Registered' then 5
    when 'Pickup Scheduled' then 15
    when 'Picked Up' then 25
    when 'Dropped Off' then 30
    when 'At Origin Hub' then 40
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

  update public.shipments
     set status          = v_new,
         current_location = coalesce(p_location, current_location),
         current_hub_id   = coalesce(p_hub_id, current_hub_id),
         progress         = v_progress
   where id = p_parcel_id;

  insert into public.shipment_tracking_logs
    (shipment_id, event_type, level, message, location, status, created_by)
  values
    (p_parcel_id, 'status', v_level,
     coalesce(p_description,
       'Status changed from ' || v_parcel.status || ' to ' || v_new),
     coalesce(p_location,
       (select h.name from public.hubs h where h.id = coalesce(p_hub_id, v_parcel.current_hub_id))),
     v_new,
     auth.uid());

  perform public.notify_parcel_event(
    (select * from public.shipments where id = p_parcel_id),
    'Parcel Update',
    'Parcel ' || coalesce(v_parcel.tracking_number, v_parcel.reference) ||
      ' is now ' || replace(v_new, '_', ' ') || '.' ||
      case when p_location is not null then ' Current location: ' || p_location || '.' else '' end
  );

  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.update_parcel_status(uuid, text, text, uuid, text)
  from anon, public;
grant execute on function public.update_parcel_status(uuid, text, text, uuid, text)
  to authenticated, service_role;


-- ============================================================================
-- SOURCE: supabase/migrations/20260825_seller_attach_customer.sql
-- ============================================================================

-- =============================================================================
-- Allow sellers to attach a REGISTERED customer account to their own parcel
-- while it is still 'Registered'. Admin may do it at any stage.
--
-- Why an RPC: sellers cannot write shipments.client_id directly (RLS blocks
-- it), so this SECURITY DEFINER function performs the lookup + write with its
-- own authorization checks:
--   * Admin            -> any parcel, any status
--   * Seller           -> ONLY their own parcel, ONLY while 'Registered'
--   * Customer         -> never
-- The target must be an existing active Customer account; unknown emails are
-- reported back instead of guessed (no enumeration beyond yes/no per parcel
-- the caller already owns).
-- Idempotent for live DBs.
-- =============================================================================

create or replace function public.attach_parcel_customer(
  p_parcel_id      uuid,
  p_customer_email text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role    public.app_role;
  v_parcel  public.shipments%rowtype;
  v_customer public.profiles%rowtype;
begin
  if p_customer_email is null or btrim(p_customer_email) = '' then
    return jsonb_build_object('ok', false, 'error', 'Customer email is required');
  end if;

  select role into v_role from public.profiles where id = auth.uid();

  select * into v_parcel from public.shipments where id = p_parcel_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Parcel not found');
  end if;

  if v_role = 'Admin' then
    null; -- admins may reassign recipients at any stage
  elsif v_role = 'Seller'
        and v_parcel.seller_id = public.current_seller_id()
        and v_parcel.status::text = 'Registered' then
    null; -- sellers: own parcel, pre-dispatch only
  else
    return jsonb_build_object('ok', false, 'error',
      'You are not allowed to change this parcel''s recipient');
  end if;

  select * into v_customer
    from public.profiles
   where lower(email) = lower(btrim(p_customer_email))
     and role = 'Customer'
     and is_active
   limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error',
      'No registered customer account was found with that email');
  end if;

  -- Already attached? Treat as success (idempotent UI retries).
  if v_parcel.client_id = v_customer.id then
    return jsonb_build_object('ok', true);
  end if;

  update public.shipments
     set client_id = v_customer.id
   where id = p_parcel_id;

  -- Welcome notification so the customer immediately sees the parcel.
  perform public.notify_parcel_event(
    (select * from public.shipments where id = p_parcel_id),
    'Parcel Assigned to You',
    'A parcel (' || coalesce(v_parcel.tracking_number, v_parcel.reference) ||
      ') has been assigned to your account.'
  );

  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.attach_parcel_customer(uuid, text) from anon, public;
grant execute on function public.attach_parcel_customer(uuid, text)
  to authenticated, service_role;


-- ============================================================================
-- SOURCE: supabase/migrations/20260826_performance_indexes.sql
-- ============================================================================

-- =============================================================================
-- Performance pass: composite indexes for the hottest parcel-platform queries.
-- All additive / IF NOT EXISTS — idempotent for live DBs.
-- =============================================================================

-- Seller dashboards: "my parcels" filtered by status chips.
create index if not exists shipments_seller_status_created_idx
  on public.shipments (seller_id, status, created_at desc);

-- Customer dashboard: assigned parcels newest-first.
create index if not exists shipments_client_created_idx2
  on public.shipments (client_id, created_at desc);

-- Tracking timeline: events for one parcel in chronological order.
create index if not exists tracking_logs_shipment_time_idx
  on public.shipment_tracking_logs (shipment_id, created_at);

-- Notification bell: unread count per user is a hot query on every page load.
create index if not exists notifications_unread_idx
  on public.notifications (user_id) where not is_read;

-- Hub directory: active facilities first.
create index if not exists sellers_active_name_idx
  on public.sellers (is_active, name);

analyze public.shipments;
analyze public.shipment_tracking_logs;
analyze public.notifications;


-- ============================================================================
-- SOURCE: supabase/seed.sql
-- ============================================================================

-- =============================================================================
-- Demo seed — consolidated role model (Admin / Seller / Customer / Carrier).
-- Applies automatically on `supabase db reset` (local) or run in SQL Editor.
-- Creates demo auth users with working passwords and provisions profiles.
-- =============================================================================

do $$
declare
  v_pass     text := crypt('demo123456', gen_salt('bf'));
begin
  -- ---- demo users (idempotent: skip if already registered). Emails and names
  --      match the one-click Quick Login accounts on the sign-in page. ----
  if not exists (select 1 from auth.users where email = 'hazems120415@gmail.com') then
    insert into auth.users
      (instance_id, id, aud, role, email, encrypted_password,
       email_confirmed_at, confirmation_token, recovery_token,
       email_change_token_new, email_change, raw_app_meta_data, raw_user_meta_data,
       created_at, updated_at)
    values
      ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
       'hazems120415@gmail.com', v_pass, now(), '', '', '', '',
       '{"provider":"email","providers":["email"]}',
       '{"role":"Admin","full_name":"Admin Sol, Emmanuel M."}',
       now(), now());
  end if;

  if not exists (select 1 from auth.users where email = 'admin@freightos.demo') then
    insert into auth.users
      (instance_id, id, aud, role, email, encrypted_password,
       email_confirmed_at, confirmation_token, recovery_token,
       email_change_token_new, email_change, raw_app_meta_data, raw_user_meta_data,
       created_at, updated_at)
    values
      ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
       'admin@freightos.demo', v_pass, now(), '', '', '', '',
       '{"provider":"email","providers":["email"]}',
       '{"role":"Admin","full_name":"Sol, Emmanuel M."}',
       now(), now());
  end if;

  if not exists (select 1 from auth.users where email = 'customer@freightos.demo') then
    insert into auth.users
      (instance_id, id, aud, role, email, encrypted_password,
       email_confirmed_at, confirmation_token, recovery_token,
       email_change_token_new, email_change, raw_app_meta_data, raw_user_meta_data,
       created_at, updated_at)
    values
      ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
       'customer@freightos.demo', v_pass, now(), '', '', '', '',
       '{"provider":"email","providers":["email"]}',
       '{"role":"Customer","full_name":"Reyes, Miguel A."}',
       now(), now());
  end if;

  if not exists (select 1 from auth.users where email = 'seller@freightos.demo') then
    insert into auth.users
      (instance_id, id, aud, role, email, encrypted_password,
       email_confirmed_at, confirmation_token, recovery_token,
       email_change_token_new, email_change, raw_app_meta_data, raw_user_meta_data,
       created_at, updated_at)
    values
      ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
       'seller@freightos.demo', v_pass, now(), '', '', '', '',
       '{"provider":"email","providers":["email"]}',
       '{"role":"Seller","full_name":"Amora, Daniella Sophia P."}',
       now(), now());
  end if;

  if not exists (select 1 from auth.users where email = 'pinkysol07@gmail.com') then
    insert into auth.users
      (instance_id, id, aud, role, email, encrypted_password,
       email_confirmed_at, confirmation_token, recovery_token,
       email_change_token_new, email_change, raw_app_meta_data, raw_user_meta_data,
       created_at, updated_at)
    values
      ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
       'pinkysol07@gmail.com', v_pass, now(), '', '', '', '',
       '{"provider":"email","providers":["email"]}',
       '{"role":"Seller","full_name":"Amora, Daniella Sophia P."}',
       now(), now());
  end if;

-- ---- provision profiles (the signup trigger demotes self-claimed roles,
--      so demo roles are set explicitly here for development purposes) ----

  insert into public.profiles (id, full_name, email, role, org_name)
  select id, 'Sol, Emmanuel M.', email, 'Admin', 'Airship Express Ops'
    from auth.users where email = 'admin@freightos.demo'
  on conflict (id) do update set role = 'Admin', full_name = 'Sol, Emmanuel M.';

  insert into public.profiles (id, full_name, email, role, org_name)
  select id, 'Admin Sol, Emmanuel M.', email, 'Admin', 'Airship Express Ops'
    from auth.users where email = 'hazems120415@gmail.com'
  on conflict (id) do update set role = 'Admin', full_name = 'Admin Sol, Emmanuel M.';

  insert into public.profiles (id, full_name, email, role, org_name)
  select id, 'Reyes, Miguel A.', email, 'Customer', null
    from auth.users where email = 'customer@freightos.demo'
  on conflict (id) do update set role = 'Customer', full_name = 'Reyes, Miguel A.';

  insert into public.profiles (id, full_name, email, role, org_name)
  select id, 'Amora, Daniella Sophia P.', email, 'Seller', null
    from auth.users where email = 'seller@freightos.demo'
  on conflict (id) do update set role = 'Seller', full_name = 'Amora, Daniella Sophia P.';

  insert into public.profiles (id, full_name, email, role, seller_id)
  select u.id, 'Amora, Daniella Sophia P.', u.email, 'Seller',
         (select s.id from public.sellers s where s.reference = 'SELL-DEMO-0001')
    from auth.users u where u.email = 'seller@freightos.demo'
  on conflict (id) do update set
    role = 'Seller',
    full_name = 'Amora, Daniella Sophia P.',
    seller_id = (select s.id from public.sellers s where s.reference = 'SELL-DEMO-0001');

  insert into public.sellers (reference, name, email, pickup_frequency)
  values ('SELL-DEMO-0001', 'Amora, Daniella Sophia P.', 'pinkysol07@gmail.com', 'Daily')
  on conflict (reference) do nothing;

  insert into public.profiles (id, full_name, email, role, seller_id)
  select u.id, 'Amora, Daniella Sophia P.', u.email, 'Seller',
         (select s.id from public.sellers s where s.reference = 'SELL-DEMO-0001')
    from auth.users u where u.email = 'pinkysol07@gmail.com'
  on conflict (id) do update set
    role = 'Seller',
    full_name = 'Amora, Daniella Sophia P.',
    seller_id = (select s.id from public.sellers s where s.reference = 'SELL-DEMO-0001');

  raise notice 'Demo seed complete: Admin hazems120415@gmail.com, Seller pinkysol07@gmail.com, Customer customer@freightos.demo; shared password demo123456';
end $$;



-- ============================================================================
-- SOURCE: supabase/migrations/20260918_fix_notify_row_arg.sql
-- ============================================================================

-- =============================================================================
-- Fix "subquery must return only one column" on parcel status updates.
--
-- public.notify_parcel_event() takes a single `public.shipments` composite
-- argument, but update_parcel_status() and attach_parcel_customer() passed
-- `(select * from public.shipments where ...)` — a multi-column subquery —
-- as that argument. Postgres rejects it, so EVERY status update failed.
--
-- Fix: re-read the row into a %rowtype variable after the UPDATE and pass
-- the variable instead. Idempotent for live DBs.
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
  v_level   text := 'info';
  v_progress int;
begin
  select role into v_role from public.profiles where id = auth.uid();
  if v_role is null or v_role <> 'Admin' then
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
  if v_parcel.status = v_new and p_location is null and p_hub_id is null then
    return jsonb_build_object('ok', false, 'error', 'Parcel already has this status');
  end if;

  v_progress := case v_new
    when 'Registered' then 5
    when 'Pickup Scheduled' then 15
    when 'Picked Up' then 25
    when 'Dropped Off' then 30
    when 'At Origin Hub' then 40
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

  update public.shipments
     set status          = v_new,
         current_location = coalesce(p_location, current_location),
         current_hub_id   = coalesce(p_hub_id, current_hub_id),
         progress         = v_progress
   where id = p_parcel_id;

  insert into public.shipment_tracking_logs
    (shipment_id, event_type, level, message, location, status, created_by)
  values
    (p_parcel_id, 'status', v_level,
     coalesce(p_description,
       'Status changed from ' || v_parcel.status || ' to ' || v_new),
     coalesce(p_location,
       (select h.name from public.hubs h where h.id = coalesce(p_hub_id, v_parcel.current_hub_id))),
     v_new,
     auth.uid());

  -- Re-read AFTER the update so the notification carries the new status.
  -- NOTE: do NOT inline `(select * ...)` here — a multi-column subquery
  -- cannot be passed as the single composite argument and raises
  -- "subquery must return only one column".
  select * into v_updated from public.shipments where id = p_parcel_id;

  perform public.notify_parcel_event(
    v_updated,
    'Parcel Update',
    'Parcel ' || coalesce(v_parcel.tracking_number, v_parcel.reference) ||
      ' is now ' || replace(v_new::text, '_', ' ') || '.' ||
      case when p_location is not null then ' Current location: ' || p_location || '.' else '' end
  );

  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.update_parcel_status(uuid, text, text, uuid, text)
  from anon, public;
grant execute on function public.update_parcel_status(uuid, text, text, uuid, text)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Same subquery bug in the recipient-attach RPC.
-- ---------------------------------------------------------------------------
create or replace function public.attach_parcel_customer(
  p_parcel_id      uuid,
  p_customer_email text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role     public.app_role;
  v_parcel   public.shipments%rowtype;
  v_updated  public.shipments%rowtype;
  v_customer public.profiles%rowtype;
begin
  if p_customer_email is null or btrim(p_customer_email) = '' then
    return jsonb_build_object('ok', false, 'error', 'Customer email is required');
  end if;

  select role into v_role from public.profiles where id = auth.uid();

  select * into v_parcel from public.shipments where id = p_parcel_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Parcel not found');
  end if;

  if v_role = 'Admin' then
    null; -- admins may reassign recipients at any stage
  elsif v_role = 'Seller'
        and v_parcel.seller_id = public.current_seller_id()
        and v_parcel.status::text = 'Registered' then
    null; -- sellers: own parcel, pre-dispatch only
  else
    return jsonb_build_object('ok', false, 'error',
      'You are not allowed to change this parcel''s recipient');
  end if;

  select * into v_customer
    from public.profiles
   where lower(email) = lower(btrim(p_customer_email))
     and role = 'Customer'
     and is_active
   limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'error',
      'No registered customer account was found with that email');
  end if;

  -- Already attached? Treat as success (idempotent UI retries).
  if v_parcel.client_id = v_customer.id then
    return jsonb_build_object('ok', true);
  end if;

  update public.shipments
     set client_id = v_customer.id
   where id = p_parcel_id;

  -- See NOTE above: pass a row variable, never `(select * ...)`.
  select * into v_updated from public.shipments where id = p_parcel_id;

  -- Welcome notification so the customer immediately sees the parcel.
  perform public.notify_parcel_event(
    v_updated,
    'Parcel Assigned to You',
    'A parcel (' || coalesce(v_parcel.tracking_number, v_parcel.reference) ||
      ') has been assigned to your account.'
  );

  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.attach_parcel_customer(uuid, text) from anon, public;
grant execute on function public.attach_parcel_customer(uuid, text)
  to authenticated, service_role;
