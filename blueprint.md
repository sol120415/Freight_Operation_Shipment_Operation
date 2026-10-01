Airship Express Freight Management & Shipment Execution
System
DESIGN AND DEVELOPMENT OF FREIGHT MANAGEMENT AND SHIPMENT EXECUTION SYSTEM WITH MACHINE
LEARNING FOR LOAD ALLOCATION TO REDUCE VEHICLE UNDERUTILIZATION AND IMPROVE DISPATCH EFFICIENCY
Capstone Project Blueprint: Comprehensive technical documentation covering Phases 1 through 4, system architecture,
SDLC methodology, role-based access control, database schema design, external CRM API specs, and machine learning load
optimization flow charts.

Implementation note: this blueprint contains the original design roles (Dispatcher, Planner, Carrier, and Client). The
implemented application uses SuperAdmin, Admin, Seller, Customer, and Citizen; see docs/RBAC.md for the current contract.
1. SYSTEM METHODOLOGY (AGILE DEVELOPMENT SDLC)
The system is developed using the Agile Scrum Methodology divided into 4 Core Phases to ensure iterative feature integration,
database integrity, and continuous testing.
+-----------------------------------------------------------------------------------+ | AGILE SDLC
IMPLEMENTATION PHASES | +-----------------------------------------------------------------------------------+
[ PHASE 1: SYSTEM INITIATION & SETUP ] ├── Requirement Gathering & Scope Definition ├── Next.js 14 (App
Router) & Tailwind CSS Dark Mode Setup └── Supabase Project Initialization & Authentication Rules [ PHASE 2:
CORE MODULE & DATABASE IMPLEMENTATION ] ├── Supabase PostgreSQL Schema (Profiles, Shipments, Bills of Lading)
├── Role-Based Access Control (RBAC: Admin, Dispatcher, Planner, Client) └── LCL / FCL Container Load
Planning Hub Build [ PHASE 3: EXECUTION, INTEGRATION & DOCUMENTATION ] ├── External CRM REST API Integration
(`/api/v1/shipments/book`) ├── Automated House & Master Bill of Lading (HBL/MBL) PDF Generation └── Live
Shipment Tracking & Supabase Realtime Log Streaming [ PHASE 4: MACHINE LEARNING & DISPATCH OPTIMIZATION ] ├──
Bin-Packing Load Allocation Algorithm Engine Integration ├── Vehicle Weight (kg) & Volume (CBM) Utilization
Calculation └── User Acceptance Testing (UAT), System Defense & Vercel Deployment
2. SYSTEM ARCHITECTURE & TECH STACK
3. ROLE-BASED ACCESS CONTROL (RBAC) MATRIX
+-----------------------------------------------------------------------------------+ | SUPABASE AUTH &
ACCESS CONTROL | +-----------------------------------------------------------------------------------+ | | |
| ▼ ▼ ▼ ▼ [ ADMIN ] [ DISPATCHER ] [ PLANNER ] [ CLIENT ] * Full Access * Operations Hub * ML Load Drafts *
Layer Technology Operational Purpose
Frontend UI Next.js 14+ (App Router), React.js,
Tailwind CSS
High-performance responsive dashboard with Dark Mode theme
(`#E81B75` Airship Magenta visual accents).
Backend API Next.js API Routes, Node.js
Microservices
Handles RESTful payloads, CRM integration endpoints, and dynamic BoL
PDF compilation.
Database &
Auth
Supabase (PostgreSQL), Supabase
Auth
Secure relational database with Row Level Security (RLS) and real-time log
stream subscriptions.
Machine
Learning Groq API / Gemini API Microservice Runs parcel volume/weight bin-packing heuristics for optimal load
allocation and AI BoL parsing.
DevOps /
Hosting Vercel, GitHub, Supabase Cloud Automated CI/CD deployment pipelines and cloud database hosting.
Own Shipments * System Config * BoL Generation * Capacity Rules * Online Booking * Realtime Logs * Live
Tracking * Bin-Packing * Track Status
SuperAdmin ( full_access + user_management ): Full system access and role management.
Admin ( operations ): Global administrative access, pickup/intake, parcel operations, manifests, handover, waybills,
reports, analytics, settings, audit, and raw realtime log streaming.
Seller ( own_shipments ): Business sender that registers parcels and views its own shipment data.
Customer ( own_shipments ): Recipient portal for assigned parcel tracking.
Citizen ( public_portal ): Public/citizen portal with the same own-shipment data tier as Customer.

