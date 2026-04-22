import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import vercel from '@astrojs/vercel';

export default defineConfig({
  site: 'https://knowledgeias.in',
  output: 'server',
  adapter: vercel({
    webAnalytics: { enabled: false },
    maxDuration: 30,
  }),
  security: {
    // Disabled because Vercel's edge routing can strip/rewrite the Origin
    // header, causing Astro to wrongly reject legitimate same-site POSTs.
    // Admin routes stay protected by password + HMAC-signed httpOnly
    // session cookies set/read on the server.
    checkOrigin: false,
  },
  vite: {
    plugins: [tailwindcss()],
  },
  server: {
    host: true,
    port: 4321,
  },
});
