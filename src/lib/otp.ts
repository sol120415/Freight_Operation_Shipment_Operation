import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverLog } from "@/lib/server/log";

/**
 * Email OTP issuance + verification (login, seller registration & password reset).
 *
 * SERVER ONLY — never imported by Client Components. `sendOtpEmail()` runs
 * exclusively in Server Actions / Route Handlers, so SMTP and OTP sender
 * variables never reach the browser (no NEXT_PUBLIC_ prefix).
 *
 * Security properties:
 * - 6-digit codes from a CSPRNG (`randomInt`), 10-minute expiry.
 * - Stored as SHA-256 hashes (never plain text), single-use (consumed_at).
 * - Max 5 verification attempts per code, 60s resend cooldown.
 * - Generic error messages so callers never reveal whether an email exists.
 * - If delivery fails the code is invalidated and NO account/password change
 *   happens — callers must treat a failed send as "not verified".
 * - Production logs never contain OTP codes, passwords, or API keys.
 *   The dev-terminal code print below only runs outside production.
 */

export const OTP_EXPIRY_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_SECONDS = 60;

export type OtpPurpose = "login" | "seller_registration" | "password_reset";

export function generateOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function hashOtpCode(code: string): string {
  return createHash("sha256").update(code, "utf8").digest("hex");
}

function hashesEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export interface OtpEmailContent {
  subject: string;
  text: string;
  html: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Per-purpose subject + body. Never includes a password. */
export function buildOtpEmail(
  code: string,
  purpose: OtpPurpose,
  name?: string,
): OtpEmailContent {
  const safeName = name?.trim() ? escapeHtml(name.trim()) : null;
  if (purpose === "seller_registration") {
    const subject = "Verify Your Seller Account";
    const greeting = safeName ? `Hi ${safeName},` : "Hi,";
    const text =
      `${greeting}\n\n` +
      `Your Airship Express seller verification code is: ${code}\n\n` +
      `It expires in ${OTP_EXPIRY_MINUTES} minutes. Enter it on the registration page to complete your seller account.\n\n` +
      `Security warning: never share this code with anyone. Airship Express staff will never ask for it.\n` +
      `If you did not request this, you can safely ignore this email.`;
    const html =
      `<p>${greeting}</p>` +
      `<p>Your Airship Express seller verification code is:</p>` +
      `<p style="font-size:28px;font-weight:bold;letter-spacing:6px;">${escapeHtml(code)}</p>` +
      `<p>It expires in ${OTP_EXPIRY_MINUTES} minutes. Enter it on the registration page to complete your seller account.</p>` +
      `<p><strong>Security warning:</strong> never share this code with anyone. Airship Express staff will never ask for it.</p>` +
      `<p>If you did not request this, you can safely ignore this email.</p>`;
    return { subject, text, html };
  }
  if (purpose === "login") {
    const subject = "Your Sign-In Verification Code";
    const text =
      `Your Airship Express sign-in verification code is: ${code}\n\n` +
      `It expires in ${OTP_EXPIRY_MINUTES} minutes. Enter it on the sign-in page to finish signing in.\n\n` +
      `Security warning: never share this code with anyone. Airship Express staff will never ask for it.\n` +
      `If you did not request this, you can safely ignore this email.`;
    const html =
      `<p>Your Airship Express sign-in verification code is:</p>` +
      `<p style="font-size:28px;font-weight:bold;letter-spacing:6px;">${escapeHtml(code)}</p>` +
      `<p>It expires in ${OTP_EXPIRY_MINUTES} minutes. Enter it on the sign-in page to finish signing in.</p>` +
      `<p><strong>Security warning:</strong> never share this code with anyone. Airship Express staff will never ask for it.</p>` +
      `<p>If you did not request this, you can safely ignore this email.</p>`;
    return { subject, text, html };
  }
  const subject = "Password Reset Verification Code";
  const text =
    `Your Airship Express password reset code is: ${code}\n\n` +
    `It expires in ${OTP_EXPIRY_MINUTES} minutes. Enter it on the password reset page to choose a new password.\n\n` +
    `Security warning: never share this code with anyone. Airship Express staff will never ask for it.\n` +
    `If you did not request this, you can safely ignore this email.`;
  const html =
    `<p>Your Airship Express password reset code is:</p>` +
    `<p style="font-size:28px;font-weight:bold;letter-spacing:6px;">${escapeHtml(code)}</p>` +
    `<p>It expires in ${OTP_EXPIRY_MINUTES} minutes. Enter it on the password reset page to choose a new password.</p>` +
    `<p><strong>Security warning:</strong> never share this code with anyone. Airship Express staff will never ask for it.</p>` +
    `<p>If you did not request this, you can safely ignore this email.</p>`;
  return { subject, text, html };
}

/**
 * Deliver the OTP through SMTP (server-side only).
 *
 * - Production with SMTP settings: sends through Nodemailer and throws on
 *   failure so the caller can invalidate the code.
 * - Development (SMTP not configured): the code is logged server-side — read it from the
 *   terminal (`npm run dev` output). It is NEVER returned to the browser.
 *   The code print is skipped entirely in production.
 */
export async function sendOtpEmail(
  email: string,
  code: string,
  purpose: OtpPurpose,
  name?: string,
): Promise<void> {
  const { subject, text, html } = buildOtpEmail(code, purpose, name);
  const smtpHost = process.env.SMTP_HOST?.trim();
  const smtpUser = process.env.SMTP_USER?.trim();
  const smtpPass = process.env.SMTP_PASS;
  const fromEmail = process.env.OTP_FROM_EMAIL;
  const isProduction = process.env.NODE_ENV === "production";

  serverLog.info("otp.send", { email, purpose, subject });

  if (!smtpHost || !smtpUser || !smtpPass || !fromEmail) {
    if (isProduction) {
      // Never print codes in production, even when misconfigured.
      serverLog.error("otp.send", {
        err: "SMTP_HOST, SMTP_USER, SMTP_PASS, or OTP_FROM_EMAIL is not configured",
      });
      throw new Error("Email service is not configured.");
    }
    // Dev delivery channel: server log only (never the webpage / API output).
    console.log(
      `[otp] ${purpose} code for ${email} (expires in ${OTP_EXPIRY_MINUTES}m): ${code}`,
    );
    return;
  }

  try {
    const { sendTransactionalEmail } = await import("@/lib/server/mailer");
    await sendTransactionalEmail({ to: email, subject, text, html });
  } catch (e) {
    const smtpError = e as Error & { code?: string; responseCode?: number };
    serverLog.error("otp.send", {
      err: e instanceof Error ? e.message : "SMTP request failed",
      code: smtpError.code,
      responseCode: smtpError.responseCode,
      email,
      purpose,
    });
    throw new Error("Unable to send the verification code. Please try again.");
  }
}

/** Issue a fresh OTP, invalidating older unconsumed codes for the address. */
export async function issueOtp(
  email: string,
  purpose: OtpPurpose,
  opts?: { name?: string },
): Promise<{ ok: true } | { ok: false; error: string; retryAfter?: number }> {
  const normalized = email.trim().toLowerCase();
  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return { ok: false, error: "Email service is not configured. Please try again later." };
  }

  const now = Date.now();
  const { data: recent, error: recentError } = await admin
    .from("email_verification_codes")
    .select("id, created_at, consumed_at")
    .eq("email", normalized)
    .eq("purpose", purpose)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (recentError) {
    serverLog.error("otp.issue", { err: recentError.message, code: recentError.code });
    return { ok: false, error: "Unable to send the verification code. Please try again." };
  }

  if (recent?.created_at) {
    const ageSec = (now - new Date(recent.created_at).getTime()) / 1000;
    if (ageSec < OTP_RESEND_COOLDOWN_SECONDS) {
      return {
        ok: false,
        error: `Please wait ${Math.ceil(OTP_RESEND_COOLDOWN_SECONDS - ageSec)} seconds before requesting a new code.`,
        retryAfter: Math.ceil(OTP_RESEND_COOLDOWN_SECONDS - ageSec),
      };
    }
    // Invalidate a superseded code after the cooldown. Failed deliveries are
    // also rate-limited because their records are marked consumed.
    if (!recent.consumed_at) {
      const { error: invalidateError } = await admin
        .from("email_verification_codes")
        .update({ consumed_at: new Date().toISOString() })
        .eq("id", recent.id);
      if (invalidateError) {
        serverLog.error("otp.issue", { err: invalidateError.message, code: invalidateError.code });
        return { ok: false, error: "Unable to send the verification code. Please try again." };
      }
    }
  }

  const code = generateOtpCode();
  const { data: inserted, error } = await admin
    .from("email_verification_codes")
    .insert({
      email: normalized,
      purpose,
      code_hash: hashOtpCode(code),
      attempts: 0,
      max_attempts: OTP_MAX_ATTEMPTS,
      expires_at: new Date(now + OTP_EXPIRY_MINUTES * 60_000).toISOString(),
    })
    .select("id")
    .single();
  if (error || !inserted) {
    serverLog.error("otp.issue", {
      err: error?.message ?? "insert failed",
      code: error?.code,
    });
    return { ok: false, error: "Unable to send the verification code. Please try again." };
  }

  // Delivery failure invalidates the code: without the email the user can
  // never verify it, so it must not linger as a live credential. No account
  // or password change can proceed without a verified code.
  try {
    await sendOtpEmail(normalized, code, purpose, opts?.name);
  } catch (e) {
    await admin
      .from("email_verification_codes")
      .update({ consumed_at: new Date().toISOString() })
      .eq("id", inserted.id);
    return {
      ok: false,
      error:
        e instanceof Error ? e.message : "Unable to send the verification code. Please try again.",
    };
  }
  return { ok: true };
}

