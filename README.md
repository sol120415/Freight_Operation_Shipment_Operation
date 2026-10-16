# Airship Express — Freight Operations & Shipment Execution Subsystem

A production-oriented logistics platform for booking, consolidating, documenting, and
tracking multimodal freight — built on **Next.js (App Router)**, **Supabase
(PostgreSQL + Auth + Realtime)**, and role-based access control.

> **Zero hardcoded mock data.** Every screen reads directly from Supabase and renders
> clean empty-state components when a table has no rows.

---

## Table of contents

1. [Tech stack](#tech-stack)
2. [Core modules](#core-modules)
3. [Architecture](#architecture)
4. [Prerequisites](#prerequisites)
5. [Setup](#setup)
6. [Environment variables](#environment-variables)
7. [Email OTP via SMTP](#email-otp-via-smtp)
8. [Database schema & RBAC](#database-schema--rbac)
9. [Running the app](#running-the-app)
10. [Roles & permissions](#roles--permissions)
11. [AI features](#ai-features)
12. [Project structure](#project-structure)
13. [Windows / PowerShell note](#windows--powershell-note)

---

## Tech stack

| Layer        | Technology                                                        |
| ------------ | ----------------------------------------------------------------- |
| Framework    | Next.js 14 (App Router, Server Components, Server Actions)         |
| UI           | React 18, Tailwind CSS, Lucide React icons                        |
| Charts        | Recharts                                                           |
| Backend      | Next.js Route Handlers + Server Actions (Node runtime)            |
| Database     | Supabase (PostgreSQL) with Row Level Security                     |
| Auth         | Supabase Auth (email/password) + RBAC via a `profiles` table      |
| Realtime     | Supabase Realtime (`postgres_changes`) for live tracking & feed   |
| AI           | Groq (preferred) or Google Gemini — server-side only              |

**Palette:** clean white base (`#FFFFFF` / `#F9FAFB`), pink accents
(`#EC4899` / `#F43F5E`), dark slate sidebar (`#0F172A`).

---

## Core modules

1. **Dashboard Overview** — KPI cards, real-time activity feed, quick actions, and a
   monthly volume analytics chart.
2. **Booking & AI Routing** — multi-modal shipment booking form with AI-generated
   route recommendations (fastest / cheapest / greenest).
3. **LCL / FCL Consolidation** — container load planning and grouping of shipments
   into containers, with live capacity utilization.
4. **House & Master BoL** — generate printable House and Master Bills of Lading; parse
   unstructured BoL text into structured fields via AI.
5. **Live Shipment Tracking** — Branch Hub → Carrier Batching → Handover to J&T handover path, status timeline, and location logs updated
   in real time through Supabase Realtime.
6. **PO Integration & SLA** — link purchase orders to shipments and track line-item
   fulfillment progress.

---

## Architecture

- **Server Components** fetch data directly from Supabase with the request-scoped,
  cookie-bound server client — RLS enforces per-role visibility.
- **Server Actions** (`"use server"`) handle all mutations (booking, consolidation,
  BoL creation, location updates) and `revalidatePath` the affected routes.
- **Route Handlers** under `src/app/api/ai/*` gate the AI helpers behind an
  authenticated session; API keys never reach the browser.
- **Middleware** refreshes the Supabase session on every request and redirects
  unauthenticated users to `/login`.

---

## Prerequisites

- **Node.js 18.17+** (Node 20 LTS recommended)
- A **Supabase project** (free tier is fine)
- Optional: a **Groq** or **Gemini** API key to enable AI features

---

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.local.example .env.local
#   then fill in the values (see below)

# 3. Apply the database schema
#   Local: supabase start && supabase db reset  (applies migrations + seed)
#   Hosted: open the Supabase Dashboard -> SQL Editor -> paste the contents of
#   supabase/migrations/0001_initial_schema.sql -> Run.
#   (Optional) run supabase/seed.sql afterwards for sample data.

# 4. Start the dev server
npm run dev
```

Then open <http://localhost:3001> (dev script uses `-p 3001`) and use the glass card:
* **Sign in** — normal Supabase email/password sign-in. Failures return a generic
  "Invalid email or password." After 3 failed attempts a Forgot Password prompt
  appears. Role-based landing: Admin → `/admin/dashboard`, Seller →
  `/seller/dashboard`.
* **Register** — creates a **Seller** account only, verified by email OTP:
  fill the seller form → receive a 6-digit code → verify → the account
  (auth user + `sellers` row + `profiles` link) is created and the seller is
  signed in. No role can be selected; Admin accounts are provisioned
  separately (see below).

There are no demo/one-click login shortcuts: the login page has no
credential-filling buttons and no bypass code exists in `src/` — every sign-in
goes through `supabase.auth.signInWithPassword`.

---

## Auth & demo accounts

**Sign in:** `src/app/login/actions.ts` `supabase.auth.signInWithPassword` →
role-based redirect. Only accounts that exist in Supabase `auth.users` can
sign in; errors are generic so accounts cannot be enumerated.

**Register (Seller + OTP):** `requestSellerOtp` validates the seller form and
issues a hashed, single-use 6-digit code (10-minute expiry, 5 attempts);
`verifySellerOtpAndRegister` verifies it, then creates the auth user (role
forced to `Seller`), the `sellers` business record, and the linked `profiles`
row. `requireProfile()` (`src/lib/auth.ts`) gates every page by
`profiles.role`. Delivery uses SMTP through Nodemailer when configured, and the
server terminal in local dev otherwise — see [Email OTP via SMTP](#email-otp-via-smtp).

**Sign In (password + email OTP):** `requestLoginOtp` checks the password without
persisting an authenticated session, then sends a login code. `verifyLoginOtp`
checks the code and password before creating the Supabase session and applying
the role-based dashboard redirect.

**Forgot Password (OTP):** `requestPasswordResetOtp` → code →
`resetPasswordWithOtp` sets a new strong password. Request messages are
identical whether or not the email exists.

**Seeded accounts (local dev):** `supabase/seed.sql` provisions demo Admin,
Seller (linked to `sellers` `SELL-DEMO-0001`), Customer, and OrderProcessor accounts on
`supabase db reset`, or run it manually in the SQL Editor:

| Role | Email | Name |
|------|-------|------|
| Admin | `hazems120415@gmail.com` / `admin@freightos.demo` | Admin Sol, Emmanuel M. / Sol, Emmanuel M. |
| Seller | `pinkysol07@gmail.com` / `seller@freightos.demo` | Amora, Daniella Sophia P. |
| Customer | `customer@freightos.demo` | Reyes, Miguel A. |
| OrderProcessor | `orderprocessor@freightos.demo` | Order Processing Desk |

Sign into these with the normal Sign In form (see the seed file for the local
development password; never use it outside local dev).

**Create Admin/Seller manually:** Supabase Dashboard → Auth → Create user →
insert the `profiles` row with the right role. Sellers additionally need a
`sellers` row + `profiles.seller_id` (or use the admin Sellers table, which
provisions the login account automatically).

---

## Environment variables

Copy `.env.local.example` to `.env.local` and set:

| Variable                        | Required | Purpose                                            |
| ------------------------------- | -------- | -------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | ✅       | Supabase project URL                               |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅       | Public anon/publishable key (safe for the browser) |
| `SUPABASE_SERVICE_ROLE_KEY`     | ⚙️       | Server-only key for trusted admin/seed operations  |
| `GROQ_API_KEY`                  | ⭘        | Enables AI routing & BoL parsing (preferred)       |
| `GEMINI_API_KEY`                | ⭘        | Fallback AI provider if Groq is not set            |
| `GROQ_MODEL`                    | ⭘        | Override (default `llama-3.3-70b-versatile`)        |
| `GEMINI_MODEL`                  | ⭘        | Override (default `gemini-2.0-flash`)              |
| `SMTP_HOST`                     | Prod ⭘   | SMTP server hostname (server-only)                 |
| `SMTP_PORT`                     | Prod ⭘   | SMTP port (usually 587 or 465)                     |
| `SMTP_SECURE`                   | Prod ⭘   | `false` for 587/STARTTLS; `true` for 465/TLS       |
| `SMTP_USER`                     | Prod ⭘   | SMTP username (server-only)                        |
| `SMTP_PASS`                     | Prod ⭘   | SMTP password/token (server-only)                  |
| `OTP_FROM_EMAIL`                | Prod ⭘   | Verified sender address, e.g. `noreply@yourdomain.com` (server-only) |
| `OTP_FROM_NAME`                 | ⭘        | Sender display name (default `Airship Express`)    |

> `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS — keep it server-side only, never expose it
> to the client. AI features are optional: with no key set, AI buttons report that no
> provider is configured and the rest of the app works normally.
> OTP email works without SMTP configuration in local dev (codes print to the
> server terminal), but production requires SMTP settings plus `OTP_FROM_EMAIL` —
> see [Email OTP via SMTP](#email-otp-via-smtp).

---

## Email OTP via SMTP

Sign In, Seller Registration, and Forgot Password use 6-digit email OTPs
(10-minute expiry, 5 attempts, 60-second resend cooldown, SHA-256 hashed
storage). `sendOtpEmail()` in `src/lib/otp.ts` delivers through the server-only
Nodemailer transporter in `src/lib/server/mailer.ts`.

1. **Install Nodemailer.** Run `npm install nodemailer` (Node.js 20 or newer).
2. **Get SMTP credentials** from your mail provider and verify the sender domain.
   Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`,
   `OTP_FROM_EMAIL`, and optionally `OTP_FROM_NAME` in `.env.local` for local
   development (or `.env.cloud` if you switch to your cloud Supabase project).
   Set the same server-side variables in the production host.
   Never use `NEXT_PUBLIC_` for mail credentials or commit real secrets.
3. **Choose the matching connection settings.** Port 587 normally uses
   STARTTLS (`SMTP_SECURE=false`); port 465 uses TLS (`SMTP_SECURE=true`).
   The examples in `.env.local.example`, `.env.localhost.example`, and
   `.env.cloud.example` show the variable names.
4. **Apply the database migration** that adds the `login` OTP purpose using
   `npm run db:push` for a linked database or `npm run db:reset` for local.
5. **Test login OTP:** sign in with a valid password, check the inbox, then enter
   the code and password again. A valid password alone must not create a session.
6. **Test the existing flows:** Register a seller and request a password reset.
   Both should now send through SMTP too. Incorrect codes show remaining
   attempts; delivery failures invalidate the unsent code.

---

## Database schema & RBAC

The full DDL lives in
[`supabase/migrations/0001_initial_schema.sql`](supabase/migrations/0001_initial_schema.sql)
and includes:

- **Enums** — `app_role`, `transport_mode`, `shipment_status`, `container_status`,
  `bol_type`, `po_status`, `load_type`.
- **8 tables** — `profiles`, `shipments`, `shipment_tracking_logs`, `containers`,
  `container_shipments`, `bills_of_lading`, `purchase_orders`,
  `purchase_order_items`.
- **RBAC helpers** — `current_role()` and `is_staff()` (SECURITY DEFINER) used by RLS
  policies.
- **Row Level Security** on every table, scoping staff / carrier / client visibility.
- **Realtime** publication for `shipments`, `shipment_tracking_logs`, and `containers`.
- **Triggers** — `updated_at` maintenance and `handle_new_user()`, which auto-creates a
  `profiles` row (with the chosen role) whenever a user signs up.

The TypeScript mirror of this schema is in
[`src/types/database.ts`](src/types/database.ts). If you change the DDL, regenerate or
update these types to keep the typed Supabase client accurate.

---

## Running the app

| Command            | Description                            |
| ------------------ | -------------------------------------- |
| `npm run dev`      | Start the dev server (hot reload)      |
| `npm run build`    | Production build + type checking       |
| `npm run start`    | Serve the production build             |
| `npm run lint`     | ESLint                                 |
| `npm run typecheck`| `tsc --noEmit` type check              |

---

## Roles & permissions

| Role | Sees | Can do |
|------|------|--------|
| **SuperAdmin** | Everything Admin can access, plus user and role management | Full system access; provisioned by an administrator and never self-registers |
| **Admin** | Everything — Hub KPIs, pickup/manifest/handover, parcels, sellers, customers, tracking, waybill | Full operations: intake → manifest → handover, reports, settings, audit, and seller management |
| **OperationsSupervisor** | Hub-wide operational view | Shift oversight, approvals, exceptions, reports, and operational corrections |
| **PickupCoordinator** | Seller and pickup workflows | Schedule pickups, receive pickup counts, and coordinate seller intake |
| **IntakeClerk** | Receiving workflows | Scan, weigh, label, and register parcels at the hub |
| **OrderProcessor** | Separate pending-order queue | Confirm seller orders and move accepted orders into hub intake |
| **Dispatcher** | Booking and dispatch workflows | Create bookings, sort parcels, and create/ready manifests |
| **HandoverOfficer** | Ready manifests and handover history | Count parcels and finalize custody handover to a courier |
| **ExceptionOfficer** | Operational exceptions | Resolve delayed, failed, damaged, lost, returned, and cancelled cases |
| **FinanceOps** | COD and reporting data | Review COD and settlement-related operational reports |
| **DocumentOfficer** | Waybill workflows | Create and check House/Master waybill records |
| **CarrierRelations** | Partner tracking and exception data | Follow up courier scans, SLA issues, and missing updates |
| **Courier** | Assigned parcels only | Update delivery progress and tracking for assigned parcels |
| **Seller** | Own parcels and seller dashboard | Register parcels and view own shipments; seller pickup scheduling is not an Admin Pickup & Intake function |
| **Customer** | Assigned parcels only (`src/app/(app)/dashboard/page.tsx:37` `CustomerDashboard`) | Provisioned by an administrator; read-only tracking |
| **Citizen** | Public/citizen portal data tier | Same own-shipment visibility as Customer |

Self-registration creates `Seller` accounts only. All internal roles must be provisioned by SuperAdmin. Admins use `/admin/dashboard`; operational staff use the separate `/operations/dashboard` workspace. `OrderProcessor` owns the pending-order queue, while Admin can see the same queue in the Admin dashboard for oversight. Navigation is filtered by role (`src/lib/nav.ts`), server actions use `src/lib/rbac.ts`, and PostgreSQL workflow functions/RLS enforce the task boundary. The system's default drop-off scope ends at third-party carrier handover; use `Courier` accounts only if Airship directly manages last-mile delivery.

---

## AI features

AI is server-side only (see [`src/lib/ai.ts`](src/lib/ai.ts)):

- **Route recommendations** — `POST /api/ai/routing` returns 3 diverse routes
  (fastest, most economical, greenest) for the booking form.
- **Bill of Lading parsing** — `POST /api/ai/parse-bl` extracts structured fields from
  pasted BoL text for the BoL generator.

The provider is chosen automatically: **Groq** if `GROQ_API_KEY` is set, otherwise
**Gemini**. Both calls request structured JSON output and validate it before use.

---

## Project structure

```
src/
├── app/
│   ├── (app)/                 # Authenticated app shell (sidebar + header)
│   │   ├── dashboard/         # Hub KPIs, platform volume, live feed
│   │   ├── operations/        # Separate staff workspace + pending-order queue
│   │   ├── pickup/            # Seller pickup scheduling & quick intake
│   │   ├── booking/           # Parcel intake + dynamic delivery-platform dropdown
│   │   ├── manifest/          # Courier manifesting (batch by platform)
│   │   ├── handover/          # Rider sign-off & handover history
│   │   ├── waybill/           # Waybill / document generator
│   │   └── schema/            # Admin-only DDL viewer
│   ├── api/ai/                # Server-only AI route handlers
│   ├── login/                 # Auth (sign in / register) + server actions
│   └── layout.tsx             # Root layout
├── components/                # UI, layout, dashboard
├── lib/
│   ├── supabase/              # Browser, server, middleware, admin clients
│   ├── ai.ts                  # Groq / Gemini helpers
│   ├── auth.ts                # requireProfile / requireRole
│   ├── nav.ts                 # Role-based navigation
│   ├── queries.ts             # Stats & data helpers
│   └── utils.ts               # Formatting + shared constants
├── types/
│   ├── database.ts            # Supabase schema types
│   └── index.ts               # Domain type aliases
└── middleware.ts              # Session refresh + auth redirects

supabase/
├── config.toml               # Local dev config (ports, auth, seed)
├── migrations/
│   ├── 0001_initial_schema.sql   # Full DDL: enums, tables, RLS, realtime, triggers
│   └── 20260806_planner_rbac.sql # Incremental Planner/load-plan RBAC (idempotent)
└── seed.sql                   # Demo parcels, sellers, manifests (applied on `supabase db reset`)
```

---

## Windows / PowerShell note

If the project path contains spaces or `&`, the npm-generated `next` shim can fail to
resolve. Invoke the Next.js binary directly instead:

```powershell
node "./node_modules/next/dist/bin/next" dev
node "./node_modules/next/dist/bin/next" build
```

---

Built with a clean white UI, pink accents, and a dark slate command sidebar.
#   f s f s d f  
 
