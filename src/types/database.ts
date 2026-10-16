/**
 * Generated-style Supabase schema types.
 * Mirrors supabase/migrations (0001 + 0005). Keep in sync when the DDL
 * changes (or regenerate with `supabase gen types typescript`).
 */

export type AppRole =
  | "SuperAdmin"
  | "Admin"
  | "OperationsSupervisor"
  | "PickupCoordinator"
  | "IntakeClerk"
  | "OrderProcessor"
  | "Dispatcher"
  | "HandoverOfficer"
  | "ExceptionOfficer"
  | "FinanceOps"
  | "DocumentOfficer"
  | "CarrierRelations"
  | "Courier"
  | "Seller"
  | "Customer"
  | "Citizen";
export type TransportMode = "Ocean" | "Air" | "Road" | "Rail";
export type DeliveryPlatform =
  | "J&T Express"
  | "Flash Express"
  | "LBC Express"
  | "GoGo Xpress"
  | "Shopee Drop-Off"
  | "Lazada Drop-Off"
  | "TikTok Shop Drop-Off"
  | "Custom Partner";
export type ShipmentStatus =
  | "Booked"
  | "Registered"
  | "Pickup Scheduled"
  | "Picked Up"
  | "Dropped Off"
  | "At Origin Hub"
  | "Intake"
  | "Batched"
  | "Handed Over"
  | "In Transit"
  | "At Destination Hub"
  | "Out for Delivery"
  | "Delivered"
  | "Delivery Failed"
  | "Pickup Failed"
  | "Damaged"
  | "Lost"
  | "Returned"
  | "Cancelled"
  | "Archived"
  | "Customs Hold"
  | "Delayed";
export type ContainerStatus =
  | "Planned"
  | "Loading in Progress"
  | "Sealed & Staged"
  | "In Transit"
  | "Deconsolidated";
export type BolType = "HBL" | "MBL";
export type PoStatus =
  | "Open"
  | "In Transit"
  | "Customs Hold"
  | "Delivered"
  | "Closed"
  | "Cancelled";
export type LoadType = "LCL" | "FCL";
export type LoadPlanStatus = "Draft" | "Approved" | "Rejected";
export type PickupStatus =
  | "Scheduled"
  | "In Transit"
  | "Received"
  | "No Show"
  | "Cancelled";
