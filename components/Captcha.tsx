"use client";

import { api } from "@/lib/client/api";
import { AlertIcon } from "./icons";
import { inputStyles } from "./ui";

/** What the server sends: the picture, and the signed token the form sends back. */
export type CaptchaChallenge = { svg: string; token: string };

/** A new challenge from the server, or null if it could not be fetched. */
export async function freshCaptcha(): Promise<CaptchaChallenge | null> {
  return api<CaptchaChallenge>("/api/captcha").catch(() => null);
}

/** The CAPTCHA picture and its input. Shown only when the site runs with CAPTCHA=on. */
export function CaptchaField({ challenge, value, onChange, error }: {
  challenge: CaptchaChallenge;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  return (
    <div>
      <label htmlFor="captcha" className="mb-1.5 block text-sm font-medium text-ink-800">Type the characters shown</label>
      <div
        data-testid="captcha-image"
        role="img"
        aria-label="Security check: five characters drawn as lines"
        className="mb-2 inline-block rounded-lg border border-ink-200 bg-white px-2 py-1 text-ink-800"
        // Built on the server from paths only (lib/server/captcha.ts), never from user input.
        dangerouslySetInnerHTML={{ __html: challenge.svg }}
      />
      <input
        id="captcha"
        name="captcha"
        data-testid="captcha-input"
        inputMode="numeric"
        autoComplete="off"
        maxLength={5}
        required
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? "captcha-error" : undefined}
        className={inputStyles}
      />
      {error && (
        <p id="captcha-error" data-testid="captcha-error" className="mt-1.5 flex items-center gap-1 text-xs font-medium text-red-600">
          <AlertIcon className="size-3.5 shrink-0" />{error}
        </p>
      )}
    </div>
  );
}
