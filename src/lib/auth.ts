import { createHmac, timingSafeEqual } from "node:crypto";

const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASS = process.env.ADMIN_PASS || "knowledgeias2026";
const SECRET = process.env.SESSION_SECRET || "dev-only-INSECURE-change-in-production";

if (!process.env.SESSION_SECRET) {
  // eslint-disable-next-line no-console
  console.warn("[auth] SESSION_SECRET is not set — using insecure dev default. Set it in .env before deploying.");
}

export const SESSION_COOKIE = "kias_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function equalStr(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function verifyCredentials(user: string, pass: string): boolean {
  return equalStr(user, ADMIN_USER) && equalStr(pass, ADMIN_PASS);
}

export function signSession(user: string): string {
  const exp = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE;
  const payload = `${user}.${exp}`;
  const sig = createHmac("sha256", SECRET).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifySession(token?: string | null): { user: string } | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [user, expStr, sig] = parts;
  const payload = `${user}.${expStr}`;
  const expected = createHmac("sha256", SECRET).update(payload).digest("base64url");
  if (!equalStr(sig, expected)) return null;
  const exp = Number.parseInt(expStr, 10);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return null;
  return { user };
}
