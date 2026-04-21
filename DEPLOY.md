# Deploying to Vercel

Everything the site needs — contact form, admin panel, newsletter — runs on Vercel. No Formspree, no Supabase, no external service accounts. Storage is provided by the **Upstash for Redis** integration from the Vercel Marketplace (one-click, auto-configured).

## TL;DR

1. Import the GitHub repo into Vercel — pick the `site/` directory as the root.
2. In **Storage** → **Create Database** → add **Upstash for Redis** (free tier).
3. In **Settings → Environment Variables**, set `ADMIN_USER`, `ADMIN_PASS`, `SESSION_SECRET`.
4. Click **Deploy**.

The first deploy creates your production URL (e.g. `knowledgeias.vercel.app`). Connect your domain `knowledgeias.in` from **Settings → Domains** — Vercel gives you the DNS records to paste into Cloudflare.

---

## Step-by-step

### 1 · Import into Vercel

1. Go to [vercel.com/new](https://vercel.com/new).
2. Sign in with GitHub and select **Jhalakdev/knowledgeias**.
3. **Important — set the Root Directory to `site`** (the Astro project lives in that subfolder, not at the repo root).
4. Framework Preset → Astro (auto-detected once Root is set).
5. Don't click Deploy yet — we'll add env vars and storage first.

### 2 · Add Upstash Redis (storage for enquiries & newsletter)

1. In your Vercel project → **Storage** tab → **Create Database**.
2. Pick **Upstash for Redis** from the Marketplace (free tier: 256 MB, 10K commands/day — plenty for a coaching site).
3. Follow the wizard; accept the defaults. It installs and links automatically to your project.
4. When prompted for environment variables, accept them all — you'll see `KV_REST_API_URL` and `KV_REST_API_TOKEN` added to your project.

> **Why Upstash Redis:** it's on the Vercel Marketplace, billed through Vercel, no separate signup. The site auto-detects these env vars and switches from local JSON files to Redis in production.

### 3 · Set the admin credentials and session secret

In **Settings → Environment Variables**, add:

| Name | Value | Environments |
|---|---|---|
| `ADMIN_USER` | pick a username (e.g. `admin` or `ajay`) | Production, Preview, Development |
| `ADMIN_PASS` | a strong password — anyone with this can read submissions | Production, Preview, Development |
| `SESSION_SECRET` | run this once and paste the output: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` | Production, Preview, Development |

> **Security note:** don't commit these to git. Vercel encrypts them at rest.

### 4 · Deploy

Click **Deploy**. The first build takes ~1-2 minutes. When it's done:

- **Public site** → `https://knowledgeias.vercel.app/` (or your project domain)
- **Admin** → `https://knowledgeias.vercel.app/admin/login`
- Sign in with the `ADMIN_USER` / `ADMIN_PASS` you set above.

### 5 · Connect `knowledgeias.in` (Cloudflare)

1. Vercel → **Settings → Domains** → Add `knowledgeias.in` and `www.knowledgeias.in`.
2. Vercel gives you two records (A for apex, CNAME for www). Copy them.
3. Cloudflare DNS → add those records. **Important:** set the proxy status (orange cloud) to **DNS only** (grey cloud) for these records — Vercel needs to handle TLS directly.
4. Cloudflare → SSL/TLS → set to **Full (strict)**.
5. Back in Vercel, the domain turns green within a few minutes once DNS propagates.

---

## Testing the deploy

After the first deploy, smoke-test everything:

- `/contact` → submit a test enquiry → should show success message
- `/admin/login` → sign in → the test enquiry appears
- Footer → subscribe with a test email → should see "Thank you" state
- `/admin?tab=newsletter` → the test email appears there
- `/gallery` → click any photo → lightbox opens with arrow-key nav
- `/` on mobile → nav hamburger works

---

## Local development

From the repo root:

```bash
cd site
cp .env.example .env.local   # optional; defaults work fine
npm install
npm run dev                  # http://localhost:4321
```

When no `KV_REST_API_URL` is set, the site automatically uses `site/data/*.json` for storage — so you can test everything offline. The admin panel shows a small **"Local file"** badge in dev and **"Redis"** in production so you always know which backend is active.

---

## Updating the site

Push to `main` → Vercel auto-deploys. Preview deploys are created for any other branch or PR.

```bash
git add .
git commit -m "your change"
git push origin main
```

---

## Changing admin password

**Settings → Environment Variables →** edit `ADMIN_PASS` → click **Redeploy** (or push any commit). Old sessions stay valid until they expire (7 days); rotate `SESSION_SECRET` too if you want to force every device to sign in again.

---

## Exporting subscribers

**Admin → Newsletter tab → Export CSV** downloads a `.csv` of every subscriber with timestamps. Import into Mailchimp, MailerLite, or any email tool when you're ready to send a campaign.

---

## What's NOT external

✅ All storage on Upstash Redis (via Vercel Marketplace)
✅ All rendering on Vercel serverless functions
✅ All form submissions go to your own `/api/*` routes
✅ Admin login is local HMAC cookies — no OAuth provider

The **only** third-party calls from the user's browser are:
- Google Fonts (Fraunces + Inter)
- Unsplash images on the gallery (placeholders — replace with your own photos in `/public/gallery/` to drop this too)

Neither sends user data anywhere.
