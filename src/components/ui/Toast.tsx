"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CheckCircle2, AlertTriangle, Info, XCircle } from "lucide-react";

type Tone = "success" | "error" | "info" | "warning";

interface Toast {
  id: number;
  tone: Tone;
  message: string;
}

interface ToastContextValue {
  notify: (tone: Tone, message: string) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TONE_STYLES: Record<Tone, string> = {
  success: "border-emerald-500/30 text-emerald-700 dark:text-emerald-300",
  error: "border-rose-500/30 text-rose-700 dark:text-rose-300",
  info: "border-sky-500/30 text-sky-700 dark:text-sky-300",
  warning: "border-amber-500/30 text-amber-700 dark:text-amber-300",
};

const TONE_ICON = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
  warning: AlertTriangle,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const notify = useCallback(
    (tone: Tone, message: string) => {
      const id = nextId.current++;
      setToasts((t) => [...t, { id, tone, message }]);
      setTimeout(() => dismiss(id), 5000);
    },
    [dismiss],
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      notify,
      success: (message) => notify("success", message),
      error: (message) => notify("error", message),
      info: (message) => notify("info", message),
    }),
    [notify],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Viewport */}
      <div className="fixed bottom-4 right-4 z-[1000] space-y-2 w-[min(24rem,calc(100vw-2rem))]">
        {toasts.map((t) => {
          const Icon = TONE_ICON[t.tone];
          return (
            <button
              key={t.id}
              onClick={() => dismiss(t.id)}
              className={`w-full text-left flex items-start gap-3 bg-white dark:bg-slate-900 border shadow-lg rounded-xl px-4 py-3 text-sm font-medium animate-[toast-in_.2s_ease-out] ${TONE_STYLES[t.tone]}`}
            >
              <Icon className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{t.message}</span>
            </button>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}
