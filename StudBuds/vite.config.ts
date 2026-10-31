import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // Keys live in the repo-root .env, shared with the Supabase setup. Only VITE_ ones reach the browser.
  envDir: '..',
  plugins: [
    tailwindcss(),
  ],
})