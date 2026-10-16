# Study Objectives Compliance

This file maps the running system to the study objectives in Section 1.4.

## General objective

The system now has one authenticated workspace for shipment booking, freight route planning, controlled consolidation/deconsolidation, waybill records, and shipment tracking.

## Specific objectives

| Objective | System evidence | Result |
| --- | --- | --- |
| One platform for booking and shipment planning | `/booking`, `/parcels`, `/freight-planning` | Met |
| Uniform shipment information | Validated server actions, generated shipment/tracking references, Supabase shipment records | Met |
| Consolidation and deconsolidation | `/freight-planning`, `containers`, `container_shipments`, server-side capacity and duplicate checks | Met after applying `20261016120000_activate_freight_planning.sql` |
| House and Master Bill of Lading records | `/waybill`, automatic HBL/MBL numbering, optional carrier-number override, shipment prefill, printable output | Met |
| Central shipment file and tracking | `/parcels/[id]`, tracking timeline, map, QR label, public seller tracking link, linked waybill records | Met |
| Functional suitability, performance, usability, reliability, and security assessment | Vitest coverage, ESLint, TypeScript, production build, RLS, RBAC, idempotent workflows, audit/tracking logs | Implemented controls; formal user evaluation still needs study respondents |

## Important deployment step

Run the database migrations in order. The new planning screen is visible in the application code, but its save, consolidation, and deconsolidation operations require the new SQL migration to be applied to the connected Supabase project.

```bash
npm run db:push
```

For a local database, use `npm run db:reset` instead.