The original design used Dispatcher, Planner, Carrier, and Client as separate roles. Those roles are retained here as
historical requirements only; the implemented application consolidates them into the canonical roles above.
4. END-TO-END SYSTEM PROCESS FLOW CHART
+-----------------------------------------------------------------------------------+ | ONLINE BOOKING &
EXECUTION FLOW | +-----------------------------------------------------------------------------------+ [
CLIENT / SHIPPER ] [ SYSTEM BACKEND ] | | |--- 1. Submits Online Booking ------------>| | (Sender, Consignee,
Cargo Specs) |--- 2. Triggers ML Load Optimizer | | (Calculates Vehicle Capacity) | | |<-- 3. Returns Booking
Confirmation -------| | & Airship Waybill (PDF) | | | ▼ [ HUB DISPATCHER DASHBOARD ] |
+----------------------+----------------------+ | | (If Metro Manila - Local) (If Provincial - 3PL) | | ▼ ▼ [
DIRECT RIDER DISPATCH ] [ 3PL PARTNER HANDOVER ] | (LBC / J&T / GoGo Xpress) | | ▼ ▼ Status: OUT_FOR_DELIVERY
Status: FORWARDED_TO_3PL | | +----------------------+----------------------+ | ▼ [ PROOF OF DELIVERY (POD) ]
Status: DELIVERED & COD Logged
5. DATABASE ENTITY RELATIONSHIP DIAGRAM (ERD SCHEMA)
Profiles Table
CREATE TABLE profiles (
 id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 full_name TEXT NOT NULL,
 email TEXT UNIQUE NOT NULL,
 role TEXT CHECK (role IN ('Admin', 'Dispatcher', 'Planner', 'Carrier', 'Client')) DEFAULT 'Client',
 created_at TIMESTAMP WITH TIMEZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);
Shipments Table
CREATE TABLE shipments (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 shipment_code VARCHAR(50) UNIQUE NOT NULL, -- e.g., 'SHP-2026-8801'
 client_name TEXT NOT NULL,
 po_number VARCHAR(50), -- e.g., 'PO-MNL-99420'
 shipper TEXT NOT NULL,
 consignee TEXT NOT NULL,
 origin TEXT NOT NULL,
 destination TEXT NOT NULL,
 transport_mode VARCHAR(20) CHECK (transport_mode IN ('Road', 'Ocean', 'Air', 'Rail')) DEFAULT 'Road',
 cargo_type TEXT DEFAULT 'LCL Truckload',
 weight_kg NUMERIC(10,2) NOT NULL,
 volume_cbm NUMERIC(10,2),
 incoterms VARCHAR(10) DEFAULT 'DAP',
 hazard_class VARCHAR(50) DEFAULT 'None',
 status VARCHAR(30) CHECK (status IN ('Booked', 'In Transit', 'Customs Hold', 'Delivered')) DEFAULT
'Booked',
 created_at TIMESTAMP WITH TIMEZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);
•
•
•
•
•
Bills of Lading Table
CREATE TABLE bills_of_lading (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 bol_number VARCHAR(50) UNIQUE NOT NULL, -- e.g., 'HBL-2026-90112'
 bol_type VARCHAR(10) CHECK (bol_type IN ('HBL', 'MBL')) DEFAULT 'HBL',
 shipment_id UUID REFERENCES shipments(id) ON DELETE CASCADE,
 vessel_voyage TEXT,
 port_of_loading TEXT,
 port_of_discharge TEXT,
 container_no VARCHAR(50),
 seal_no VARCHAR(50),
 freight_terms VARCHAR(20) DEFAULT 'Prepaid',
 created_at TIMESTAMP WITH TIMEZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);
6. API SPECIFICATION FOR CRM INTEGRATION
Allows external customer portals or CRM subsystems to programmatically trigger shipment bookings.
Endpoint: POST /api/v1/shipments/book
Content-Type: application/json
Request Payload Example
{
 "client_name": "Jollibee Foods Logistics",
 "po_number": "PO-MNL-99420",
 "shipper": "Davao Agri Exports Co.",
 "consignee": "Manila North Harbor Whse",
 "origin": "Davao Port (PHDVO)",
 "destination": "Manila Port (PHMNL)",
 "transport_mode": "Road",
 "cargo_type": "LCL Truckload",
 "weight_kg": 8200,
 "volume_cbm": 14.5,
 "incoterms": "DAP",
 "hazard_class": "None"
}
Response Payload Example (201 Created)
{
 "success": true,
 "message": "Shipment successfully booked and logged into active freight execution hub.",
 "data": {
 "shipment_id": "SHP-2026-8801",
 "tracking_code": "TRK-ROAD-99812",
 "status": "Booked",
 "realtime_stream_channel": "shipment_tracking_logs"
 }
}
7. MACHINE LEARNING LOAD ALLOCATION MODULE
To directly eliminate vehicle underutilization, the system executes a Bin-Packing Algorithm integrated with capacity constraints:
•
•
Utilization Score (%) = [ ( Σ Item Weight / Vehicle Weight Capacity ) × 0.5 + ( Σ Item Volume / Vehicle CBM Capacity ) × 0.5
] × 100
Target Threshold: Ensures vehicles and containers reach at least 80% capacity utilization before dispatch confirmation.
Fallback Mode: If external AI providers (Groq/Gemini) are offline, the system defaults to static heuristic rules.
