-- Provision the service-only OTP table independently of seller workflow
-- changes, and permit OTPs requested during login.
create table if not exists public.email_verification_codes (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  purpose text not null,
  code_hash text not null,
  attempts int not null default 0,
  max_attempts int not null default 5,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.email_verification_codes
  drop constraint if exists email_verification_codes_purpose_check;

alter table public.email_verification_codes
  add constraint email_verification_codes_purpose_check
  check (purpose in ('login', 'seller_registration', 'password_reset'));

create index if not exists email_verification_codes_email_idx
  on public.email_verification_codes (email, purpose, created_at desc);

alter table public.email_verification_codes enable row level security;
