import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { createClient, type RedisClientType } from "redis";

export type GalleryImage = {
  id: string;
  url: string;          // public URL to display
  pathname?: string;    // blob pathname (for deletion in prod)
  filePath?: string;    // local path on disk (file backend only)
  caption: string;
  size: number;
  type: string;
  createdAt: string;
};

type GalleryBackend = {
  add(input: { buffer: Buffer; filename: string; type: string; caption: string }): Promise<GalleryImage>;
  addExternal(input: { url: string; caption: string }): Promise<GalleryImage>;
  list(): Promise<GalleryImage[]>;
  remove(id: string): Promise<boolean>;
  updateCaption(id: string, caption: string): Promise<boolean>;
  claimSeed(): Promise<boolean>;
};

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
]);

const DEFAULT_GALLERY: { url: string; caption: string }[] = [
  { caption: "Live online classroom session", url: "https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=1600&q=80" },
  { caption: "Webinar at IIT Delhi", url: "https://images.unsplash.com/photo-1427504494785-3a9ca7044f45?auto=format&fit=crop&w=1600&q=80" },
  { caption: "Study materials & notes", url: "https://images.unsplash.com/photo-1521587760476-6c12a4b040da?auto=format&fit=crop&w=1600&q=80" },
  { caption: "Guest session — serving IAS officer", url: "https://images.unsplash.com/photo-1515168833906-d2a3b82b302a?auto=format&fit=crop&w=1600&q=80" },
  { caption: "Mains answer-writing workshop", url: "https://images.unsplash.com/photo-1456406644174-8ddd4cd52a06?auto=format&fit=crop&w=1600&q=80" },
  { caption: "Orientation day — new batch", url: "https://images.unsplash.com/photo-1577896851231-70ef18881754?auto=format&fit=crop&w=1600&q=80" },
  { caption: "Weekly prelims test series", url: "https://images.unsplash.com/photo-1606326608606-aa0b62935f2b?auto=format&fit=crop&w=1600&q=80" },
  { caption: "Aspirants across India", url: "https://images.unsplash.com/photo-1498243691581-b145c3f54a5a?auto=format&fit=crop&w=1600&q=80" },
  { caption: "Director's interaction hour", url: "https://images.unsplash.com/photo-1544531585-9847b68c8c86?auto=format&fit=crop&w=1600&q=80" },
];

export function isAllowedImageType(type: string): boolean {
  return ALLOWED_MIME.has(type.toLowerCase());
}

function makeId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function safeFilename(name: string) {
  const base = name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").slice(0, 80);
  return base || "image";
}

function captionFromFilename(name: string) {
  return name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim();
}

/* ==================== File backend (local dev) ==================== */

