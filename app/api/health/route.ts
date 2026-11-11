import { connection, NextResponse } from "next/server";
import { qaSuiteOn } from "@/lib/server/qa-suite";

/**
 * Liveness, like any ordinary site. What the site runs with is at /api/environment.
 * With QA_SUITE=on it also tells the QA console this is a stand-in for the
 * full suite, and where its sign-in page is.
 */
export async function GET() {
  await connection(); // evaluate per request, never prerender
  const body = qaSuiteOn() ? { ok: true, standIn: true, signInPath: "/login" } : { ok: true };
  return NextResponse.json(body, { headers: { "cache-control": "no-store" } });
}
