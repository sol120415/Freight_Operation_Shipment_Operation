"use client";

import { useEffect, useRef, useState } from "react";
import {
  FileText,
  Sparkles,
  Loader2,
  Printer,
  Save,
  CheckCircle2,
} from "lucide-react";
import { createBillOfLading, type BolInput } from "./actions";
import type { BolType, ParsedBillOfLading, Shipment } from "@/types";
import { manilaDateISO } from "@/lib/utils";

const EMPTY: BolInput = {
  bolNumber: "",
  bolType: "HBL",
  shipmentId: null,
  shipperName: "",
  consigneeName: "",
  notifyParty: "",
  containerNumber: "",
  sealNumber: "",
  totalWeightKg: 0,
  totalVolumeCbm: 0,
  goodsDescription: "",
  freightTerms: "Prepaid",
};

export default function BolGenerator({
  shipments,
  aiEnabled,
}: {
  shipments: Pick<Shipment, "id" | "reference" | "shipper" | "consignee" | "origin" | "destination" | "container_no" | "weight_kg" | "volume_cbm">[];
  aiEnabled: boolean;
}) {
  const [form, setForm] = useState<BolInput>(EMPTY);
  const [rawText, setRawText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  // Issue date is day-resolution "today". Rendering `new Date()` inline would
  // make the server HTML differ from the client render across a UTC-midnight
  // boundary (hydration mismatch), so it is stamped after mount instead —
  // identical (empty) on server and first client render.
  const [issuedDate, setIssuedDate] = useState("");
  useEffect(() => {
    setIssuedDate(manilaDateISO());
  }, []);

  function set<K extends keyof BolInput>(k: K, v: BolInput[K]) {
    setForm((f) => ({ ...f, [k]: v }));
    setSaved(false);
  }

  function onSelectShipment(id: string) {
    const s = shipments.find((x) => x.id === id);
    if (!s) {
      set("shipmentId", null);
      return;
    }
    setForm((f) => ({
      ...f,
      shipmentId: s.id,
      shipperName: s.shipper ?? f.shipperName,
      consigneeName: s.consignee ?? f.consigneeName,
      containerNumber: s.container_no ?? f.containerNumber,
      totalWeightKg: Number(s.weight_kg ?? f.totalWeightKg),
      totalVolumeCbm: Number(s.volume_cbm ?? f.totalVolumeCbm),
    }));
  }

  async function parse() {
    if (!rawText.trim()) return;
    setParsing(true);
    setParseError(null);
    try {
      const res = await fetch("/api/ai/parse-bl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: rawText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Parse failed");
      const p = data.parsed as ParsedBillOfLading;
      setForm((f) => ({
        ...f,
        bolNumber: p.billOfLadingNumber || f.bolNumber,
        shipperName: p.shipperName || f.shipperName,
        consigneeName: p.consigneeName || f.consigneeName,
        containerNumber: p.containerNumber || f.containerNumber,
        totalWeightKg: p.totalWeightKg || f.totalWeightKg,
        totalVolumeCbm: p.totalVolumeCbm || f.totalVolumeCbm,
        goodsDescription: p.goodsDescription || f.goodsDescription,
      }));
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "Parse failed");
    } finally {
      setParsing(false);
    }
  }

  async function save() {
    setSaving(true);
    setSaveError(null);
    const res = await createBillOfLading(form);
    setSaving(false);
    if (!res.ok) {
      setSaveError(res.error ?? "Save failed");
      return;
    }
    setForm((current) => ({ ...current, bolNumber: res.value.bolNumber }));
    setSaved(true);
  }

  function printBol() {
    const html = previewRef.current?.innerHTML;
    if (!html) return;
    const w = window.open("", "_blank", "width=900,height=1100");
    if (!w) return;
    w.document.write(`<!doctype html><html><head><title>${form.bolNumber || "Bill of Lading"}</title>
      <style>
        body{font-family:ui-sans-serif,system-ui,sans-serif;color:#0f172a;padding:32px}
        .bol-grid{display:grid;grid-template-columns:1fr 1fr;gap:0;border:2px solid #0f172a}
        .cell{border:1px solid #cbd5e1;padding:10px 12px}
        .label{font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#64748b;font-weight:700}
        .value{font-size:13px;margin-top:2px}
        h1{font-size:20px;margin:0 0 4px}
        .full{grid-column:1/-1}
        .muted{color:#64748b;font-size:11px}
      </style></head><body>${html}</body></html>`);
    w.document.close();
    w.focus();
    w.print();
  }

  const field = "w-full border border-slate-200 dark:border-slate-700 dark:bg-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500";
  const label = "block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left: form + AI parse */}
      <div className="space-y-6">
        {/* AI parse box */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm">
          <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-pink-600" /> AI Document Parsing
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
            Paste unstructured shipping advice / BoL text — the AI extracts the fields.
          </p>
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            rows={4}
            className={field}
            placeholder="Paste raw Bill of Lading text here..."
          />
          <div className="flex items-center gap-3 mt-3">
            <button
              onClick={parse}
              disabled={parsing || !rawText.trim() || !aiEnabled}
              className="bg-gradient-to-r from-pink-600 to-rose-500 hover:opacity-90 disabled:opacity-50 text-white px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-2"
            >
              {parsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              Parse with AI
            </button>
            {!aiEnabled && <span className="text-[11px] text-amber-600 dark:text-amber-400">AI provider not configured.</span>}
            {parseError && <span className="text-[11px] text-rose-600 dark:text-rose-400">{parseError}</span>}
          </div>
        </div>

        {/* BoL fields */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={label}>BoL type</label>
              <select className={field} value={form.bolType} onChange={(e) => set("bolType", e.target.value as BolType)}>
                <option value="HBL">House B/L (HBL)</option>
                <option value="MBL">Master B/L (MBL)</option>
              </select>
            </div>
            <div>
              <label className={label}>BoL number</label>
              <input
                className={field}
                value={form.bolNumber}
                readOnly={form.bolType === "HBL"}
                onChange={(e) => set("bolNumber", e.target.value)}
                placeholder={form.bolType === "HBL" ? "Generated when issued" : "Generated when issued (or enter carrier number)"}
              />
              <p className="mt-1 text-[10px] text-slate-400">
                {form.bolType === "HBL"
                  ? "The system issues the HBL number."
                  : "Leave blank to generate an MBL, or enter a carrier-issued number."}
              </p>
            </div>
          </div>

          <div>
            <label className={label}>Link to shipment</label>
            <select className={field} value={form.shipmentId ?? ""} onChange={(e) => onSelectShipment(e.target.value)}>
              <option value="">— None —</option>
              {shipments.map((s) => (
                <option key={s.id} value={s.id}>{s.reference}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label className={label}>Shipper</label><input className={field} value={form.shipperName} onChange={(e) => set("shipperName", e.target.value)} /></div>
            <div><label className={label}>Consignee</label><input className={field} value={form.consigneeName} onChange={(e) => set("consigneeName", e.target.value)} /></div>
            <div><label className={label}>Notify party</label><input className={field} value={form.notifyParty} onChange={(e) => set("notifyParty", e.target.value)} /></div>
            <div><label className={label}>Freight terms</label>
              <select className={field} value={form.freightTerms} onChange={(e) => set("freightTerms", e.target.value)}>
                <option>Prepaid</option><option>Collect</option>
              </select>
            </div>
            <div><label className={label}>Container no.</label><input className={field} value={form.containerNumber} onChange={(e) => set("containerNumber", e.target.value)} /></div>
            <div><label className={label}>Seal no.</label><input className={field} value={form.sealNumber} onChange={(e) => set("sealNumber", e.target.value)} /></div>
            <div><label className={label}>Weight (kg)</label><input type="number" className={field} value={form.totalWeightKg || ""} onChange={(e) => set("totalWeightKg", Number(e.target.value))} /></div>
            <div><label className={label}>Volume (CBM)</label><input type="number" className={field} value={form.totalVolumeCbm || ""} onChange={(e) => set("totalVolumeCbm", Number(e.target.value))} /></div>
          </div>

          <div>
            <label className={label}>Goods description</label>
            <textarea className={field} rows={2} value={form.goodsDescription} onChange={(e) => set("goodsDescription", e.target.value)} />
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button onClick={save} disabled={saving} className="bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Save className="w-4 h-4" />}
              {saved ? "Saved" : "Save BoL"}
            </button>
            <button onClick={printBol} disabled={!saved || !form.bolNumber} className="bg-pink-600 hover:bg-pink-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2">
              <Printer className="w-4 h-4" /> Print / PDF
            </button>
            {saveError && <span className="text-[11px] text-rose-600 dark:text-rose-400">{saveError}</span>}
          </div>
        </div>
      </div>

      {/* Right: printable preview */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm flex items-center gap-2">
            <FileText className="w-4 h-4 text-pink-600" /> Document Preview
          </h3>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-900 text-white">
            {form.bolType}
          </span>
        </div>

        <div ref={previewRef}>
          <h1>{form.bolType === "HBL" ? "HOUSE BILL OF LADING" : "MASTER BILL OF LADING"}</h1>
          <p className="muted" style={{ marginBottom: 12 }}>
            No. {form.bolNumber || "—"} · Issued {issuedDate || "—"} · {form.freightTerms}
          </p>
          <div className="bol-grid">
            <div className="cell"><div className="label">Shipper</div><div className="value">{form.shipperName || "—"}</div></div>
            <div className="cell"><div className="label">Consignee</div><div className="value">{form.consigneeName || "—"}</div></div>
            <div className="cell"><div className="label">Notify Party</div><div className="value">{form.notifyParty || "—"}</div></div>
            <div className="cell"><div className="label">Container No.</div><div className="value">{form.containerNumber || "—"}</div></div>
            <div className="cell"><div className="label">Seal No.</div><div className="value">{form.sealNumber || "—"}</div></div>
            <div className="cell"><div className="label">Gross Weight</div><div className="value">{form.totalWeightKg ? `${form.totalWeightKg.toLocaleString("en-US")} kg` : "—"}</div></div>
            <div className="cell"><div className="label">Measurement</div><div className="value">{form.totalVolumeCbm ? `${form.totalVolumeCbm} CBM` : "—"}</div></div>
            <div className="cell full"><div className="label">Description of Goods</div><div className="value">{form.goodsDescription || "—"}</div></div>
          </div>
        </div>
      </div>
    </div>
  );
}
