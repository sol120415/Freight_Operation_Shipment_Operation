"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTransactionalEmail } from "@/lib/server/mailer";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import {
  signInSchema,
  signUpSchema,
  passwordResetRequestSchema,
  passwordResetConfirmSchema,
  otpCodeRule,
} from "@/lib/validation/schemas";
import type { AppRole } from "@/types";

import { parseAppRole } from "@/lib/roles";
import { issueOtp, verifyOtp } from "@/lib/otp";

export interface AuthState {
  error?: string;
  message?: string;
}

/**
 * Supabase-JS surfaces connectivity problems as a raw "fetch failed".
 * Translate that into an actionable message so the form doesn't show
 * a cryptic error when the local stack is down. Invalid credentials are
 * mapped to a generic message that never reveals whether an email exists.
 */
function friendlyAuthError(message: string): string {
  const normalized = message.toLowerCase();
  if (
    normalized.includes("invalid login credentials") ||
    normalized.includes("invalid email or password") ||
    normalized.includes("email not confirmed")
  ) {
    return "Invalid email or password.";
  }
  const isConnectivity =
    normalized.includes("fetch failed") ||
    normalized.includes("failed to fetch") ||
    normalized.includes("econnrefused") ||
    normalized.includes("enotfound") ||
    normalized.includes("network request failed");
  if (!isConnectivity) return message;

  let host = "the Supabase server";
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const parsedHost = new URL(url).host;
    if (parsedHost) host = parsedHost;
  } catch {
    // Keep the generic label when the env URL is missing/malformed.
  }
  const isLocal = host.includes("127.0.0.1") || host.includes("localhost");
  return isLocal
    ? `Cannot reach the local auth server (${host}) — it is not running. Start Docker Desktop, run \`supabase start\`, then restart \`npm run dev\`.`
    : `Cannot reach the auth server (${host}). Check your network / Supabase project status and restart \`npm run dev\`.`;
}

/** Validate a password without persisting a Supabase session in cookies. */
async function checkCredentialsWithoutSession(email: string, password: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("Supabase auth is not configured.");

  const validator = createSupabaseClient<Database>(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  const { data, error } = await validator.auth.signInWithPassword({ email, password });
  if (error || !data.user?.email) {
    return {
      ok: false as const,
      error: friendlyAuthError(error?.message ?? "Invalid login credentials"),
    };
  }

  const { data: profile } = await validator
    .from("profiles")
    .select("is_active")
    .eq("id", data.user.id)
    .maybeSingle();
  if (profile && !profile.is_active) {
    return { ok: false as const, error: "Invalid email or password." };
  }

  return { ok: true as const, email: data.user.email.trim().toLowerCase() };
}

export async function requestLoginOtp(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const rawEmail = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  // Sign-in validates format only — never password complexity.
  // Complexity (uppercase, number, special char) is register-only.
  try {
    signInSchema.parse({ email: rawEmail, password });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return { error: e.issues[0]?.message ?? "Validation failed" };
    }
  }

  const email = rawEmail.trim().toLowerCase();
  try {
    const checked = await checkCredentialsWithoutSession(email, password);
    if (!checked.ok) return { error: checked.error };

    const issued = await issueOtp(checked.email, "login");
    if (!issued.ok) return { error: issued.error };

    return {
      message: "Sign-in code sent. Check your email and enter it below within 10 minutes.",
    };
  } catch (e) {
    console.error("login OTP request failed:", e);
    return { error: "Unable to connect to authentication service. Please try again." };
  }
}

/**
 * Stable form entry point for the first password sign-in step. Registration uses the
 * dedicated OTP actions below (requestSellerOtp → verifySellerOtpAndRegister)
 * so no account exists until the email OTP is verified.
 */
export async function authenticate(
  prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  return requestLoginOtp(prev, formData);
}

