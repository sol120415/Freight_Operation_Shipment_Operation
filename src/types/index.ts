import type { Database, TransportMode, AppRole } from "./database";

/** Convenience row aliases used across the UI. */
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Shipment = Database["public"]["Tables"]["shipments"]["Row"];
export type ShipmentInsert = Database["public"]["Tables"]["shipments"]["Insert"];
export type TrackingLog =
  Database["public"]["Tables"]["shipment_tracking_logs"]["Row"];
export type Container = Database["public"]["Tables"]["containers"]["Row"];
export type BillOfLading =
  Database["public"]["Tables"]["bills_of_lading"]["Row"];
export type PurchaseOrder =
  Database["public"]["Tables"]["purchase_orders"]["Row"];
export type PurchaseOrderItem =
  Database["public"]["Tables"]["purchase_order_items"]["Row"];
export type LoadPlan = Database["public"]["Tables"]["load_plans"]["Row"];
export type LoadPlanItem =
  Database["public"]["Tables"]["load_plan_items"]["Row"];
export type Seller = Database["public"]["Tables"]["sellers"]["Row"];
export type PickupRequest =
  Database["public"]["Tables"]["pickup_requests"]["Row"];
export type CarrierBatch =
  Database["public"]["Tables"]["carrier_batches"]["Row"];
export type CarrierBatchItem =
  Database["public"]["Tables"]["carrier_batch_items"]["Row"];
export type Handover = Database["public"]["Tables"]["handovers"]["Row"];
export type HandoverItem = Database["public"]["Tables"]["handover_items"]["Row"];
export type Hub = Database["public"]["Tables"]["hubs"]["Row"];
export type AiTrainingExample =
  Database["public"]["Tables"]["ai_training_examples"]["Row"];
export type AiTrainingJob =
  Database["public"]["Tables"]["ai_training_jobs"]["Row"];
export type AppNotification =
  Database["public"]["Tables"]["notifications"]["Row"];
export type EmailVerificationCode =
  Database["public"]["Tables"]["email_verification_codes"]["Row"];
export type ParcelTrackingLink =
  Database["public"]["Tables"]["parcel_tracking_links"]["Row"];

export type {
  AppRole,
  TransportMode,
  DeliveryPlatform,
  ShipmentStatus,
  ContainerStatus,
  BolType,
  PoStatus,
  LoadType,
  LoadPlanStatus,
  PickupStatus,
  BatchStatus,
} from "./database";

/** Seller joined with its pickup request counters. */
export interface SellerWithStats extends Seller {
  pickupCount: number;
  parcelCount: number;
}

/** Seller row plus admin-table roll-ups (parcel count, owner account). */
export interface SellerAdminRow extends SellerWithStats {
  archived: boolean;
  ownerEmail: string | null;
  lastActivityAt: string | null;
}

/** Customer (recipient) profile joined with assigned-parcel counters. */
export interface CustomerRow {
  id: string;
  full_name: string | null;
  email: string | null;
  role: AppRole;
  is_active: boolean;
  createdAt: string;
  parcelCount: number;
  activeCount: number;
  deliveredCount: number;
}

/** Pickup request joined with its seller. */
export interface PickupRequestWithSeller extends PickupRequest {
  seller: Pick<Seller, "id" | "name" | "phone"> | null;
}

/** Carrier batch joined with its parcels. */
export interface CarrierBatchWithItems extends CarrierBatch {
  items: Pick<
    Shipment,
    | "id"
    | "reference"
    | "tracking_number"
    | "client_name"
    | "consignee"
    | "destination"
    | "weight_kg"
    | "cod_amount"
    | "service_type"
    | "status"
  >[];
}

/** Container joined with the shipments consolidated into it. */
export interface ContainerWithShipments extends Container {
  shipments: Pick<
    Shipment,
    "id" | "reference" | "weight_kg" | "volume_cbm" | "cargo_type"
  >[];
}

/** Purchase order joined with its line items. */
export interface PurchaseOrderWithItems extends PurchaseOrder {
  items: PurchaseOrderItem[];
}

/** Dashboard KPI roll-up. */
export interface ShipmentStats {
  active: number;
  inTransit: number;
  customsHold: number;
  delivered: number;
  delayed: number;
  totalWeightKg: number;
}

/** Hub intake roll-up for the operations dashboard. */
export interface HubStats {
  intakeToday: number;
  activeParcels: number;
  pendingHandovers: number;
  completedDispatches: number;
  intaken: number;
  batched: number;
  handedOver: number;
  cancelled: number;
  totalWeightKg: number;
}

/** ----- AI feature contracts ----- */

/** One carrier/route recommendation returned by the routing engine. */
export interface RouteRecommendation {
  routeName: string;
  carrierName: string;
  transitTimeDays: number;
  /** Cost in Philippine pesos. */
  estimatedCostPHP: number;
  co2ReductionPercent: number;
  riskScore: "Low" | "Medium" | "High";
  keyAdvantage: string;
}

/** Structured Bill of Lading fields parsed from free text. */
export interface ParsedBillOfLading {
  billOfLadingNumber: string;
  shipperName: string;
  consigneeName: string;
  containerNumber: string;
  totalWeightKg: number;
  totalVolumeCbm: number;
  goodsDescription: string;
}

export interface RoutingRequest {
  origin: string;
  destination: string;
  mode: TransportMode;
  weightKg: number;
  volumeCbm: number;
  incoterms: string;
}

