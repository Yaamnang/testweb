/**
 * Reset and seed the Supabase database for the stand-in platform.
 *
 *   npm run db:seed
 *
 * Wipes every row (eclypse_reset() in db/schema.sql), then adds the same
 * fictional tenants, users and documents as the in-memory store, with the
 * same code (seedSupabase in lib/server/seed.ts). Tenant ids are fixed on
 * purpose so the two backends agree on who owns what.
 *
 * The QA bot and viewer are added only when SEED_QA_* are set. Without a
 * terminal, the /setup page does the same without wiping anything.
 *
 * Client credentials are random and are thrown away as soon as the row is
 * written: nobody, the QA bot included, can sign in as a client.
 */
import { createClient } from "@supabase/supabase-js";
import { qaLoginsFromEnv, seedSupabase } from "../lib/server/seed";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL and SUPABASE_SECRET_KEY must be set. Put them in .env.local.");
  process.exit(2);
}
const sb = createClient(url, key, { auth: { persistSession: false } });

async function main() {
  console.log("• Wiping every eclypse_ table");
  const { error } = await sb.rpc("eclypse_reset");
  if (error) throw new Error(`reset: ${error.message}`);

  const logins = qaLoginsFromEnv();
  console.log("• Tenants, client users and documents");
  await seedSupabase(sb, logins);
  console.log(logins.bot ? "• QA bot seeded" : "• QA bot skipped (SEED_QA_PASSWORD / SEED_QA_TOTP_SECRET not set)");
  if (logins.viewer) console.log("• QA viewer seeded");

  console.log("\nSeeded: 4 tenants, 3 documents, and the users above.");
}

main().catch((err: unknown) => {
  console.error(`Seed failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
