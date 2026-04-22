import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createClient, type RedisClientType } from "redis";

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

function makeRedisBackend(url: string): StoreBackend {
  // Reused across invocations in the same serverless instance (warm starts).
  let clientPromise: Promise<RedisClientType> | null = null;

  async function getClient(): Promise<RedisClientType> {
    if (clientPromise) {
      const existing = await clientPromise;
      if (existing.isReady) return existing;
      clientPromise = null;
    }
    clientPromise = (async () => {
      const c = createClient({ url }) as RedisClientType;
      c.on("error", (err) => console.error("[redis] client error:", err));
      await c.connect();
      return c;
    })();
    return clientPromise;
  }

  const K = {
    sub: (id: string) => `kias:sub:${id}`,
    subIndex: "kias:subs:idx",
    subUnread: "kias:subs:unread",
    nl: (id: string) => `kias:nl:${id}`,
    nlIndex: "kias:nl:idx",
    nlEmail: (email: string) => `kias:nl:email:${email.toLowerCase()}`,
  };

  async function mgetJson<T>(r: RedisClientType, keys: string[]): Promise<T[]> {
    if (keys.length === 0) return [];
    const values = await r.mGet(keys);
    return values
      .map((v) => {
        if (!v) return null;
        try { return JSON.parse(v) as T; } catch { return null; }
      })
      .filter((v): v is T => v !== null);
  }

  return {
    async addSubmission(input) {
      const sub: Submission = { id: makeId(), createdAt: new Date().toISOString(), ...input };
      const r = await getClient();
      const score = Date.parse(sub.createdAt);
      await Promise.all([
        r.set(K.sub(sub.id), JSON.stringify(sub)),
        r.zAdd(K.subIndex, { score, value: sub.id }),
        r.sAdd(K.subUnread, sub.id),
      ]);
      return sub;
    },
    async listSubmissions() {
      const r = await getClient();
      const ids = await r.zRange(K.subIndex, 0, -1, { REV: true });
      if (ids.length === 0) return [];
      return mgetJson<Submission>(r, ids.map(K.sub));
    },
    async countUnreadSubmissions() {
      const r = await getClient();
      return r.sCard(K.subUnread);
    },
    async markSubmissionRead(id) {
      const r = await getClient();
      const raw = await r.get(K.sub(id));
      if (!raw) return false;
      const sub = JSON.parse(raw) as Submission;
      if (sub.readAt) return true;
      sub.readAt = new Date().toISOString();
      await Promise.all([r.set(K.sub(id), JSON.stringify(sub)), r.sRem(K.subUnread, id)]);
      return true;
    },
    async markAllSubmissionsRead() {
      const r = await getClient();
      const unread = await r.sMembers(K.subUnread);
      if (unread.length === 0) return;
      const now = new Date().toISOString();
      const subs = await mgetJson<Submission>(r, unread.map(K.sub));
      await Promise.all(
        subs.map((s) => r.set(K.sub(s.id), JSON.stringify({ ...s, readAt: now })))
      );
      await r.del(K.subUnread);
    },
    async deleteSubmission(id) {
      const r = await getClient();
      const exists = await r.exists(K.sub(id));
      if (!exists) return false;
      await Promise.all([
        r.del(K.sub(id)),
        r.zRem(K.subIndex, id),
        r.sRem(K.subUnread, id),
      ]);
      return true;
    },

    async addSubscriber(email, ip) {
      const r = await getClient();
      const key = K.nlEmail(email);
      const existingId = await r.get(key);
      if (existingId) {
        const raw = await r.get(K.nl(existingId));
        if (raw) return { subscriber: JSON.parse(raw) as NewsletterSubscriber, alreadyExists: true };
      }
      const sub: NewsletterSubscriber = { id: makeId(), email, ip, createdAt: new Date().toISOString() };
      const score = Date.parse(sub.createdAt);
      await Promise.all([
        r.set(K.nl(sub.id), JSON.stringify(sub)),
        r.zAdd(K.nlIndex, { score, value: sub.id }),
        r.set(key, sub.id),
      ]);
      return { subscriber: sub, alreadyExists: false };
    },
    async listSubscribers() {
      const r = await getClient();
      const ids = await r.zRange(K.nlIndex, 0, -1, { REV: true });
      if (ids.length === 0) return [];
      return mgetJson<NewsletterSubscriber>(r, ids.map(K.nl));
    },
    async deleteSubscriber(id) {
      const r = await getClient();
      const raw = await r.get(K.nl(id));
      if (!raw) return false;
      const sub = JSON.parse(raw) as NewsletterSubscriber;
      await Promise.all([
        r.del(K.nl(id)),
        r.zRem(K.nlIndex, id),
        r.del(K.nlEmail(sub.email)),
      ]);
      return true;
    },
  };
}

/* ==================== Backend selection ==================== */

const redisUrl = process.env.REDIS_URL || process.env.KV_URL;

const backend: StoreBackend = redisUrl ? makeRedisBackend(redisUrl) : makeFileBackend();

if (!redisUrl && process.env.VERCEL) {
  console.warn(
    "[store] Running on Vercel without REDIS_URL. Submissions will fail. " +
    "Add a Redis database from the Storage tab in the Vercel dashboard."
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

export const storeMode: "redis" | "file" = redisUrl ? "redis" : "file";
