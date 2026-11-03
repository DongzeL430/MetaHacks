// Every Meta model call starts here: public.claim_muse_use checks the student's own limit for this
// kind, then the daily budget shared by everyone, and records the use in one step (so parallel
// clicks can't slip past a limit). Limits and costs live in private.muse_limits.

import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';

export type MuseClaim =
  | { ok: true; id: number; left: number }
  | { ok: false; reason: 'student'; retry_at: string }
  | { ok: false; reason: 'everyone' | 'error' };

export async function claimMuseUse(supabase: SupabaseClient, userId: string, kind: string): Promise<MuseClaim> {
  const { data, error } = await supabase.rpc('claim_muse_use', { student: userId, what: kind });
  if (error || !data) {
    console.error('claim_muse_use failed', kind, error?.message);
    return { ok: false, reason: 'error' };
  }
  return data as MuseClaim;
}

/** Gives a claimed use back, for a failure on our side */
export async function refundMuseUse(supabase: SupabaseClient, claim: MuseClaim): Promise<void> {
  if (claim.ok) await supabase.from('ai_requests').delete().eq('id', claim.id);
}

export const BUDGET_PAUSED =
  'StudBuds has used today’s Muse budget for everyone. It resets within a day, so try again tomorrow.';
export const LIMIT_CHECK_FAILED = 'Could not check your limit. Try again in a moment.';

/** "in 5 hours" or "in 3 days", until a used-up limit frees a spot */
export function untilFree(retryAt: string): string {
  const hours = Math.max(1, Math.ceil((new Date(retryAt).getTime() - Date.now()) / 3_600_000));
  if (hours <= 36) return `in ${hours} hour${hours === 1 ? '' : 's'}`;
  const days = Math.ceil(hours / 24);
  return `in ${days} days`;
}
