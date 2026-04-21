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
  vite: {
    plugins: [tailwindcss()],
  },
  server: {
    host: true,
    port: 4321,
  },
});
