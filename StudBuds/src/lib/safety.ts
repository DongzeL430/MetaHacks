import { useCallback, useEffect, useRef, useState } from 'react';
import { avatarUrlOf } from './profile.ts';
import { supabase } from './supabase.ts';
import type { Database } from '../../../supabase/database.types.ts';

export type ReportReason = Database['public']['Enums']['report_reason'];

/** The reasons a student can pick, in the order shown */
export const REPORT_REASONS: { id: ReportReason; label: string }[] = [
  { id: 'harassment', label: 'Harassment or bullying' },
  { id: 'inappropriate', label: 'Inappropriate messages or pictures' },
  { id: 'spam', label: 'Spam or ads' },
  { id: 'safety', label: 'I’m worried about someone’s safety' },
  { id: 'other', label: 'Something else' },
];

/** Matches report_student's limit */
export const REPORT_NOTE_MAX = 300;

/** P0001 messages ("Keep the note to 300 characters.") are written for students */
const messageOf = (error: { message: string; code?: string }) =>
  error.code === 'P0001' ? error.message : 'That didn’t go through. Check your connection and try again.';

/** Sends a report to the StudBuds team. Resolves to why it failed, or null when it went through. */
export async function reportStudent(personId: string, reason: ReportReason, note: string): Promise<string | null> {
  const details = note.trim();
  const { error } = await supabase.rpc('report_student', {
    person: personId,
    reason,
    ...(details ? { details } : {}),
  });
  return error ? messageOf(error) : null;
}

export interface SharedContact {
  discord: string | null;
  instagram: string | null;
  phone: string | null;
}

/**
 * Contact sharing with connections, for the Connections window: who the student shares with,
 * whose details they can see, and whether they've filled in anything to share. Loads each time
 * `active` turns on (the window opening), and again when `refreshKey` changes (someone connects
 * or leaves).
 */
export function useContactSharing(active: boolean, refreshKey: string) {
  const [loaded, setLoaded] = useState(false);
  const [sharingWith, setSharingWith] = useState<Set<string>>(() => new Set());
  const [sharedWithMe, setSharedWithMe] = useState<Map<string, SharedContact>>(() => new Map());
  const [haveContact, setHaveContact] = useState(false);
  const [error, setError] = useState('');
  const loadSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    const { data, error: failed } = await supabase.rpc('contact_sharing');
    if (seq !== loadSeq.current) return;
    if (failed || !data) {
      setError('Couldn’t load shared contacts right now.');
      return;
    }
    const d = data as unknown as {
      sharingWith: string[];
      sharedWithMe: ({ person: string } & SharedContact)[];
      haveContact: boolean;
    };
    setSharingWith(new Set(d.sharingWith));
    setSharedWithMe(new Map(d.sharedWithMe.map(({ person, ...contact }) => [person, contact])));
    setHaveContact(d.haveContact);
    setError('');
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (active) void load();
  }, [active, refreshKey, load]);

  /** Turns sharing with one connection on or off. Shows the change right away. */
  const setShared = useCallback(
    async (personId: string, share: boolean) => {
      setSharingWith((prev) => {
        const next = new Set(prev);
        if (share) next.add(personId);
        else next.delete(personId);
        return next;
      });
      const { error: failed } = await supabase.rpc('set_contact_shared', { person: personId, share });
      if (failed) setError(messageOf(failed));
      void load();
    },
    [load],
  );

  return { loaded, sharingWith, sharedWithMe, haveContact, error, setShared };
}

export interface BlockedStudent {
  id: string;
  name: string;
  avatar?: string;
}

/** The students this student has blocked, for Profile > Account. Loads each time `active` turns on. */
export function useBlockedStudents(active: boolean) {
  const [blocked, setBlocked] = useState<BlockedStudent[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const { data, error: failed } = await supabase.rpc('my_blocks');
    if (failed) {
      setError('Couldn’t load your blocked list right now.');
      return;
    }
    setBlocked(
      (data ?? []).map((b) => ({ id: b.id, name: b.nickname, avatar: avatarUrlOf(b.avatar_path ?? null) })),
    );
    setError('');
  }, []);

  useEffect(() => {
    if (active) void load();
  }, [active, load]);

  /** Resolves to true when it worked */
  const unblock = useCallback(
    async (personId: string) => {
      const { error: failed } = await supabase.rpc('unblock_student', { person: personId });
      if (failed) {
        setError(messageOf(failed));
        return false;
      }
      setBlocked((prev) => prev?.filter((b) => b.id !== personId) ?? null);
      return true;
    },
    [],
  );

  return { blocked, error, unblock };
}
