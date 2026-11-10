// The view-only demo login (migrations/*_demo_viewer.sql). Its app_metadata.demo_of names the
// student it shows. app_metadata is set only with the service key, so it can be trusted here.
//
// Edge Functions use the service key, which the database's demo guard doesn't see, so each
// function takes care here instead:
// - It reads as the shown student (actingId), but claims Muse uses under the demo login's own id,
//   where public.claim_muse_use gives the demo 10 a day in all (migrations/*_demo_muse.sql).
// - Anything it saves goes under the demo login's own id or into shared caches, never into the
//   shown student's account. Functions that could only change that account refuse a demo login.

import { untilFree } from './museBudget.ts';

type AuthUser = { id: string; app_metadata?: Record<string, unknown> };

export const DEMO_READ_ONLY = 'This is a view-only demo account, so this can’t be changed here.';

/** The student a demo login shows, or null for everyone else */
export function demoOf(user: AuthUser | null | undefined): string | null {
  const id = user?.app_metadata?.demo_of;
  return typeof id === 'string' && id ? id : null;
}

/** Whose data to read: the shown student for a demo login, the caller otherwise */
export function actingId(user: AuthUser): string {
  return demoOf(user) ?? user.id;
}

/** The message when the demo has used today's Muse uses */
export function demoLimitReached(retryAt: string): string {
  return `The demo has used today’s Muse tries. More are back ${untilFree(retryAt)}.`;
}
