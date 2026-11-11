import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { hashPassword } from "./password";
import type { MemDb } from "./store";
import { CANARY_DOC_ID, QA_TENANT_SLUG, type Role } from "./store-types";
import { randomBase32Secret } from "./totp";

/**
 * The test data the suite expects, and one function per store that makes it
 * exist. Used in three places:
 *   - the in-memory store when it starts (store.ts), with the QA logins from SEED_QA_*
 *   - npm run db:seed (scripts/seed-supabase.ts), after wiping the tables
 *   - the /setup page (app/api/setup), with freshly generated QA logins
 *
 * Both functions are idempotent and only touch QA data: the fixed tenants
 * below, their fictional client users and documents, and the QA bot and
 * viewer. Other accounts, organizations and documents are left alone.
 * Everything here is fictional.
 */

export const QA_TENANT_ID = "t_qa";
export const QA_BOT_EMAIL = "qa-bot@synthetic.eclypse.test";
export const QA_VIEWER_EMAIL = "qa-viewer@synthetic.eclypse.test";

const TENANTS = [
  { id: "t_acme", slug: "acme-pharma", name: "Acme Pharma" },
  { id: "t_northwind", slug: "northwind-health", name: "Northwind Health" },
  { id: QA_TENANT_ID, slug: QA_TENANT_SLUG, name: "QA Synthetic" },
  { id: "t_qa_canary", slug: "qa-canary", name: "QA Canary" },
];

/** One user per client tenant, so their data has an owner. Their credentials are random and thrown away. */
const CLIENT_USERS = [
  { tenantId: "t_acme", email: "j.doe@acme-pharma.example" },
  { tenantId: "t_northwind", email: "r.lee@northwind-health.example" },
  { tenantId: "t_qa_canary", email: "qa-canary@synthetic.eclypse.test" },
];

const HEADER = ["subject_id", "arm", "age", "adverse_event", "severity"];
const UPLOADED_AT = Date.UTC(2026, 9, 1, 9, 0, 0);

const DOCUMENTS = [
  {
    id: "doc_acme_0001",
    tenantId: "t_acme",
    owner: "j.doe@acme-pharma.example",
    name: "PH2-ONC-114 interim AE listing.csv",
    rows: [
      ["ONC-001", "treatment", "61", "neutropenia", "severe"],
      ["ONC-002", "placebo", "58", "fatigue", "mild"],
    ],
  },
  {
    id: "doc_nw_0001",
    tenantId: "t_northwind",
    owner: "r.lee@northwind-health.example",
    name: "NW-CARD-07 safety listing.csv",
    rows: [["CARD-01", "treatment", "70", "dizziness", "moderate"]],
  },
  // Canary: lives in a second synthetic tenant the QA team owns. If the QA
  // bot ever sees this marker, tenant isolation is broken.
  {
    id: CANARY_DOC_ID,
    tenantId: "t_qa_canary",
    owner: "qa-canary@synthetic.eclypse.test",
    name: "QA-CANARY-7f3a2c do-not-display.csv",
    rows: [["QA-CANARY-7f3a2c", "placebo", "40", "canary", "mild"]],
  },
];

export type QaLogin = { email: string; password: string; totpSecret: string };
/** The QA accounts to (re)create. A missing one is left as it is. */
export type QaLogins = { bot?: QaLogin; viewer?: QaLogin };

const QA_ACCOUNTS = [
  { key: "bot", role: "admin", displayName: "QA Bot" },
  { key: "viewer", role: "viewer", displayName: "QA Viewer" },
] as const satisfies ReadonlyArray<{ key: keyof QaLogins; role: Role; displayName: string }>;

/** A fresh login: random password and authenticator key. */
export function newQaLogin(email: string): QaLogin {
  return { email, password: randomBytes(18).toString("base64url"), totpSecret: randomBase32Secret() };
}

/** The QA logins from SEED_QA_* (CI, npm run qa). No default credentials exist. */
export function qaLoginsFromEnv(env = process.env): QaLogins {
  const logins: QaLogins = {};
  if (env.SEED_QA_PASSWORD && env.SEED_QA_TOTP_SECRET) {
    logins.bot = { email: env.SEED_QA_EMAIL || QA_BOT_EMAIL, password: env.SEED_QA_PASSWORD, totpSecret: env.SEED_QA_TOTP_SECRET };
  }
  if (env.SEED_QA_VIEWER_PASSWORD && env.SEED_QA_VIEWER_TOTP_SECRET) {
    logins.viewer = {
      email: env.SEED_QA_VIEWER_EMAIL || QA_VIEWER_EMAIL,
      password: env.SEED_QA_VIEWER_PASSWORD,
      totpSecret: env.SEED_QA_VIEWER_TOTP_SECRET,
    };
  }
  return logins;
}

const newUserId = () => `u_${randomUUID().slice(0, 8)}`;

// ---------------------------------------------------------------------------
// In-memory store
// ---------------------------------------------------------------------------

