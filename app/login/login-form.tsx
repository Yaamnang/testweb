"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { AuthLayout, codeInputStyles } from "@/components/AuthLayout";
import { CaptchaField, freshCaptcha, type CaptchaChallenge } from "@/components/Captcha";
import { ArrowLeftIcon, SmartphoneIcon } from "@/components/icons";
import { PasswordField } from "@/components/PasswordField";
import { Button, Field, Notice } from "@/components/ui";
import { ApiError, postJson } from "@/lib/client/api";

/**
 * Sign-in: email + password, then the 6-digit code from the authenticator app.
 * initialCaptcha is set only when the site runs with CAPTCHA=on.
 */
export function LoginForm({ initialCaptcha }: { initialCaptcha: CaptchaChallenge | null }) {
  const router = useRouter();
  const [step, setStep] = useState<"password" | "code">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [captcha, setCaptcha] = useState(initialCaptcha);
  const [captchaAnswer, setCaptchaAnswer] = useState("");
  const [captchaError, setCaptchaError] = useState<string | undefined>();

  /** A used or failed challenge is replaced, so every try needs a fresh answer. */
  async function refreshCaptcha() {
    if (!captcha) return;
    setCaptchaAnswer("");
    setCaptcha((await freshCaptcha()) ?? captcha);
  }

  async function submitPassword(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setCaptchaError(undefined);
    try {
      const captchaFields = captcha ? { captchaToken: captcha.token, captcha: captchaAnswer } : {};
      const { next } = await postJson<{ next: "verify" | "setup" }>("/api/auth/login", { email, password, ...captchaFields });
      setPassword("");
      if (next === "setup") {
        router.push("/signup/authenticator");
        return;
      }
      setStep("code");
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors.captcha) setCaptchaError(err.fieldErrors.captcha);
      else setError(err instanceof ApiError ? err.message : "Something went wrong.");
      await refreshCaptcha();
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { next } = await postJson<{ next: string }>("/api/auth/verify", { code });
      router.replace(next);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
      if (err instanceof ApiError && (err.status === 429 || /expired/.test(err.message))) {
        setStep("password");
        await refreshCaptcha();
      }
      setCode("");
      setBusy(false);
    }
  }

  function backToPassword() {
    setStep("password");
    setCode("");
    setError(null);
    void refreshCaptcha();
  }

  return (
    <AuthLayout
      title="Sign in to Eclypse"
      subtitle={step === "password" ? "For Eclypse staff. Use your work email and password." : "Enter the 6-digit code from your authenticator app."}
      footer={step === "password" && (
        <>New to the team? <Link href="/signup" className="font-medium text-brand-600 hover:text-brand-700">Create your account</Link></>
      )}
    >
      {error && <Notice kind="error" className="mb-5">{error}</Notice>}

      {step === "password" ? (
        <form onSubmit={submitPassword} className="space-y-5">
          <Field id="email" label="Work email" type="email" autoComplete="username" required autoFocus
            placeholder="you@eclypse-ai.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <PasswordField id="password" label="Password" autoComplete="current-password" required
            placeholder="Enter your password" value={password} onChange={(e) => setPassword(e.target.value)} />
          {captcha && <CaptchaField challenge={captcha} value={captchaAnswer} onChange={setCaptchaAnswer} error={captchaError} />}
          <Button type="submit" size="lg" className="w-full" loading={busy} loadingText="Checking…">Continue</Button>
        </form>
      ) : (
        <form onSubmit={submitCode} className="space-y-5">
          <div className="flex items-center gap-3 rounded-xl border border-ink-200 bg-white p-3.5 shadow-sm">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <SmartphoneIcon className="size-5" />
            </span>
            <p className="text-sm text-ink-600">
              Open your authenticator app and find <span className="font-medium text-ink-900">Eclypse</span>. Codes change every 30 seconds.
            </p>
          </div>
          <div>
            <label htmlFor="code" className="mb-1.5 block text-sm font-medium text-ink-800">Authentication code</label>
            <input id="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required autoFocus
              placeholder="000000" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} className={codeInputStyles} />
          </div>
          <Button type="submit" size="lg" className="w-full" loading={busy} loadingText="Verifying…">Verify</Button>
          <button type="button" onClick={backToPassword}
            className="mx-auto flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-800">
            <ArrowLeftIcon className="size-3.5" /> Use a different account
          </button>
        </form>
      )}
    </AuthLayout>
  );
}
