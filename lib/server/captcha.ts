import "server-only";
import { randomBytes, randomInt } from "node:crypto";
import { sameText, sign, signingKey } from "./signing";
import { qaSuiteOn } from "./qa-suite";

/**
 * A simple built-in CAPTCHA, switched on with CAPTCHA=on.
 *
 * Five digits drawn as strokes in an SVG (paths only, no text elements), each
 * slightly rotated and jittered, with a few noise lines. The answer is never
 * stored: the token carries the expiry and a nonce, signed together with the
 * answer, and the form sends it back. Any instance with the same key can
 * check it, so it works on Vercel.
 *
 * Limit: a solved token can be used again until it expires (five minutes).
 * Stopping that would need a store of used tokens.
 */

export const CAPTCHA_TTL_MS = 5 * 60_000;
export const CAPTCHA_LENGTH = 5;
export const CAPTCHA_WRONG = "That did not match, or it expired. Type the new characters.";

export type CaptchaChallenge = { svg: string; token: string };

/** Off whenever QA_SUITE=on, whatever CAPTCHA says. */
export function captchaEnabled(): boolean {
  return process.env.CAPTCHA === "on" && !qaSuiteOn();
}

export function newCaptcha(now = Date.now(), key = signingKey()): CaptchaChallenge {
  const answer = Array.from({ length: CAPTCHA_LENGTH }, () => randomInt(10)).join("");
  return { svg: drawDigits(answer), token: captchaToken(answer, now + CAPTCHA_TTL_MS, key) };
}

/** "<expiresAt>.<nonce>.<hmac>". Exported for tests. */
export function captchaToken(answer: string, expiresAt: number, key = signingKey()): string {
  const nonce = randomBytes(6).toString("base64url");
  return `${expiresAt}.${nonce}.${sign(`captcha:${answer}:${expiresAt}:${nonce}`, key)}`;
}

export function checkCaptcha(token: unknown, answer: unknown, now = Date.now(), key = signingKey()): boolean {
  if (typeof token !== "string" || typeof answer !== "string") return false;
  const [expiry, nonce, mac] = token.split(".");
  const expiresAt = Number(expiry);
  if (!nonce || !mac || !Number.isFinite(expiresAt) || expiresAt < now) return false;
  const given = answer.replace(/\s+/g, "");
  if (!new RegExp(`^\\d{${CAPTCHA_LENGTH}}$`).test(given)) return false;
  return sameText(mac, sign(`captcha:${given}:${expiresAt}:${nonce}`, key));
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

/** Each digit as strokes on a 10 x 16 grid. */
const STROKES: Record<string, number[][][]> = {
  "0": [[[0, 0], [10, 0], [10, 16], [0, 16], [0, 0]]],
  "1": [[[2, 4], [6, 0], [6, 16]]],
  "2": [[[0, 0], [10, 0], [10, 8], [0, 8], [0, 16], [10, 16]]],
  "3": [[[0, 0], [10, 0], [10, 16], [0, 16]], [[2, 8], [10, 8]]],
  "4": [[[0, 0], [0, 8], [10, 8]], [[10, 0], [10, 16]]],
  "5": [[[10, 0], [0, 0], [0, 8], [10, 8], [10, 16], [0, 16]]],
  "6": [[[10, 0], [0, 0], [0, 16], [10, 16], [10, 8], [0, 8]]],
  "7": [[[0, 0], [10, 0], [4, 16]]],
  "8": [[[0, 0], [10, 0], [10, 16], [0, 16], [0, 0]], [[0, 8], [10, 8]]],
  "9": [[[10, 8], [0, 8], [0, 0], [10, 0], [10, 16], [0, 16]]],
};

const WIDTH = 170;
const HEIGHT = 56;
const SCALE = 1.9;

/** A random number in [-spread, spread]. */
const wobble = (spread: number) => (randomInt(2001) / 1000 - 1) * spread;
const fmt = (n: number) => n.toFixed(1);

function drawDigits(answer: string): string {
  const paths: string[] = [];
  [...answer].forEach((digit, i) => {
    const angle = (wobble(14) * Math.PI) / 180;
    const cx = 22 + i * 31 + wobble(2);
    const cy = HEIGHT / 2 + wobble(3);
    for (const stroke of STROKES[digit]) {
      const points = stroke.map(([x, y]) => {
        // Centre the grid on (0, 0), jitter, scale, rotate, move into place.
        const px = (x - 5 + wobble(0.6)) * SCALE;
        const py = (y - 8 + wobble(0.6)) * SCALE;
        return [cx + px * Math.cos(angle) - py * Math.sin(angle), cy + px * Math.sin(angle) + py * Math.cos(angle)];
      });
      const d = points.map(([x, y], j) => `${j === 0 ? "M" : "L"}${fmt(x)} ${fmt(y)}`).join(" ");
      paths.push(`<path d="${d}" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`);
    }
  });
  const third = Math.floor(WIDTH / 3);
  for (let i = 0; i < 4; i++) {
    const d = `M${randomInt(third)} ${randomInt(HEIGHT)} Q${randomInt(WIDTH)} ${randomInt(HEIGHT)} ${WIDTH - randomInt(third)} ${randomInt(HEIGHT)}`;
    paths.push(`<path d="${d}" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.45"/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}" height="${HEIGHT}" aria-hidden="true">${paths.join("")}</svg>`;
}
