import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../../supabase/database.types.ts';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY in the repo-root .env');
}

// One shared client. It keeps the session in the browser and picks it up from the
// confirmation link when a student comes back from their email.
export const supabase = createClient<Database>(url, key);
