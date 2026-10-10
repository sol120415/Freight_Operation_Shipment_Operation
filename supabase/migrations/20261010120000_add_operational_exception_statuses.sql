-- Add operational exception states in a separate migration so PostgreSQL can
-- commit the enum values before the next migration uses them in functions.
alter type public.shipment_status add value if not exists 'Pickup Failed';
alter type public.shipment_status add value if not exists 'Damaged';
alter type public.shipment_status add value if not exists 'Lost';
