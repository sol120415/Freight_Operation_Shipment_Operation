import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";
import type { AppRole } from "@/types";
import { can, isAdminRole, isCourierRole, isOpsStaffRole } from "@/lib/rbac";

// Public routes — exact match or prefix with slash to avoid /loginsucks bypass
const PUBLIC_ROUTES = [
  "/login",
  "/auth",
  "/api/health",
  "/offline",
  "/manifest.webmanifest",
  "/sw.js",
  "/icons",
  // Customer tracking links (/t/<token>) — read-only, token-validated
  // server-side; grants no session and no access to protected routes.
  "/t",
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_ROUTES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

/** Exported for unit tests (route-visibility contract). */
export { isPublicPath };

function isApiRoute(pathname: string): boolean {
  return pathname.startsWith("/api/");
}

/**
 * Refreshes the Supabase session on every request and gates protected
 * routes. Unauthenticated users hitting an app route are redirected to
 * /login; the session cookie is kept fresh for Server Components.
 *
 * RBAC: route checks mirror the centralized permission matrix. Pages re-check
 * via requirePermission for defense in depth.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        // Fix: do not recreate response on each setAll — reuse outer response
        // so sb-access-token + sb-refresh-token set in one call are not lost.
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  let user: { id: string } | null = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    // If Supabase is unreachable (local instance down), treat as unauthenticated
    // so public routes like /login still render instead of 500.
    user = null;
  }

  const { pathname } = request.nextUrl;
  const isPublic = isPublicPath(pathname);

  // If we have a user, check is_active and role to enforce RBAC and avoid redirect loops
  let isActive: boolean | null = null;
  let userRole: AppRole | null = null;
  if (user) {
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("is_active, role")
        .eq("id", user.id)
        .maybeSingle();
      isActive = profile?.is_active ?? null;
      userRole = profile?.role ?? null;

      if (profile && !profile.is_active) {
        // Deactivated: clear session and treat as unauthenticated
        await supabase.auth.signOut();
        user = null;
        isActive = false;
        userRole = null;
      }
    } catch {
      // Ignore profile fetch failure — keep user as-is
    }
  }

  if (!user && !isPublic) {
    // API routes should get 401 JSON, not 302 to /login (which fetch would follow as HTML)
    if (isApiRoute(pathname)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirectedFrom", pathname);
    return NextResponse.redirect(url);
  }

  // Authenticated active user hitting /login → role-specific dashboard
  if (user && isActive !== false && pathname === "/login") {
    const url = request.nextUrl.clone();
    if (userRole === "SuperAdmin" || userRole === "Admin") {
      url.pathname = "/admin/dashboard";
    } else if (userRole && isOpsStaffRole(userRole)) {
      url.pathname = "/operations/dashboard";
    } else if (userRole && isCourierRole(userRole)) {
      url.pathname = "/parcels";
    } else if (userRole === "Seller") {
      url.pathname = "/seller/dashboard";
    } else {
      url.pathname = "/dashboard";
    }
    return NextResponse.redirect(url);
  }

  const isPrivileged = (role: AppRole | null) =>
    role !== null && isAdminRole(role);

  // Route Guard: Admin-specific routes (/admin/*) — SuperAdmin inherits.
  if (user && pathname.startsWith("/admin")) {
    if (!isPrivileged(userRole)) {
      const url = request.nextUrl.clone();
      url.pathname = "/forbidden";
      return NextResponse.redirect(url);
    }
  }

  // Route Guard: Seller-specific routes (/seller/*)
  if (user && pathname.startsWith("/seller")) {
    if (userRole !== "Seller" && !isPrivileged(userRole)) {
      const url = request.nextUrl.clone();
      url.pathname = "/forbidden";
      return NextResponse.redirect(url);
    }
  }

  // Route Guard: privileged ops modules — Admin + SuperAdmin only.
  const permissionRoutes = [
    ["/operations", "orders.viewPending"],
    ["/freight-planning", "planning.manage"],
    ["/reports", "reports.view"],
    ["/analytics", "analytics.view"],
    ["/audit-logs", "audit.view"],
    ["/settings", "settings.manage"],
    ["/hubs", "hubs.manage"],
    ["/sellers", "sellers.manage"],
    ["/customers", "customers.view"],
    ["/ai/training", "ai.train"],
  ] as const;
  const requiredPermission = permissionRoutes.find(
    ([prefix]) => pathname === prefix || pathname.startsWith(prefix + "/"),
  )?.[1];
  if (user && requiredPermission) {
    if (!userRole || !can(userRole, requiredPermission)) {
      const url = request.nextUrl.clone();
      url.pathname = "/forbidden";
      return NextResponse.redirect(url);
    }
  }

  return response;
}