function makeFileBackend(): GalleryBackend {
  const PUBLIC_DIR = resolve("./public/gallery");
  const META_PATH = resolve(process.env.GALLERY_META_PATH || "./data/gallery.json");
  const SEED_FLAG = resolve("./data/.gallery-seeded");

  function ensureDir(p: string) {
    if (!existsSync(p)) mkdirSync(p, { recursive: true });
  }
  function ensureFile(p: string) {
    ensureDir(dirname(p));
    if (!existsSync(p)) writeFileSync(p, "[]", "utf8");
  }

  function readMeta(): GalleryImage[] {
    ensureFile(META_PATH);
    try {
      const raw = readFileSync(META_PATH, "utf8");
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  function writeMeta(items: GalleryImage[]) {
    ensureFile(META_PATH);
    writeFileSync(META_PATH, JSON.stringify(items, null, 2), "utf8");
  }

  return {
    async add({ buffer, filename, type, caption }) {
      ensureDir(PUBLIC_DIR);
      const id = makeId();
      const ext = (extname(filename) || ".jpg").toLowerCase();
      const safeName = `${id}${ext}`;
      const filePath = resolve(PUBLIC_DIR, safeName);
      writeFileSync(filePath, buffer);

      const img: GalleryImage = {
        id,
        url: `/gallery/${safeName}`,
        filePath,
        caption: caption.trim() || captionFromFilename(filename),
        size: buffer.byteLength,
        type,
        createdAt: new Date().toISOString(),
      };
      const all = readMeta();
      all.push(img);
      writeMeta(all);
      return img;
    },

    async addExternal({ url, caption }) {
      const img: GalleryImage = {
        id: makeId(),
        url,
        caption: caption.trim() || "Photo",
        size: 0,
        type: "image/external",
        createdAt: new Date().toISOString(),
      };
      const all = readMeta();
      all.push(img);
      writeMeta(all);
      return img;
    },

    async list() {
      return readMeta().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    },

    async remove(id) {
      const all = readMeta();
      const idx = all.findIndex((i) => i.id === id);
      if (idx === -1) return false;
      const img = all[idx];
      try {
        if (img.filePath && existsSync(img.filePath)) unlinkSync(img.filePath);
      } catch (e) {
        console.error("[gallery/file] failed to delete file", e);
      }
      all.splice(idx, 1);
      writeMeta(all);
      return true;
    },

    async updateCaption(id, caption) {
      const all = readMeta();
      const idx = all.findIndex((i) => i.id === id);
      if (idx === -1) return false;
      all[idx].caption = caption.trim() || all[idx].caption;
      writeMeta(all);
      return true;
    },

    async claimSeed() {
      if (existsSync(SEED_FLAG)) return false;
      ensureDir(dirname(SEED_FLAG));
      writeFileSync(SEED_FLAG, "1", "utf8");
      return true;
    },
  };
}

/* ==================== Blob + Redis backend (production) ==================== */

function makeBlobBackend(redisUrl: string): GalleryBackend {
  let clientPromise: Promise<RedisClientType> | null = null;

  async function getClient(): Promise<RedisClientType> {
    if (clientPromise) {
      const existing = await clientPromise;
      if (existing.isReady) return existing;
      clientPromise = null;
    }
    clientPromise = (async () => {
      const c = createClient({ url: redisUrl }) as RedisClientType;
      c.on("error", (err) => console.error("[gallery/redis] client error:", err));
      await c.connect();
      return c;
    })();
    return clientPromise;
  }

  const K = {
    img: (id: string) => `kias:gal:${id}`,
    index: "kias:gal:idx",
    seeded: "kias:gal:seeded",
  };

  async function mgetJson(r: RedisClientType, keys: string[]): Promise<GalleryImage[]> {
    if (keys.length === 0) return [];
    const values = await r.mGet(keys);
    return values
      .map((v) => {
        if (!v) return null;
        try { return JSON.parse(v) as GalleryImage; } catch { return null; }
      })
      .filter((v): v is GalleryImage => v !== null);
  }

  return {
    async add({ buffer, filename, type, caption }) {
      const { put } = await import("@vercel/blob");
      const id = makeId();
      const ext = (extname(filename) || ".jpg").toLowerCase();
      const blobName = `gallery/${id}${ext}`;
      const blob = await put(blobName, buffer, {
        access: "public",
        contentType: type,
        addRandomSuffix: false,
      });

      const img: GalleryImage = {
        id,
        url: blob.url,
        pathname: blob.pathname,
        caption: caption.trim() || captionFromFilename(filename),
        size: buffer.byteLength,
        type,
        createdAt: new Date().toISOString(),
      };

      const r = await getClient();
      const score = Date.parse(img.createdAt);
      await Promise.all([
        r.set(K.img(img.id), JSON.stringify(img)),
        r.zAdd(K.index, { score, value: img.id }),
      ]);
      return img;
    },

    async addExternal({ url, caption }) {
      const img: GalleryImage = {
        id: makeId(),
        url,
        caption: caption.trim() || "Photo",
        size: 0,
        type: "image/external",
        createdAt: new Date().toISOString(),
      };
      const r = await getClient();
      const score = Date.parse(img.createdAt);
      await Promise.all([
        r.set(K.img(img.id), JSON.stringify(img)),
        r.zAdd(K.index, { score, value: img.id }),
      ]);
      return img;
    },

    async list() {
      const r = await getClient();
      const ids = await r.zRange(K.index, 0, -1, { REV: true });
      if (ids.length === 0) return [];
      return mgetJson(r, ids.map(K.img));
    },

    async remove(id) {
      const r = await getClient();
      const raw = await r.get(K.img(id));
      if (!raw) return false;
      const img = JSON.parse(raw) as GalleryImage;
      if (img.pathname) {
        try {
          const { del } = await import("@vercel/blob");
          await del(img.pathname);
        } catch (e) {
          console.error("[gallery/blob] failed to delete blob", e);
        }
      }
      await Promise.all([r.del(K.img(id)), r.zRem(K.index, id)]);
      return true;
    },

    async updateCaption(id, caption) {
      const r = await getClient();
      const raw = await r.get(K.img(id));
      if (!raw) return false;
      const img = JSON.parse(raw) as GalleryImage;
      img.caption = caption.trim() || img.caption;
      await r.set(K.img(id), JSON.stringify(img));
      return true;
    },

    async claimSeed() {
      const r = await getClient();
      const result = await r.set(K.seeded, "1", { NX: true });
      return result === "OK";
    },
  };
}

/* ==================== Backend selection ==================== */

const redisUrl = process.env.REDIS_URL || process.env.KV_URL;
const blobToken = process.env.BLOB_READ_WRITE_TOKEN;

// Prefer Redis when available — Blob is only required to upload new binaries.
// Without Blob, listing/seeding/captions/delete still work via Redis metadata.
const backend: GalleryBackend = redisUrl ? makeBlobBackend(redisUrl) : makeFileBackend();

if (process.env.VERCEL && !redisUrl) {
  console.warn(
    "[gallery] Running on Vercel without REDIS_URL. Gallery will not function. " +
    "Add Redis storage in the Vercel dashboard."
  );
}
if (process.env.VERCEL && !blobToken) {
  console.warn(
    "[gallery] BLOB_READ_WRITE_TOKEN is not set. Existing images will display, " +
    "but new uploads will fail. Enable Blob storage in the Vercel dashboard."
  );
}

export const galleryMode: "blob" | "file" = redisUrl ? "blob" : "file";
export const galleryUploadsEnabled = Boolean(blobToken) || !redisUrl;
export const addGalleryImage = backend.add;
export const deleteGalleryImage = backend.remove;
export const updateGalleryCaption = backend.updateCaption;

async function seedDefaultsIfNeeded() {
  let claimed = false;
  try {
    claimed = await backend.claimSeed();
  } catch (e) {
    console.error("[gallery] seed claim failed", e);
    return;
  }
  if (!claimed) return;
  try {
    const existing = await backend.list();
    if (existing.length > 0) return; // user already has images — leave them be
    for (const def of DEFAULT_GALLERY) {
      await backend.addExternal(def);
    }
    console.log(`[gallery] Seeded ${DEFAULT_GALLERY.length} default images`);
  } catch (e) {
    console.error("[gallery] seeding default images failed", e);
  }
}

export async function listGalleryImages(): Promise<GalleryImage[]> {
  try {
    await seedDefaultsIfNeeded();
    return await backend.list();
  } catch (e) {
    console.error("[gallery] list failed — returning empty", e);
    return [];
  }
}
