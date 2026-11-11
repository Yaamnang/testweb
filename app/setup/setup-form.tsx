"use client";

import { useState, type FormEvent } from "react";
import { AuthLayout } from "@/components/AuthLayout";
import { AlertIcon, CheckIcon, CopyIcon } from "@/components/icons";
import { PasswordField } from "@/components/PasswordField";
import { Button, Notice } from "@/components/ui";
import { ApiError, postJson } from "@/lib/client/api";

type Login = { email: string; password: string; totpSecret: string };
type Result = { bot: Login; viewer: Login };

/**
 * Creates the QA test data and shows the two QA logins once. They live only
 * in this component's state: not in the URL, not in storage, not in a log.
 */
export function SetupForm() {
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setResult(await postJson<Result>("/api/setup", { key }));
      setKey("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout title="QA test data">
      {result ? (
        <div data-testid="setup-result" className="space-y-6">
          <Notice kind="warning">These are test accounts for this site only. They are not shown again.</Notice>
          <Account title="QA bot (admin)" id="bot" login={result.bot} />
          <Account title="QA viewer (read-only)" id="viewer" login={result.viewer} />
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-5">
          <div>
            <PasswordField id="setup-key" label="Setup key" data-testid="setup-key" autoComplete="off" required autoFocus
              value={key} onChange={(e) => setKey(e.target.value)}
              aria-invalid={error ? true : undefined} aria-describedby={error ? "setup-error" : undefined} />
            {error && (
              <p id="setup-error" data-testid="setup-error" role="alert" className="mt-1.5 flex items-center gap-1 text-xs font-medium text-red-600">
                <AlertIcon className="size-3.5 shrink-0" />{error}
              </p>
            )}
          </div>
          <Button type="submit" size="lg" className="w-full" data-testid="setup-submit" loading={busy} loadingText="Creating…">
            Create QA test data
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}

function Account({ title, id, login }: { title: string; id: string; login: Login }) {
  return (
    <section aria-label={title}>
      <h2 className="mb-2 text-sm font-semibold text-ink-900">{title}</h2>
      <dl className="divide-y divide-ink-100 rounded-lg border border-ink-200">
        <Value label="Email" value={login.email} testId={`setup-${id}-email`} />
        <Value label="Password" value={login.password} testId={`setup-${id}-password`} />
        <Value label="Authenticator key" value={login.totpSecret} testId={`setup-${id}-totp`} />
      </dl>
    </section>
  );
}

function Value({ label, value, testId }: { label: string; value: string; testId: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(value).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <dt className="text-xs text-ink-500">{label}</dt>
        <dd data-testid={testId} className="break-all font-mono text-[13px] text-ink-900">{value}</dd>
      </div>
      <button type="button" onClick={copy} aria-label={`Copy ${label.toLowerCase()}`}
        className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700">
        {copied ? <><CheckIcon className="size-3.5" /> Copied</> : <><CopyIcon className="size-3.5" /> Copy</>}
      </button>
    </div>
  );
}
