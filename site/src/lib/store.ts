import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Redis } from "@upstash/redis";

/* ==================== Types ==================== */

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

export type NewsletterSubscriber = {
  id: string;
  email: string;
  ip?: string;
  createdAt: string;
};

type StoreBackend = {
  addSubmission(input: Omit<Submission, "id" | "createdAt" | "readAt">): Promise<Submission>;
  listSubmissions(): Promise<Submission[]>;
  countUnreadSubmissions(): Promise<number>;
  markSubmissionRead(id: string): Promise<boolean>;
  markAllSubmissionsRead(): Promise<void>;
  deleteSubmission(id: string): Promise<boolean>;

  addSubscriber(email: string, ip?: string): Promise<{ subscriber: NewsletterSubscriber; alreadyExists: boolean }>;
  listSubscribers(): Promise<NewsletterSubscriber[]>;
  deleteSubscriber(id: string): Promise<boolean>;
};

/* ==================== ID helper ==================== */

function makeId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/* ==================== File backend (local dev) ==================== */

function makeFileBackend(): StoreBackend {
  const DB_PATH = resolve(process.env.DB_PATH || "./data/submissions.json");
  const NL_PATH = resolve(process.env.NEWSLETTER_PATH || "./data/newsletter.json");

  function ensureFile(p: string) {
    const dir = dirname(p);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    if (!existsSync(p)) writeFileSync(p, "[]", "utf8");
  }

  function readAll<T>(p: string): T[] {
    ensureFile(p);
    try {
      const raw = readFileSync(p, "utf8");
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function writeAll<T>(p: string, items: T[]) {
    ensureFile(p);
    writeFileSync(p, JSON.stringify(items, null, 2), "utf8");
  }

  return {
    async addSubmission(input) {
      const sub: Submission = { id: makeId(), createdAt: new Date().toISOString(), ...input };
      const all = readAll<Submission>(DB_PATH);
      all.push(sub);
      writeAll(DB_PATH, all);
      return sub;
    },
    async listSubmissions() {
      return readAll<Submission>(DB_PATH).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    },
    async countUnreadSubmissions() {
      return readAll<Submission>(DB_PATH).filter((s) => !s.readAt).length;
    },
    async markSubmissionRead(id) {
      const all = readAll<Submission>(DB_PATH);
      const idx = all.findIndex((s) => s.id === id);
      if (idx === -1) return false;
      if (!all[idx].readAt) {
        all[idx].readAt = new Date().toISOString();
        writeAll(DB_PATH, all);
      }
      return true;
    },
    async markAllSubmissionsRead() {
      const now = new Date().toISOString();
      const all = readAll<Submission>(DB_PATH);
      let changed = false;
      for (const s of all) {
        if (!s.readAt) { s.readAt = now; changed = true; }
      }
      if (changed) writeAll(DB_PATH, all);
    },
    async deleteSubmission(id) {
      const all = readAll<Submission>(DB_PATH);
      const next = all.filter((s) => s.id !== id);
      if (next.length === all.length) return false;
      writeAll(DB_PATH, next);
      return true;
    },

    async addSubscriber(email, ip) {
      const all = readAll<NewsletterSubscriber>(NL_PATH);
      const existing = all.find((n) => n.email.toLowerCase() === email.toLowerCase());
      if (existing) return { subscriber: existing, alreadyExists: true };
      const sub: NewsletterSubscriber = { id: makeId(), email, ip, createdAt: new Date().toISOString() };
      all.push(sub);
      writeAll(NL_PATH, all);
      return { subscriber: sub, alreadyExists: false };
    },
    async listSubscribers() {
      return readAll<NewsletterSubscriber>(NL_PATH).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    },
    async deleteSubscriber(id) {
      const all = readAll<NewsletterSubscriber>(NL_PATH);
      const next = all.filter((s) => s.id !== id);
      if (next.length === all.length) return false;
      writeAll(NL_PATH, next);
      return true;
    },
  };
}

/* ==================== Redis backend (production on Vercel) ==================== */

function makeRedisBackend(): StoreBackend {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL!;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN!;
  const redis = new Redis({ url, token });

  const K = {
    sub: (id: string) => `kias:sub:${id}`,
    subIndex: "kias:subs:idx",
    subUnread: "kias:subs:unread",
    nl: (id: string) => `kias:nl:${id}`,
    nlIndex: "kias:nl:idx",
    nlEmail: (email: string) => `kias:nl:email:${email.toLowerCase()}`,
  };

  async function getMany<T>(ids: string[], keyFn: (id: string) => string): Promise<T[]> {
    if (ids.length === 0) return [];
    const keys = ids.map(keyFn);
    const results = (await redis.mget<(T | null)[]>(...keys)) ?? [];
    return results.filter((r): r is T => r !== null);
  }

  return {
    async addSubmission(input) {
      const sub: Submission = { id: makeId(), createdAt: new Date().toISOString(), ...input };
      const score = Date.parse(sub.createdAt);
      await Promise.all([
        redis.set(K.sub(sub.id), sub),
        redis.zadd(K.subIndex, { score, member: sub.id }),
        redis.sadd(K.subUnread, sub.id),
      ]);
      return sub;
    },
    async listSubmissions() {
      const ids = (await redis.zrange<string[]>(K.subIndex, 0, -1, { rev: true })) ?? [];
      return getMany<Submission>(ids, K.sub);
    },
    async countUnreadSubmissions() {
      return (await redis.scard(K.subUnread)) ?? 0;
    },
    async markSubmissionRead(id) {
      const sub = await redis.get<Submission>(K.sub(id));
      if (!sub) return false;
      if (sub.readAt) return true;
      sub.readAt = new Date().toISOString();
      await Promise.all([redis.set(K.sub(id), sub), redis.srem(K.subUnread, id)]);
      return true;
    },
    async markAllSubmissionsRead() {
      const unread = (await redis.smembers(K.subUnread)) ?? [];
      if (unread.length === 0) return;
      const now = new Date().toISOString();
      const subs = await getMany<Submission>(unread, K.sub);
      await Promise.all(subs.map((s) => redis.set(K.sub(s.id), { ...s, readAt: now })));
      await redis.del(K.subUnread);
    },
    async deleteSubmission(id) {
      const exists = await redis.exists(K.sub(id));
      if (!exists) return false;
      await Promise.all([
        redis.del(K.sub(id)),
        redis.zrem(K.subIndex, id),
        redis.srem(K.subUnread, id),
      ]);
      return true;
    },

    async addSubscriber(email, ip) {
      const key = K.nlEmail(email);
      const existingId = await redis.get<string>(key);
      if (existingId) {
        const existing = await redis.get<NewsletterSubscriber>(K.nl(existingId));
        if (existing) return { subscriber: existing, alreadyExists: true };
      }
      const sub: NewsletterSubscriber = { id: makeId(), email, ip, createdAt: new Date().toISOString() };
      const score = Date.parse(sub.createdAt);
      await Promise.all([
        redis.set(K.nl(sub.id), sub),
        redis.zadd(K.nlIndex, { score, member: sub.id }),
        redis.set(key, sub.id),
      ]);
      return { subscriber: sub, alreadyExists: false };
    },
    async listSubscribers() {
      const ids = (await redis.zrange<string[]>(K.nlIndex, 0, -1, { rev: true })) ?? [];
      return getMany<NewsletterSubscriber>(ids, K.nl);
    },
    async deleteSubscriber(id) {
      const sub = await redis.get<NewsletterSubscriber>(K.nl(id));
      if (!sub) return false;
      await Promise.all([
        redis.del(K.nl(id)),
        redis.zrem(K.nlIndex, id),
        redis.del(K.nlEmail(sub.email)),
      ]);
      return true;
    },
  };
}

/* ==================== Backend selection ==================== */

const hasRedis = Boolean(
  (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) ||
  (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
);

const backend: StoreBackend = hasRedis ? makeRedisBackend() : makeFileBackend();

if (!hasRedis && process.env.VERCEL) {
  console.warn(
    "[store] Running on Vercel without Upstash Redis env vars. Submissions will not persist. " +
    "Add an Upstash Redis / Vercel KV integration from the Vercel dashboard."
  );
}

export const {
  addSubmission,
  listSubmissions,
  countUnreadSubmissions,
  markSubmissionRead,
  markAllSubmissionsRead,
  deleteSubmission,
  addSubscriber,
  listSubscribers,
  deleteSubscriber,
} = backend;

export const storeMode: "redis" | "file" = hasRedis ? "redis" : "file";
