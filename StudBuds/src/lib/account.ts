import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase.ts';
import { actingId } from './demo.ts';

/** loading: not known yet. new: signed in, pre-survey not finished. onboarded: in the match pool. */
export type AccountStatus = 'loading' | 'signed-out' | 'new' | 'onboarded';

/** Who is signed in, and whether they've finished the pre-survey. Follows log in and log out. */
export function useAccount() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [status, setStatus] = useState<AccountStatus>('loading');

  useEffect(() => {
    let cancelled = false;

    const load = async (next: Session | null) => {
      setSession(next);
      if (!next) {
        setStatus('signed-out');
        return;
      }
      // Just signed in: don't let a guard act on the old "signed-out" while the profile loads
      setStatus((s) => (s === 'signed-out' ? 'loading' : s));
      const { data, error } = await supabase
        .from('profiles')
        .select('onboarding_status')
        .eq('id', actingId(next.user)!)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        // Couldn't read the profile (a connection blip): try again rather than guess "new",
        // which would send a finished student back into the pre-survey
        setTimeout(() => void load(next), 2000);
        return;
      }
      setStatus(data?.onboarding_status === 'onboarded' ? 'onboarded' : 'new');
    };

    // Fires right away with the saved session, then on every log in, log out and token refresh.
    // Supabase calls made inside this callback can deadlock, so the profile loads just after it.
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setTimeout(() => void load(next), 0);
    });
    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, []);

  return { session, status };
}
