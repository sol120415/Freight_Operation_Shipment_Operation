import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const REMEMBER_ME_COOKIE = "ax-remember-me";
export const REMEMBER_ME_MAX_AGE_SECONDS = 24 * 60 * 60;

function signingSecret(): string | null {
  // A separate secret is preferred. The service-role key is a safe fallback
  // because it is already required on the server and is never sent to users.
  return (
    process.env.REMEMBER_ME_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    null
  );
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function signature(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload, "utf8").digest("base64url");
}

function buildToken(email: string, expiresAt: number, secret: string): string {
  const payload = Buffer.from(
    JSON.stringify({ email: normalizeEmail(email), expiresAt }),
    "utf8",
  ).toString("base64url");
  return `${payload}.${signature(payload, secret)}`;
}

function readEmailFromToken(token: string, secret: string): string | null {
  const [payload, receivedSignature] = token.split(".");
  if (!payload || !receivedSignature) return null;

  const expectedSignature = signature(payload, secret);
  const expectedBytes = Buffer.from(expectedSignature, "utf8");
  const receivedBytes = Buffer.from(receivedSignature, "utf8");
  if (
    expectedBytes.length !== receivedBytes.length ||
    !timingSafeEqual(expectedBytes, receivedBytes)
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      email?: unknown;
      expiresAt?: unknown;
    };
    if (
      typeof parsed.email !== "string" ||
      typeof parsed.expiresAt !== "number" ||
      !Number.isFinite(parsed.expiresAt) ||
      parsed.expiresAt <= Date.now()
    ) {
      return null;
    }
    return normalizeEmail(parsed.email);
  } catch {
    return null;
  }
}

/** Check the signed, httpOnly device cookie for the requested account. */
export async function hasRememberedLogin(email: string): Promise<boolean> {
  const secret = signingSecret();
  if (!secret) return false;

  const cookieStore = await cookies();
  const token = cookieStore.get(REMEMBER_ME_COOKIE)?.value;
  if (!token) return false;

  const rememberedEmail = readEmailFromToken(token, secret);
  if (rememberedEmail === normalizeEmail(email)) return true;

  // Remove malformed, expired, or account-mismatched tokens so they do not
  // linger in the browser. This does not affect the user's Supabase session.
  cookieStore.delete(REMEMBER_ME_COOKIE);
  return false;
}

/** Remember a successfully OTP-verified account on this browser for 24 hours. */
export async function rememberLoginForDay(email: string): Promise<void> {
  const secret = signingSecret();
  if (!secret) return;

  const cookieStore = await cookies();
  cookieStore.set(
    REMEMBER_ME_COOKIE,
    buildToken(email, Date.now() + REMEMBER_ME_MAX_AGE_SECONDS * 1000, secret),
    {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: REMEMBER_ME_MAX_AGE_SECONDS,
      path: "/",
    },
  );
}

/** Remove the trusted-device marker on logout, timeout, or password reset. */
export async function clearRememberedLogin(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(REMEMBER_ME_COOKIE);
}
