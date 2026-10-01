"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, Lock, Loader2, ShieldAlert } from "lucide-react";
import { createRecoveryClient } from "@/lib/supabase/client";
import { passwordChecks } from "@/lib/sellerValidation";

type PageState = "loading" | "ready" | "success" | "error";

function PasswordChecklist({ password }: { password: string }) {
  return (
    <ul className="mt-2 space-y-1 rounded-xl bg-white/5 border border-white/10 p-3">
      {passwordChecks(password).map((check) => (
        <li
          key={check.label}
          className={`flex items-center gap-2 text-[12px] font-medium ${
            check.ok ? "text-emerald-300" : "text-white/50"
          }`}
        >
          <span
            className={`inline-flex w-4 h-4 items-center justify-center rounded-full text-[10px] font-black ${
              check.ok ? "bg-emerald-500/25 text-emerald-300" : "bg-white/10 text-white/40"
            }`}
          >
            {check.ok ? "✓" : "·"}
          </span>
          {check.label}
        </li>
      ))}
    </ul>
  );
}

export default function ResetPasswordForm() {
  const [pageState, setPageState] = useState<PageState>("loading");
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const hasRecoveryCallback =
      hash.has("access_token") || hash.has("error") || hash.get("type") === "recovery";
    const supabase = createRecoveryClient();
    let settled = false;

    const finishWithError = (message: string) => {
      if (settled) return;
      settled = true;
      setError(message);
      setPageState("error");
    };

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" && session) {
        settled = true;
        setPageState("ready");
        setError("");
      }
    });

    if (!hasRecoveryCallback) {
      finishWithError("Open the password reset link from your email to continue.");
    } else {
      const timeout = window.setTimeout(() => {
        finishWithError("This password reset link is invalid or has expired. Request a new link.");
      }, 8000);

      return () => {
        window.clearTimeout(timeout);
        data.subscription.unsubscribe();
      };
    }

    return () => data.subscription.unsubscribe();
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const checks = passwordChecks(password);
    if (checks.some((check) => !check.ok)) {
      setError("New password does not meet all strength requirements.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setPending(true);
    setError("");
    const supabase = createRecoveryClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setError(updateError.message);
      setPending(false);
      return;
    }

    await supabase.auth.signOut({ scope: "local" });
    setPending(false);
    setPageState("success");
  }

  const inputClass =
    "w-full h-11 bg-white/10 border border-white/15 rounded-xl pl-10 pr-3.5 text-sm font-medium text-white placeholder:text-white/35 focus:outline-none focus:border-pink-300/60 focus:ring-2 focus:ring-pink-500/30 transition";

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-950 px-4 py-8 text-white">
      <section className="w-full max-w-md rounded-2xl border border-white/15 bg-slate-900/95 p-6 shadow-2xl sm:p-8">
        <div className="text-center">
          <h1 className="text-2xl font-semibold">Reset password</h1>
          <p className="mt-1 text-sm text-white/60">
            Choose a new password for your Airship Express account.
          </p>
        </div>

        {pageState === "loading" && (
          <div className="mt-8 flex items-center justify-center gap-2 text-sm text-white/65">
            <Loader2 className="h-4 w-4 animate-spin" /> Verifying reset link...
          </div>
        )}

        {pageState === "error" && (
          <div className="mt-6 space-y-4">
            <div className="flex items-start gap-2 rounded-xl border border-rose-300/25 bg-rose-500/15 p-3 text-sm text-rose-100">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" />
              <span>{error}</span>
            </div>
            <a
              href="/login"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-semibold transition hover:bg-white/15"
            >
              <ArrowLeft className="h-4 w-4" /> Request a new link
            </a>
          </div>
        )}

        {pageState === "ready" && (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-white/75">
                New password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                <input
                  type="password"
                  required
                  autoFocus
                  autoComplete="new-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className={inputClass}
                  placeholder="••••••••"
                />
              </div>
              <PasswordChecklist password={password} />
            </div>

            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-white/75">
                Confirm new password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                <input
                  type="password"
                  required
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className={inputClass}
                  placeholder="••••••••"
                />
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-xl border border-rose-300/25 bg-rose-500/15 p-3 text-[13px] text-rose-100">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={pending}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#E81B75] text-sm font-semibold text-white transition hover:bg-[#CB1664] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Change password"}
            </button>
          </form>
        )}

        {pageState === "success" && (
          <div className="mt-6 space-y-4 text-center">
            <div className="flex items-center justify-center gap-2 rounded-xl border border-emerald-300/25 bg-emerald-500/15 p-3 text-sm text-emerald-100">
              <CheckCircle2 className="h-4 w-4 text-emerald-300" /> Password changed successfully.
            </div>
            <a
              href="/login"
              className="inline-flex w-full items-center justify-center rounded-xl bg-[#E81B75] px-4 py-3 text-sm font-semibold transition hover:bg-[#CB1664]"
            >
              Continue to sign in
            </a>
          </div>
        )}
      </section>
    </main>
  );
}
