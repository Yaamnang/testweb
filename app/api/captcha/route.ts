import { connection, NextResponse } from "next/server";
import { captchaEnabled, newCaptcha } from "@/lib/server/captcha";
import { jsonError } from "@/lib/server/http";

/** A fresh CAPTCHA challenge, for the forms to swap in after a wrong answer. */
export async function GET() {
  await connection(); // evaluate per request, never prerender
  if (!captchaEnabled()) return jsonError(404, "Not found.");
  return NextResponse.json(newCaptcha(), { headers: { "cache-control": "no-store" } });
}
