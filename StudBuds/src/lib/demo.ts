import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase.ts';

/**
 * The view-only demo login (supabase/migrations/*_demo_viewer.sql). Its app_metadata.demo_of names
 * the student it shows, and the database answers every request as that student while refusing
 * any change. The app does the same: everywhere it needs "my id", it uses actingId().
 */
export function demoOf(user: User | null | undefined): string | null {
  const id = user?.app_metadata?.demo_of;
  return typeof id === 'string' && id ? id : null;
}

/** The student this session acts as: the shown student for a demo login, yourself otherwise */
export function actingId(user: User | null | undefined): string | null {
  return user ? (demoOf(user) ?? user.id) : null;
}

/** The demo login's details, when this build offers a "Try the demo" button (both set in .env) */
export const DEMO_LOGIN =
  import.meta.env.VITE_DEMO_EMAIL && import.meta.env.VITE_DEMO_PASSWORD
    ? { email: import.meta.env.VITE_DEMO_EMAIL, password: import.meta.env.VITE_DEMO_PASSWORD }
    : null;

export const DEMO_NOTICE = 'View-only demo: you’re seeing a real student’s account, and nothing you do is saved.';

/** Whether this browser is signed in with the demo login (false until the saved session is read) */
export function useIsDemo(): boolean {
  const [demo, setDemo] = useState(false);
  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setDemo(!!demoOf(data.session?.user)));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setDemo(!!demoOf(session?.user)));
    return () => data.subscription.unsubscribe();
  }, []);
  return demo;
}

/**
 * Logs out. A demo login is shared by everyone trying the demo, so it only logs out this browser;
 * a normal log out (scope "global") would sign every other visitor out too.
 */
export async function logOut(): Promise<void> {
  const { data } = await supabase.auth.getSession();
  await supabase.auth.signOut(demoOf(data.session?.user) ? { scope: 'local' } : undefined);
}
