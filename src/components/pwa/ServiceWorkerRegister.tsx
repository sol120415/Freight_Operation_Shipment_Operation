"use client";

import { useEffect } from "react";

/**
 * Registers the service worker in production and removes any production
 * worker that remains registered when the app is opened through `next dev`.
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      // Workers survive server restarts. Remove a worker left by a previous
      // production run so it cannot serve stale Next.js chunks during HMR.
      void navigator.serviceWorker.getRegistrations().then((registrations) =>
        Promise.all(
          registrations
            .filter((registration) => registration.scope.startsWith(window.location.origin))
            .map((registration) => registration.unregister()),
        ),
      );
      if ("caches" in window) {
        void caches.keys().then((keys) =>
          Promise.all(
            keys
              .filter((key) => key.startsWith("airship-"))
              .map((key) => caches.delete(key)),
          ),
        );
      }
      return;
    }

    const onMessage = (event: MessageEvent) => {
      if ((event.data as { type?: string })?.type === "flush-outbox") {
        void import("@/lib/offline/outbox").then((module) => module.flushOutbox());
      }
    };
    navigator.serviceWorker.addEventListener("message", onMessage);

    // Reload when a newly activated worker takes control so HTML, CSS, and
    // JavaScript all come from the same application version.
    const onControllerChange = () => window.location.reload();
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    navigator.serviceWorker
      .register("/sw.js", { updateViaCache: "none" })
      .then((registration) => registration.update())
      .catch(() => {
        /* The service worker is a progressive enhancement. */
      });

    return () => {
      navigator.serviceWorker.removeEventListener("message", onMessage);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  return null;
}
