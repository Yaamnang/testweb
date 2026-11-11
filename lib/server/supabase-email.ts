import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Real email codes for sign-up (EMAIL_CODE=supabase, or on).
 *
 * Supabase Auth is used only as the mail sender and the code checker. The
 * site keeps its own accounts (eclypse_users) and its own sessions. Asking
 * Supabase to send a code creates a row in Supabase's auth.users for each
 * address. That is expected and harmless: nothing here signs in with it.
 *
 * Whether the email holds a code or a link depends on the project's "Magic
 * Link" email template. It sends a code when the template contains
 * {{ .Token }}. Codes are 6 to 8 digits depending on the project.
 *
 * Neither the code nor the email body is ever logged.
 */

export const EMAIL_CODE_PATTERN = /^\d{6,8}$/;

export const MESSAGES = {
  notConfigured: "Email codes need Supabase settings.",
  notAuthorized:
    "Supabase's built-in email only delivers to your project's team addresses. Add custom SMTP in Supabase to send to others.",
  rateLimited: "Too many emails sent. Try again later.",
  invalidCode: "That code is not valid. Check the email or request a new one.",
  sendFailed: "Could not send the email. Try again.",
  checkFailed: "Could not check the code. Try again.",
} as const;

export function supabaseEmailConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);
}

/**
 * A fresh client for each call, with no session storage and no refresh, so
 * the session verifyOtp creates is dropped with the client. Not the store's
 * client: that one must never carry a user session.
 */
function authClient() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

type AuthErrorLike = { code?: string; status?: number; message?: string } | null | undefined;

/** A short message for the user. Pure, so it can be checked without Supabase. */
export function emailErrorMessage(error: AuthErrorLike, during: "send" | "verify"): string {
  const code = error?.code ?? "";
  const message = error?.message ?? "";
  if (code === "email_address_not_authorized") return MESSAGES.notAuthorized;
  // The per-address limit (one code a minute) says how long to wait.
  const wait = /after (\d+) seconds?/i.exec(message);
  if (wait) return `Wait ${wait[1]} seconds before asking for a new code.`;
  if (code === "over_email_send_rate_limit" || code === "over_request_rate_limit" || error?.status === 429) {
    return MESSAGES.rateLimited;
  }
  if (during === "verify") return MESSAGES.invalidCode;
  return MESSAGES.sendFailed;
}

/** Ask Supabase to email a code. null on success, else a message for the user. */
export async function sendEmailCode(email: string): Promise<string | null> {
  try {
    const { error } = await authClient().auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    if (!error) return null;
    console.error("[email-code] send refused:", error.code ?? error.status ?? "unknown");
    return emailErrorMessage(error, "send");
  } catch {
    console.error("[email-code] send failed: network or configuration");
    return MESSAGES.sendFailed;
  }
}

/** Check a code with Supabase. null when it is right, else a message for the user. */
export async function verifyEmailCode(email: string, code: string): Promise<string | null> {
  if (!EMAIL_CODE_PATTERN.test(code)) return MESSAGES.invalidCode;
  try {
    // The session in the answer is deliberately ignored and never returned.
    const { error } = await authClient().auth.verifyOtp({ email, token: code, type: "email" });
    return error ? emailErrorMessage(error, "verify") : null;
  } catch {
    console.error("[email-code] verify failed: network or configuration");
    return MESSAGES.checkFailed;
  }
}
