import type { ReactNode } from 'react';
import { Navigate } from 'react-router';
import { useAccount } from './lib/account.ts';

/**
 * Shows its children only to a signed-in student. Everyone else goes to the log-in page.
 * need="onboarded" (Home) sends students who haven't finished the pre-survey to it first;
 * need="new" (the pre-survey) sends students who already finished it to Home.
 */
export default function RequireAuth({ children, need }: { children: ReactNode; need?: 'onboarded' | 'new' }) {
  const { status } = useAccount();

  if (status === 'loading') return null;
  if (status === 'signed-out') return <Navigate to="/login" replace />;
  if (need === 'onboarded' && status === 'new') return <Navigate to="/survey" replace />;
  if (need === 'new' && status === 'onboarded') return <Navigate to="/" replace />;
  return children;
}
