import { connection, NextResponse } from "next/server";

/** Liveness only, like any ordinary site. What the site runs with is at /api/environment. */
export async function GET() {
  await connection(); // evaluate per request, never prerender
  return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}
