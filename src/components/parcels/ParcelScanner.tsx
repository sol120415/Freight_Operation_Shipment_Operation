"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, CameraOff, Loader2 } from "lucide-react";

interface DetectedBarcode {
  rawValue: string;
}

interface BarcodeDetectorLike {
  detect(source: HTMLVideoElement): Promise<DetectedBarcode[]>;
}

type BarcodeDetectorConstructor = new (options: { formats: string[] }) => BarcodeDetectorLike;

export default function ParcelScanner() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const [scanning, setScanning] = useState(false);
  const [message, setMessage] = useState("");

  function stop() {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    frameRef.current = null;
    setScanning(false);
  }

  useEffect(() => stop, []);

  function trackingFromScan(raw: string): string {
    const value = raw.trim();
    try {
      const url = new URL(value);
      return url.searchParams.get("q")?.trim() || value;
    } catch {
      return value;
    }
  }

  async function start() {
    setMessage("");
    const Detector = (window as typeof window & { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
    if (!Detector) {
      setMessage("Camera scanning is not supported by this browser. Enter the tracking number above instead.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setMessage("This device cannot provide camera access. Enter the tracking number above instead.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();
      setScanning(true);
      const detector = new Detector({ formats: ["qr_code", "code_128", "code_39"] });

      const scanFrame = async () => {
        if (!streamRef.current || !videoRef.current) return;
        try {
          const codes = await detector.detect(videoRef.current);
          const raw = codes[0]?.rawValue;
          if (raw) {
            const tracking = trackingFromScan(raw);
            stop();
            router.push(`/track?q=${encodeURIComponent(tracking)}`);
            return;
          }
        } catch {
          // Some browsers briefly fail while the camera is changing focus.
        }
        frameRef.current = requestAnimationFrame(scanFrame);
      };
      frameRef.current = requestAnimationFrame(scanFrame);
    } catch {
      stop();
      setMessage("Camera permission was not granted. You can still type the tracking number above.");
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-black text-slate-900 dark:text-slate-100">Scan parcel label</h2>
          <p className="mt-1 text-[11px] text-slate-500">Use the rear camera to read an internal QR or carrier barcode.</p>
        </div>
        <button
          type="button"
          onClick={scanning ? stop : start}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white hover:bg-slate-800"
        >
          {scanning ? <CameraOff className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
          {scanning ? "Stop camera" : "Open camera"}
        </button>
      </div>
      <div className={`mt-4 overflow-hidden rounded-xl bg-slate-950 ${scanning ? "block" : "hidden"}`}>
        <video ref={videoRef} muted playsInline className="aspect-video w-full object-cover" />
        <p className="flex items-center justify-center gap-2 py-2 text-[10px] font-bold text-white">
          <Loader2 className="h-3 w-3 animate-spin" /> Looking for a code…
        </p>
      </div>
      {message && <p className="mt-3 text-[11px] text-amber-700 dark:text-amber-300">{message}</p>}
    </div>
  );
}
