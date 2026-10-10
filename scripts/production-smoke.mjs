import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadEnvFile(fileName) {
  const filePath = resolve(process.cwd(), fileName);
  if (!existsSync(filePath)) return;
  for (const rawLine of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function resultObject(value) {
  return value && typeof value === "object" ? value : {};
}

loadEnvFile(".env.local");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

assert(supabaseUrl, "NEXT_PUBLIC_SUPABASE_URL is required");
assert(anonKey, "NEXT_PUBLIC_SUPABASE_ANON_KEY is required");
assert(serviceRoleKey, "SUPABASE_SERVICE_ROLE_KEY is required");

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const runId = `${Date.now()}-${randomBytes(3).toString("hex")}`;
const password = `Smoke-${randomBytes(18).toString("base64url")}!9a`;
const created = {
  authUserIds: [],
  sellerIds: [],
  parcelIds: [],
  batchIds: [],
  bolIds: [],
  pickupIds: [],
};

async function createTestUser(role, sellerId = null) {
  const email = `freight-smoke-${role.toLowerCase()}-${runId}@example.com`;
  const authResult = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: `Freight Smoke ${role}` },
  });
  if (authResult.error || !authResult.data.user) {
    throw new Error(`Could not create ${role} smoke user: ${authResult.error?.message}`);
  }
  const userId = authResult.data.user.id;
  created.authUserIds.push(userId);

  const profile = await admin.from("profiles").upsert({
    id: userId,
    email,
    full_name: `Freight Smoke ${role}`,
    role,
    seller_id: sellerId,
    is_active: true,
  });
  if (profile.error) throw new Error(`Could not prepare ${role} profile: ${profile.error.message}`);

  const client = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw new Error(`Could not sign in ${role} smoke user: ${signIn.error.message}`);
  return { client, userId };
}

async function createParcel(client, overrides = {}) {
  const request = {
    p_source: "new_parcel",
    p_idempotency_key: randomUUID(),
    p_consignee: `Smoke Recipient ${runId}`,
    p_destination: "Quezon City",
    p_platform: "J&T Express",
    p_delivery_method: "Drop-off",
    p_initial_status: "Registered",
    p_service_type: "Standard",
    p_weight_kg: 1.25,
    p_cod_amount: 0,
    ...overrides,
  };
  const response = await client.rpc("create_parcel", request);
  if (response.error) throw new Error(`create_parcel RPC failed: ${response.error.message}`);
  return { request, result: resultObject(response.data) };
}

async function cleanup() {
  for (const id of created.bolIds) await admin.from("bills_of_lading").delete().eq("id", id);
  for (const id of created.pickupIds) await admin.from("pickup_requests").delete().eq("id", id);
  for (const id of created.batchIds) await admin.from("carrier_batches").delete().eq("id", id);
  for (const id of created.parcelIds) await admin.from("shipments").delete().eq("id", id);
  for (const id of created.sellerIds) await admin.from("sellers").delete().eq("id", id);
  for (const id of created.authUserIds) await admin.auth.admin.deleteUser(id);
}

