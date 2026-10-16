"use client";

import { useState, useActionState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Loader2,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  ArrowLeft,
  User,
  Building2,
  MapPin,
  Phone,
  ShieldAlert,
  ShieldCheck,
  KeyRound,
  X,
} from "lucide-react";
import {
  authenticate,
  verifyLoginOtp,
  requestPasswordResetLink,
  requestSellerOtp,
  verifySellerOtpAndRegister,
  type AuthState,
} from "./actions";

type Mode = "signin" | "signup" | "forgot";

const FAIL_KEY = "ax-login-fails";
const MAX_FAILS_BEFORE_HINT = 3;
const LOGIN_OTP_RESEND_SECONDS = 60;
// Form-filling browser extensions can add attributes such as `fdprocessedid`
// before hydration. Suppress that external mismatch on the initial controls.
// Security note: this counter is UI-ONLY (reveals the Forgot Password
// prompt after 3 failed attempts). localStorage is not a security boundary —
// it can be cleared — so actual brute-force protection comes server-side
// from Supabase Auth rate limits (sign_in_sign_ups / token_verifications per
// IP in supabase/config.toml) plus generic "Invalid email or password."
// errors. Deliberately NO per-account lockout: a lockout table would let an
// attacker deny service to other sellers by failing their logins on purpose.

import { isValidSellerName, isValidContactNumber, passwordChecks } from "@/lib/sellerValidation";

function PasswordChecklist({ password }: { password: string }) {
  const checks = passwordChecks(password);
  return (
    <ul className="mt-2 space-y-1 rounded-xl bg-white/5 border border-white/10 p-3">
      {checks.map((c) => (
        <li
          key={c.label}
          className={`flex items-center gap-2 text-[12px] font-medium ${
            c.ok ? "text-emerald-300" : "text-white/50"
          }`}
        >
          <span
            className={`inline-flex w-4 h-4 items-center justify-center rounded-full text-[10px] font-black ${
              c.ok ? "bg-emerald-500/25 text-emerald-300" : "bg-white/10 text-white/40"
            }`}
          >
            {c.ok ? "✓" : "·"}
          </span>
          {c.label}
        </li>
      ))}
    </ul>
  );
}

function SubmitButton({
  label,
  pending,
  pendingLabel = "Authenticating...",
}: {
  label: string;
  pending: boolean;
  pendingLabel?: string;
}) {
  return (
    <button
      suppressHydrationWarning
      type="submit"
      disabled={pending}
      className="w-full inline-flex items-center justify-center gap-2 h-11 rounded-xl bg-[#E81B75] hover:bg-[#CB1664] disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-semibold shadow-lg shadow-pink-950/30 transition-colors cursor-pointer select-none"
    >
      {pending ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>{pendingLabel}</span>
        </>
      ) : (
        <>
          <span>{label}</span>
          <ArrowRight className="w-4 h-4 text-white/70" />
        </>
      )}
    </button>
  );
}

function StateAlert({ state }: { state: AuthState }) {
  return (
    <>
      {state.error && (
        <div className="text-[13px] text-rose-100 bg-rose-500/15 border border-rose-300/25 rounded-xl p-3 flex items-start gap-2">
          <ShieldAlert className="w-4 h-4 text-rose-300 shrink-0 mt-0.5" />
          <span>{state.error}</span>
        </div>
      )}
      {state.message && (
        <div className="text-[13px] text-emerald-100 bg-emerald-500/15 border border-emerald-300/25 rounded-xl p-3 flex items-start gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-300 shrink-0 mt-0.5" />
          <span>{state.message}</span>
        </div>
      )}
    </>
  );
}

