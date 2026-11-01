import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from './supabase.ts';

/**
 * Calls one of our Supabase Edge Functions as the signed-in student. Errors become an Error
 * whose message is the function's own { error } text (daily limit, bad image, ...), which is
 * written to be shown to students as is.
 */
export async function callFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    const message =
      error instanceof FunctionsHttpError
        ? await error.context.json().then((b: { error?: string }) => b.error, () => undefined)
        : undefined;
    throw new Error(message ?? 'Couldn’t reach Muse right now. Check your connection and try again.');
  }
  return data as T;
}
