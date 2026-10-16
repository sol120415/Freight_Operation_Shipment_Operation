# RBAC — Airship Express FOSE (Authorized Drop-Off Hub)

Four layers: **Auth session → nav visibility → `requireRole`/`requirePermission` → Postgres RLS**.

## Roles (canonical)

| Role | Purpose |
|------|---------|
| **SuperAdmin** | System owner: manages users, roles, settings, security, and every operation. |
| **Admin** | Trusted full-access operations administrator kept for existing senior accounts and legacy workflows. |
| **OperationsSupervisor** | Shift lead: oversees intake, dispatch, handover, exceptions, reports, and approvals. |
| **PickupCoordinator** | Schedules seller pickups and compares expected versus received parcel counts. |
| **IntakeClerk** | Receives, scans, weighs, labels, and registers parcels at the hub. |
| **OrderProcessor** | Owns the pending-order queue and confirms orders before hub intake. |
| **Dispatcher** | Sorts parcels, creates manifests, and prepares courier dispatches. |
| **HandoverOfficer** | Counts parcels with the rider and finalizes physical handover to the courier. |
| **ExceptionOfficer** | Owns delayed, failed, damaged, lost, returned, and cancelled cases. |
| **FinanceOps** | Checks COD collections, remittances, fees, shortages, disputes, and seller settlements. |
| **DocumentOfficer** | Prepares and checks House/Master waybills and shipment documents. |
| **CarrierRelations** | Follows up courier scans, partner service levels, and tracking gaps. |
| **Courier** | External delivery user: only assigned-parcel visibility and delivery updates. |
| **Seller** | Business sender ("other user" type): creates own parcels, views own parcels. |
| **Customer** | Recipient: views/tracks own parcels only. |
| **Citizen** | Public tracking tier with limited assigned-shipment visibility. |

## Lifecycle owner (maker–checker)

The Admin Command Center is `/admin/dashboard`. Operational staff use the separate `/operations/dashboard` portal and `/operations/orders` queue. Admin can see the pending queue for oversight without doing the processing work there.

- **Manifest batching:** Dispatcher, OperationsSupervisor, Admin, or SuperAdmin create and ready Draft manifests on `/manifest`.
- **Handover sign-off:** HandoverOfficer, OperationsSupervisor, Admin, or SuperAdmin finalize a Ready manifest to a rider on `/handover`.
  (guard: `canFinalizeHandover` → only approved handover roles)

The manifest creator should not be the only person approving the same final handover, especially for COD parcels.

### Plain-language ownership

- PickupCoordinator owns pickup schedules and seller coordination.
- IntakeClerk owns scanning, weighing, label printing, and parcel receiving.
- Dispatcher owns sorting, booking, manifest creation, and dispatch readiness.
- HandoverOfficer owns the physical rider count and custody confirmation.
- ExceptionOfficer owns delayed, failed, damaged, lost, returned, and cancelled cases.
- FinanceOps owns COD reconciliation and seller settlement records.
- DocumentOfficer owns HBL/MBL and waybill preparation.
- CarrierRelations owns partner follow-up and missing carrier scans.
- OperationsSupervisor owns the shift and approves sensitive corrections.

## Module matrix

| Module | SuperAdmin/Admin | Operations staff | Courier | Seller/Customer/Citizen |
|--------|:---------------:|:---------------:|:-------:|:--------------------:|
| Dashboard | ✓ | scoped | assigned parcels | scoped |
| Pickup & Intake | ✓ | task-scoped | — | — |
| Booking / Manifest | ✓ | Dispatcher-scoped | — | — |
| Carrier Handover | ✓ | HandoverOfficer-scoped | — | — |
| Exceptions | ✓ | ExceptionOfficer-scoped | assigned updates | — |
| COD / Reports | ✓ | FinanceOps-scoped | — | — |
| Waybill | ✓ | DocumentOfficer-scoped | — | — |
| User & role management | SuperAdmin only | — | — | — |

Helpers in SQL: `is_staff()`, `is_ops()`, `is_superadmin()`, `is_admin_or_above()`, and task-specific workflow guards for manifests, handovers, parcel movement, status updates, and tracking.
App helpers in `src/lib/rbac.ts`: `can()`, `isSuperAdminRole()`, `isCitizenRole()`, `isPublicUserRole()`.
First SuperAdmin bootstrap (run in Supabase SQL Editor after creating the auth user):
```sql
update public.profiles set role = 'SuperAdmin'
where email = 'owner@your-domain.com';
```
