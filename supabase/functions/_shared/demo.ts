// The view-only demo login (migrations/*_demo_viewer.sql). Its app_metadata.demo_of names the
// student it shows. app_metadata is set only with the service key, so it can be trusted here.
//
// Edge Functions use the service key, which the database's demo guard doesn't see, so each
// function checks here instead: Muse is never called for a demo login, and nothing is saved.

export const DEMO_READ_ONLY = 'This is a view-only demo account, so Muse is turned off here.';

/** The student a demo login shows, or null for everyone else */
export function demoOf(user: { app_metadata?: Record<string, unknown> } | null | undefined): string | null {
  const id = user?.app_metadata?.demo_of;
  return typeof id === 'string' && id ? id : null;
}
