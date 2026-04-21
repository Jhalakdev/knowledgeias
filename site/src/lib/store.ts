import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

export type Submission = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role?: string;
  programme?: string;
  message?: string;
  ip?: string;
  userAgent?: string;
  createdAt: string;
  readAt?: string;
};

const DB_PATH = resolve(process.env.DB_PATH || "./data/submissions.json");

function ensureFile() {
  const dir = dirname(DB_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  if (!existsSync(DB_PATH)) writeFileSync(DB_PATH, "[]", "utf8");
}

function readAll(): Submission[] {
  ensureFile();
  try {
    const raw = readFileSync(DB_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(subs: Submission[]) {
  ensureFile();
  writeFileSync(DB_PATH, JSON.stringify(subs, null, 2), "utf8");
}

export function listSubmissions(): Submission[] {
  return readAll().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function countUnread(): number {
  return readAll().filter((s) => !s.readAt).length;
}

export function addSubmission(input: Omit<Submission, "id" | "createdAt" | "readAt">): Submission {
  const sub: Submission = {
    id: (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`),
    createdAt: new Date().toISOString(),
    ...input,
  };
  const all = readAll();
  all.push(sub);
  writeAll(all);
  return sub;
}

export function markRead(id: string) {
  const all = readAll();
  const idx = all.findIndex((s) => s.id === id);
  if (idx === -1) return false;
  if (!all[idx].readAt) {
    all[idx].readAt = new Date().toISOString();
    writeAll(all);
  }
  return true;
}

export function markAllRead() {
  const now = new Date().toISOString();
  const all = readAll();
  let changed = false;
  for (const s of all) {
    if (!s.readAt) {
      s.readAt = now;
      changed = true;
    }
  }
  if (changed) writeAll(all);
}

export function deleteSubmission(id: string): boolean {
  const all = readAll();
  const next = all.filter((s) => s.id !== id);
  if (next.length === all.length) return false;
  writeAll(next);
  return true;
}
