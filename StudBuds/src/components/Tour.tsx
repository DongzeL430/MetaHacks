import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { supabase } from '../lib/supabase';

/**
 * A guided tour: one popup at a time, each pointing an arrow at a part of the page while that
 * part pulses. Mark what a step points at with `data-tour="name"` and give the step `target: 'name'`.
 * A step without a target shows in the middle of the screen.
 */
export interface TourStep {
  /** Name for this step, so another step's `ifMissing` can send the tour back to it */
  id?: string;
  /** The `data-tour` value of the element to point at. Leave out for a centered popup. */
  target?: string;
  title: string;
  body: ReactNode;
  /**
   * Which side of the target the popup prefers (default 'bottom'). It moves to another side when
   * that one has no room, and onto the target itself when no side does.
   */
  placement?: Side;
  /**
   * Shows only the ✕ (pulsing) to close, with no Next / Done button. For a popup that just needs
   * reading, where the ✕ is the thing to notice.
   */
  closeOnly?: boolean;
  /**
   * The student has to do something to move on: the highlighted part stays clickable, there's no
   * Next button, and the tour moves on by itself once an element with this `data-tour` value shows up.
   */
  advanceWhen?: string;
  /**
   * Nothing is dimmed or blocked: the whole page stays usable (e.g. to fill in a form) while the
   * popup and the ring stay up.
   */
  passThrough?: boolean;
  /** If the target goes away (its window was closed), go back to the step with this id */
  ifMissing?: string;
}

type Side = 'top' | 'bottom' | 'left' | 'right';

interface TourProps {
  steps: TourStep[];
  /** Runs when the last step is done, or the tour is closed early (✕ or Escape) */
  onClose: () => void;
}

/** Space between the target and its pulsing ring, and between the ring and the popup */
const RING_GAP = 6;
const POPUP_GAP = 16;
/** Keeps the popup this far from the screen's edges */
const EDGE = 16;
const ARROW = 14;
/** How long a target can be gone before `ifMissing` sends the tour back */
const MISSING_GRACE_MS = 500;

type Box = { top: number; left: number; width: number; height: number };
type Size = { width: number; height: number };

const sameBox = (a: Box | null, b: Box | null) =>
  a === b ||
  (!!a && !!b && a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height);

/** The first element with this name that's showing (the gear, for one, has a phone-only copy) */
const find = (name: string) => {
  const all = Array.from(document.querySelectorAll(`[data-tour="${name}"]`));
  return all.find((el) => boxOf(el)) ?? all[0] ?? null;
};

function boxOf(el: Element | null): Box | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), Math.max(min, max));

const OPPOSITE: Record<Side, Side> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };

/**
 * Where the popup goes around the ring: the preferred side, its opposite, then the others,
 * whichever fits first. With no room anywhere it sits on the target's top edge, with no arrow, or
 * with `dock` in the screen's bottom left corner (out of the way of a form being filled in).
 */
function placePopup(ring: Box, popup: Size, viewport: Size, preferred: Side, dock: boolean) {
  const room: Record<Side, boolean> = {
    top: ring.top - POPUP_GAP - EDGE >= popup.height,
    bottom: viewport.height - (ring.top + ring.height) - POPUP_GAP - EDGE >= popup.height,
    left: ring.left - POPUP_GAP - EDGE >= popup.width,
    right: viewport.width - (ring.left + ring.width) - POPUP_GAP - EDGE >= popup.width,
  };
  const order: Side[] = [preferred, OPPOSITE[preferred], ...(['bottom', 'top', 'right', 'left'] as Side[])];
  const side = order.find((s) => room[s]);

  const centerX = ring.left + ring.width / 2;
  const centerY = ring.top + ring.height / 2;
  const maxLeft = viewport.width - popup.width - EDGE;
  const maxTop = viewport.height - popup.height - EDGE;

  if (!side && dock) {
    return { top: maxTop, left: EDGE, arrow: null };
  }
  if (!side) {
    // Over the target, just inside its top edge
    return {
      top: clamp(ring.top + 12, EDGE, maxTop),
      left: clamp(centerX - popup.width / 2, EDGE, maxLeft),
      arrow: null,
    };
  }

  if (side === 'top' || side === 'bottom') {
    const left = clamp(centerX - popup.width / 2, EDGE, maxLeft);
    const top = side === 'top' ? ring.top - POPUP_GAP - popup.height : ring.top + ring.height + POPUP_GAP;
    // The arrow sits on the popup's edge facing the target, pointing at the target's middle
    return { top, left, arrow: { side: OPPOSITE[side], offset: clamp(centerX - left, 28, popup.width - 28) } };
  }
  const top = clamp(centerY - popup.height / 2, EDGE, maxTop);
  const left = side === 'left' ? ring.left - POPUP_GAP - popup.width : ring.left + ring.width + POPUP_GAP;
  return { top, left, arrow: { side: OPPOSITE[side], offset: clamp(centerY - top, 24, popup.height - 24) } };
}

