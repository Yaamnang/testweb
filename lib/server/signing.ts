import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Signing for stateless tokens (CAPTCHA answers, email codes, the pending
 * sign-up cookie). Nothing is stored, so any server instance can check a
 * token another one issued, as long as they share the key.
 *
 * Key, in order: CAPTCHA_SECRET; else a key derived from SUPABASE_SECRET_KEY
 * (never the key itself); else a random key for this process, which is fine
 * for the in-memory store because that is a single process anyway. The
 * random key lives on globalThis: route handlers and pages are separate
 * bundles, and a plain module variable would give each its own key.
 */

const globalForKey = globalThis as unknown as { __fakeClientSigningKey?: Buffer };

export function signingKey(): Buffer {
  const secret = process.env.CAPTCHA_SECRET;
  if (secret) return createHash("sha256").update(`fake-client:${secret}`).digest();
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;
  if (supabaseKey) return createHash("sha256").update(`fake-client-signing:${supabaseKey}`).digest();
  return (globalForKey.__fakeClientSigningKey ??= randomBytes(32));
}

export function sign(data: string, key: Buffer = signingKey()): string {
  return createHmac("sha256", key).update(data).digest("base64url");
}

/** Constant-time string comparison. */
export function sameText(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