/** Verify the OTP and password, then create the cookie-backed Supabase session. */
export async function verifyLoginOtp(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const input = {
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
    token: String(formData.get("token") ?? ""),
  };

  try {
    signInSchema.parse({ email: input.email, password: input.password });
    otpCodeRule.parse(input.token);
  } catch (e) {
    if (e instanceof z.ZodError) {
      return { error: e.issues[0]?.message ?? "Validation failed" };
    }
  }

  try {
    const normalizedEmail = input.email.trim().toLowerCase();
    const checked = await checkCredentialsWithoutSession(normalizedEmail, input.password);
    if (!checked.ok || checked.email !== normalizedEmail) {
      return { error: checked.ok ? "Invalid email or password." : checked.error };
    }

    const verified = await verifyOtp(checked.email, "login", input.token);
    if (!verified.ok) return { error: verified.error };

    const supabase = await createClient();
    const { data: authData, error: signInError } = await supabase.auth.signInWithPassword({
      email: checked.email,
      password: input.password,
    });
    if (signInError || !authData.user) {
      return { error: friendlyAuthError(signInError?.message ?? "Invalid login credentials") };
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, is_active")
      .eq("id", authData.user.id)
      .maybeSingle();
    if (profile && !profile.is_active) {
      await supabase.auth.signOut();
      return { error: "Invalid email or password." };
    }

    let targetRole: AppRole = "Customer";
    if (profile?.role) {
      targetRole = parseAppRole(profile.role) ?? "Customer";
    } else if (authData.user.user_metadata?.role) {
      targetRole = parseAppRole(authData.user.user_metadata.role) ?? "Customer";
    }

    const destination =
      targetRole === "SuperAdmin" || targetRole === "Admin"
        ? "/admin/dashboard"
        : targetRole === "Seller"
          ? "/seller/dashboard"
          : "/dashboard";
    revalidatePath("/", "layout");
    redirect(destination);
  } catch (e) {
    if (
      e &&
      typeof e === "object" &&
      "digest" in e &&
      typeof (e as { digest: string }).digest === "string" &&
      (e as { digest: string }).digest.startsWith("NEXT_REDIRECT")
    ) {
      throw e;
    }
    console.error("login OTP verification failed:", e);
    return { error: "Unable to connect to authentication service. Please try again." };
  }
}

export async function signOut() {
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
  } catch (e) {
    console.error("signOut failed:", e);
  }
  revalidatePath("/", "layout");
  redirect("/login");
}

// ---------------------------------------------------------------------------
// Seller-only registration with email OTP verification.
// The account (auth user + sellers row + profile link) is created ONLY after
// the OTP is verified. Passwords are hashed by Supabase Auth (bcrypt) —
// never stored as plain text anywhere.
// ---------------------------------------------------------------------------

function sellerRef() {
  const yr = new Date().getFullYear();
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `SELL-${yr}-${rand}`;
}

/**
 * Step 1: validate the full seller form, reject duplicate emails, then issue
 * a 6-digit OTP to the address (10-minute expiry, 5 attempts, resend after
 * 60s — see lib/otp.ts).
 */
export async function requestSellerOtp(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const input = {
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
    confirmPassword: String(formData.get("confirmPassword") ?? ""),
    fullName: String(formData.get("fullName") ?? ""),
    address: String(formData.get("address") ?? ""),
    companyName: String(formData.get("companyName") ?? ""),
    contactNumber: String(formData.get("contactNumber") ?? ""),
  };
  try {
    signUpSchema.parse(input);
  } catch (e) {
    if (e instanceof z.ZodError) {
      return { error: e.issues[0]?.message ?? "Validation failed" };
    }
  }

  const email = input.email.trim().toLowerCase();
  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return { error: "Registration service is not configured. Please try again later." };
  }

  const { data: existing } = await admin
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (existing) {
    return { error: "This email is already registered. Please sign in instead." };
  }

  const issued = await issueOtp(email, "seller_registration", {
    name: input.fullName.trim(),
  });
  if (!issued.ok) return { error: issued.error };
  return {
    message:
      "Verification code sent — check your email. It expires in 10 minutes. Enter it below to complete registration.",
  };
}

