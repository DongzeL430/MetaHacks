import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/** Chips shown on a card before the rest move to a popup */
const MAX_INLINE = 4;

interface ChipListProps {
  items: string[];
  /** Classes for each chip */
  chipClassName: string;
  /** Popup title, e.g. "Sam’s courses taken" */
  title: string;
  /** Shown when the list is empty */
  empty: string;
}

/**
 * A wrapping row of chips. Past MAX_INLINE, the card shows the first few and a "+N more" button
 * that opens every chip in a popup over the page (Escape, its ✕ or a click outside closes it).
 */
export default function ChipList({ items, chipClassName, title, empty }: ChipListProps) {
  const [open, setOpen] = useState(false);
  const moreRef = useRef<HTMLButtonElement>(null);

  if (items.length === 0) return <p className="m-0 text-sm opacity-70">{empty}</p>;

  const overflow = items.length > MAX_INLINE;
  // Leave room for the "+N more" chip so the row stays the same size
  const shown = overflow ? items.slice(0, MAX_INLINE - 1) : items;

  return (
    <>
      <div className="flex flex-wrap gap-1">
        {shown.map((item) => (
          <span key={item} className={chipClassName}>
            {item}
          </span>
        ))}
        {overflow && (
          <button
            ref={moreRef}
            type="button"
            onClick={() => setOpen(true)}
            aria-haspopup="dialog"
            aria-label={`Show all ${items.length}: ${title}`}
            className="px-1.5 py-0.5 rounded border-2 border-ink/40 [border-image:none] bg-sand-soft hover:bg-sand text-xs cursor-pointer"
          >
            +{items.length - shown.length} more
          </button>
        )}
      </div>
      {open && (
        <ChipPopup
          items={items}
          chipClassName={chipClassName}
          title={title}
          onClose={() => {
            setOpen(false);
            requestAnimationFrame(() => moreRef.current?.focus());
          }}
        />
      )}
    </>
  );
}

function ChipPopup({
  items,
  chipClassName,
  title,
  onClose,
}: {
  items: string[];
  chipClassName: string;
  title: string;
  onClose: () => void;
}) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => closeRef.current?.focus(), []);

  // Over every window (they're inside the desk), under the welcome tour
  return createPortal(
    <div
      className="doodle fixed inset-0 z-[95] flex items-center justify-center p-4 bg-ink/25 motion-safe:transition-opacity motion-safe:duration-200 starting:opacity-0"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation(); // so a full screen window behind doesn't also exit
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md max-h-[80dvh] flex flex-col rounded-md border-2 border-ink bg-paper shadow-[0_18px_40px_-14px_rgba(40,30,20,0.6)] overflow-hidden motion-safe:transition motion-safe:duration-200 starting:scale-95"
      >
        <header className="shrink-0 flex items-center gap-2 px-3 py-1.5 border-b-2 border-ink bg-title-butter">
          <h2 id={titleId} className="m-0 flex-1 min-w-0 truncate text-base">
            {title}
          </h2>
          <span className="text-xs opacity-70">{items.length}</span>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-7 h-7 p-0 flex items-center justify-center rounded border-0 [border-image:none] bg-transparent hover:bg-busy cursor-pointer"
          >
            <svg viewBox="0 0 20 20" className="w-3.5 h-3.5" aria-hidden="true">
              <path d="M5 5l10 10M15 5L5 15" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
            </svg>
          </button>
        </header>
        <ul className="m-0 p-3 list-none flex flex-wrap gap-1.5 overflow-auto">
          {items.map((item) => (
            <li key={item} className={`list-none ${chipClassName}`}>
              {item}
            </li>
          ))}
        </ul>
      </div>
    </div>,
    document.body,
  );
}
