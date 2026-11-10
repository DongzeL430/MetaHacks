// Browser-safe keys from the repo-root .env (see .env.example).
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string;
  readonly VITE_TURNSTILE_SITE_KEY: string;
  // Optional: the view-only demo login behind the "Try the demo" button (scripts/demo-account.mjs)
  readonly VITE_DEMO_EMAIL?: string;
  readonly VITE_DEMO_PASSWORD?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