/**
 * Step 2: verify the OTP, then create the auth account + seller business
 * record + profile link atomically (best effort), and sign the seller in.
 */
export async function verifySellerOtpAndRegister(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const input = {
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
    confirmPassword: String(formData.get("confirmPassword") ?? ""),
    fullName: String(formData.get("fullName") ?? ""),
    address: String(formData.get("address") ?? ""),
    companyName: String(formData.get("companyName") ?? ""),
    contactNumber: String(formData.get("contactNumber") ?? ""),
  };
  const token = String(formData.get("token") ?? "").trim();
  try {
    signUpSchema.parse(input);
    otpCodeRule.parse(token);
  } catch (e) {
    if (e instanceof z.ZodError) {
      return { error: e.issues[0]?.message ?? "Validation failed" };
    }
  }

  const email = input.email.trim().toLowerCase();
  const checked = await verifyOtp(email, "seller_registration", token);
  if (!checked.ok) return { error: checked.error };

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return { error: "Registration service is not configured. Please try again later." };
  }

  const { data: taken } = await admin
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (taken) {
    return { error: "This email is already registered. Please sign in instead." };
  }

  // Auth account — Supabase Auth hashes the password (bcrypt); the plain
  // password is never written to our tables. Role is forced to Seller.
  const { data: authUser, error: authError } = await admin.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: input.fullName.trim(), role: "Seller" },
  });
  if (authError || !authUser?.user) {
    if (authError && /already|exists|registered/i.test(authError.message)) {
      return { error: "This email is already registered. Please sign in instead." };
    }
    return { error: friendlyAuthError(authError?.message ?? "Registration failed") };
  }

  const supabase = await createClient();
  const { data: seller, error: sellerError } = await supabase
    .from("sellers")
    .insert({
      reference: sellerRef(),
      name: input.fullName.trim(),
      business_name: input.companyName.trim(),
      phone: input.contactNumber.trim(),
      email,
      address: input.address.trim(),
      pickup_frequency: "On-demand",
      created_by: authUser.user.id,
    })
    .select("id, reference")
    .single();
  if (sellerError || !seller) {
    // Roll back the orphaned auth account so a retry starts clean.
    await admin.auth.admin.deleteUser(authUser.user.id);
    return { error: sellerError?.message ?? "Could not create the seller record." };
  }

  const { error: profileError } = await supabase.from("profiles").upsert(
    {
      id: authUser.user.id,
      email,
      full_name: input.fullName.trim(),
      role: "Seller",
      is_active: true,
      seller_id: seller.id,
    },
    { onConflict: "id" },
  );
  if (profileError) {
    return { error: profileError.message };
  }

  // Sign the verified seller straight into their dashboard.
  try {
    const userClient = await createClient();
    const { error: signInError } = await userClient.auth.signInWithPassword({
      email,
      password: input.password,
    });
    if (signInError) {
      return {
        message:
          "Account created and email verified. Please sign in with your new credentials.",
      };
    }
    revalidatePath("/", "layout");
  } catch (e) {
    console.error("post-registration sign-in failed:", e);
    return {
      message:
        "Account created and email verified. Please sign in with your new credentials.",
    };
  }
  redirect("/seller/dashboard");
}

// ---------------------------------------------------------------------------
// Forgot password with email OTP verification.
// Request/verify messages are identical whether or not the email exists, so
// attackers cannot probe for registered accounts.
// ---------------------------------------------------------------------------

const RESET_GENERIC_MESSAGE =
  "If this email is registered, a password reset link has been sent. Check your inbox and spam folder.";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function passwordResetRedirectUrl(): Promise<string> {
  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configuredSiteUrl) {
    return new URL("/auth/reset-password", configuredSiteUrl).toString();
  }

  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    process.env.VERCEL_PROJECT_PRODUCTION_URL ??
    process.env.VERCEL_URL;
  if (!host) throw new Error("The application URL is not configured.");

  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) ? "http" : "https");
  const origin = host.startsWith("http") ? host : `${protocol}://${host}`;
  return new URL("/auth/reset-password", origin).toString();
}

