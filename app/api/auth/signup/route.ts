import { NextResponse, type NextRequest } from "next/server";
import { createChallenge, createUser, findUserByEmail } from "@/lib/server/auth-store";
import { CAPTCHA_WRONG, captchaEnabled, checkCaptcha } from "@/lib/server/captcha";
import {
  PENDING_SIGNUP_COOKIE,
  PENDING_SIGNUP_TTL_MS,
  checkEmailCode,
  emailCodeMode,
  pendingSignupValue,
  readPendingSignup,
} from "@/lib/server/email-code";
import { CHALLENGE_COOKIE, cookieOptions } from "@/lib/server/http";
import { MESSAGES, sendEmailCode, supabaseEmailConfigured, verifyEmailCode } from "@/lib/server/supabase-email";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const fieldError = (field: string, message: string) =>
  NextResponse.json({ error: message, fieldErrors: { [field]: message } }, { status: 422 });

// Sign-up step 1: create the account. It cannot be used until step 2
// (authenticator setup) is done, so every account always has two factors.
//
// With EMAIL_CODE on (demo or supabase) the form is sent twice: first without
// a code (the code goes out, and a signed cookie records the address), then
// with the code. With CAPTCHA=on the first send must solve it; the second is
// covered by the signed cookie. resend=1 asks for a new code.
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Record<string, string | undefined> | null;
  const displayName = body?.displayName?.trim() ?? "";
  const email = body?.email?.trim().toLowerCase() ?? "";
  const password = body?.password ?? "";
  const confirmPassword = body?.confirmPassword ?? "";
  const pendingEmail = readPendingSignup(req.cookies.get(PENDING_SIGNUP_COOKIE)?.value);
  const pastForm = pendingEmail !== null && pendingEmail === email;
  const mode = emailCodeMode();

  const fieldErrors: Record<string, string> = {};
  if (displayName.length < 2 || displayName.length > 60) fieldErrors.displayName = "Enter your name (2-60 characters).";
  if (!EMAIL.test(email)) fieldErrors.email = "Enter a valid email address.";
  else if (await findUserByEmail(email)) fieldErrors.email = "An account with this email already exists. Sign in instead.";
  if (password.length < 12) fieldErrors.password = "Use at least 12 characters.";
  if (confirmPassword !== password) fieldErrors.confirmPassword = "The passwords do not match.";
  if (captchaEnabled() && !pastForm && !checkCaptcha(body?.captchaToken, body?.captcha)) fieldErrors.captcha = CAPTCHA_WRONG;
  if (Object.keys(fieldErrors).length) {
    return NextResponse.json({ error: "Please fix the highlighted fields.", fieldErrors }, { status: 422 });
  }

  if (mode === "supabase" && !supabaseEmailConfigured()) {
    return NextResponse.json({ error: MESSAGES.notConfigured }, { status: 503 });
  }

  if (mode !== "off") {
    const resend = body?.resend === "1";
    if (!pastForm || resend || body?.emailCode === undefined) {
      if (mode === "supabase") {
        const problem = await sendEmailCode(email);
        // On the form the problem belongs to the address; on the code step, to the code.
        if (problem) return fieldError(pastForm && resend ? "emailCode" : "email", problem);
      }
      const res = NextResponse.json({ next: "email-code", email, mode });
      res.cookies.set(PENDING_SIGNUP_COOKIE, pendingSignupValue(email), { ...cookieOptions, maxAge: PENDING_SIGNUP_TTL_MS / 1000 });
      return res;
    }
    const code = body.emailCode.trim();
    if (mode === "demo" && !checkEmailCode(email, code)) {
      return fieldError("emailCode", "That code is not correct. Check the demo inbox for the newest code.");
    }
    if (mode === "supabase") {
      const problem = await verifyEmailCode(email, code);
      if (problem) return fieldError("emailCode", problem);
    }
  }

  const user = await createUser({ email, displayName, password });
  const challenge = await createChallenge(user.id);
  const res = NextResponse.json({ next: "setup" }, { status: 201 });
  res.cookies.set(CHALLENGE_COOKIE, challenge.id, { ...cookieOptions, maxAge: 600 });
  res.cookies.delete(PENDING_SIGNUP_COOKIE);
  return res;
}
