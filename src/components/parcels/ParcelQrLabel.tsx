"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Loader2, Printer, QrCode } from "lucide-react";

export default function ParcelQrLabel({
  trackingNumber,
  reference,
  destination,
}: {
  trackingNumber: string;
  reference: string;
  destination: string;
}) {
  const [imageUrl, setImageUrl] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void QRCode.toDataURL(trackingNumber, {
      width: 320,
      margin: 2,
      errorCorrectionLevel: "M",
      color: { dark: "#0f172a", light: "#ffffff" },
    })
      .then((url) => {
        if (active) setImageUrl(url);
      })
      .catch(() => {
        if (active) setError("Could not generate the QR label.");
      });
    return () => {
      active = false;
    };
  }, [trackingNumber]);

  function printLabel() {
    if (!imageUrl) return;
    const popup = window.open("", "_blank", "width=520,height=720");
    if (!popup) return;
    popup.opener = null;

    const document = popup.document;
    document.title = trackingNumber;

    const style = document.createElement("style");
    style.textContent = `
      body{font-family:Arial,sans-serif;margin:0;padding:24px;color:#0f172a}
      .label{width:360px;border:2px solid #0f172a;border-radius:12px;padding:20px;text-align:center}
      img{width:260px;height:260px}.tracking{font:700 22px monospace;margin:10px 0 4px}
      .reference{font:13px monospace;color:#475569}.destination{font:700 14px Arial;margin-top:12px}
      .caption{font-size:10px;text-transform:uppercase;letter-spacing:.12em;color:#64748b}
    `;
    document.head.replaceChildren(style);

    const label = document.createElement("div");
    label.className = "label";
    const qrImage = document.createElement("img");
    qrImage.alt = `QR code for ${trackingNumber}`;
    let printed = false;
    const triggerPrint = () => {
      if (printed) return;
      printed = true;
      popup.focus();
      popup.print();
    };
    qrImage.addEventListener("load", triggerPrint, { once: true });
    qrImage.src = imageUrl;

    const addText = (className: string, value: string) => {
      const element = document.createElement("p");
      element.className = className;
      element.textContent = value;
      label.appendChild(element);
    };

    label.appendChild(qrImage);
    addText("tracking", trackingNumber);
    addText("reference", reference);
    addText("destination", destination);
    addText("caption", "Scan to verify parcel");
    document.body.replaceChildren(label);
    if (qrImage.complete) window.setTimeout(triggerPrint, 0);
  }

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-black text-slate-900 dark:text-slate-100">
          <QrCode className="h-4 w-4 text-pink-500" /> Parcel Label
        </h3>
        <button
          type="button"
          onClick={printLabel}
          disabled={!imageUrl}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <Printer className="h-3.5 w-3.5" /> Print label
        </button>
      </div>
      <div className="text-center">
        {imageUrl ? (
          // Generated locally from the internal tracking number; no remote image host is involved.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt={`QR code for ${trackingNumber}`} className="mx-auto h-48 w-48" />
        ) : error ? (
          <p className="py-10 text-xs text-rose-600">{error}</p>
        ) : (
          <Loader2 className="mx-auto my-16 h-6 w-6 animate-spin text-slate-400" />
        )}
        <p className="tracking mt-2 font-mono text-base font-black text-slate-900 dark:text-slate-100">{trackingNumber}</p>
        <p className="reference font-mono text-[11px] text-slate-400">{reference}</p>
        <p className="destination mt-2 text-xs font-bold text-slate-700 dark:text-slate-200">{destination}</p>
        <p className="caption mt-1 text-[9px] uppercase tracking-widest text-slate-400">Scan to verify parcel</p>
      </div>
    </div>
  );
}