function resetPasswordEmail(actionLink: string, email: string) {
  const safeEmail = escapeHtml(email);
  const safeLink = escapeHtml(actionLink);
  return {
    subject: "Reset your Airship Express password",
    text:
      `We received a request to reset the password for ${email}.\n\n` +
      `Open this link to choose a new password:\n${actionLink}\n\n` +
      "If you did not request this, you can safely ignore this email.",
    html:
      `<p>We received a request to reset the password for <strong>${safeEmail}</strong>.</p>` +
      `<p><a href="${safeLink}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#e81b75;color:#fff;text-decoration:none;font-weight:600;">Reset password</a></p>` +
      `<p>This link is single-use. If you did not request this, you can safely ignore this email.</p>`,
  };
}

/** Send a single-use Supabase recovery link through the app's SMTP mailer. */
export async function requestPasswordResetLink(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "");
  try {
    passwordResetRequestSchema.parse({ email });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return { error: e.issues[0]?.message ?? "Validation failed" };
    }
  }
  const normalized = email.trim().toLowerCase();

  try {
    const admin = createAdminClient();
    const { data: account } = await admin
      .from("profiles")
      .select("id")
      .eq("email", normalized)
      .maybeSingle();
    if (account) {
      const redirectTo = await passwordResetRedirectUrl();
      const { data, error } = await admin.auth.admin.generateLink({
        type: "recovery",
        email: normalized,
        options: { redirectTo },
      });
      if (error || !data?.properties?.action_link) {
        throw new Error(error?.message ?? "Supabase did not return a recovery link.");
      }

      await sendTransactionalEmail({
        to: normalized,
        ...resetPasswordEmail(data.properties.action_link, normalized),
      });
    }
  } catch (e) {
    console.error("requestPasswordResetLink failed:", e);
  }
  return { message: RESET_GENERIC_MESSAGE };
}

/** Step 1: issue a password-reset OTP (silent when the email is unknown). */
export async function requestPasswordResetOtp(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "");
  try {
    passwordResetRequestSchema.parse({ email });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return { error: e.issues[0]?.message ?? "Validation failed" };
    }
  }
  const normalized = email.trim().toLowerCase();

  try {
    const admin = createAdminClient();
    const { data: account } = await admin
      .from("profiles")
      .select("id")
      .eq("email", normalized)
      .maybeSingle();
    if (account) {
      await issueOtp(normalized, "password_reset");
    }
  } catch (e) {
    console.error("requestPasswordResetOtp failed:", e);
  }
  return { message: RESET_GENERIC_MESSAGE };
}

/**
 * Step 2+3: verify the OTP and set the new strong password in one checked
 * action. The code is single-use; the old password stops working immediately.
 */
export async function resetPasswordWithOtp(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const input = {
    email: String(formData.get("email") ?? ""),
    token: String(formData.get("token") ?? ""),
    newPassword: String(formData.get("newPassword") ?? ""),
    confirmPassword: String(formData.get("confirmPassword") ?? ""),
  };
  try {
    passwordResetConfirmSchema.parse(input);
  } catch (e) {
    if (e instanceof z.ZodError) {
      return { error: e.issues[0]?.message ?? "Validation failed" };
    }
  }
  const normalized = input.email.trim().toLowerCase();

  const checked = await verifyOtp(normalized, "password_reset", input.token);
  if (!checked.ok) return { error: checked.error };

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return { error: "Password service is not configured. Please try again later." };
  }
  const { data: account } = await admin
    .from("profiles")
    .select("id")
    .eq("email", normalized)
    .maybeSingle();
  if (!account) {
    // Verified against a code that should not exist — generic failure.
    return { error: "Code expired or invalid. Request a new code and try again." };
  }

  const { error } = await admin.auth.admin.updateUserById(account.id, {
    password: input.newPassword,
    email_confirm: true,
  });
  if (error) return { error: friendlyAuthError(error.message) };

  return { message: "Password successfully changed. Please sign in with your new password." };
}