export type BatchStatus = "Draft" | "Ready" | "Handed Over";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          email: string | null;
          role: AppRole;
          org_name: string | null;
          is_active: boolean;
          invited_by: string | null;
          seller_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          email?: string | null;
          role?: AppRole;
          org_name?: string | null;
          is_active?: boolean;
          invited_by?: string | null;
          seller_id?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "profiles_invited_by_fkey";
            columns: ["invited_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      sellers: {
        Row: {
          id: string;
          reference: string;
          name: string;
          business_name: string | null;
          contact_person: string | null;
          phone: string | null;
          email: string | null;
          address: string | null;
          pickup_frequency: string | null;
          notes: string | null;
          is_active: boolean;
          archived_at: string | null;
          last_activity_at: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          reference?: string;
          name: string;
          business_name?: string | null;
          contact_person?: string | null;
          phone?: string | null;
          email?: string | null;
          address?: string | null;
          pickup_frequency?: string | null;
          notes?: string | null;
          is_active?: boolean;
          archived_at?: string | null;
          last_activity_at?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["sellers"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "sellers_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      pickup_requests: {
        Row: {
          id: string;
          reference: string;
          seller_id: string;
          scheduled_at: string;
          status: PickupStatus;
          parcel_count: number;
          expected_parcel_count: number;
          actual_parcel_count: number | null;
          idempotency_key: string | null;
          notes: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          reference?: string;
          seller_id: string;
          scheduled_at: string;
          status?: PickupStatus;
          parcel_count?: number;
          expected_parcel_count?: number;
          actual_parcel_count?: number | null;
          idempotency_key?: string | null;
          notes?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["pickup_requests"]["Insert"]
        >;
        Relationships: [
          {
            foreignKeyName: "pickup_requests_seller_id_fkey";
            columns: ["seller_id"];
            isOneToOne: false;
            referencedRelation: "sellers";
            referencedColumns: ["id"];
          },
        ];
      };
      shipments: {
        Row: {
          id: string;
          reference: string;
          tracking_number: string | null;
          external_tracking_number: string | null;
          creation_source: string;
          idempotency_key: string | null;
          client_name: string;
          shipper: string | null;
          consignee: string | null;
          origin: string;
          destination: string;
          mode: TransportMode;
          status: ShipmentStatus;
          etd: string | null;
          eta: string | null;
          container_no: string | null;
          cargo_type: string | null;
          carrier: string | null;
          po_number: string | null;
          weight_kg: number;
          volume_cbm: number;
          hazard_class: string | null;
          incoterms: string | null;
          current_location: string | null;
          current_lat: number | null;
          current_lng: number | null;
          description: string | null;
          dimensions: string | null;
          shipping_fee: number | null;
          recipient_phone: string | null;
          expected_delivery_date: string | null;
          current_hub_id: string | null;
          progress: number;
          platform: DeliveryPlatform;
          seller_id: string | null;
          service_type: string;
          cod_amount: number;
          cancel_reason: string | null;
          delivery_method: string | null;
          received_at: string | null;
          booked_at: string | null;
          manifested_at: string | null;
          handover_at: string | null;
          archived_at: string | null;
          client_id: string | null;
          carrier_id: string | null;
          courier_profile_id: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          reference?: string;
          tracking_number?: string | null;
          external_tracking_number?: string | null;
          creation_source?: string;
          idempotency_key?: string | null;
          client_name: string;
          shipper?: string | null;
          consignee?: string | null;
          origin: string;
          destination: string;
          mode?: TransportMode;
          status?: ShipmentStatus;
          etd?: string | null;
          eta?: string | null;
          container_no?: string | null;
          cargo_type?: string | null;
          carrier?: string | null;
          po_number?: string | null;
          weight_kg?: number;
          volume_cbm?: number;
          hazard_class?: string | null;
          incoterms?: string | null;
          current_location?: string | null;
          current_lat?: number | null;
          current_lng?: number | null;
          description?: string | null;
          dimensions?: string | null;
          shipping_fee?: number | null;
          recipient_phone?: string | null;
          expected_delivery_date?: string | null;
          current_hub_id?: string | null;
          progress?: number;
          platform?: DeliveryPlatform;
          seller_id?: string | null;
          service_type?: string;
          cod_amount?: number;
          cancel_reason?: string | null;
          delivery_method?: string | null;
          received_at?: string | null;
          booked_at?: string | null;
          manifested_at?: string | null;
          handover_at?: string | null;
          archived_at?: string | null;
          client_id?: string | null;
          carrier_id?: string | null;
          courier_profile_id?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["shipments"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "shipments_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shipments_carrier_id_fkey";
            columns: ["carrier_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shipments_courier_profile_id_fkey";
            columns: ["courier_profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shipments_seller_id_fkey";
            columns: ["seller_id"];
            isOneToOne: false;
            referencedRelation: "sellers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shipments_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shipments_current_hub_id_fkey";
            columns: ["current_hub_id"];
            isOneToOne: false;
            referencedRelation: "hubs";
            referencedColumns: ["id"];
          },
        ];
      };
      shipment_tracking_logs: {
        Row: {
          id: string;
          shipment_id: string;
          event_type: string;
          message: string;
          level: string;
          lat: number | null;
          lng: number | null;
          location: string | null;
          status: ShipmentStatus | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          shipment_id: string;
          event_type?: string;
          message: string;
          level?: string;
          lat?: number | null;
          lng?: number | null;
          location?: string | null;
          status?: ShipmentStatus | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["shipment_tracking_logs"]["Insert"]
        >;
        Relationships: [
          {
            foreignKeyName: "shipment_tracking_logs_shipment_id_fkey";
            columns: ["shipment_id"];
            isOneToOne: false;
            referencedRelation: "shipments";
            referencedColumns: ["id"];
          },
        ];
      };
      containers: {
        Row: {
          id: string;
          reference: string;
          container_type: string;
          load_type: LoadType;
          max_volume_cbm: number;
          max_weight_kg: number;
          current_volume_cbm: number;
          current_weight_kg: number;
          origin: string | null;
          destination: string | null;
          status: ContainerStatus;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          reference: string;
          container_type: string;
          load_type?: LoadType;
          max_volume_cbm: number;
          max_weight_kg: number;
          current_volume_cbm?: number;
          current_weight_kg?: number;
          origin?: string | null;
          destination?: string | null;
          status?: ContainerStatus;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["containers"]["Insert"]>;
        Relationships: [];
      };
      container_shipments: {
        Row: {
          container_id: string;
          shipment_id: string;
          loaded_at: string;
        };
        Insert: {
          container_id: string;
          shipment_id: string;
          loaded_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["container_shipments"]["Insert"]
        >;
        Relationships: [
          {
            foreignKeyName: "container_shipments_container_id_fkey";
            columns: ["container_id"];
            isOneToOne: false;
            referencedRelation: "containers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "container_shipments_shipment_id_fkey";
            columns: ["shipment_id"];
            isOneToOne: false;
            referencedRelation: "shipments";
            referencedColumns: ["id"];
          },
        ];
      };
      bills_of_lading: {
        Row: {
          id: string;
          bol_number: string;
          bol_type: BolType;
          shipment_id: string | null;
          master_bol_id: string | null;
          shipper_name: string | null;
          consignee_name: string | null;
          notify_party: string | null;
          container_number: string | null;
          seal_number: string | null;
          total_weight_kg: number | null;
          total_volume_cbm: number | null;
          goods_description: string | null;
          freight_terms: string | null;
          issued_date: string | null;
          document_version: number;
          issued_by: string | null;
          approved_by: string | null;
          finalized_at: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          bol_number: string;
          bol_type: BolType;
          shipment_id?: string | null;
          master_bol_id?: string | null;
          shipper_name?: string | null;
          consignee_name?: string | null;
          notify_party?: string | null;
          container_number?: string | null;
          seal_number?: string | null;
          total_weight_kg?: number | null;
          total_volume_cbm?: number | null;
          goods_description?: string | null;
          freight_terms?: string | null;
          issued_date?: string | null;
          document_version?: number;
          issued_by?: string | null;
          approved_by?: string | null;
          finalized_at?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["bills_of_lading"]["Insert"]
        >;
        Relationships: [
          {
            foreignKeyName: "bills_of_lading_shipment_id_fkey";
            columns: ["shipment_id"];
            isOneToOne: false;
            referencedRelation: "shipments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bills_of_lading_master_bol_id_fkey";
            columns: ["master_bol_id"];
            isOneToOne: false;
            referencedRelation: "bills_of_lading";
            referencedColumns: ["id"];
          },
        ];
      };
      purchase_orders: {
        Row: {
          id: string;
          po_number: string;
          client_name: string;
          vendor: string | null;
          currency: string;
          total_amount: number;
          status: PoStatus;
          shipment_id: string | null;
          client_id: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          po_number: string;
          client_name: string;
          vendor?: string | null;
          currency?: string;
          total_amount?: number;
          status?: PoStatus;
          shipment_id?: string | null;
          client_id?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["purchase_orders"]["Insert"]
        >;
        Relationships: [
          {
            foreignKeyName: "purchase_orders_shipment_id_fkey";
            columns: ["shipment_id"];
            isOneToOne: false;
            referencedRelation: "shipments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchase_orders_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      purchase_order_items: {
        Row: {
          id: string;
          po_id: string;
          sku: string;
          name: string;
          qty_ordered: number;
          qty_shipped: number;
          unit_price: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          po_id: string;
          sku: string;
          name: string;
          qty_ordered?: number;
          qty_shipped?: number;
          unit_price?: number;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["purchase_order_items"]["Insert"]
        >;
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_po_id_fkey";
            columns: ["po_id"];
            isOneToOne: false;
            referencedRelation: "purchase_orders";
            referencedColumns: ["id"];
          },
        ];
      };
      load_plans: {
        Row: {
          id: string;
          reference: string;
          status: LoadPlanStatus;
          vehicle_ref: string | null;
          origin: string | null;
          destination: string | null;
          max_weight_kg: number;
          max_volume_cbm: number;
          planned_weight_kg: number;
          planned_volume_cbm: number;
          utilization_pct: number;
          ml_score: number | null;
          ml_rationale: string | null;
          created_by: string | null;
          approved_by: string | null;
          approved_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          reference: string;
          status?: LoadPlanStatus;
          vehicle_ref?: string | null;
          origin?: string | null;
          destination?: string | null;
          max_weight_kg?: number;
          max_volume_cbm?: number;
          planned_weight_kg?: number;
          planned_volume_cbm?: number;
          utilization_pct?: number;
          ml_score?: number | null;
          ml_rationale?: string | null;
          created_by?: string | null;
          approved_by?: string | null;
          approved_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["load_plans"]["Insert"]>;
        Relationships: [];
      };
      load_plan_items: {
        Row: {
          id: string;
          plan_id: string;
          shipment_id: string;
          sequence_no: number;
          status_before_manifest: ShipmentStatus | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          plan_id: string;
          shipment_id: string;
          sequence_no?: number;
          status_before_manifest?: ShipmentStatus | null;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["load_plan_items"]["Insert"]
        >;
        Relationships: [
          {
            foreignKeyName: "load_plan_items_plan_id_fkey";
            columns: ["plan_id"];
            isOneToOne: false;
            referencedRelation: "load_plans";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "load_plan_items_shipment_id_fkey";
            columns: ["shipment_id"];
            isOneToOne: false;
            referencedRelation: "shipments";
            referencedColumns: ["id"];
          },
        ];
      };
      carrier_batches: {
        Row: {
          id: string;
          reference: string;
          platform: DeliveryPlatform;
          status: BatchStatus;
          parcel_count: number;
          total_weight_kg: number;
          rider_name: string | null;
          rider_phone: string | null;
          handover_notes: string | null;
          handed_over_by: string | null;
          handed_over_at: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          idempotency_key: string | null;
        };
        Insert: {
          id?: string;
          reference?: string;
          platform: DeliveryPlatform;
          status?: BatchStatus;
          parcel_count?: number;
          total_weight_kg?: number;
          rider_name?: string | null;
          rider_phone?: string | null;
          handover_notes?: string | null;
          handed_over_by?: string | null;
          handed_over_at?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          idempotency_key?: string | null;
        };
        Update: Partial<
          Database["public"]["Tables"]["carrier_batches"]["Insert"]
        >;
        Relationships: [
          {
            foreignKeyName: "carrier_batches_handed_over_by_fkey";
            columns: ["handed_over_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      carrier_batch_items: {
        Row: {
          id: string;
          batch_id: string;
          shipment_id: string;
          sequence_no: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          batch_id: string;
          shipment_id: string;
          sequence_no?: number;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["carrier_batch_items"]["Insert"]
        >;
        Relationships: [
          {
            foreignKeyName: "carrier_batch_items_batch_id_fkey";
            columns: ["batch_id"];
            isOneToOne: false;
            referencedRelation: "carrier_batches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "carrier_batch_items_shipment_id_fkey";
            columns: ["shipment_id"];
            isOneToOne: false;
            referencedRelation: "shipments";
            referencedColumns: ["id"];
          },
        ];
      };
      handovers: {
        Row: {
          id: string;
          batch_id: string | null;
          platform: DeliveryPlatform;
          rider_name: string;
          rider_phone: string | null;
          parcel_count: number;
          notes: string | null;
          handed_over_by: string | null;
          handed_over_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          batch_id?: string | null;
          platform: DeliveryPlatform;
          rider_name: string;
          rider_phone?: string | null;
          parcel_count?: number;
          notes?: string | null;
          handed_over_by?: string | null;
          handed_over_at?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["handovers"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "handovers_batch_id_fkey";
            columns: ["batch_id"];
            isOneToOne: false;
            referencedRelation: "carrier_batches";
            referencedColumns: ["id"];
          },
        ];
      };
      handover_items: {
        Row: {
          id: string;
          handover_id: string;
          parcel_id: string | null;
          parcel_reference: string;
          tracking_number: string | null;
          seller_id: string | null;
          seller_name: string | null;
          consignee: string | null;
          destination: string | null;
          weight_kg: number;
          cod_amount: number;
          status_at_handover: ShipmentStatus;
          created_at: string;
        };
        Insert: {
          id?: string;
          handover_id: string;
          parcel_id?: string | null;
          parcel_reference: string;
          tracking_number?: string | null;
          seller_id?: string | null;
          seller_name?: string | null;
          consignee?: string | null;
          destination?: string | null;
          weight_kg?: number;
          cod_amount?: number;
          status_at_handover: ShipmentStatus;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["handover_items"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "handover_items_handover_id_fkey";
            columns: ["handover_id"];
            isOneToOne: false;
            referencedRelation: "handovers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "handover_items_parcel_id_fkey";
            columns: ["parcel_id"];
            isOneToOne: false;
            referencedRelation: "shipments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "handover_items_seller_id_fkey";
            columns: ["seller_id"];
            isOneToOne: false;
            referencedRelation: "sellers";
            referencedColumns: ["id"];
          },
        ];
      };
      hubs: {
        Row: {
          id: string;
          name: string;
          code: string | null;
          address: string | null;
          city: string | null;
          province: string | null;
          contact: string | null;
          is_active: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          code?: string | null;
          address?: string | null;
          city?: string | null;
          province?: string | null;
          contact?: string | null;
          is_active?: boolean;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["hubs"]["Insert"]>;
        Relationships: [];
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          parcel_id: string | null;
          tracking_number: string | null;
          title: string;
          message: string;
          status: string | null;
          is_read: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          parcel_id?: string | null;
          tracking_number?: string | null;
          title: string;
          message: string;
          status?: string | null;
          is_read?: boolean;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["notifications"]["Insert"]
        >;
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_parcel_id_fkey";
            columns: ["parcel_id"];
            isOneToOne: false;
            referencedRelation: "shipments";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_logs: {
        Row: {
          id: number;
          table_name: string;
          record_id: string | null;
          action: "INSERT" | "UPDATE" | "DELETE";
          actor_id: string | null;
          old_data: Record<string, unknown> | null;
          new_data: Record<string, unknown> | null;
          created_at: string;
        };
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      email_verification_codes: {
        Row: {
          id: string;
          email: string;
          purpose: "login" | "seller_registration" | "password_reset";
          code_hash: string;
          attempts: number;
          max_attempts: number;
          expires_at: string;
          consumed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          purpose: "login" | "seller_registration" | "password_reset";
          code_hash: string;
          attempts?: number;
          max_attempts?: number;
          expires_at: string;
          consumed_at?: string | null;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["email_verification_codes"]["Insert"]
        >;
        Relationships: [];
      };
      parcel_tracking_links: {
        Row: {
          id: string;
          parcel_id: string;
          token_hash: string;
          label: string;
          created_by: string | null;
          expires_at: string | null;
          revoked_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          parcel_id: string;
          token_hash: string;
          label?: string;
          created_by?: string | null;
          expires_at?: string | null;
          revoked_at?: string | null;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["parcel_tracking_links"]["Insert"]
        >;
        Relationships: [
          {
            foreignKeyName: "parcel_tracking_links_parcel_id_fkey";
            columns: ["parcel_id"];
            isOneToOne: false;
            referencedRelation: "shipments";
            referencedColumns: ["id"];
          },
        ];
      };
      webhook_events: {
        Row: {
          id: number;
          source: string;
          event_type: string;
          idempotency_key: string;
          payload: Record<string, unknown>;
          status: "received" | "processed" | "failed";
          error: string | null;
          created_at: string;
          processed_at: string | null;
        };
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
      ai_training_examples: {
        Row: {
          id: string;
          kind: "routing" | "bol_parse";
          input: string;
          expected_output: string;
          notes: string;
          is_active: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          kind: "routing" | "bol_parse";
          input: string;
          expected_output: string;
          notes?: string;
          is_active?: boolean;
          created_by?: string | null;
        };
        Update: Partial<
          Database["public"]["Tables"]["ai_training_examples"]["Insert"]
        >;
        Relationships: [];
      };
      ai_training_jobs: {
        Row: {
          id: string;
          status: "Queued" | "Running" | "Completed" | "Failed";
          example_count: number;
          model_hint: string;
          summary: string;
          created_by: string | null;
          created_at: string;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          status?: "Queued" | "Running" | "Completed" | "Failed";
          example_count?: number;
          model_hint?: string;
          summary?: string;
          created_by?: string | null;
          completed_at?: string | null;
        };
        Update: Partial<
          Database["public"]["Tables"]["ai_training_jobs"]["Insert"]
        >;
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      current_role: { Args: Record<string, never>; Returns: AppRole | null };
      is_staff: { Args: Record<string, never>; Returns: boolean };
      is_ops: { Args: Record<string, never>; Returns: boolean };
      is_superadmin: { Args: Record<string, never>; Returns: boolean };
      is_admin_or_above: { Args: Record<string, never>; Returns: boolean };
      can_approve_load_plans: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      post_tracking_update: {
        Args: {
          p_shipment_id: string;
          p_message: string;
          p_location?: string | null;
          p_lat?: number | null;
          p_lng?: number | null;
          p_progress?: number | null;
          p_status?: ShipmentStatus | null;
        };
        Returns: { ok: boolean; error?: string | null };
      };
      next_shipment_reference: {
        Args: Record<string, never>;
        Returns: string;
      };
      next_bol_number: { Args: { p_bol_type: string }; Returns: string };
      next_container_reference: {
        Args: Record<string, never>;
        Returns: string;
      };
      next_parcel_tracking_number: {
        Args: Record<string, never>;
        Returns: string;
      };
      next_seller_reference: { Args: Record<string, never>; Returns: string };
      next_pickup_reference: { Args: Record<string, never>; Returns: string };
      next_manifest_reference: { Args: Record<string, never>; Returns: string };
      next_hbl_number: { Args: Record<string, never>; Returns: string };
      create_parcel: {
        Args: {
          p_source: string;
          p_idempotency_key: string;
          p_consignee: string;
          p_destination: string;
          p_platform: string;
          p_delivery_method: string;
          p_seller_id?: string | null;
          p_customer_email?: string | null;
          p_client_name?: string | null;
          p_origin?: string;
          p_initial_status?: string;
          p_service_type?: string;
          p_weight_kg?: number;
          p_cod_amount?: number;
          p_shipping_fee?: number | null;
          p_description?: string | null;
          p_dimensions?: string | null;
          p_recipient_phone?: string | null;
          p_expected_delivery_date?: string | null;
          p_external_tracking_number?: string | null;
        };
        Returns: Record<string, unknown>;
      };
      create_manifest: {
        Args: {
          p_platform: string;
          p_parcel_ids: string[];
          p_idempotency_key: string;
        };
        Returns: Record<string, unknown>;
      };
      mark_manifest_ready: {
        Args: { p_batch_id: string };
        Returns: Record<string, unknown>;
      };
      release_manifest: {
        Args: { p_batch_id: string };
        Returns: Record<string, unknown>;
      };
      finalize_handover: {
        Args: {
          p_batch_id: string;
          p_rider_name: string;
          p_rider_phone?: string | null;
          p_notes?: string | null;
        };
        Returns: Record<string, unknown>;
      };
      update_parcel_status: {
        Args: {
          p_parcel_id: string;
          p_status: string;
          p_location?: string | null;
          p_hub_id?: string | null;
          p_description?: string | null;
        };
        Returns: { ok: boolean; error?: string | null };
      };
      update_parcel_location: {
        Args: {
          p_parcel_id: string;
          p_location?: string | null;
          p_hub_id?: string | null;
          p_description?: string | null;
        };
        Returns: { ok: boolean; error?: string | null };
      };
      attach_parcel_customer: {
        Args: {
          p_parcel_id: string;
          p_customer_email: string;
        };
        Returns: { ok: boolean; error?: string | null };
      };
      get_parcel_by_tracking_token: {
        Args: { p_token_hash: string };
        Returns: {
          ok: boolean;
          parcel?: Record<string, unknown> | null;
          events?: Record<string, unknown>[] | null;
        };
      };
      ingest_crm_po: {
        Args: {
          p_idempotency_key: string;
          p_po_number: string;
          p_client_name: string;
          p_vendor: string;
          p_currency: string;
          p_total_amount: number;
          p_client_email: string;
          p_items: Record<string, unknown>[];
          p_notes: string;
        };
        Returns: {
          ok: boolean;
          duplicate: boolean;
          po_id?: string | null;
        };
      };
    };
    Enums: {
      app_role: AppRole;
      transport_mode: TransportMode;
      delivery_platform: DeliveryPlatform;
      shipment_status: ShipmentStatus;
      container_status: ContainerStatus;
      bol_type: BolType;
      po_status: PoStatus;
      load_type: LoadType;
      load_plan_status: LoadPlanStatus;
      pickup_status: PickupStatus;
      batch_status: BatchStatus;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}
