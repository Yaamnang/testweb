import "server-only";
import { createHmac } from "node:crypto";
import { sameText, sign, signingKey } from "./signing";

/**
 * Email code step for sign-up. EMAIL_CODE picks the mode:
 *
 *   off (default)    no email step.
 *   demo             no email is sent. The code is six digits derived by HMAC
 *                    from the address and a ten-minute window, so nothing is
 *                    stored and any instance can check it. The current and the
 *                    previous window are accepted. /inbox shows the code for
 *                    the sign-up in progress in this browser.
 *   supabase (or on) Supabase Auth emails a real code and checks it
 *                    (lib/server/supabase-email.ts).
 */

export const EMAIL_CODE_WINDOW_MS = 10 * 60_000;
export const PENDING_SIGNUP_COOKIE = "fc_signup";
export const PENDING_SIGNUP_TTL_MS = 20 * 60_000;

export type EmailCodeMode = "off" | "demo" | "supabase";

export function emailCodeMode(): EmailCodeMode {
  const value = (process.env.EMAIL_CODE ?? "").trim().toLowerCase();
  if (value === "demo") return "demo";
  if (value === "supabase" || value === "on") return "supabase";
  return "off";
}

function codeForWindow(email: string, window: number, key: Buffer): string {
  const mac = createHmac("sha256", key).update(`email-code:${email.toLowerCase()}:${window}`).digest();
  return String(mac.readUInt32BE(0) % 1_000_000).padStart(6, "0");
}

export function emailCodeFor(email: string, now = Date.now(), key = signingKey()): string {
  return codeForWindow(email, Math.floor(now / EMAIL_CODE_WINDOW_MS), key);
}

export function checkEmailCode(email: string, code: unknown, now = Date.now(), key = signingKey()): boolean {
  if (typeof code !== "string" || !/^\d{6}$/.test(code)) return false;
  const window = Math.floor(now / EMAIL_CODE_WINDOW_MS);
  // Both windows are always compared, so the timing does not tell which matched.
  const matches = [window, window - 1].map((w) => sameText(codeForWindow(email, w, key), code));
  return matches.some(Boolean);
}

/**
 * The pending sign-up cookie: which address this browser is signing up with,
 * signed. It proves the form (and the CAPTCHA, when on) was passed, so the
 * second send skips the CAPTCHA, and /inbox shows a demo code only for it. Value: "<email base64url>.<expiresAt>.<hmac>".
 */
export function pendingSignupValue(email: string, now = Date.now(), key = signingKey()): string {
  const expiresAt = now + PENDING_SIGNUP_TTL_MS;
  return `${Buffer.from(email).toString("base64url")}.${expiresAt}.${sign(`signup:${email}:${expiresAt}`, key)}`;
}

/** The address in a valid, unexpired pending sign-up cookie, else null. */
export function readPendingSignup(value: string | undefined, now = Date.now(), key = signingKey()): string | null {
  if (!value) return null;
  const [encoded, expiry, mac] = value.split(".");
  const expiresAt = Number(expiry);
  if (!encoded || !mac || !Number.isFinite(expiresAt) || expiresAt < now) return null;
  const email = Buffer.from(encoded, "base64url").toString("utf8");
  return sameText(mac, sign(`signup:${email}:${expiresAt}`, key)) ? email : null;
}
