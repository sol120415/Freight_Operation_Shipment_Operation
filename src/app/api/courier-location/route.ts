import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkPermission } from "@/lib/auth";

/**
 * POST /api/courier-location — post a GPS fix for one parcel.
 *
 * Authorization: approved tracking roles, including an assigned Courier.
 * Delegates to the
 * `post_tracking_update` RPC which re-checks authorization INSIDE the
 * database, validates coordinates are within the Philippines, writes the
 * tracking event and updates the shipment row (which realtime map clients
 * receive as a WebSocket push).
 */

// Simple in-memory rate limit per user: max 60 fixes/minute.
const rateBucket = new Map<string, { count: number; resetAt: number }>();
function rateLimited(userId: string): boolean {
  const now = Date.now();
  const bucket = rateBucket.get(userId);
  if (!bucket || bucket.resetAt < now) {
    rateBucket.set(userId, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  bucket.count += 1;
  return bucket.count > 60;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (rateLimited(user.id)) {
    return NextResponse.json({ error: "Too many updates" }, { status: 429 });
  }

  const check = await checkPermission("tracking.update");
  if ("error" in check) {
    return NextResponse.json(
      { error: "You are not allowed to post a location for this parcel" },
      { status: 403 },
    );
  }

  let body: { parcelId?: string; lat?: number; lng?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { parcelId, lat, lng } = body ?? {};
  if (
    typeof parcelId !== "string" ||
    typeof lat !== "number" ||
    typeof lng !== "number" ||
    Number.isNaN(lat) ||
    Number.isNaN(lng)
  ) {
    return NextResponse.json(
      { error: "parcelId, lat and lng are required numbers" },
      { status: 400 },
    );
  }

  // Server-side validation mirrors the DB guard (defense in depth).
  if (lat < 4.2 || lat > 21.5 || lng < 116.0 || lng > 127.0) {
    return NextResponse.json(
      { error: "Coordinates must be inside the Philippines" },
      { status: 422 },
    );
  }

  const rpc = await supabase.rpc("post_tracking_update", {
    p_shipment_id: parcelId,
    p_message: "Courier location update",
    p_location: null,
    p_lat: lat,
    p_lng: lng,
    p_progress: null,
    p_status: null,
  });

  const result = rpc.data as { ok: boolean; error?: string } | null;
  if (rpc.error || !result?.ok) {
    return NextResponse.json(
      { ok: false, error: result?.error ?? rpc.error?.message ?? "Update failed" },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true });
}