export default function Tour({ steps, onClose }: TourProps) {
  const [index, setIndex] = useState(0);
  const step = steps[index];
  const isLast = index === steps.length - 1;

  const popupRef = useRef<HTMLDivElement>(null);
  const [target, setTarget] = useState<Box | null>(null);
  const [popup, setPopup] = useState<Size | null>(null);
  const [viewport, setViewport] = useState<Size>({ width: window.innerWidth, height: window.innerHeight });

  // The page may hand over new copies of these on every render; the frame loop reads the latest
  const latest = useRef({ steps, onClose });
  useEffect(() => {
    latest.current = { steps, onClose };
  });

  const next = useCallback(
    () => (index >= latest.current.steps.length - 1 ? latest.current.onClose() : setIndex(index + 1)),
    [index],
  );
  const back = () => setIndex((i) => Math.max(0, i - 1));

  // Every frame: follow the target (the nav bar slides in, windows open, move and resize), move on
  // once the student did what an `advanceWhen` step asks, and go back if the target disappeared
  useLayoutEffect(() => {
    let frame = 0;
    let missingSince: number | null = null;

    const tick = () => {
      const step = latest.current.steps[index];
      if (!step) return;
      const backTo = step.ifMissing ? latest.current.steps.findIndex((s) => s.id === step.ifMissing) : -1;

      if (step.advanceWhen && find(step.advanceWhen)) {
        next();
        return;
      }

      const box = step.target ? boxOf(find(step.target)) : null;
      setTarget((prev) => (sameBox(prev, box) ? prev : box));

      if (step.target && !box && backTo >= 0) {
        missingSince ??= performance.now();
        if (performance.now() - missingSince > MISSING_GRACE_MS) {
          setIndex(backTo);
          return;
        }
      } else {
        missingSince = null;
      }

      const p = popupRef.current;
      if (p) {
        const size = { width: p.offsetWidth, height: p.offsetHeight };
        setPopup((prev) => (prev && prev.width === size.width && prev.height === size.height ? prev : size));
      }
      setViewport((prev) =>
        prev.width === window.innerWidth && prev.height === window.innerHeight
          ? prev
          : { width: window.innerWidth, height: window.innerHeight },
      );
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [index, next]);

  // Each new step takes focus, so keyboard and screen reader users land on it
  useEffect(() => {
    popupRef.current?.focus({ preventScroll: true });
  }, [index]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        latest.current.onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const ring: Box | null =
    step.target && target
      ? {
          top: target.top - RING_GAP,
          left: target.left - RING_GAP,
          width: target.width + RING_GAP * 2,
          height: target.height + RING_GAP * 2,
        }
      : null;
  // Buttons and pills get a round ring; windows and panels a rounded rectangle
  const radius = ring && ring.height <= 64 ? 9999 : 18;

  let popupStyle: CSSProperties;
  let arrow: { side: Side; offset: number } | null = null;
  if (ring && popup) {
    const placed = placePopup(ring, popup, viewport, step.placement ?? 'bottom', !!step.passThrough);
    popupStyle = { top: placed.top, left: placed.left };
    arrow = placed.arrow;
  } else if (ring) {
    // First frame: measure the popup before placing it
    popupStyle = { top: 0, left: 0, visibility: 'hidden' };
  } else {
    popupStyle = { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
  }

  const interactive = !!step.advanceWhen;
  const dimmed = !step.passThrough;

  return (
    <div className="pointer-events-none fixed inset-0 z-[100]" role="presentation">
      {dimmed &&
        (ring ? (
          <>
            {/* The dim is this hole's huge shadow, so it follows the ring's rounded corners */}
            <div
              aria-hidden
              className="absolute"
              style={{ ...boxStyle(ring), borderRadius: radius, boxShadow: '0 0 0 200vmax rgb(0 0 0 / 0.45)' }}
            />
            {/* Clicks: blocked around the hole, and inside it too unless the step asks for a click */}
            {holeBlockers(ring, viewport, interactive).map((style, i) => (
              <div key={i} aria-hidden className="pointer-events-auto absolute" style={style} />
            ))}
          </>
        ) : (
          <div aria-hidden className="pointer-events-auto absolute inset-0 bg-black/45 motion-safe:animate-[tour-fade_200ms_ease-out]" />
        ))}

      {ring && (
        <div aria-hidden className="tour-ring absolute" style={{ ...boxStyle(ring), borderRadius: radius }} />
      )}

      <div
        ref={popupRef}
        data-tour-popup
        role="dialog"
        aria-modal={dimmed && !interactive}
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        tabIndex={-1}
        key={index}
        className="doodle pointer-events-auto absolute w-[min(22rem,calc(100vw-2rem))] p-5 pt-4 rounded-2xl bg-surface text-ink shadow-[0_18px_40px_-14px_rgba(40,30,20,0.6)] border-2 border-ink outline-none motion-safe:animate-[tour-pop_260ms_cubic-bezier(0.34,1.56,0.64,1)]"
        style={popupStyle}
      >
        {arrow && (
          <span
            aria-hidden
            className={`absolute w-[14px] h-[14px] bg-surface border-ink rotate-45 ${ARROW_BORDERS[arrow.side]}`}
            style={
              arrow.side === 'top' || arrow.side === 'bottom'
                ? { left: arrow.offset - ARROW / 2, [arrow.side]: -ARROW / 2 - 1 }
                : { top: arrow.offset - ARROW / 2, [arrow.side]: -ARROW / 2 - 1 }
            }
          />
        )}

        <div className="flex items-start gap-3">
          <h2 id="tour-title" className="m-0 flex-1 text-xl leading-snug">
            {step.title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={step.closeOnly ? 'Close' : 'Skip the tour'}
            title={step.closeOnly ? 'Close' : 'Skip the tour'}
            className={`shrink-0 -mr-1 w-9 h-9 flex items-center justify-center rounded-full border-0 [border-image:none] bg-sand-soft hover:bg-sand text-lg leading-none cursor-pointer ${
              step.closeOnly ? 'tour-ring-pulse' : ''
            }`}
          >
            ✕
          </button>
        </div>

        <div id="tour-body" className="mt-2 flex flex-col gap-2 leading-relaxed">
          {step.body}
        </div>

        {!step.closeOnly && (
          <div className="mt-4 flex items-center gap-2">
            {steps.length > 1 && (
              <span className="flex-1 text-sm opacity-70">
                {index + 1} of {steps.length}
              </span>
            )}
            {index > 0 && !interactive && (
              <button type="button" onClick={back} className="px-4 py-1">
                Back
              </button>
            )}
            {interactive ? (
              <span className="ml-auto text-sm font-bold">Your turn</span>
            ) : (
              <button type="button" onClick={next} className="ml-auto px-5 py-1">
                {isLast ? 'Got it' : 'Next'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const ARROW_BORDERS: Record<Side, string> = {
  top: 'border-l-2 border-t-2',
  bottom: 'border-r-2 border-b-2',
  left: 'border-l-2 border-b-2',
  right: 'border-r-2 border-t-2',
};

const boxStyle = (b: Box): CSSProperties => ({ top: b.top, left: b.left, width: b.width, height: b.height });

/** Click blockers: four strips around the hole, plus one over it when the hole isn't clickable */
function holeBlockers(ring: Box, viewport: Size, holeClickable: boolean): CSSProperties[] {
  const bottom = ring.top + ring.height;
  const right = ring.left + ring.width;
  const strips: CSSProperties[] = [
    { top: 0, left: 0, width: viewport.width, height: Math.max(0, ring.top) },
    { top: bottom, left: 0, width: viewport.width, height: Math.max(0, viewport.height - bottom) },
    { top: ring.top, left: 0, width: Math.max(0, ring.left), height: ring.height },
    { top: ring.top, left: right, width: Math.max(0, viewport.width - right), height: ring.height },
  ];
  return holeClickable ? strips : [...strips, boxStyle(ring)];
}

/** Remembers, per account and per browser, which tours a student has already seen */
export const tourSeen = {
  key: (tour: string, userId: string) => `studbuds:tour:${tour}:${userId}`,
  has(tour: string, userId: string) {
    try {
      return localStorage.getItem(this.key(tour, userId)) === '1';
    } catch {
      return false;
    }
  },
  mark(tour: string, userId: string) {
    try {
      localStorage.setItem(this.key(tour, userId), '1');
    } catch {
      // Private mode or blocked storage: the tour may show again, which is fine
    }
  },
};

/**
 * Whether to show a tour the signed-in student hasn't seen yet. 'checking' until the account is
 * known; then 'open' (show it, and call close() when it's done) or 'done'. `wanted` false skips it.
 */
export function useFirstTimeTour(tour: string, wanted = true) {
  const [userId, setUserId] = useState<string | null>(null);
  const [status, setStatus] = useState<'checking' | 'open' | 'done'>(wanted ? 'checking' : 'done');

  useEffect(() => {
    if (!wanted) return;
    let cancelled = false;
    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      const id = data.session?.user.id ?? null;
      setUserId(id);
      setStatus(id && !tourSeen.has(tour, id) ? 'open' : 'done');
    });
    return () => {
      cancelled = true;
    };
  }, [tour, wanted]);

  const close = useCallback(() => {
    if (userId) tourSeen.mark(tour, userId);
    setStatus('done');
  }, [tour, userId]);

  return { status, close };
}
