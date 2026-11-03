import type { ChatLine } from '../lib/worldChat';

/*
 * Home's live activity feed, bottom right, like a game's world chat: light gray text on a
 * half-transparent dark strip, newest at the bottom, each line fading out after a few seconds.
 * It never takes clicks, so windows under it stay usable. The colors stay the same in every theme.
 */
export default function WorldChat({ lines }: { lines: ChatLine[] }) {
  return (
    <div
      role="log"
      aria-live="polite"
      aria-label="Live activity"
      className="pointer-events-none absolute right-2 bottom-2 md:right-3 md:bottom-3 z-40 max-w-[min(26rem,calc(100%-1rem))] flex flex-col items-end gap-0.5"
    >
      {lines.map((line) => (
        <p key={line.id} className="chat-line m-0 px-2 py-0.5 text-sm leading-snug">
          {line.text}
        </p>
      ))}
    </div>
  );
}
