# Knowledge IAS Academy — Official Website

The marketing site for **Knowledge IAS Academy**, a premier online UPSC coaching academy led by Mr. Ajay Sah. Home to our flagship programme **FOCUS SCHOOL** — built for school students aspiring to the Civil Services.

Live domain: [knowledgeias.in](https://knowledgeias.in)

## Tech

- **Astro 5** (server output) — zero client-side JS on most pages, serverless functions on Vercel
- **Tailwind CSS v4** — design tokens for the black / amber / cream palette pulled from the logo
- **Upstash Redis** (via Vercel Marketplace) — persistent storage for contact enquiries and newsletter subscribers; falls back to local JSON files in dev
- **Google Fonts** — Fraunces (serif headings) + Inter (body)

## Pages

| Path | Purpose |
|------|---------|
| `/` | Home — overview + Focus School highlight |
| `/about` | About Knowledge IAS Academy |
| `/upsc` | About UPSC & Civil Services Examination |
| `/focus-school` | Flagship programme with full curriculum |
| `/directors-message` | Message from Director Mr. Ajay Sah |
| `/messages` | Testimonials from serving civil servants |
| `/gallery` | Photo gallery with lightbox |
| `/contact` | Contact form + channels |
| `/admin` | Private dashboard (login required) — enquiries + newsletter subscribers |

## Local development

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # production build
npm run preview  # preview production build
```

## Deployment

See [DEPLOY.md](DEPLOY.md) for the Vercel setup — import repo, add the Upstash Redis integration, set three env vars, click Deploy.

---

Website created by [webaccuracy.com](https://webaccuracy.com).
