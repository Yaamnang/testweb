import { connection, NextResponse } from "next/server";
import { aiMode } from "@/lib/server/ai";
import { authBackendName } from "@/lib/server/auth-store";

/** What this deployment runs with. The test suite records it in every report. */
export async function GET() {
  await connection(); // evaluate per request, never prerender
  return NextResponse.json({ aiMode: aiMode(), store: authBackendName }, { headers: { "cache-control": "no-store" } });
}
