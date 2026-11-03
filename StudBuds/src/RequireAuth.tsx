import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Navigate } from 'react-router';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase.ts';

/** Shows its children only to a signed-in student. Everyone else goes to the log-in page. */
export default function RequireAuth({ children }: { children: ReactNode }) {
  // undefined until the saved session has been read
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  if (session === undefined) return null;
  return session ? children : <Navigate to="/h" replace />;
}
