import type { AppRole } from "@/types";
import { COURIER_ROLES, OPS_STAFF_ROLES, STAFF_ROLES } from "@/lib/roles";
import {
  LayoutDashboard,
  PackageSearch,
  PackagePlus,
  ClipboardList,
  Handshake,
  FileText,
  Users,
  Building2,
  Package,
  Warehouse,
  Radar,
  ScrollText,
  Settings,
  UserCircle,
  Truck,
  Network,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Roles allowed to see this item. Empty = everyone authenticated. */
  roles: AppRole[];
  badge?: { text: string; kind: "ai" | "live" | "count" };
  /** Visual variant — `cta` renders as a distinct primary button (Create Parcel). */
  variant?: "default" | "cta";
}

/**
 * Role-specific navigation.
 * Admin sees the full administration suite; Operations staff use their own
 * workspace. Sellers and Customers only see their own scoped entries.
 * Visibility is cosmetic — every route re-checks
 * permissions server-side (requirePermission / RLS).
 */
export const NAV_ITEMS: NavItem[] = [
  // ---- Role-specific Dashboards ----
  { href: "/admin/dashboard", label: "Admin Dashboard", icon: LayoutDashboard, roles: ["SuperAdmin", "Admin"] },
  { href: "/operations/dashboard", label: "Operations Dashboard", icon: LayoutDashboard, roles: OPS_STAFF_ROLES },
  { href: "/seller/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["Seller"] },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["Customer", "Citizen"] },
  { href: "/parcels", label: "Parcels", icon: Package, roles: [...STAFF_ROLES, ...COURIER_ROLES] },
  { href: "/operations/orders", label: "Pending Orders", icon: ClipboardList, roles: OPS_STAFF_ROLES },
  {
    href: "/parcels",
    label: "My Parcels",
    icon: Package,
    roles: ["Seller", "Customer", "Citizen"],
  },
  {
    href: "/parcels/new",
    label: "Create Parcel",
    icon: PackagePlus,
    roles: ["SuperAdmin", "Admin", "OperationsSupervisor", "PickupCoordinator", "IntakeClerk", "Seller"],
    variant: "cta",
  },
  { href: "/track", label: "Track Parcel", icon: Radar, roles: [] },
  // ---- Admin only ----
  { href: "/sellers", label: "Sellers", icon: Building2, roles: ["SuperAdmin", "Admin", "OperationsSupervisor", "PickupCoordinator"] },
  { href: "/customers", label: "Customers", icon: Users, roles: ["SuperAdmin", "Admin", "OperationsSupervisor", "ExceptionOfficer", "CarrierRelations"] },
  { href: "/hubs", label: "Hubs / Facilities", icon: Warehouse, roles: ["SuperAdmin", "Admin", "OperationsSupervisor"] },

  // ---- Legacy operations suite (admin) ----
  { href: "/pickup", label: "Pickup & Intake", icon: PackageSearch, roles: ["SuperAdmin", "Admin", "OperationsSupervisor", "PickupCoordinator", "IntakeClerk"] },
  { href: "/booking", label: "Shipment Bookings", icon: PackagePlus, roles: ["SuperAdmin", "Admin", "OperationsSupervisor", "Dispatcher", "DocumentOfficer"] },
  { href: "/exceptions", label: "Exception Monitor", icon: TriangleAlert, roles: ["SuperAdmin", "Admin", "OperationsSupervisor", "HandoverOfficer", "ExceptionOfficer", "CarrierRelations"], badge: { text: "live", kind: "live" } },
  {
    href: "/manifest",
    label: "Manifest & Consolidation",
    icon: ClipboardList,
    roles: ["SuperAdmin", "Admin", "OperationsSupervisor", "Dispatcher"],
    badge: { text: "count", kind: "count" },
  },
  {
    href: "/handover",
    label: "Carrier Handover & History",
    icon: Handshake,
    roles: ["SuperAdmin", "Admin", "OperationsSupervisor", "HandoverOfficer"],
  },
  { href: "/waybill", label: "Waybill Generator", icon: FileText, roles: ["SuperAdmin", "Admin", "OperationsSupervisor", "Dispatcher", "DocumentOfficer"] },

  // ---- Reporting, analytics & AI (admin) ----
  { href: "/reports", label: "Reports", icon: FileText, roles: ["SuperAdmin", "Admin", "OperationsSupervisor", "ExceptionOfficer", "FinanceOps", "CarrierRelations"] },
  { href: "/analytics", label: "Analytics", icon: LayoutDashboard, roles: ["SuperAdmin", "Admin", "OperationsSupervisor", "FinanceOps"] },
  { href: "/ai/training", label: "Train your AI", icon: PackageSearch, roles: ["SuperAdmin", "Admin"], badge: { text: "AI", kind: "ai" } },

  // ---- Admin only ----
  { href: "/audit-logs", label: "Audit Logs", icon: ScrollText, roles: ["SuperAdmin", "Admin", "OperationsSupervisor"] },
  { href: "/settings", label: "Settings", icon: Settings, roles: ["SuperAdmin", "Admin"] },

  // ---- SuperAdmin only: user & role management ----
  { href: "/admin/users", label: "Users & Roles", icon: Users, roles: ["SuperAdmin"] },

  // ---- Everyone ----
  { href: "/profile", label: "Profile", icon: UserCircle, roles: [] },
];

export function visibleNav(role: AppRole): NavItem[] {
  return NAV_ITEMS.filter(
    (item) => item.roles.length === 0 || item.roles.includes(role),
  );
}

/**
 * Entries grouped into the header Settings dropdown instead of the sidebar.
 * Rendered by <SettingsMenu /> (role-filtered) and hidden from the sidebar.
 */
export const SETTINGS_MENU_HREFS = ["/audit-logs", "/settings", "/profile"];

// ---------------------------------------------------------------------------
// Grouped admin navigation — collapsible dropdown sections for the sidebar.
// ---------------------------------------------------------------------------

export interface NavGroup {
  id: string;
  label: string;
  icon: LucideIcon;
  roles: AppRole[];
  hrefs: string[];
  /** Short description shown as subtitle in the group header tooltip. */
  description?: string;
}

/**
 * Admin sidebar groups. Order matters — rendered in this sequence.
 * - Operations Hub: sequential shipment execution pipeline (intake → handover)
 * - Partner Network: master data / directory (sellers, customers, facilities)
 *
 * Groups are role-filtered the same as individual items; non-Admin roles
 * automatically hide both groups (no matching hrefs visible).
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    id: "operations",
    label: "Operations Hub",
    icon: Truck,
    roles: ["SuperAdmin", "Admin", "OperationsSupervisor", "PickupCoordinator", "IntakeClerk", "OrderProcessor", "Dispatcher", "HandoverOfficer", "ExceptionOfficer", "DocumentOfficer", "CarrierRelations"],
    hrefs: ["/pickup", "/booking", "/manifest", "/handover", "/waybill", "/exceptions"],
    description: "Pickup → Booking → Manifest → Handover → Exceptions",
  },
  {
    id: "directory",
    label: "Partner Network",
    icon: Network,
    roles: ["SuperAdmin", "Admin", "OperationsSupervisor", "PickupCoordinator", "IntakeClerk", "OrderProcessor", "Dispatcher", "HandoverOfficer", "ExceptionOfficer", "DocumentOfficer", "CarrierRelations"],
    hrefs: ["/sellers", "/customers", "/hubs"],
    description: "Sellers, customers & facilities",
  },
  {
    id: "insights",
    label: "Insights & AI",
    icon: LayoutDashboard,
    roles: ["SuperAdmin", "Admin", "OperationsSupervisor", "ExceptionOfficer", "FinanceOps", "CarrierRelations"],
    hrefs: ["/reports", "/analytics", "/ai/training"],
    description: "Reports → Analytics → Train your AI",
  },
];

/** Hrefs that belong to any NavGroup (used to hide them from the flat list). */
export const GROUPED_HREFS: string[] = NAV_GROUPS.flatMap((g) => g.hrefs);
