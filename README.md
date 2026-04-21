# Knowledge IAS Academy — Official Website

The marketing site for **Knowledge IAS Academy**, a premier UPSC coaching institute led by Mr. Ajay Sah. Home to our flagship programme **FOCUS SCHOOL** — built for school students aspiring to the Civil Services.

Live domain: [knowledgeias.in](https://knowledgeias.in)

## Tech

- **Astro 5** — static site generator, zero client-side JS by default
- **Tailwind CSS v4** — design tokens for the black / amber / cream palette pulled from the logo
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
| `/gallery` | Photo gallery |
| `/contact` | Contact form + address |

## Local development

```bash
cd site
npm install
npm run dev      # http://localhost:4321
npm run build    # static output in site/dist/
npm run preview  # preview production build
```

## Deployment

Deploy the `site/` directory to any static host (Vercel, Netlify, Cloudflare Pages). The build output is plain HTML/CSS — no server needed.

## Contact form

The form on `/contact` currently logs submissions to the browser console only. To receive real submissions, wire the form handler in [`site/src/pages/contact.astro`](site/src/pages/contact.astro) to one of:

- **Formspree** — drop-in endpoint, free tier
- **Resend** — email delivery via a Vercel/Netlify serverless function
- **A custom API route** — Astro supports server endpoints when switched from static to hybrid/server output

---

Website created by [webaccuracy.com](https://webaccuracy.com).