function OtpCooldown({ seconds }: { seconds: number }) {
  if (seconds <= 0) return null;

  const progress = Math.min(100, (seconds / LOGIN_OTP_RESEND_SECONDS) * 100);

  return (
    <div
      role="status"
      aria-live="polite"
      className="space-y-1.5 rounded-xl border border-pink-300/20 bg-pink-500/10 px-3 py-2.5"
    >
      <div className="flex items-center justify-between gap-3 text-xs text-white/65">
        <span>Resend available in</span>
        <span className="font-mono font-semibold tabular-nums text-pink-200">{seconds}s</span>
      </div>
      <div
        role="progressbar"
        aria-label={`Resend code available in ${seconds} seconds`}
        aria-valuemin={0}
        aria-valuemax={LOGIN_OTP_RESEND_SECONDS}
        aria-valuenow={seconds}
        className="h-1.5 overflow-hidden rounded-full bg-white/10"
      >
        <div
          className="h-full rounded-full bg-pink-400 transition-[width] duration-1000 ease-linear"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

interface FormStyling {
  inputCls: string;
  labelCls: string;
}

// ---------------------------------------------------------------------------
// Sign in (+ failed-attempt tracking → forgot-password prompt after 3 fails)
// ---------------------------------------------------------------------------

function SignInForm({
  showPw,
  onTogglePw,
  styling,
  onForgot,
}: { styling: FormStyling } & {
  showPw: boolean;
  onTogglePw: () => void;
  onForgot: () => void;
}) {
  const { inputCls, labelCls } = styling;
  const [state, formAction, pending] = useActionState<AuthState, FormData>(authenticate, {});
  const [verifyState, verifyAction, verifyPending] = useActionState<AuthState, FormData>(verifyLoginOtp, {});
  const [resendState, resendAction, resendPending] = useActionState<AuthState, FormData>(authenticate, {});
  const [step, setStep] = useState<"credentials" | "otp">("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(0);
  const [portalReady, setPortalReady] = useState(false);
  const [fails, setFails] = useState(0);
  const [otpToken, setOtpToken] = useState("");
  const verifyFormRef = useRef<HTMLFormElement>(null);
  const submittedOtpRef = useRef<string | null>(null);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    try {
      setFails(Number(window.localStorage.getItem(FAIL_KEY) ?? 0) || 0);
    } catch {
      setFails(0);
    }
  }, []);

  useEffect(() => {
    const error = state.error;
    if (!error) return;
    setFails((prev) => {
      const next = prev + 1;
      try {
        window.localStorage.setItem(FAIL_KEY, String(next));
      } catch {
        /* offline-safe */
      }
      return next;
    });
  }, [state.error]);

  useEffect(() => {
    if (state.message) {
      setStep("otp");
      setResendSeconds(LOGIN_OTP_RESEND_SECONDS);
    }
  }, [state]);

  useEffect(() => {
    if (step !== "otp" || resendSeconds <= 0) return;
    const timer = window.setTimeout(() => {
      setResendSeconds((remaining) => Math.max(0, remaining - 1));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [step, resendSeconds]);

  useEffect(() => {
    if (otpToken.length < 6) {
      submittedOtpRef.current = null;
      return;
    }
    if (verifyPending || submittedOtpRef.current === otpToken) return;

    submittedOtpRef.current = otpToken;
    verifyFormRef.current?.requestSubmit();
  }, [otpToken, verifyPending]);

  useEffect(() => {
    if (step !== "otp") return;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setStep("credentials");
        setPassword("");
        setResendSeconds(0);
        setOtpToken("");
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [step]);

  function closeOtpModal() {
    setStep("credentials");
    setPassword("");
    setResendSeconds(0);
    setOtpToken("");
  }

  return (
    <>
      <form action={formAction} className="mt-5 space-y-4">
        <div>
          <label className={labelCls}>Email</label>
          <div className="relative">
            <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" />
            <input
              suppressHydrationWarning
              name="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className={inputCls}
              placeholder="you@company.com"
            />
          </div>
        </div>

        <div>
          <label className={labelCls}>Password</label>
          <div className="relative">
            <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" />
            <input
              suppressHydrationWarning
              name="password"
              type={showPw ? "text" : "password"}
              required
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={`${inputCls} pr-10`}
              placeholder="••••••••"
            />
            <button
              suppressHydrationWarning
              type="button"
              onClick={onTogglePw}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-white/40 hover:text-white transition cursor-pointer"
              aria-label={showPw ? "Hide password" : "Show password"}
            >
              {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 pt-0.5">
          <label className="inline-flex cursor-pointer items-center gap-2 text-[13px] text-white/70">
            <input
              type="checkbox"
              name="rememberMe"
              value="on"
              checked={rememberMe}
              onChange={(event) => setRememberMe(event.target.checked)}
              className="h-4 w-4 rounded border-white/30 bg-white/10 text-pink-500 accent-pink-500 focus:ring-2 focus:ring-pink-500/40"
            />
            <span>
              <span className="font-semibold text-white">Remember Me</span>
              <span className="ml-1 text-white/50">(24 hours)</span>
            </span>
          </label>
          <button
            suppressHydrationWarning
            type="button"
            onClick={onForgot}
            className="text-[13px] font-semibold text-pink-300 hover:text-pink-200 hover:underline transition cursor-pointer"
          >
            Forgot Password?
          </button>
        </div>

        {step !== "otp" && <StateAlert state={state} />}

        {fails >= MAX_FAILS_BEFORE_HINT && (
          <div className="rounded-xl border border-amber-300/40 bg-amber-500/15 p-3 flex items-start gap-2">
            <KeyRound className="w-4 h-4 text-amber-200 shrink-0 mt-0.5" />
            <p className="text-[13px] text-amber-100">
              Forgot your password?{" "}
              <button
                type="button"
                onClick={onForgot}
                className="font-bold underline hover:text-white transition cursor-pointer"
              >
                Reset it here
              </button>{" "}
              with a code sent to your email.
            </p>
          </div>
        )}

        <div className="pt-1">
          <SubmitButton label="Continue" pending={pending} pendingLabel="Sending code..." />
        </div>
      </form>
      {step === "otp" && portalReady
        ? createPortal(
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm">
              <section
                role="dialog"
                aria-modal="true"
                aria-labelledby="login-otp-title"
                aria-describedby="login-otp-description"
                className="relative w-full max-w-md rounded-2xl border border-white/15 bg-slate-950 p-5 shadow-2xl shadow-black/50 sm:p-6"
              >
                <button
                  type="button"
                  onClick={closeOtpModal}
                  aria-label="Close verification dialog"
                  className="absolute right-3 top-3 rounded-lg p-2 text-white/50 transition hover:bg-white/10 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>

                <div className="mb-5 pr-8">
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-pink-500/15 text-pink-300">
                    <KeyRound className="h-5 w-5" />
                  </div>
                  <h3 id="login-otp-title" className="text-lg font-semibold text-white">
                    Enter your sign-in code
                  </h3>
                  <p id="login-otp-description" className="mt-1 text-sm leading-5 text-white/65">
                    We sent a 6-digit code to <span className="font-semibold text-white">{email}</span>. It expires in 10 minutes.
                  </p>
                </div>

                <form ref={verifyFormRef} action={verifyAction} className="space-y-3">
                  <input type="hidden" name="email" value={email} />
                  <input type="hidden" name="password" value={password} />
                  <input type="hidden" name="rememberMe" value={rememberMe ? "on" : "off"} />
                  <div>
                    <label htmlFor="login-otp-token" className={labelCls}>Verification code</label>
                    <input
                      id="login-otp-token"
                      name="token"
                      value={otpToken}
                      onChange={(event) => setOtpToken(event.target.value.replace(/\D/g, "").slice(0, 6))}
                      required
                      autoFocus
                      disabled={verifyPending}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      pattern="[0-9]{6}"
                      aria-describedby="login-otp-status"
                      className="w-full h-12 bg-white/10 border border-white/15 rounded-xl px-3.5 text-base font-mono tracking-[0.45em] text-white placeholder:text-white/35 focus:outline-none focus:border-pink-300/60 focus:ring-2 focus:ring-pink-500/30 transition text-center"
                      placeholder="••••••"
                    />
                  </div>
                  <StateAlert state={verifyState} />
                  <p id="login-otp-status" aria-live="polite" className="min-h-5 text-center text-xs text-white/55">
                    {verifyPending ? "Verifying code..." : "The code will be checked automatically when all 6 digits are entered."}
                  </p>
                </form>

                <form
                  action={resendAction}
                  onSubmit={() => setResendSeconds(LOGIN_OTP_RESEND_SECONDS)}
                  className="mt-4 space-y-3"
                >
                  <input type="hidden" name="email" value={email} />
                  <input type="hidden" name="password" value={password} />
                  <StateAlert state={resendState} />
                  <OtpCooldown seconds={resendSeconds} />
                  <button
                    type="submit"
                    disabled={verifyPending || resendPending || resendSeconds > 0}
                    className="w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {verifyPending
                      ? "Authorizing..."
                      : resendPending
                      ? "Sending code..."
                      : resendSeconds > 0
                        ? `Resend code in ${resendSeconds}s`
                        : "Resend code"}
                  </button>
                </form>
              </section>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Seller-only registration (details → email OTP → verified account)
// ---------------------------------------------------------------------------

interface SellerDraft {
  fullName: string;
  companyName: string;
  address: string;
  contactNumber: string;
  email: string;
  password: string;
  confirmPassword: string;
}

const EMPTY_DRAFT: SellerDraft = {
  fullName: "",
  companyName: "",
  address: "",
  contactNumber: "",
  email: "",
  password: "",
  confirmPassword: "",
};

function SellerSignupForm({ styling, showPw, onTogglePw }: { styling: FormStyling } & { showPw: boolean; onTogglePw: () => void }) {
  const { inputCls, labelCls } = styling;
  const [draft, setDraft] = useState<SellerDraft>(EMPTY_DRAFT);
  const [step, setStep] = useState<"details" | "otp">("details");
  const [clientError, setClientError] = useState<string | null>(null);
  const [resendSeconds, setResendSeconds] = useState(0);

  const [reqState, reqAction, reqPending] = useActionState<AuthState, FormData>(requestSellerOtp, {});
  const [verState, verAction, verPending] = useActionState<AuthState, FormData>(verifySellerOtpAndRegister, {});

  // Advance to the OTP step once the code was accepted for sending.
  useEffect(() => {
    if (reqState.message) {
      setStep("otp");
      setClientError(null);
      setResendSeconds(LOGIN_OTP_RESEND_SECONDS);
    }
  }, [reqState]);

  useEffect(() => {
    if (step !== "otp" || resendSeconds <= 0) return;
    const timer = window.setTimeout(() => {
      setResendSeconds((remaining) => Math.max(0, remaining - 1));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [step, resendSeconds]);

  const set = (k: keyof SellerDraft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setDraft((d) => ({ ...d, [k]: e.target.value }));

  function hiddenFields() {
    return (
      <>
        <input type="hidden" name="fullName" value={draft.fullName} />
        <input type="hidden" name="companyName" value={draft.companyName} />
        <input type="hidden" name="address" value={draft.address} />
        <input type="hidden" name="contactNumber" value={draft.contactNumber} />
        <input type="hidden" name="email" value={draft.email} />
        <input type="hidden" name="password" value={draft.password} />
        <input type="hidden" name="confirmPassword" value={draft.confirmPassword} />
      </>
    );
  }

  function validateDetails(): string | null {
    if (!isValidSellerName(draft.fullName))
      return "Name must be 2–50 characters and contain letters only (spaces, hyphens, apostrophes and periods allowed).";
    if (draft.companyName.trim().length < 2 || draft.companyName.trim().length > 200)
      return "Company name is required (2–200 characters).";
    if (draft.address.trim().length < 4 || draft.address.trim().length > 300)
      return "Address is required (4–300 characters).";
    if (!isValidContactNumber(draft.contactNumber))
      return "Contact number must be exactly 11 digits starting with 09 (e.g. 09XXXXXXXXX).";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim()))
      return "Enter a valid email address.";
    const checks = passwordChecks(draft.password);
    if (checks.some((c) => !c.ok))
      return "Password does not meet all strength requirements below.";
    if (draft.password !== draft.confirmPassword) return "Passwords don't match.";
    return null;
  }

  if (step === "otp") {
    return (
      <div className="mt-5 space-y-4">
        <div className="rounded-xl border border-white/15 bg-white/5 p-3 text-[13px] text-white/70">
          Code sent to <span className="font-bold text-white">{draft.email}</span> — it
          expires in 10 minutes.
          <button
            type="button"
            onClick={() => {
              setStep("details");
              setResendSeconds(0);
            }}
            className="ml-2 font-semibold text-pink-300 hover:underline cursor-pointer"
          >
            Edit details
          </button>
        </div>

        <form
          action={verAction}
          className="space-y-3"
          onSubmit={(e) => {
            const code = String(new FormData(e.currentTarget).get("token") ?? "");
            if (!/^\d{6}$/.test(code.trim())) {
              e.preventDefault();
              setClientError("Enter the 6-digit code sent to your email.");
            }
          }}
        >
          {hiddenFields()}
          <div>
            <label className={labelCls}>6-digit verification code</label>
            <input
              name="token"
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              className="w-full h-11 bg-white/10 border border-white/15 rounded-xl px-3.5 text-sm font-mono tracking-[0.3em] text-white placeholder:text-white/35 focus:outline-none focus:border-pink-300/60 focus:ring-2 focus:ring-pink-500/30 transition text-center"
              placeholder="••••••"
            />
          </div>
          {(clientError || verState.error) && (
            <div className="text-[13px] text-rose-100 bg-rose-500/15 border border-rose-300/25 rounded-xl p-3 flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-300 shrink-0 mt-0.5" />
              <span>{clientError ?? verState.error}</span>
            </div>
          )}
          {verState.message && (
            <div className="text-[13px] text-emerald-100 bg-emerald-500/15 border border-emerald-300/25 rounded-xl p-3 flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-300 shrink-0 mt-0.5" />
              <span>{verState.message}</span>
            </div>
          )}
          <SubmitButton label="Verify & Create Account" pending={verPending} />
        </form>

        <form action={reqAction} onSubmit={() => setClientError(null)} className="space-y-3">
          {hiddenFields()}
          <OtpCooldown seconds={resendSeconds} />
          <button
            type="submit"
            disabled={reqPending || verPending || resendSeconds > 0}
            className="w-full inline-flex items-center justify-center gap-2 h-11 rounded-xl bg-white/15 hover:bg-white/20 disabled:opacity-60 text-white text-sm font-semibold border border-white/20 transition cursor-pointer"
          >
            {verPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Authorizing...
              </>
            ) : reqPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Sending...
              </>
            ) : resendSeconds > 0 ? (
              `Resend code in ${resendSeconds}s`
            ) : (
              "Resend code"
            )}
          </button>
        </form>
      </div>
    );
  }

  return (
    <form
      action={reqAction}
      className="mt-5 space-y-4"
      onSubmit={(e) => {
        const problem = validateDetails();
        if (problem) {
          e.preventDefault();
          setClientError(problem);
        } else {
          setClientError(null);
        }
      }}
    >
      <p className="rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-[12px] text-white/70">
        Public registration creates a <span className="font-bold text-white">Seller account</span> only.
        Admin accounts are provisioned separately by administrators.
      </p>

      <div>
        <label className={labelCls}>Full name (max 50 characters, letters only)</label>
        <div className="relative">
          <User className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" />
          <input
            name="fullName"
            required
            autoComplete="name"
            maxLength={50}
            value={draft.fullName}
            onChange={set("fullName")}
            className={inputCls}
            placeholder="Daniella Sophia Amora"
          />
        </div>
      </div>

      <div>
        <label className={labelCls}>Company name</label>
        <div className="relative">
          <Building2 className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" />
          <input
            name="companyName"
            required
            maxLength={200}
            value={draft.companyName}
            onChange={set("companyName")}
            className={inputCls}
            placeholder="Amora Online Shop"
          />
        </div>
      </div>

      <div>
        <label className={labelCls}>Address</label>
        <div className="relative">
          <MapPin className="w-4 h-4 absolute left-3.5 top-3.5 text-white/40" />
          <textarea
            name="address"
            required
            rows={2}
            maxLength={300}
            value={draft.address}
            onChange={set("address")}
            className="w-full min-h-11 bg-white/10 border border-white/15 rounded-xl pl-10 pr-3.5 py-2.5 text-sm font-medium text-white placeholder:text-white/35 focus:outline-none focus:border-pink-300/60 focus:ring-2 focus:ring-pink-500/30 transition"
            placeholder="House / Street, Barangay, City, Province"
          />
        </div>
      </div>

      <div>
        <label className={labelCls}>Contact number (11 digits, e.g. 09XXXXXXXXX)</label>
        <div className="relative">
          <Phone className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" />
          <input
            name="contactNumber"
            required
            inputMode="numeric"
            maxLength={11}
            value={draft.contactNumber}
            onChange={set("contactNumber")}
            className="w-full h-11 bg-white/10 border border-white/15 rounded-xl pl-10 pr-3.5 text-sm font-mono tracking-wider text-white placeholder:text-white/35 focus:outline-none focus:border-pink-300/60 focus:ring-2 focus:ring-pink-500/30 transition"
            placeholder="09XXXXXXXXX"
          />
        </div>
      </div>

      <div>
        <label className={labelCls}>Email</label>
        <div className="relative">
          <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" />
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            value={draft.email}
            onChange={set("email")}
            className={inputCls}
            placeholder="you@company.com"
          />
        </div>
      </div>

      <div>
        <label className={labelCls}>Password</label>
        <div className="relative">
          <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" />
          <input
            name="password"
            type={showPw ? "text" : "password"}
            required
            autoComplete="new-password"
            value={draft.password}
            onChange={set("password")}
            className={`${inputCls} pr-10`}
            placeholder="••••••••"
          />
          <button
            type="button"
            onClick={onTogglePw}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-white/40 hover:text-white transition cursor-pointer"
            aria-label={showPw ? "Hide password" : "Show password"}
          >
            {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        <PasswordChecklist password={draft.password} />
      </div>

      <div>
        <label className={labelCls}>Confirm password</label>
        <div className="relative">
          <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" />
          <input
            name="confirmPassword"
            type={showPw ? "text" : "password"}
            required
            autoComplete="new-password"
            value={draft.confirmPassword}
            onChange={set("confirmPassword")}
            className={inputCls}
            placeholder="••••••••"
          />
        </div>
      </div>

      {(clientError || reqState.error) && (
        <div className="text-[13px] text-rose-100 bg-rose-500/15 border border-rose-300/25 rounded-xl p-3 flex items-start gap-2">
          <ShieldAlert className="w-4 h-4 text-rose-300 shrink-0 mt-0.5" />
          <span>{clientError ?? reqState.error}</span>
        </div>
      )}
      {reqState.message && (
        <div className="text-[13px] text-emerald-100 bg-emerald-500/15 border border-emerald-300/25 rounded-xl p-3 flex items-start gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-300 shrink-0 mt-0.5" />
          <span>{reqState.message}</span>
        </div>
      )}

      <div className="pt-1">
        <SubmitButton label="Send verification code" pending={reqPending} />
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Forgot password (email → OTP → new strong password)
// ---------------------------------------------------------------------------

function ForgotPasswordForm({ styling, onBack }: { styling: FormStyling } & { onBack: () => void }) {
  const { inputCls, labelCls } = styling;
  const [email, setEmail] = useState("");
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    requestPasswordResetLink,
    {},
  );

  return (
    <div className="mt-5 space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-white/60 hover:text-white transition cursor-pointer"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Back to sign in
      </button>

      <form action={formAction} className="space-y-3">
        <div>
          <label className={labelCls}>Registered email</label>
          <div className="relative">
            <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" />
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputCls}
              placeholder="you@company.com"
            />
          </div>
        </div>

        {state.error && (
          <div className="text-[13px] text-rose-100 bg-rose-500/15 border border-rose-300/25 rounded-xl p-3 flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 text-rose-300 shrink-0 mt-0.5" />
            <span>{state.error}</span>
          </div>
        )}
        {state.message && (
          <div className="text-[13px] text-emerald-100 bg-emerald-500/15 border border-emerald-300/25 rounded-xl p-3 flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-300 shrink-0 mt-0.5" />
            <span>{state.message}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full inline-flex items-center justify-center gap-2 h-11 rounded-xl bg-white/15 hover:bg-white/20 disabled:opacity-60 text-white text-sm font-semibold border border-white/20 transition cursor-pointer"
        >
          {pending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Sending link...
            </>
          ) : (
            "Send reset password link"
          )}
        </button>
      </form>

      <p className="rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-[12px] leading-5 text-white/65">
        Check Gmail and spam for the reset email. When you click the link,
        the page for your new password and password confirmation will open.
      </p>
    </div>
  );
}

export default function LoginForm({ compact = false }: { compact?: boolean }) {
  const [mode, setMode] = useState<Mode>("signin");
  const [showPw, setShowPw] = useState(false);

  const inputCls =
    "w-full h-11 bg-white/10 border border-white/15 rounded-xl pl-10 pr-3.5 text-sm font-medium text-white placeholder:text-white/35 focus:outline-none focus:border-pink-300/60 focus:ring-2 focus:ring-pink-500/30 transition shadow-none";
  const labelCls = "block text-[13px] font-medium text-white/75 mb-1.5";
  const styling = { inputCls, labelCls };

  return (
    <div className="w-full rounded-2xl border border-white/20 bg-slate-950/95 backdrop-blur-2xl shadow-[0_20px_60px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.15)] overflow-hidden">
      {/* Top glass highlight */}
      <div className="h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />

      <div className={compact ? "p-5" : "p-6 sm:p-7"}>
        {/* Brand Header */}
        <div className="text-center">
          <div className="mx-auto flex justify-center items-center gap-2 mb-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/icons/airship-pink-mark.png"
              alt="Airship Express"
              width={32}
              height={20}
              className="w-8 h-5 object-contain"
            />
            <div className="text-left leading-none">
              <div className="flex items-baseline gap-1">
                <span className="text-[15px] font-bold tracking-tight text-white">
                  AIRSHIP
                </span>
                <span className="text-[11px] font-bold tracking-tight text-pink-300">
                  EXPRESS
                </span>
              </div>
            </div>
          </div>

          <h2 className="text-[20px] font-semibold text-white tracking-tight leading-tight">
            {mode === "signup" ? "Create seller account" : mode === "forgot" ? "Reset password" : "Welcome back"}
          </h2>
          <p className="mt-1 text-[13px] font-normal text-white/60">
            {mode === "signup"
              ? "Register as a seller — email verification required."
              : mode === "forgot"
                ? "Verify your email, then choose a new password."
                : "Sign in to continue to your hub."}
          </p>
        </div>

        {/* Mode Switcher — Sign In / Register only (seller-only registration) */}
        {mode !== "forgot" && (
          <div className="mt-5 flex gap-1 p-1 bg-white/10 rounded-full border border-white/10">
            {([
              { id: "signin", label: "Sign In" },
              { id: "signup", label: "Register" },
            ] as const).map((m) => (
              <button
                suppressHydrationWarning
                key={m.id}
                type="button"
                onClick={() => setMode(m.id)}
                className={`flex-1 h-9 text-[13px] font-semibold rounded-full transition-all duration-200 cursor-pointer ${
                  mode === m.id
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-white/60 hover:text-white"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        )}

        {/* Key remount clears stale errors when switching modes */}
        {mode === "forgot" ? (
          <ForgotPasswordForm key="forgot" styling={styling} onBack={() => setMode("signin")} />
        ) : mode === "signup" ? (
          <SellerSignupForm
            key="signup"
            styling={styling}
            showPw={showPw}
            onTogglePw={() => setShowPw((v) => !v)}
          />
        ) : (
          <SignInForm
            key="signin"
            styling={styling}
            showPw={showPw}
            onTogglePw={() => setShowPw((v) => !v)}
            onForgot={() => setMode("forgot")}
          />
        )}
      </div>
    </div>
  );
}

