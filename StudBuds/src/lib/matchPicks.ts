import { useEffect, useRef, useState } from 'react';
import { callFunction } from './edgeFunctions.ts';

/** One of Muse's picks: its place among them (0 is Muse's first) and why it suits you */
export interface MusePick {
  rank: number;
  reason: string;
}

/**
 * Muse's picks for Study Lobbies (the pick-matches function): up to three sessions Muse thinks
 * suit this student best, with a reason each. Asks while `active` (the window is open), and again
 * when the sessions change (`lobbiesKey`); the server reuses its last answer when nothing changed,
 * so that costs nothing. Any failure means no picks, and the list keeps the ranking's order.
 */
export function useMusePicks(active: boolean, mySchoolOnly: boolean, lobbiesKey: string) {
  const [picks, setPicks] = useState<Map<string, MusePick>>(() => new Map());
  const asked = useRef(0);

  useEffect(() => {
    if (!active || !lobbiesKey) return;
    const n = ++asked.current;
    // A moment's wait, so a burst of live updates asks once
    const timer = window.setTimeout(() => {
      callFunction<{ picks?: { lobbyId: string; reason: string }[] }>('pick-matches', { mySchoolOnly })
        .then((res) => {
          if (n !== asked.current) return;
          setPicks(new Map((res.picks ?? []).map((p, rank) => [p.lobbyId, { rank, reason: p.reason }])));
        })
        .catch((err) => {
          if (n !== asked.current) return;
          console.warn('no Muse picks this time', err);
          setPicks(new Map());
        });
    }, 600);
    return () => window.clearTimeout(timer);
  }, [active, mySchoolOnly, lobbiesKey]);

  return picks;
}
