import { useEffect, useId, useRef, useState } from 'react';
import type { ChatLine } from '../lib/worldChat';

/*
 * Home's live activity feed, bottom right, like a game's world chat: light gray text on a
 * half-transparent dark strip, newest at the bottom, each line fading out after a few seconds.
 * Under the lines sits a round button that opens every line since the tab opened, with times.
 * The lines never take clicks, so windows under them stay usable. It sits above full-screen
 * windows (z 60) and under popups (z 65+). Colors stay the same in every theme, so it reads over
 * any background picture.
 */

interface WorldChatProps {
  /** Popping up right now */
  lines: ChatLine[];
  /** Everything since the tab opened, oldest first */
  history: ChatLine[];
  /** Lines since the list was last opened: shows the red dot (and the count, for screen readers) */
  unread: number;
  onOpen: () => void;
}

const time = (at: number) => new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 5h16v10H9l-5 4z" />
      <path d="M8 9h8M8 12h5" />
    </svg>
  );
}

export default function WorldChat({ lines, history, unread, onOpen }: WorldChatProps) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLOListElement>(null);

  // While open: newest in view, nothing counts as unread, and a click elsewhere or Escape closes it
  useEffect(() => {
    if (!open) return;
    onOpen();
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
    const onPointer = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, history.length, onOpen]);

  return (
    <div
      ref={wrapRef}
      // Sits in <main>, outside the desk: 16px (24px on md+) from the screen's corner, the same
      // gap the bottom-left gear uses on phones
      className="pointer-events-none absolute right-4 bottom-4 md:right-6 md:bottom-6 z-[62] w-[min(26rem,calc(100%-2rem))] flex flex-col items-end gap-2.5"
    >
      {open ? (
        <section
          id={panelId}
          aria-label="Activity"
          className="pointer-events-auto w-full flex flex-col gap-1 p-2 bg-black/35 motion-safe:transition motion-safe:duration-150 starting:opacity-0 starting:translate-y-1"
        >
          <h2 className="chat-text m-0 px-1 text-xs uppercase tracking-wide opacity-80">Activity</h2>
          {history.length === 0 ? (
            <p className="chat-text m-0 px-1 py-1 text-sm">Nothing yet. New sessions that fit you and visits to your croft show up here.</p>
          ) : (
            <ol ref={listRef} className="m-0 p-0 max-h-[min(50vh,22rem)] overflow-y-auto flex flex-col gap-0.5">
              {history.map((line) => (
                <li key={line.id} className="chat-strip list-none flex gap-2 px-2 py-0.5 text-sm leading-snug">
                  <span className="shrink-0 opacity-70 tabular-nums">{time(line.at)}</span>
                  <span className="min-w-0">{line.text}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      ) : (
        <div role="log" aria-live="polite" aria-label="Live activity" className="flex flex-col items-end gap-0.5">
          {lines.map((line) => (
            <p key={line.id} className="chat-line chat-strip m-0 px-2 py-0.5 text-sm leading-snug">
              {line.text}
            </p>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={unread > 0 && !open ? `Activity (${unread} new)` : 'Activity'}
        title="Activity"
        // Its own look, not a doodle button: the chat lines' dark strip, set as utilities because
        // doodle.css's button rules are more specific than .chat-strip
        className="chat-text pointer-events-auto relative w-10 h-10 p-0 flex items-center justify-center rounded-full border-0 [border-image:none] bg-black/40 text-[rgb(232_232_232)] hover:bg-black/55"
      >
        <ChatIcon />
        {/* Unread: a small red dot centered on the button's edge at the upper right (on a 40px
            circle, that point is about 6px in from the corner). Fixed red, in every theme. */}
        {unread > 0 && !open && (
          <span
            aria-hidden="true"
            className="absolute top-0 right-0 w-3 h-3 rounded-full bg-[#e5484d] ring-2 ring-black/30 motion-safe:transition-transform motion-safe:duration-200 starting:scale-0"
          />
        )}
      </button>
    </div>
  );
}
