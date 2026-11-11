import { NextResponse } from "next/server";

/**
 * The /setup page exists only when SETUP_KEY is set. Checked here, before the
 * page renders, so the answer is a real 404 and the switch needs no rebuild.
 * Its API checks the same thing itself (app/api/setup/route.ts).
 */
export function proxy() {
  if (!process.env.SETUP_KEY) return new NextResponse("Not found", { status: 404 });
  return NextResponse.next();
}

export const config = { matcher: "/setup" };
