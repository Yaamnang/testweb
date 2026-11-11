import type { Metadata } from "next";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { Suspense } from "react";
import { AuthLayout } from "@/components/AuthLayout";
import { LoadingScreen, Notice } from "@/components/ui";
import { PENDING_SIGNUP_COOKIE, emailCodeFor, emailCodeMode, readPendingSignup } from "@/lib/server/email-code";

export const metadata: Metadata = { title: "Demo inbox" };

/** Stands in for the user's mailbox: no email is sent, the sign-up code shows here. */
export default function InboxPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <Inbox />
    </Suspense>
  );
}

async function Inbox() {
  await connection();
  const mode = emailCodeMode();
  const email = readPendingSignup((await cookies()).get(PENDING_SIGNUP_COOKIE)?.value);
  return (
    <AuthLayout title="Demo inbox" subtitle="No email is sent. Codes for a sign-up started in this browser show here.">
      {mode === "off" ? (
        <Notice kind="info">Email codes are off on this site.</Notice>
      ) : mode === "supabase" ? (
        <Notice kind="info">Codes are sent by real email in this mode.</Notice>
      ) : !email ? (
        <p data-testid="inbox-empty" className="text-sm text-ink-600">No sign-up in progress in this browser.</p>
      ) : (
        <div data-testid="inbox-message" className="rounded-xl border border-ink-200 p-4">
          <p className="text-xs text-ink-500">To <span className="font-mono">{email}</span></p>
          <p className="mt-2 text-sm text-ink-800">Your sign-up code</p>
          <p data-testid="inbox-code" className="mt-1 font-mono text-3xl tracking-[0.3em] text-ink-900">{emailCodeFor(email)}</p>
          <p className="mt-2 text-xs text-ink-500">Valid for 10 to 20 minutes. Reload for the newest code.</p>
        </div>
      )}
    </AuthLayout>
  );
}
