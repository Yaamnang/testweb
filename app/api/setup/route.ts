import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseEnabled } from "@/lib/server/auth-store";
import { newQaLogin, QA_BOT_EMAIL, QA_VIEWER_EMAIL, seedMemory, seedSupabase } from "@/lib/server/seed";
import { memDb } from "@/lib/server/store";
import { client } from "@/lib/server/store-supabase";

/**
 * POST /api/setup { key }: creates the QA test data and returns fresh logins
 * for the QA bot and viewer, once. Exists only when SETUP_KEY is set.
 *
 * A wrong key waits two seconds before the answer. A counter would not work
 * on Vercel, where each request may run in a different instance, so the
 * delay is the limit: guessing a long key one try at a time is hopeless.
 */
const NO_STORE = { "cache-control": "no-store" };
const WRONG_KEY = "That setup key is not right.";

/** Constant time, and the length of the key does not leak either. */
function sameKey(given: string, expected: string): boolean {
  const digest = (text: string) => createHash("sha256").update(text).digest();
  return timingSafeEqual(digest(given), digest(expected));
}

export async function POST(req: NextRequest) {
  const expected = process.env.SETUP_KEY;
  if (!expected) return NextResponse.json({ error: "Not found." }, { status: 404, headers: NO_STORE });

  const body = (await req.json().catch(() => null)) as { key?: unknown } | null;
  const key = typeof body?.key === "string" ? body.key : "";
  if (!sameKey(key, expected)) {
    await new Promise((r) => setTimeout(r, 2000));
    return NextResponse.json({ error: WRONG_KEY, fieldErrors: { key: WRONG_KEY } }, { status: 403, headers: NO_STORE });
  }

  const logins = { bot: newQaLogin(QA_BOT_EMAIL), viewer: newQaLogin(QA_VIEWER_EMAIL) };
  try {
    if (isSupabaseEnabled()) await seedSupabase(client(), logins);
    else seedMemory(memDb(), logins);
  } catch (err) {
    // The message names the step and the Postgres error, never a password or key.
    console.error("[setup] Could not create the QA test data:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "The test data could not be created. The server log has the reason." }, { status: 500, headers: NO_STORE });
  }
  return NextResponse.json(logins, { headers: NO_STORE });
}