export function seedMemory(db: MemDb, logins: QaLogins): void {
  const byEmail = (email: string) => [...db.users.values()].find((u) => u.email.toLowerCase() === email.toLowerCase());
  const ensureMember = (userId: string, tenantId: string, role: Role) => {
    if (!db.memberships.some((m) => m.userId === userId && m.tenantId === tenantId)) db.memberships.push({ userId, tenantId, role });
  };

  for (const t of TENANTS) db.tenants.set(t.id, { ...t });

  for (const c of CLIENT_USERS) {
    let user = byEmail(c.email);
    if (!user) {
      user = {
        id: newUserId(),
        email: c.email,
        passwordHash: hashPassword(randomUUID()),
        totpSecret: randomBase32Secret(),
        totpConfirmed: true,
        lastTotpStep: -1,
        displayName: c.email.split("@")[0],
        notificationEmail: c.email,
      };
      db.users.set(user.id, user);
    }
    ensureMember(user.id, c.tenantId, "admin");
  }

  for (const d of DOCUMENTS) {
    db.documents.set(d.id, {
      id: d.id,
      tenantId: d.tenantId,
      name: d.name,
      sizeBytes: d.rows.length * 40,
      table: { header: HEADER, rows: d.rows },
      uploadedAt: UPLOADED_AT,
      uploadedBy: byEmail(d.owner)!.id,
    });
  }

  // Whatever earlier runs left in the QA organization.
  for (const map of [db.documents, db.jobs, db.invites]) {
    for (const [id, row] of map) if (row.tenantId === QA_TENANT_ID) map.delete(id);
  }

  for (const account of QA_ACCOUNTS) {
    const login = logins[account.key];
    if (!login) continue;
    const existing = byEmail(login.email);
    const user = {
      id: existing?.id ?? newUserId(),
      email: login.email,
      passwordHash: hashPassword(login.password),
      totpSecret: login.totpSecret,
      totpConfirmed: true,
      lastTotpStep: -1,
      displayName: account.displayName,
      notificationEmail: login.email,
    };
    db.users.set(user.id, user);
    // Member of the QA organization only, and signed out everywhere.
    db.memberships = db.memberships.filter((m) => m.userId !== user.id);
    db.memberships.push({ userId: user.id, tenantId: QA_TENANT_ID, role: account.role });
    for (const [id, s] of db.sessions) if (s.userId === user.id) db.sessions.delete(id);
    for (const [id, c] of db.challenges) if (c.userId === user.id) db.challenges.delete(id);
  }
}

// ---------------------------------------------------------------------------
// Supabase store. Same steps as seedMemory, as queries.
// ---------------------------------------------------------------------------

/** Throws with the Postgres message only, so no credential can reach a log. */
function check(step: string, error: { message: string } | null) {
  if (error) throw new Error(`${step}: ${error.message}`);
}

export async function seedSupabase(sb: SupabaseClient, logins: QaLogins): Promise<void> {
  const idOf = async (email: string): Promise<string | undefined> => {
    const { data, error } = await sb.from("eclypse_users").select("id").eq("email", email).maybeSingle();
    check(`find ${email}`, error);
    return (data as { id: string } | null)?.id;
  };

  check("tenants", (await sb.from("eclypse_tenants").upsert(TENANTS, { onConflict: "id" })).error);

  const owners = new Map<string, string>();
  for (const c of CLIENT_USERS) {
    let id = await idOf(c.email);
    if (!id) {
      id = newUserId();
      const row = {
        id,
        email: c.email,
        password_hash: hashPassword(randomUUID()),
        totp_secret: randomBase32Secret(),
        totp_confirmed: true,
        last_totp_step: -1,
        display_name: c.email.split("@")[0],
        notification_email: c.email,
      };
      check(`user ${c.email}`, (await sb.from("eclypse_users").insert(row)).error);
    }
    const member = { user_id: id, tenant_id: c.tenantId, role: "admin" };
    check(`membership ${c.email}`, (await sb.from("eclypse_memberships").upsert(member, { onConflict: "user_id,tenant_id", ignoreDuplicates: true })).error);
    owners.set(c.email, id);
  }

  const docs = DOCUMENTS.map((d) => ({
    id: d.id,
    tenant_id: d.tenantId,
    name: d.name,
    size_bytes: d.rows.length * 40,
    table_json: { header: HEADER, rows: d.rows },
    uploaded_at: UPLOADED_AT,
    uploaded_by: owners.get(d.owner)!,
  }));
  check("documents", (await sb.from("eclypse_documents").upsert(docs, { onConflict: "id" })).error);

  // Whatever earlier runs left in the QA organization.
  for (const table of ["eclypse_jobs", "eclypse_documents", "eclypse_invites"]) {
    check(`clear ${table}`, (await sb.from(table).delete().eq("tenant_id", QA_TENANT_ID)).error);
  }

  for (const account of QA_ACCOUNTS) {
    const login = logins[account.key];
    if (!login) continue;
    const fields = {
      email: login.email,
      password_hash: hashPassword(login.password),
      totp_secret: login.totpSecret,
      totp_confirmed: true,
      last_totp_step: -1,
      display_name: account.displayName,
      notification_email: login.email,
    };
    let id = await idOf(login.email);
    if (id) check(`update ${login.email}`, (await sb.from("eclypse_users").update(fields).eq("id", id)).error);
    else {
      id = newUserId();
      check(`user ${login.email}`, (await sb.from("eclypse_users").insert({ id, ...fields })).error);
    }
    // Member of the QA organization only, and signed out everywhere.
    for (const table of ["eclypse_memberships", "eclypse_sessions", "eclypse_challenges"]) {
      check(`clear ${table} for ${login.email}`, (await sb.from(table).delete().eq("user_id", id)).error);
    }
    const member = { user_id: id, tenant_id: QA_TENANT_ID, role: account.role };
    check(`membership ${login.email}`, (await sb.from("eclypse_memberships").insert(member)).error);
  }
}
