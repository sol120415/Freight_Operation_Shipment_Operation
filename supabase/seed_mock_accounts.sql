-- =============================================================================
-- Airship Express: Multi-Role Mock Accounts Seed Script
-- =============================================================================
-- This script provisions initial mock testing accounts for multi-role access:
--
-- 1. ADMIN ACCOUNT:
--    - Email:    hazems120415@gmail.com (legacy demo Admin account also remains)
--    - Password: demo123456
--    - Role:     Admin (full administrative access to hubs, manifests, handovers,
--                sellers, customers, audit logs, and settings)
--    - Landing:  /admin/dashboard
--
-- 2. SELLER ACCOUNT:
--    - Email:    pinkysol07@gmail.com (legacy demo Seller account also remains)
--    - Password: demo123456
--    - Role:     Seller (restricted to seller-specific parcels & booking)
--    - Landing:  /seller/dashboard
--
-- Instructions:
-- Run this in the Supabase SQL Editor or apply via Supabase CLI (`supabase db reset`).
-- =============================================================================

do $$
declare
  v_pass text := crypt('demo123456', gen_salt('bf'));
  v_admin_uid uuid;
  v_seller_uid uuid;
  v_seller_record_id uuid;
begin
  -- ---------------------------------------------------------------------------
  -- 1. Create or ensure Seller business record in public.sellers
  -- ---------------------------------------------------------------------------
  insert into public.sellers (reference, name, business_name, email, phone, pickup_frequency, is_active)
  values (
    'SELL-DEMO-0001',
    'Amora, Daniella Sophia P.',
    'Airship Express Premier Seller',
    'pinkysol07@gmail.com',
    '0945 441 8789',
    'Daily',
    true
  )
  on conflict (reference) do update set
    name = excluded.name,
    business_name = excluded.business_name,
    email = excluded.email,
    is_active = true
  returning id into v_seller_record_id;

  if v_seller_record_id is null then
    select id into v_seller_record_id from public.sellers where reference = 'SELL-DEMO-0001';
  end if;

  -- ---------------------------------------------------------------------------
  -- 2. ADMIN ACCOUNTS (hazems120415@gmail.com and legacy admin@freightos.demo)
  -- ---------------------------------------------------------------------------
  -- Account A: hazems120415@gmail.com
  if not exists (select 1 from auth.users where email = 'hazems120415@gmail.com') then
    v_admin_uid := gen_random_uuid();
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, confirmation_token, recovery_token,
      email_change_token_new, email_change, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at
    ) values (
      '00000000-0000-0000-0000-000000000000', v_admin_uid, 'authenticated', 'authenticated',
      'hazems120415@gmail.com', v_pass, now(), '', '',
      '', '', '{"provider":"email","providers":["email"]}',
      '{"role":"Admin","full_name":"Admin Sol, Emmanuel M."}',
      now(), now()
    );
  end if;

  -- Account B: admin@freightos.demo (legacy alias)
  if not exists (select 1 from auth.users where email = 'admin@freightos.demo') then
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, confirmation_token, recovery_token,
      email_change_token_new, email_change, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at
    ) values (
      '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
      'admin@freightos.demo', v_pass, now(), '', '',
      '', '', '{"provider":"email","providers":["email"]}',
      '{"role":"Admin","full_name":"Sol, Emmanuel M."}',
      now(), now()
    );
  end if;

  -- Update profiles for Admins
  insert into public.profiles (id, full_name, email, role, org_name, is_active)
  select id, 'Admin Sol, Emmanuel M.', email, 'Admin'::public.app_role, 'Airship Express Operations Hub', true
    from auth.users where email = 'hazems120415@gmail.com'
  on conflict (id) do update set
    role = 'Admin'::public.app_role,
    full_name = 'Admin Sol, Emmanuel M.',
    org_name = 'Airship Express Operations Hub',
    is_active = true;

  insert into public.profiles (id, full_name, email, role, org_name, is_active)
  select id, 'Sol, Emmanuel M.', email, 'Admin'::public.app_role, 'Airship Express Operations Hub', true
    from auth.users where email = 'admin@freightos.demo'
  on conflict (id) do update set
    role = 'Admin'::public.app_role,
    full_name = 'Sol, Emmanuel M.',
    org_name = 'Airship Express Operations Hub',
    is_active = true;

  -- ---------------------------------------------------------------------------
  -- 3. SELLER ACCOUNTS (pinkysol07@gmail.com and legacy seller@freightos.demo)
  -- ---------------------------------------------------------------------------
  -- Account A: pinkysol07@gmail.com
  if not exists (select 1 from auth.users where email = 'pinkysol07@gmail.com') then
    v_seller_uid := gen_random_uuid();
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, confirmation_token, recovery_token,
      email_change_token_new, email_change, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at
    ) values (
      '00000000-0000-0000-0000-000000000000', v_seller_uid, 'authenticated', 'authenticated',
      'pinkysol07@gmail.com', v_pass, now(), '', '',
      '', '', '{"provider":"email","providers":["email"]}',
      '{"role":"Seller","full_name":"Amora, Daniella Sophia P."}',
      now(), now()
    );
  end if;

  -- Account B: seller@freightos.demo (legacy alias)
  if not exists (select 1 from auth.users where email = 'seller@freightos.demo') then
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, confirmation_token, recovery_token,
      email_change_token_new, email_change, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at
    ) values (
      '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
      'seller@freightos.demo', v_pass, now(), '', '',
      '', '', '{"provider":"email","providers":["email"]}',
      '{"role":"Seller","full_name":"Amora, Daniella Sophia P."}',
      now(), now()
    );
  end if;

  -- Update profiles for Sellers (linked to seller_id)
  insert into public.profiles (id, full_name, email, role, seller_id, is_active)
  select id, 'Amora, Daniella Sophia P.', email, 'Seller'::public.app_role, v_seller_record_id, true
    from auth.users where email = 'pinkysol07@gmail.com'
  on conflict (id) do update set
    role = 'Seller'::public.app_role,
    full_name = 'Amora, Daniella Sophia P.',
    seller_id = v_seller_record_id,
    is_active = true;

  insert into public.profiles (id, full_name, email, role, seller_id, is_active)
  select id, 'Amora, Daniella Sophia P.', email, 'Seller'::public.app_role, v_seller_record_id, true
    from auth.users where email = 'seller@freightos.demo'
  on conflict (id) do update set
    role = 'Seller'::public.app_role,
    full_name = 'Amora, Daniella Sophia P.',
    seller_id = v_seller_record_id,
    is_active = true;

  raise notice 'Airship Express mock accounts successfully created/updated:';
  raise notice '  - Admin:  hazems120415@gmail.com (pw: demo123456) -> /admin/dashboard';
  raise notice '  - Seller: pinkysol07@gmail.com (pw: demo123456) -> /seller/dashboard';
end $$;
