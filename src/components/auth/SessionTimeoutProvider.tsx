"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Clock3, LogIn } from "lucide-react";
import Modal from "@/components/ui/Modal";
import { createClient } from "@/lib/supabase/client";

const WARNING_BEFORE_SECONDS = 30;

interface SessionTimeoutContextValue {
  secondsLeft: number;
}

const SessionTimeoutContext = createContext<SessionTimeoutContextValue | null>(
  null,
);

function timeoutMs(): number {
  const minutes = Number(
    process.env.NEXT_PUBLIC_SESSION_TIMEOUT_MINUTES ?? "5",
  );
  return (Number.isFinite(minutes) && minutes > 0 ? minutes : 5) * 60_000;
}

export function useSessionTimeout(): SessionTimeoutContextValue {
  const value = useContext(SessionTimeoutContext);
  if (!value) {
    throw new Error(
      "useSessionTimeout must be used within SessionTimeoutProvider.",
    );
  }
  return value;
}

export function formatSessionCountdown(seconds: number): string {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = String(safeSeconds % 60).padStart(2, "0");
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    return `${hours}:${String(minutes % 60).padStart(2, "0")}:${remainder}`;
  }
  return `${minutes}:${remainder}`;
}

export default function SessionTimeoutProvider({
  children,
}: {
  children: ReactNode;
}) {
  const router = useRouter();
  const durationMs = timeoutMs();
  const durationSeconds = Math.ceil(durationMs / 1000);
  const [secondsLeft, setSecondsLeft] = useState(durationSeconds);
  const [expired, setExpired] = useState(false);
  const lastActive = useRef(Date.now());
  const expiredRef = useRef(false);
  const warningOpenRef = useRef(false);
  const signOutPromise = useRef<Promise<void> | null>(null);

  const recordActivity = useCallback(() => {
    if (expiredRef.current) return;
    lastActive.current = Date.now();
    if (warningOpenRef.current) {
      warningOpenRef.current = false;
      setSecondsLeft(durationSeconds);
    }
  }, [durationSeconds]);

  const goToLogin = useCallback(async () => {
    if (signOutPromise.current) await signOutPromise.current;
    router.replace("/login?timeout=1");
  }, [router]);

  useEffect(() => {
    const expireSession = () => {
      if (expiredRef.current) return;
      expiredRef.current = true;
      warningOpenRef.current = false;
      setSecondsLeft(0);
      setExpired(true);

      signOutPromise.current = (async () => {
        try {
          const supabase = createClient();
          await supabase.auth.signOut();
        } catch {
          // Keep the expired-session dialog available if sign-out is offline.
        }
      })();
    };

    const tick = () => {
      if (expiredRef.current) return;
      const remainingMs = durationMs - (Date.now() - lastActive.current);
      if (remainingMs <= 0) {
        expireSession();
        return;
      }

      const remainingSeconds = Math.ceil(remainingMs / 1000);
      warningOpenRef.current = remainingSeconds <= WARNING_BEFORE_SECONDS;
      setSecondsLeft(remainingSeconds);
    };

    const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"];
    events.forEach((event) =>
      window.addEventListener(event, recordActivity, { passive: true }),
    );
    const intervalId = window.setInterval(tick, 1000);

    return () => {
      window.clearInterval(intervalId);
      events.forEach((event) =>
        window.removeEventListener(event, recordActivity),
      );
    };
  }, [durationMs, recordActivity]);

  const warningOpen = !expired && secondsLeft > 0 && secondsLeft <= WARNING_BEFORE_SECONDS;

  return (
    <SessionTimeoutContext.Provider value={{ secondsLeft }}>
      {children}

      <Modal
        open={warningOpen}
        onClose={recordActivity}
        title="Session expiring soon"
      >
        <div className="space-y-5">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
              <AlertTriangle className="h-5 w-5" aria-hidden="true" />
            </span>
            <p className="pt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              You will be signed out in{" "}
              <strong className="tabular-nums text-slate-900 dark:text-white">
                {formatSessionCountdown(secondsLeft)}
              </strong>{" "}
              due to inactivity. Continue your session to stay signed in.
            </p>
          </div>
          <button
            type="button"
            onClick={recordActivity}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-pink-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-pink-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
          >
            <Clock3 className="h-4 w-4" aria-hidden="true" />
            Stay signed in
          </button>
        </div>
      </Modal>

      <Modal
        open={expired}
        onClose={goToLogin}
        title="Session timed out"
      >
        <div className="space-y-5">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
              <AlertTriangle className="h-5 w-5" aria-hidden="true" />
            </span>
            <p className="pt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              You have been signed out after a period of inactivity. Go to the
              login page to sign in again.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void goToLogin()}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-pink-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-pink-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2"
          >
            <LogIn className="h-4 w-4" aria-hidden="true" />
            Go to login
          </button>
        </div>
      </Modal>
    </SessionTimeoutContext.Provider>
  );
}
