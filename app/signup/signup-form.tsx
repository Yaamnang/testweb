"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { AuthLayout, codeInputStyles } from "@/components/AuthLayout";
import { CaptchaField, freshCaptcha, type CaptchaChallenge } from "@/components/Captcha";
import { AlertIcon, ArrowLeftIcon, SparkleIcon } from "@/components/icons";
import { PasswordField } from "@/components/PasswordField";
import { Button, Field, Notice } from "@/components/ui";
import { ApiError, postJson } from "@/lib/client/api";

type Values = { displayName: string; email: string; password: string; confirmPassword: string };

/** Rough strength: 0-4. Only a hint for the user; the server enforces the real rule (12+ chars). */
function passwordStrength(p: string): { score: number; label: string } {
  if (!p) return { score: 0, label: "" };
  let score = p.length >= 12 ? 1 : 0;
  if (p.length >= 16) score++;
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) score++;
  if (/\d/.test(p) && /[^A-Za-z0-9]/.test(p)) score++;
  if (p.length < 12) return { score: Math.min(score, 1), label: `${12 - p.length} more characters needed` };
  return { score, label: ["Too short", "Okay", "Good", "Strong", "Very strong"][score] };
}

const RESEND_WAIT_S = 60;

const METER = ["bg-red-400", "bg-amber-400", "bg-lime-500", "bg-emerald-500"];

/**
 * A random 20-character password, made in the browser with the crypto API
 * (never sent anywhere until the user submits the form). It always has a
 * lowercase letter, an uppercase letter, a digit and a symbol. Look-alike
 * characters (l, I, O, 0, 1) are left out so it is easy to copy by hand.
 */