try {
  console.log(`Starting production smoke test ${runId}`);

  const adminUser = await createTestUser("Admin");
  const adminSellerInsert = await admin
    .from("sellers")
    .insert({
      name: `SMOKE ADMIN SELLER ${runId}`,
      email: `seller-${runId}@example.com`,
      created_by: adminUser.userId,
    })
    .select("id, reference")
    .single();
  if (adminSellerInsert.error) throw new Error(adminSellerInsert.error.message);
  const adminSeller = adminSellerInsert.data;
  created.sellerIds.push(adminSeller.id);
  assert(/^SEL-\d{2}-\d{6}$/.test(adminSeller.reference), "Seller reference format is invalid");

  const ownSellerInsert = await admin
    .from("sellers")
    .insert({ name: `SMOKE PORTAL SELLER ${runId}`, created_by: adminUser.userId })
    .select("id")
    .single();
  if (ownSellerInsert.error) throw new Error(ownSellerInsert.error.message);
  created.sellerIds.push(ownSellerInsert.data.id);
  const sellerUser = await createTestUser("Seller", ownSellerInsert.data.id);

  const adminParcelCreation = await createParcel(adminUser.client, {
    p_source: "booking",
    p_idempotency_key: randomUUID(),
    p_seller_id: adminSeller.id,
    p_initial_status: "Booked",
    p_external_tracking_number: `SMOKE-EXT-${runId}`,
  });
  assert(adminParcelCreation.result.ok === true, `Admin parcel creation failed: ${adminParcelCreation.result.error}`);
  const adminParcelId = adminParcelCreation.result.id;
  created.parcelIds.push(adminParcelId);
  assert(/^SHP-\d{2}-\d{6}$/.test(adminParcelCreation.result.reference), "Shipment reference format is invalid");
  assert(/^TRK-\d{2}-\d{6}$/.test(adminParcelCreation.result.tracking_number), "Tracking format is invalid");

  const duplicateParcel = await adminUser.client.rpc("create_parcel", adminParcelCreation.request);
  const duplicateParcelResult = resultObject(duplicateParcel.data);
  assert(!duplicateParcel.error && duplicateParcelResult.ok === true, "Duplicate parcel retry failed");
  assert(duplicateParcelResult.duplicate === true, "Duplicate parcel retry was not detected");
  assert(duplicateParcelResult.id === adminParcelId, "Duplicate parcel retry created a different parcel");

  const invalidTransition = await adminUser.client.rpc("update_parcel_status", {
    p_parcel_id: adminParcelId,
    p_status: "Delivered",
  });
  assert(!invalidTransition.error, "Invalid transition should return a controlled result");
  assert(resultObject(invalidTransition.data).ok === false, "Invalid status transition was accepted");

  const validTransition = await adminUser.client.rpc("update_parcel_status", {
    p_parcel_id: adminParcelId,
    p_status: "Picked Up",
    p_description: "Production smoke test pickup",
  });
  assert(!validTransition.error && resultObject(validTransition.data).ok === true, "Valid status transition failed");

  const locationUpdate = await adminUser.client.rpc("update_parcel_location", {
    p_parcel_id: adminParcelId,
    p_location: "Production smoke test depot",
    p_description: "Atomic location smoke test",
  });
  assert(!locationUpdate.error && resultObject(locationUpdate.data).ok === true, "Location update failed");
  const locationParcel = await admin
    .from("shipments")
    .select("status, current_location")
    .eq("id", adminParcelId)
    .single();
  assert(locationParcel.data?.status === "Picked Up", "Location update changed the parcel status");
  assert(locationParcel.data?.current_location === "Production smoke test depot", "Location was not saved");

  const manifestKey = randomUUID();
  const manifest = await adminUser.client.rpc("create_manifest", {
    p_platform: "J&T Express",
    p_parcel_ids: [adminParcelId],
    p_idempotency_key: manifestKey,
  });
  const manifestResult = resultObject(manifest.data);
  assert(!manifest.error && manifestResult.ok === true, `Manifest creation failed: ${manifestResult.error}`);
  created.batchIds.push(manifestResult.id);
  assert(/^MNF-\d{2}-\d{6}$/.test(manifestResult.reference), "Manifest reference format is invalid");

  const duplicateManifest = await adminUser.client.rpc("create_manifest", {
    p_platform: "J&T Express",
    p_parcel_ids: [adminParcelId],
    p_idempotency_key: manifestKey,
  });
  assert(
    !duplicateManifest.error && resultObject(duplicateManifest.data).duplicate === true,
    "Duplicate manifest retry was not detected",
  );

  const releaseManifest = await adminUser.client.rpc("release_manifest", {
    p_batch_id: manifestResult.id,
  });
  assert(!releaseManifest.error && resultObject(releaseManifest.data).ok === true, "Draft manifest release failed");
  created.batchIds = created.batchIds.filter((id) => id !== manifestResult.id);
  const restoredParcel = await admin.from("shipments").select("status").eq("id", adminParcelId).single();
  assert(restoredParcel.data?.status === "Picked Up", "Manifest release did not restore the previous status");

  const readyManifest = await adminUser.client.rpc("create_manifest", {
    p_platform: "J&T Express",
    p_parcel_ids: [adminParcelId],
    p_idempotency_key: randomUUID(),
  });
  const readyManifestResult = resultObject(readyManifest.data);
  assert(!readyManifest.error && readyManifestResult.ok === true, "Second manifest creation failed");
  created.batchIds.push(readyManifestResult.id);
  const markReady = await adminUser.client.rpc("mark_manifest_ready", {
    p_batch_id: readyManifestResult.id,
  });
  assert(!markReady.error && resultObject(markReady.data).ok === true, "Mark manifest Ready failed");
  const markReadyAgain = await adminUser.client.rpc("mark_manifest_ready", {
    p_batch_id: readyManifestResult.id,
  });
  assert(!markReadyAgain.error && resultObject(markReadyAgain.data).duplicate === true, "Ready retry was not idempotent");

  const sellerVisibility = await sellerUser.client
    .from("shipments")
    .select("id")
    .eq("id", adminParcelId)
    .maybeSingle();
  assert(!sellerVisibility.error && sellerVisibility.data === null, "Seller could read another seller's parcel");

  const sellerParcelCreation = await createParcel(sellerUser.client, {
    p_seller_id: adminSeller.id,
    p_description: "Seller RLS smoke test",
  });
  assert(sellerParcelCreation.result.ok === true, `Seller parcel creation failed: ${sellerParcelCreation.result.error}`);
  const sellerParcelId = sellerParcelCreation.result.id;
  created.parcelIds.push(sellerParcelId);
  const sellerParcelRow = await admin.from("shipments").select("seller_id, status").eq("id", sellerParcelId).single();
  assert(sellerParcelRow.data?.seller_id === ownSellerInsert.data.id, "Seller RPC accepted another seller association");

  const blockedSellerIntake = await createParcel(sellerUser.client, {
    p_source: "quick_intake",
    p_initial_status: "Intake",
  });
  assert(blockedSellerIntake.result.ok === false, "Seller was able to forge a staff intake operation");

  const allowedSellerEdit = await sellerUser.client
    .from("shipments")
    .update({ description: "Seller-approved description edit" })
    .eq("id", sellerParcelId)
    .select("id")
    .single();
  assert(!allowedSellerEdit.error, `Allowed seller edit failed: ${allowedSellerEdit.error?.message}`);

  const blockedSellerStatus = await sellerUser.client
    .from("shipments")
    .update({ status: "Delivered" })
    .eq("id", sellerParcelId)
    .select("id");
  assert(blockedSellerStatus.error, "Seller was able to bypass controlled status transitions");

  const invalidCod = await createParcel(adminUser.client, {
    p_seller_id: adminSeller.id,
    p_service_type: "COD",
    p_cod_amount: 0,
  });
  assert(invalidCod.result.ok === false, "Zero-value COD parcel was accepted");

  const hbl = await adminUser.client
    .from("bills_of_lading")
    .insert({
      bol_number: "",
      bol_type: "HBL",
      shipment_id: adminParcelId,
      shipper_name: adminSeller.reference,
      consignee_name: "Smoke Recipient",
      issued_date: new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Manila",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date()),
      created_by: adminUser.userId,
    })
    .select("id, bol_number")
    .single();
  if (hbl.error) throw new Error(`HBL issuance failed: ${hbl.error.message}`);
  created.bolIds.push(hbl.data.id);
  assert(/^HBL-\d{2}-\d{6}$/.test(hbl.data.bol_number), "Generated HBL format is invalid");

  const blankMbl = await adminUser.client.from("bills_of_lading").insert({
    bol_number: "",
    bol_type: "MBL",
    shipment_id: adminParcelId,
    created_by: adminUser.userId,
  });
  assert(blankMbl.error, "Blank carrier-issued MBL was accepted");

  const pickup = await adminUser.client
    .from("pickup_requests")
    .insert({
      seller_id: adminSeller.id,
      scheduled_at: new Date(Date.now() + 86_400_000).toISOString(),
      status: "Scheduled",
      parcel_count: 2,
      expected_parcel_count: 2,
      idempotency_key: randomUUID(),
      created_by: adminUser.userId,
    })
    .select("id, reference, expected_parcel_count, actual_parcel_count")
    .single();
  if (pickup.error) throw new Error(`Pickup creation failed: ${pickup.error.message}`);
  created.pickupIds.push(pickup.data.id);
  assert(/^PUP-\d{2}-\d{6}$/.test(pickup.data.reference), "Pickup reference format is invalid");
  assert(pickup.data.expected_parcel_count === 2, "Expected pickup count was not saved");
  assert(pickup.data.actual_parcel_count === null, "Actual pickup count should start empty");

  const receivePickup = await adminUser.client
    .from("pickup_requests")
    .update({ status: "Received", actual_parcel_count: 1 })
    .eq("id", pickup.data.id)
    .select("actual_parcel_count")
    .single();
  assert(!receivePickup.error && receivePickup.data.actual_parcel_count === 1, "Actual pickup count was not recorded");

  console.log("Production smoke test passed: identifiers, idempotency, transitions, manifests, RLS, COD, HBL/MBL, and pickup counts.");
} finally {
  await cleanup();
  console.log("Temporary smoke-test operational records cleaned up.");
}
