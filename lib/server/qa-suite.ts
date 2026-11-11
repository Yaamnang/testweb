import "server-only";

/**
 * QA_SUITE=on: this deployment is a target for the full test suite run from
 * the QA console. /api/health then says so (standIn and signInPath), and
 * CAPTCHA and EMAIL_CODE are treated as off, because the suite cannot pass
 * them. Read at request time, so changing it needs no rebuild.
 */
export function qaSuiteOn(): boolean {
  return (process.env.QA_SUITE ?? "").trim().toLowerCase() === "on";
}
