"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Boxes, CheckCircle2, Loader2, Map, PackageCheck, Route, Sparkles, Split, Trash2 } from "lucide-react";
import type { ContainerWithShipments, LoadPlan, RouteRecommendation, Shipment } from "@/types";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";
import StatusBadge from "@/components/ui/StatusBadge";
import { useToast } from "@/components/ui/Toast";
import { createFreightConsolidation, deconsolidateFreightShipment, saveFreightPlan } from "./actions";

const input = "w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-pink-500";
const label = "block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1";

export default function FreightPlanningClient({
  shipments,
  containers,
  plans,
  demoMode,
}: {
  shipments: Shipment[];
  containers: ContainerWithShipments[];
  plans: LoadPlan[];
  demoMode: boolean;
}) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [routes, setRoutes] = useState<RouteRecommendation[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<RouteRecommendation | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [origin, setOrigin] = useState("Manila Hub");
  const [destination, setDestination] = useState("");
  const [mode, setMode] = useState<"Ocean" | "Air" | "Road" | "Rail">("Road");
  const [incoterms, setIncoterms] = useState("FOB");
  const [maxWeight, setMaxWeight] = useState("20000");
  const [maxVolume, setMaxVolume] = useState("60");
  const [containerType, setContainerType] = useState("40ft High Cube Container");
  const [loadType, setLoadType] = useState<"LCL" | "FCL">("LCL");

  const selectedShipments = useMemo(
    () => shipments.filter((shipment) => selectedIds.includes(shipment.id)),
    [selectedIds, shipments],
  );
  const selectedWeight = selectedShipments.reduce((sum, shipment) => sum + Number(shipment.weight_kg ?? 0), 0);
  const selectedVolume = selectedShipments.reduce((sum, shipment) => sum + Number(shipment.volume_cbm ?? 0), 0);
  const routeInputKey = JSON.stringify({
    origin,
    destination,
    mode,
    incoterms,
    maxWeight,
    maxVolume,
    shipmentIds: [...selectedIds].sort(),
  });
  const routeInputKeyRef = useRef(routeInputKey);

  useEffect(() => {
    routeInputKeyRef.current = routeInputKey;
    setRoutes([]);
    setSelectedRoute(null);
    setRouteError(null);
  }, [routeInputKey]);

  function toggleShipment(id: string) {
    setSelectedIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  }

  async function getRoutes() {
    const requestedFor = routeInputKey;
    setRouteError(null);
    setRoutes([]);
    setSelectedRoute(null);
    if (!origin.trim() || !destination.trim()) {
      setRouteError("Enter both the origin and destination first.");
      return;
    }
    setRouteLoading(true);
    try {
      const response = await fetch("/api/ai/routing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          origin, destination, mode, incoterms,
          weightKg: selectedWeight || Number(maxWeight),
          volumeCbm: selectedVolume || Number(maxVolume),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Route recommendations are unavailable");
      if (routeInputKeyRef.current !== requestedFor) return;
      setRoutes((body.routes ?? []) as RouteRecommendation[]);
    } catch (error) {
      setRouteError(error instanceof Error ? error.message : "Route recommendations are unavailable");
    } finally {
      setRouteLoading(false);
    }
  }

  function savePlan() {
    if (!selectedRoute) return;
    startTransition(async () => {
      const result = await saveFreightPlan({
        origin, destination, transportMode: mode, incoterms,
        routeName: selectedRoute.routeName, carrierName: selectedRoute.carrierName,
        transitTimeDays: selectedRoute.transitTimeDays,
        estimatedCostPHP: selectedRoute.estimatedCostPHP,
        co2ReductionPercent: selectedRoute.co2ReductionPercent,
        riskScore: selectedRoute.riskScore, keyAdvantage: selectedRoute.keyAdvantage,
        maxWeightKg: Number(maxWeight), maxVolumeCbm: Number(maxVolume), shipmentIds: selectedIds,
      });
      if (result.ok) toast.success(`Route plan ${result.value.reference} saved`);
      else toast.error(result.error ?? "Could not save route plan");
    });
  }

  function createConsolidation() {
    startTransition(async () => {
      const result = await createFreightConsolidation({
        containerType, loadType, maxVolumeCbm: Number(maxVolume), maxWeightKg: Number(maxWeight),
        origin, destination, shipmentIds: selectedIds,
      });
      if (result.ok) toast.success(`Consolidation ${result.value.reference} created`);
      else toast.error(result.error ?? "Could not create consolidation");
    });
  }

  function removeFromConsolidation(containerId: string, shipmentId: string) {
    startTransition(async () => {
      const result = await deconsolidateFreightShipment({ containerId, shipmentId });
      if (result.ok) toast.success("Shipment deconsolidated");
      else toast.error(result.error ?? "Could not deconsolidate shipment");
    });
  }

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <PageHeader
        eyebrow="Freight execution"
        title="Planning & Consolidation"
        description="Save a route plan, group shipments within capacity, and remove shipments when a load is deconsolidated."
      />
      {demoMode && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          Demo data is read-only. Connect the database to save plans or change consolidations.
        </p>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div><h2 className="font-black text-sm flex items-center gap-2"><Route className="w-4 h-4 text-pink-600" /> Route planning</h2><p className="text-[11px] text-slate-500 mt-1">Ask the routing engine for options, then save the chosen plan.</p></div>
            <Sparkles className="w-4 h-4 text-pink-500" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={label}>Origin</label><input className={input} value={origin} onChange={(e) => setOrigin(e.target.value)} /></div>
            <div><label className={label}>Destination</label><input className={input} value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Cebu City" /></div>
            <div><label className={label}>Transport</label><select className={input} value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}><option>Road</option><option>Air</option><option>Ocean</option><option>Rail</option></select></div>
            <div><label className={label}>Incoterms</label><input className={input} value={incoterms} onChange={(e) => setIncoterms(e.target.value)} /></div>
            <div><label className={label}>Max weight (kg)</label><input className={input} type="number" min="0.01" value={maxWeight} onChange={(e) => setMaxWeight(e.target.value)} /></div>
            <div><label className={label}>Max volume (CBM)</label><input className={input} type="number" min="0.01" value={maxVolume} onChange={(e) => setMaxVolume(e.target.value)} /></div>
          </div>
          <button onClick={getRoutes} disabled={routeLoading || demoMode} className="inline-flex items-center gap-2 rounded-xl bg-pink-600 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">
            {routeLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Get route suggestions
          </button>
          {routeError && <p className="text-xs text-rose-600">{routeError}</p>}
          <div className="space-y-2">
            {routes.map((route) => (
              <button key={`${route.routeName}-${route.carrierName}`} onClick={() => setSelectedRoute(route)} className={`w-full text-left rounded-xl border p-3 ${selectedRoute === route ? "border-pink-500 bg-pink-50 dark:bg-pink-950/20" : "border-slate-200 dark:border-slate-700"}`}>
                <div className="flex items-center justify-between gap-2"><span className="text-xs font-black">{route.routeName}</span><StatusBadge status={route.riskScore} /></div>
                <p className="text-[11px] text-slate-500 mt-1">{route.carrierName} · {route.transitTimeDays} days · ₱{route.estimatedCostPHP.toLocaleString()}</p>
                <p className="text-[11px] text-slate-500 mt-1">{route.keyAdvantage}</p>
              </button>
            ))}
          </div>
          {selectedRoute && <button onClick={savePlan} disabled={pending || demoMode} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50"><CheckCircle2 className="w-4 h-4" /> Save selected route plan</button>}
        </section>

        <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm p-5 space-y-4">
          <div><h2 className="font-black text-sm flex items-center gap-2"><Boxes className="w-4 h-4 text-pink-600" /> Consolidate shipments</h2><p className="text-[11px] text-slate-500 mt-1">Select shipments below. The database checks weight, volume, duplicates, and permissions.</p></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><label className={label}>Container / load name</label><input className={input} value={containerType} onChange={(e) => setContainerType(e.target.value)} /></div>
            <div><label className={label}>Load type</label><select className={input} value={loadType} onChange={(e) => setLoadType(e.target.value as typeof loadType)}><option>LCL</option><option>FCL</option></select></div>
            <div><label className={label}>Capacity (kg)</label><input className={input} type="number" min="0.01" value={maxWeight} onChange={(e) => setMaxWeight(e.target.value)} /></div>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="px-3 py-2 bg-slate-50 dark:bg-slate-800/60 text-[10px] font-bold uppercase tracking-widest text-slate-400">Available shipments · {selectedShipments.length} selected · {selectedWeight.toFixed(2)} kg</div>
            {shipments.length === 0 ? <EmptyState icon={PackageCheck} title="No shipments ready" description="Book or receive shipments before planning a load." /> : <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">{shipments.map((shipment) => <label key={shipment.id} className="flex items-center gap-3 px-3 py-2.5 text-xs cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40"><input type="checkbox" checked={selectedIds.includes(shipment.id)} onChange={() => toggleShipment(shipment.id)} /><span className="font-bold">{shipment.reference}</span><span className="text-slate-500 truncate">{shipment.origin} → {shipment.destination}</span><span className="ml-auto text-[10px] text-slate-400">{Number(shipment.weight_kg ?? 0).toFixed(2)} kg</span></label>)}</div>}
          </div>
          <button onClick={createConsolidation} disabled={pending || demoMode || selectedIds.length === 0} className="inline-flex items-center gap-2 rounded-xl bg-pink-600 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50"><Boxes className="w-4 h-4" /> Create consolidation</button>
        </section>
      </div>

      <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm p-5">
        <h2 className="font-black text-sm flex items-center gap-2"><Split className="w-4 h-4 text-pink-600" /> Active consolidations</h2>
        {containers.length === 0 ? <EmptyState icon={Boxes} title="No consolidations yet" description="Create a load above to see the grouped shipments here." /> : <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">{containers.map((container) => <div key={container.id} className="rounded-xl border border-slate-200 dark:border-slate-700 p-4"><div className="flex items-center justify-between gap-2"><div><p className="text-xs font-black">{container.reference}</p><p className="text-[11px] text-slate-500">{container.container_type} · {container.origin ?? "—"} → {container.destination ?? "—"}</p></div><StatusBadge status={container.status} /></div><p className="mt-2 text-[11px] text-slate-500">{Number(container.current_weight_kg).toFixed(2)} / {Number(container.max_weight_kg).toFixed(2)} kg · {Number(container.current_volume_cbm).toFixed(2)} / {Number(container.max_volume_cbm).toFixed(2)} CBM</p><ul className="mt-3 space-y-1">{container.shipments.map((shipment) => <li key={shipment.id} className="flex items-center justify-between gap-2 text-[11px]"><span>{shipment.reference}</span>{container.status !== "Deconsolidated" && <button title="Deconsolidate shipment" onClick={() => removeFromConsolidation(container.id, shipment.id)} disabled={pending || demoMode} className="text-slate-400 hover:text-rose-600 disabled:opacity-50"><Trash2 className="w-3.5 h-3.5" /></button>}</li>)}</ul></div>)}</div>}
      </section>

      <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm p-5">
        <h2 className="font-black text-sm flex items-center gap-2"><Map className="w-4 h-4 text-pink-600" /> Saved route plans</h2>
        {plans.length === 0 ? <p className="mt-3 text-xs text-slate-500">No route plans saved yet.</p> : <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-xs"><thead className="text-[10px] uppercase tracking-widest text-slate-400"><tr><th className="py-2 pr-3">Plan</th><th className="py-2 pr-3">Route</th><th className="py-2 pr-3">Mode</th><th className="py-2 pr-3">Capacity used</th><th className="py-2">Status</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-800">{plans.map((plan) => <tr key={plan.id}><td className="py-2 pr-3 font-bold">{plan.reference}</td><td className="py-2 pr-3">{plan.origin} → {plan.destination}<span className="block text-[10px] text-slate-400">{plan.route_name ?? "Route not named"} · {plan.carrier_name ?? "Carrier not set"}</span></td><td className="py-2 pr-3">{plan.transport_mode ?? "—"}</td><td className="py-2 pr-3">{Number(plan.utilization_pct).toFixed(1)}%</td><td className="py-2"><StatusBadge status={plan.status} /></td></tr>)}</tbody></table></div>}
      </section>
    </div>
  );
}
