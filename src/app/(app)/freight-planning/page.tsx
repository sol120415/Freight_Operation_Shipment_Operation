import { requirePermission } from "@/lib/auth";
import { listShipments } from "@/lib/repos/shipments";
import { listContainersWithShipments } from "@/lib/repos/containers";
import { listLoadPlans } from "@/lib/repos/loadplans";
import { isDemoMode } from "@/lib/demoMode";
import FreightPlanningClient from "./FreightPlanningClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Freight Planning — Airship Express" };

export default async function FreightPlanningPage() {
  await requirePermission("planning.manage");
  const [shipmentPage, containers, plans, demoMode] = await Promise.all([
    listShipments({
      status: ["Booked", "Picked Up", "Dropped Off", "At Origin Hub", "Intake"],
      perPage: 100,
    }),
    listContainersWithShipments(),
    listLoadPlans(),
    isDemoMode(),
  ]);

  return (
    <FreightPlanningClient
      shipments={shipmentPage.rows}
      containers={containers}
      plans={plans}
      demoMode={demoMode}
    />
  );
}