/**
 * Verify a submitted OTP. Consumes the code on success. Generic failures so
 * callers cannot probe for registered emails.
 */
export async function verifyOtp(
  email: string,
  purpose: OtpPurpose,
  code: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const normalized = email.trim().toLowerCase();
  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return { ok: false, error: "Email service is not configured. Please try again later." };
  }

  const { data: row } = await admin
    .from("email_verification_codes")
    .select("id, code_hash, attempts, max_attempts, expires_at")
    .eq("email", normalized)
    .eq("purpose", purpose)
    .is("consumed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!row) {
    return {
      ok: false,
      error: "Code expired or invalid. Request a new code and try again.",
    };
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await admin
      .from("email_verification_codes")
      .update({ consumed_at: new Date().toISOString() })
      .eq("id", row.id);
    return {
      ok: false,
      error: "Code expired or invalid. Request a new code and try again.",
    };
  }
  if (row.attempts >= row.max_attempts) {
    return {
      ok: false,
      error: "Too many incorrect attempts. Request a new code and try again.",
    };
  }
  if (!hashesEqual(hashOtpCode(code.trim()), row.code_hash)) {
    const attempts = row.attempts + 1;
    await admin
      .from("email_verification_codes")
      .update({ attempts })
      .eq("id", row.id);
    const left = row.max_attempts - attempts;
    return {
      ok: false,
      error:
        left > 0
          ? `Incorrect code. You have ${left} attempt${left === 1 ? "" : "s"} left.`
          : "Too many incorrect attempts. Request a new code and try again.",
    };
  }

  await admin
    .from("email_verification_codes")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", row.id);
  return { ok: true };
}