function generatePassword(length = 20): string {
  const sets = ["abcdefghijkmnpqrstuvwxyz", "ABCDEFGHJKLMNPQRSTUVWXYZ", "23456789", "!@#$%^&*-_=+?"];
  const random = (max: number) => crypto.getRandomValues(new Uint32Array(1))[0] % max;
  const pick = (chars: string) => chars[random(chars.length)];
  const all = sets.join("");
  const chars = [...sets.map(pick), ...Array.from({ length: length - sets.length }, () => pick(all))];
  // Shuffle (Fisher-Yates) so the guaranteed characters are not always first.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = random(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

/**
 * Sign-up: account details. Next comes the authenticator, then the organization.
 * With CAPTCHA=on thashjkdbaskje form has a CAPTCHA (initialCaptcha is set). With
 * EMAIL_CODE on, the server answers the first send with "email-code" and the
 * form asks for the code: from the demo inbox (demo) or a real email (supabase).
 */
export function SignupForm({ initialCaptcha }: { initialCaptcha: CaptchaChallenge | null }) {
  const router = useRouter();
  const [values, setValues] = useState<Values>({ displayName: "", email: "", password: "", confirmPassword: "" });
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof Values, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  /** The last generated password, so the "save it" note goes away if the user types their own. */
  const [generated, setGenerated] = useState("");
  const strength = passwordStrength(values.password);
  const [step, setStep] = useState<"form" | "email-code">("form");
  const [emailCode, setEmailCode] = useState("");
  const [emailCodeError, setEmailCodeError] = useState<string | undefined>();
  const [codeMode, setCodeMode] = useState<"demo" | "supabase">("demo");
  /** When the last code was asked for, so "Send a new code" waits the 60 seconds Supabase requires. */
  const [sentAt, setSentAt] = useState(0);
  const [now, setNow] = useState(0);
  const [resent, setResent] = useState(false);
  const waitLeft = Math.max(0, RESEND_WAIT_S - Math.floor((now - sentAt) / 1000));

  useEffect(() => {
    if (step !== "email-code") return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [step]);
  const [captcha, setCaptcha] = useState(initialCaptcha);
  const [captchaAnswer, setCaptchaAnswer] = useState("");
  const [captchaError, setCaptchaError] = useState<string | undefined>();

  async function refreshCaptcha() {
    if (!captcha) return;
    setCaptchaAnswer("");
    setCaptcha((await freshCaptcha()) ?? captcha);
  }

  function fillGeneratedPassword() {
    const password = generatePassword();
    setValues({ ...values, password, confirmPassword: password });
    setFieldErrors({ ...fieldErrors, password: undefined, confirmPassword: undefined });
    setGenerated(password);
    // Show it, so the user can see it and save it.
    setShowPassword(true);
    setShowConfirm(true);
  }

  const bind = (key: keyof Values) => ({
    value: values[key],
    error: fieldErrors[key],
    onChange: (e: { target: { value: string } }) => setValues({ ...values, [key]: e.target.value }),
  });

  async function submit(e: FormEvent) {
    e.preventDefault();
    await send(false);
  }

  /** Sends the form. With resend, asks for a new code instead of checking one. */
  async function send(resend: boolean) {
    setBusy(true);
    setResent(false);
    setError(null);
    setFieldErrors({});
    setCaptchaError(undefined);
    setEmailCodeError(undefined);
    const captchaFields = captcha ? { captchaToken: captcha.token, captcha: captchaAnswer } : {};
    const codeFields = resend ? { resend: "1" } : step === "email-code" ? { emailCode } : {};
    try {
      const res = await postJson<{ next: "setup" | "email-code"; mode?: "demo" | "supabase" }>("/api/auth/signup", { ...values, ...captchaFields, ...codeFields });
      if (res.next === "email-code") {
        setStep("email-code");
        setCodeMode(res.mode ?? "demo");
        setEmailCode("");
        setSentAt(Date.now());
        setNow(Date.now());
        setResent(resend);
        setBusy(false);
        return;
      }
      router.push("/signup/authenticator");
    } catch (err) {
      if (err instanceof ApiError) {
        const { captcha: captchaMessage, emailCode: codeMessage, ...rest } = err.fieldErrors;
        if (codeMessage) {
          setEmailCodeError(codeMessage);
        } else {
          setStep("form");
          setFieldErrors(rest);
          setError(err.message);
        }
        if (captchaMessage) {
          setCaptchaError(captchaMessage);
          await refreshCaptcha();
        }
      } else {
        setError("Something went wrong.");
      }
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="It takes about a minute, and you will need an authenticator app on your phone."
      footer={<>Already have an account? <Link href="/login" className="font-medium text-brand-600 hover:text-brand-700">Sign in</Link></>}
    >
      {error && <Notice kind="error" className="mb-5">{error}</Notice>}
      {step === "email-code" ? (
        <form onSubmit={submit} className="space-y-5">
          <div>
            <label htmlFor="emailCode" className="mb-1.5 block text-sm font-medium text-ink-800">
              {codeMode === "supabase" ? "Enter the code we emailed to" : "Enter the 6-digit code we sent to"} {values.email.trim().toLowerCase()}
            </label>
            <input id="emailCode" name="emailCode" inputMode="numeric" autoComplete="one-time-code" required autoFocus
              pattern={codeMode === "supabase" ? "\d{6,8}" : "\d{6}"} maxLength={codeMode === "supabase" ? 8 : 6}
              placeholder="000000" value={emailCode} onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, ""))}
              aria-invalid={emailCodeError ? true : undefined} aria-describedby={emailCodeError ? "emailCode-error" : "emailCode-hint"}
              className={codeInputStyles} />
            {emailCodeError ? (
              <p id="emailCode-error" data-testid="email-code-error" className="mt-1.5 flex items-center gap-1 text-xs font-medium text-red-600">
                <AlertIcon className="size-3.5 shrink-0" />{emailCodeError}
              </p>
            ) : codeMode === "supabase" ? (
              <p id="emailCode-hint" className="mt-1.5 text-xs text-ink-500">
                {resent ? "A new code is on its way. " : ""}Check your inbox and spam folder.
              </p>
            ) : (
              <p id="emailCode-hint" className="mt-1.5 text-xs text-ink-500">
                No email is sent in this demo. The code is in the{" "}
                <Link href="/inbox" target="_blank" className="font-medium text-brand-600 hover:text-brand-700">demo inbox</Link>.
              </p>
            )}
          </div>
          <Button type="submit" size="lg" className="w-full" loading={busy} loadingText="Checking…">Verify email</Button>
          <button type="button" onClick={() => void send(true)} disabled={busy || waitLeft > 0}
            className="mx-auto block text-sm font-medium text-brand-600 hover:text-brand-700 disabled:cursor-not-allowed disabled:text-ink-400">
            {waitLeft > 0 ? `Send a new code in ${waitLeft}s` : "Send a new code"}
          </button>
          <button type="button" onClick={() => { setStep("form"); setEmailCodeError(undefined); }}
            className="mx-auto flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-800">
            <ArrowLeftIcon className="size-3.5" /> Change details
          </button>
        </form>
      ) : (
      <form onSubmit={submit} noValidate className="space-y-5">
        <Field id="displayName" label="Full name" autoComplete="name" autoFocus placeholder="Jane Doe" {...bind("displayName")} />
        <Field id="email" label="Email" type="email" autoComplete="email" placeholder="you@example.com" {...bind("email")} />
        <div>
          <PasswordField id="password" label="Password" autoComplete="new-password" placeholder="Create a password"
            revealed={showPassword} onRevealedChange={setShowPassword}
            aside={
              <button type="button" onClick={fillGeneratedPassword}
                className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700">
                <SparkleIcon className="size-3.5" /> Generate strong password
              </button>
            }
            hint={!fieldErrors.password && !values.password ? "At least 12 characters. A short sentence works well." : undefined}
            {...bind("password")} />
          {values.password && !fieldErrors.password && (
            <div className="mt-2" aria-live="polite">
              <div aria-hidden="true" className="flex gap-1">
                {METER.map((color, i) => (
                  <span key={color} className={`h-1 flex-1 rounded-full transition-colors ${i < strength.score ? METER[strength.score - 1] : "bg-ink-200"}`} />
                ))}
              </div>
              <p className="mt-1 text-xs text-ink-500">{strength.label}</p>
              {generated && values.password === generated && (
                <p className="mt-1 text-xs text-ink-700">Save this password in your password manager before you continue.</p>
              )}
            </div>
          )}
        </div>
        <PasswordField id="confirmPassword" label="Confirm password" autoComplete="new-password" placeholder="Type the password again"
          revealed={showConfirm} onRevealedChange={setShowConfirm} {...bind("confirmPassword")} />
        {captcha && <CaptchaField challenge={captcha} value={captchaAnswer} onChange={setCaptchaAnswer} error={captchaError} />}
        <Button type="submit" size="lg" className="w-full" loading={busy} loadingText="Creating account…">Create account</Button>
      </form>
      )}
    </AuthLayout>
  );
}
