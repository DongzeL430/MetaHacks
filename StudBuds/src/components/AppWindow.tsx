import {
  createContext,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { flushSync } from 'react-dom';
import type {
  CSSProperties,
  KeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from 'react';

type ResizeEdge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

/** 'enabled' = clickable, 'disabled' = shown but greyed out, 'hidden' = not rendered */
export type WindowControlState = 'enabled' | 'disabled' | 'hidden';

export interface WindowControls {
  close?: WindowControlState;
  fullscreen?: WindowControlState;
}

/** Window position and size, relative to the parent's content box */
interface WindowRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/* ------------------------------------------------------------------ *
 * WINDOW STACK
 * Wrap a group of windows in <WindowManagerProvider>. It remembers the order they
 * opened (or were last clicked) in. The newest sits on top at full size; each window
 * behind it shrinks a little more, with an animation. Windows outside a provider
 * work exactly as before, just without the shrinking.
 * ------------------------------------------------------------------ */

/** How much smaller each window gets per window stacked in front of it */
const STACK_SHRINK = 0.06;
/** Never shrink below this */
const MIN_STACK_SCALE = 0.82;

interface WindowStackActions {
  open: (id: string) => void;
  close: (id: string) => void;
  focus: (id: string) => void;
}

// Two contexts: the actions never change, so registering a window never re-runs because the order moved
const WindowStackActionsContext = createContext<WindowStackActions | null>(null);
const WindowStackOrderContext = createContext<string[]>([]);

/** The stack's actions (open / close / focus a window by id), for components inside a WindowManagerProvider */
export const useWindowManager = () => useContext(WindowStackActionsContext);

/**
 * Lets several windows share one desk area. Each window goes in its own full-size layer, so they
 * all measure the same area, and the layer lets clicks through to whatever is underneath.
 * The desk area needs `relative`.
 */
export function WindowLayer({ children }: { children: ReactNode }) {
  return <div className="absolute inset-0 pointer-events-none [&>*]:pointer-events-auto">{children}</div>;
}

export function WindowManagerProvider({ children }: { children: ReactNode }) {
  const [order, setOrder] = useState<string[]>([]);

  const actions = useMemo<WindowStackActions>(
    () => ({
      open: (id) => setOrder((prev) => [...prev.filter((w) => w !== id), id]),
      close: (id) => setOrder((prev) => (prev.includes(id) ? prev.filter((w) => w !== id) : prev)),
      focus: (id) =>
        setOrder((prev) =>
          !prev.includes(id) || prev[prev.length - 1] === id ? prev : [...prev.filter((w) => w !== id), id],
        ),
    }),
    [],
  );

  return (
    <WindowStackActionsContext.Provider value={actions}>
      <WindowStackOrderContext.Provider value={order}>{children}</WindowStackOrderContext.Provider>
    </WindowStackActionsContext.Provider>
  );
}

/* ------------------------------------------------------------------ */

interface AppWindowProps {
  /** Text shown in the title bar */
  title?: ReactNode;
  /** Stable id for the window stack. Optional; one is generated if left out. */
  id?: string;
  /**
   * Controlled visibility. Leave it out and the window hides itself when closed;
   * pass it (with onClose setting it to false) to control it from the parent.
   */
  open?: boolean;
  /** Content rendered below the divider. Scrolls when it gets too tall. */
  children?: ReactNode;
  /** Pinned under the body with its own divider (action buttons, progress, etc.) */
  footer?: ReactNode;
  /** Let the user drag any edge or corner to resize */
  resizable?: boolean;
  /** Let the user drag the title bar to reposition the window */
  movable?: boolean;
  minWidth?: number;
  minHeight?: number;
  /**
   * State of the title bar buttons. Anything not given is 'disabled'.
   * e.g. controls={{ close: 'enabled', fullscreen: 'hidden' }}
   */
  controls?: WindowControls;
  /** Opens at this size instead of filling its area */
  initialSize?: { width: number; height: number };
  /** Where an initialSize window opens horizontally: left edge, centered (default) or right edge */
  initialAlign?: 'start' | 'center' | 'end';
  /** Makes the window unclickable and unfocusable, e.g. while a popup sits on top of it */
  inactive?: boolean;
  /** id for the title text, so a dialog can point aria-labelledby at it */
  titleId?: string;
  onClose?: () => void;
  onFullscreenChange?: (isFullscreen: boolean) => void;
  /** Extra classes for the outer frame */
  className?: string;
  /** Extra classes for the scrolling body (padding, gap, layout) */
  bodyClassName?: string;
  /** Extra classes for the footer strip (padding, background) */
  footerClassName?: string;
}

const KEYBOARD_STEP = 16;

/** Body fill. A shade lighter than the page (#FDF7F1) so the window reads as a solid sheet, not a hole. */
const BODY_BG = 'bg-[#FFFDFA]';

/** How far the window's fill sits inside the hand-drawn border. Nudge this if the fill peeks past the line. */
const SURFACE_INSET = 5;

/** While dragging, keep at least this much of the window on screen so it can always be grabbed again */
const DRAG_KEEP_VISIBLE = 80;

const SHADOW_RESTING =
  'shadow-[5px_7px_0_rgba(60,60,60,0.2),0_14px_30px_-6px_rgba(60,60,60,0.35)]';
/** While dragging: a crisp offset shadow with no blur, which is cheap to redraw. It switches instantly, never animates. */
const SHADOW_LIFTED = 'shadow-[8px_11px_0_rgba(60,60,60,0.25)]';

const EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)';
/** Overshoots slightly, then settles: the "rebound" when a window is dropped out of bounds */
const SPRING = 'cubic-bezier(0.34, 1.56, 0.64, 1)';
const REBOUND_MS = 450;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(value, max));

/** Invisible grab strips along each edge and corner (bottom-right is the visible grip) */
const EDGE_HANDLES: { edge: ResizeEdge; className: string }[] = [
  { edge: 'n', className: 'z-20 -top-1.5 inset-x-3 h-3 cursor-ns-resize' },
  { edge: 's', className: 'z-20 -bottom-1.5 inset-x-3 h-3 cursor-ns-resize' },
  { edge: 'e', className: 'z-20 -right-1.5 inset-y-3 w-3 cursor-ew-resize' },
  { edge: 'w', className: 'z-20 -left-1.5 inset-y-3 w-3 cursor-ew-resize' },
  { edge: 'nw', className: 'z-30 -top-1.5 -left-1.5 w-4 h-4 cursor-nwse-resize' },
  { edge: 'ne', className: 'z-30 -top-1.5 -right-1.5 w-4 h-4 cursor-nesw-resize' },
  { edge: 'sw', className: 'z-30 -bottom-1.5 -left-1.5 w-4 h-4 cursor-nesw-resize' },
];

const getContentBox = (parent: HTMLElement): Box => {
  const rect = parent.getBoundingClientRect();
  const style = getComputedStyle(parent);
  return {
    left: rect.left + parseFloat(style.paddingLeft),
    top: rect.top + parseFloat(style.paddingTop),
    right: rect.right - parseFloat(style.paddingRight),
    bottom: rect.bottom - parseFloat(style.paddingBottom),
  };
};

/** Follows one pointer drag and removes its own listeners when the pointer is released */
const trackPointer = (
  target: HTMLElement,
  e: ReactPointerEvent,
  onMove: (dx: number, dy: number) => void,
  onEnd?: () => void,
) => {
  target.setPointerCapture(e.pointerId);
  const startX = e.clientX;
  const startY = e.clientY;

  const move = (ev: PointerEvent) => onMove(ev.clientX - startX, ev.clientY - startY);
  const end = () => {
    target.removeEventListener('pointermove', move);
    target.removeEventListener('pointerup', end);
    target.removeEventListener('pointercancel', end);
    onEnd?.();
  };

  target.addEventListener('pointermove', move);
  target.addEventListener('pointerup', end);
  target.addEventListener('pointercancel', end);
};

function usePrefersReducedMotion() {
  const query = '(prefers-reduced-motion: reduce)';
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const onChange = () => setReduced(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

export default function AppWindow({
  title = 'Untitled',
  id,
  open,
  children,
  footer,
  resizable = true,
  movable = true,
  minWidth = 280,
  minHeight = 200,
  controls,
  initialSize,
  initialAlign = 'center',
  inactive = false,
  titleId,
  onClose,
  onFullscreenChange,
  className = '',
  bodyClassName = 'p-4 flex flex-col gap-4',
  footerClassName = 'px-3 py-1.5',
}: AppWindowProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  // null means "fill the parent". Becomes a position + size once the user resizes or moves it.
  const [rect, setRect] = useState<WindowRect | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isRebounding, setIsRebounding] = useState(false);
  const reboundTimer = useRef<number | undefined>(undefined);
  const [selfOpen, setSelfOpen] = useState(true);
  const isOpen = open ?? selfOpen;
  // Latest callback, for the Escape listener below
  const onFullscreenChangeRef = useRef(onFullscreenChange);
  onFullscreenChangeRef.current = onFullscreenChange;
  const sizedRef = useRef(false);
  const reducedMotion = usePrefersReducedMotion();

  const closeState = controls?.close ?? 'disabled';
  const fullscreenState = controls?.fullscreen ?? 'disabled';

  const canResize = resizable && !isFullscreen;
  const canMove = movable && !isFullscreen;

  /* ---------- Window stack ---------- */
  const autoId = useId();
  const windowId = id ?? autoId;
  const stack = useContext(WindowStackActionsContext);
  const order = useContext(WindowStackOrderContext);

  useEffect(() => {
    if (!stack || !isOpen) return;
    stack.open(windowId);
    return () => stack.close(windowId);
  }, [stack, isOpen, windowId]);

  const stackIndex = order.indexOf(windowId);
  const depth = stackIndex === -1 ? 0 : order.length - 1 - stackIndex;
  const stackScale = Math.max(MIN_STACK_SCALE, 1 - depth * STACK_SHRINK);

  /* ---------- Measuring ---------- */

  /**
   * Current window edges and the area it's allowed to occupy, in viewport pixels.
   * Uses the layout size and the saved position rather than getBoundingClientRect,
   * because a window behind others is scaled down and its on-screen box is smaller.
   */
  const measure = () => {
    const frame = frameRef.current;
    const parent = frame?.parentElement;
    if (!frame || !parent) return null;
    const box = getContentBox(parent);
    const left = box.left + (rect?.x ?? 0);
    const top = box.top + (rect?.y ?? 0);
    const width = frame.offsetWidth;
    const height = frame.offsetHeight;
    return { start: { left, top, right: left + width, bottom: top + height, width, height }, box };
  };

  /** Moves only the dragged edges, keeping the opposite edges pinned in place */
  const resizeFrom = (edge: ResizeEdge, start: Box, box: Box, dx: number, dy: number): WindowRect => {
    let { left, right, top, bottom } = start;
    if (edge.includes('e')) right = clamp(start.right + dx, start.left + minWidth, box.right);
    if (edge.includes('w')) left = clamp(start.left + dx, box.left, start.right - minWidth);
    if (edge.includes('s')) bottom = clamp(start.bottom + dy, start.top + minHeight, box.bottom);
    if (edge.includes('n')) top = clamp(start.top + dy, box.top, start.bottom - minHeight);
    return { x: left - box.left, y: top - box.top, width: right - left, height: bottom - top };
  };

  const stopRebound = () => {
    window.clearTimeout(reboundTimer.current);
    if (frameRef.current) frameRef.current.style.translate = '';
    setIsRebounding(false);
  };

  const startResize = (edge: ResizeEdge) => (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!canResize || e.button !== 0) return;
    const measured = measure();
    if (!measured) return;

    const frame = frameRef.current;
    if (!frame) return;

    e.preventDefault();
    stopRebound();
    const { start, box } = measured;
    let latest: WindowRect | null = null;

    trackPointer(
      e.currentTarget,
      e,
      (dx, dy) => {
        const next = resizeFrom(edge, start, box, dx, dy);
        latest = next;
        // Straight onto the element, so the window's contents don't re-render on every pointer move
        frame.style.left = `${next.x}px`;
        frame.style.top = `${next.y}px`;
        frame.style.width = `${next.width}px`;
        frame.style.height = `${next.height}px`;
      },
      () => {
        if (latest) setRect(latest); // saved once, when the pointer is released
      },
    );
  };

  /**
   * Dragging the title bar moves the window freely, even out over the page's padding.
   * When it's let go somewhere it doesn't fit, it springs back inside its area.
   *
   * While dragging, the window is moved with the CSS `translate` property, written straight
   * to the element: the graphics card slides it along without the browser redoing layout,
   * and React doesn't re-render anything. The position is saved to state once, on release.
   */
  const startMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!canMove || e.button !== 0) return;
    if ((e.target as HTMLElement).closest('button')) return;
    const measured = measure();
    const frame = frameRef.current;
    if (!measured || !frame) return;

    e.preventDefault();
    stopRebound();
    const { start, box } = measured;
    const { width, height } = start;
    const baseX = start.left - box.left;
    const baseY = start.top - box.top;

    // While dragging: anywhere, as long as enough stays on screen to grab it again
    const dragMinX = -box.left - width + DRAG_KEEP_VISIBLE;
    const dragMaxX = window.innerWidth - box.left - DRAG_KEEP_VISIBLE;
    const dragMinY = -box.top;
    const dragMaxY = window.innerHeight - box.top - DRAG_KEEP_VISIBLE / 2;

    // Where it's allowed to rest
    const restMaxX = Math.max(0, box.right - box.left - width);
    const restMaxY = Math.max(0, box.bottom - box.top - height);

    const last = { x: baseX, y: baseY };
    setIsDragging(true);
    frame.style.willChange = 'translate';

    trackPointer(
      e.currentTarget,
      e,
      (dx, dy) => {
        last.x = clamp(baseX + dx, dragMinX, dragMaxX);
        last.y = clamp(baseY + dy, dragMinY, dragMaxY);
        frame.style.translate = `${last.x - baseX}px ${last.y - baseY}px`;
      },
      () => {
        setIsDragging(false);
        frame.style.willChange = '';

        const x = clamp(last.x, 0, restMaxX);
        const y = clamp(last.y, 0, restMaxY);
        const fits = x === last.x && y === last.y;

        // Hand the position from translate over to left/top in one step, so nothing jumps.
        // The window's real spot becomes where it should rest; if that's not where it was dropped,
        // translate holds it at the drop point for now.
        frame.style.translate = fits ? '' : `${last.x - x}px ${last.y - y}px`;
        flushSync(() => setRect({ x, y, width, height }));
        if (fits) return;

        // Spring back: lock in the drop point, turn on the translate transition, then let translate go to zero
        frame.getBoundingClientRect();
        flushSync(() => setIsRebounding(true));
        requestAnimationFrame(() => {
          frame.style.translate = '0px 0px';
          reboundTimer.current = window.setTimeout(() => {
            frame.style.translate = '';
            setIsRebounding(false);
          }, REBOUND_MS + 50);
        });
      },
    );
  };

  useEffect(() => () => window.clearTimeout(reboundTimer.current), []);

  /** Arrow keys resize from the corner grip, so it works without a mouse */
  const handleCornerKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!canResize) return;
    const deltas: Record<string, [number, number]> = {
      ArrowRight: [KEYBOARD_STEP, 0],
      ArrowLeft: [-KEYBOARD_STEP, 0],
      ArrowDown: [0, KEYBOARD_STEP],
      ArrowUp: [0, -KEYBOARD_STEP],
    };
    const delta = deltas[e.key];
    const measured = measure();
    if (!delta || !measured) return;

    e.preventDefault();
    setRect(resizeFrom('se', measured.start, measured.box, delta[0], delta[1]));
  };

  // initialSize: open centered at that size (before the first paint, so it doesn't jump)
  useLayoutEffect(() => {
    if (!initialSize || !isOpen || sizedRef.current) return;
    const parent = frameRef.current?.parentElement;
    if (!parent) return;
    const box = getContentBox(parent);
    const areaW = box.right - box.left;
    const areaH = box.bottom - box.top;
    const width = clamp(initialSize.width, Math.min(minWidth, areaW), areaW);
    const height = clamp(initialSize.height, Math.min(minHeight, areaH), areaH);
    const x = initialAlign === 'start' ? 0 : initialAlign === 'end' ? areaW - width : (areaW - width) / 2;
    setRect({ x, y: (areaH - height) / 2, width, height });
    sizedRef.current = true;
    // Only the first time it opens: later size changes come from the user
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // inactive: block clicks and keyboard focus on everything inside the window
  useEffect(() => {
    const frame = frameRef.current as (HTMLDivElement & { inert: boolean }) | null;
    if (frame) frame.inert = inactive;
  }, [inactive, isOpen]);

  // If the page shrinks, pull the window back inside its area
  useEffect(() => {
    const parent = frameRef.current?.parentElement;
    if (!parent) return;

    const observer = new ResizeObserver(() => {
      setRect((prev) => {
        if (!prev) return prev;
        const box = getContentBox(parent);
        const areaW = box.right - box.left;
        const areaH = box.bottom - box.top;
        const width = Math.max(minWidth, Math.min(prev.width, areaW));
        const height = Math.max(minHeight, Math.min(prev.height, areaH));
        const x = clamp(prev.x, 0, Math.max(0, areaW - width));
        const y = clamp(prev.y, 0, Math.max(0, areaH - height));
        const unchanged =
          x === prev.x && y === prev.y && width === prev.width && height === prev.height;
        return unchanged ? prev : { x, y, width, height };
      });
    });

    observer.observe(parent);
    return () => observer.disconnect();
  }, [minWidth, minHeight, isOpen]);

  const setFullscreen = (next: boolean) => {
    setIsFullscreen(next);
    onFullscreenChangeRef.current?.(next);
  };

  const toggleFullscreen = () => setFullscreen(!isFullscreen);

  // Escape leaves full screen (a popup that handles Escape itself stops it first)
  useEffect(() => {
    if (!isFullscreen) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) setFullscreen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFullscreen]);

  const handleClose = () => {
    if (isFullscreen) setFullscreen(false);
    if (open === undefined) setSelfOpen(false);
    onClose?.();
  };

  // Double-clicking the title bar toggles full screen, like a desktop window
  const handleTitleDoubleClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (fullscreenState !== 'enabled' || (e.target as HTMLElement).closest('button')) return;
    toggleFullscreen();
  };

  // Shrinking behind newer windows, the pop-in, and the rebound all animate; nothing does with reduced motion
  const transition = reducedMotion
    ? 'none'
    : [
        `transform 320ms ${EASE_OUT}`,
        `scale 260ms ${EASE_OUT}`,
        'opacity 200ms ease-out',
        // The spring-back animates translate only, so it also stays off the layout and paint path
        ...(isRebounding ? [`translate ${REBOUND_MS}ms ${SPRING}`] : []),
      ].join(', ');

  // Full screen: pinned over the whole viewport. Otherwise: its own spot inside the desk area.
  // The saved position and size are kept, so leaving full screen puts it back where it was.
  const frameStyle: CSSProperties = isFullscreen
    ? { position: 'fixed', inset: 0, zIndex: 60 }
    : {
        ...(rect
          ? { left: rect.x, top: rect.y, width: rect.width, height: rect.height }
          : { left: 0, top: 0, width: '100%', height: '100%' }),
        minWidth,
        minHeight,
        maxWidth: '100%',
        maxHeight: '100%',
        // Later windows sit on top. Kept under 20 so the taskbar stays above windows dragged under it.
        zIndex: stackIndex === -1 ? undefined : 10 + stackIndex,
        transform: stackScale < 1 ? `scale(${stackScale})` : 'none',
        transition,
      };

  // Paper chips that sit on top of the title bar. Hover lifts and tilts them, press pushes them in.
  const titleButton = [
    'shrink-0 w-8 h-8 p-0 flex items-center justify-center rounded-md',
    'border-2 border-[#3c3c3c] [border-image:none] bg-[#FDF7F1]',
    'shadow-[2px_2px_0_rgba(60,60,60,0.35)] transition duration-150 ease-out',
    'disabled:opacity-45 disabled:cursor-not-allowed disabled:shadow-none',
    'enabled:hover:shadow-[3px_4px_0_#3c3c3c] enabled:active:shadow-[1px_1px_0_#3c3c3c]',
    'motion-safe:enabled:hover:-translate-y-0.5 motion-safe:enabled:hover:-rotate-6',
    'motion-safe:enabled:active:translate-y-0 motion-safe:enabled:active:rotate-0',
  ].join(' ');

  if (!isOpen) return null;

  return (
    <div
      ref={frameRef}
      style={frameStyle}
      // Clicking anywhere on a window brings it to the front of the stack
      onPointerDownCapture={() => stack?.focus(windowId)}
      // Pops in when it first appears (or reopens)
      className={`relative starting:opacity-0 starting:scale-90 ${className}`}
    >
      {/* SURFACE: the window's fill. Inset so its edges tuck under the hand-drawn line.
          Full screen: square, edge to edge, no shadow. */}
      <div
        style={{ inset: isFullscreen ? 0 : SURFACE_INSET }}
        className={`absolute flex flex-col overflow-hidden bg-[#FDF7F1] ${
          isFullscreen ? '' : isDragging ? SHADOW_LIFTED : SHADOW_RESTING
        }`}
      >
        {/* TITLE BAR: drag it to move the window */}
        <div
          onPointerDown={startMove}
          onDoubleClick={handleTitleDoubleClick}
          className={`shrink-0 flex items-center gap-3 pl-4 pr-2.5 py-2 bg-[#EADBC8] touch-none select-none ${
            canMove ? (isDragging ? 'cursor-grabbing' : 'cursor-grab') : ''
          }`}
        >
          <p id={titleId} className="flex-1 min-w-0 m-0 truncate text-lg">{title}</p>

          <div className="flex items-center gap-2">
            {fullscreenState !== 'hidden' && (
              <button
                type="button"
                className={`${titleButton} enabled:hover:bg-[#BFE3C4]`}
                onClick={toggleFullscreen}
                disabled={fullscreenState === 'disabled'}
                aria-label={isFullscreen ? 'Exit full screen' : 'Full screen'}
                title={isFullscreen ? 'Exit full screen' : 'Full screen'}
              >
                <svg viewBox="0 0 20 20" className="w-4 h-4" aria-hidden="true">
                  <path
                    d={
                      isFullscreen
                        ? 'M8 3v5H3M12 3v5h5M17 12h-5v5M3 12h5v5' // corners pointing in: exit
                        : 'M3 8V3h5M12 3h5v5M17 12v5h-5M8 17H3v-5' // corners pointing out: enter
                    }
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            )}

            {closeState !== 'hidden' && (
              <button
                type="button"
                className={`${titleButton} enabled:hover:bg-[#F2A99E]`}
                onClick={handleClose}
                disabled={closeState === 'disabled'}
                aria-label="Close"
                title="Close"
              >
                <svg viewBox="0 0 20 20" className="w-4 h-4" aria-hidden="true">
                  <path
                    d="M4 4.5 16 15.5M15.5 4 4.5 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Divider between the title bar and the window contents, edge to edge */}
        <hr className="m-0 shrink-0" />

        {/* contain-content: typing or scrolling in here never makes the browser redraw anything outside the window */}
        <div className={`flex-1 min-h-0 overflow-auto contain-content ${BODY_BG} ${bodyClassName}`}>{children}</div>

        {footer && (
          <>
            <hr className="m-0 shrink-0" />
            <div className={`shrink-0 bg-[#F6EDE2] ${footerClassName}`}>{footer}</div>
          </>
        )}
      </div>

      {/* Hand-drawn frame, painted over the surface's edges. Left out in full screen,
          where its rounded corners would leave gaps at the corners of the screen. */}
      {!isFullscreen && (
        <div aria-hidden="true" className="doodle-border pointer-events-none absolute inset-0 z-10" />
      )}

      {canResize && (
        <>
          {EDGE_HANDLES.map(({ edge, className: handleClass }) => (
            <div
              key={edge}
              onPointerDown={startResize(edge)}
              className={`absolute touch-none ${handleClass}`}
              aria-hidden="true"
            />
          ))}

          {/* Bottom-right corner: the visible grip, also keyboard resizable */}
          <div
            role="slider"
            tabIndex={0}
            aria-label="Resize window with arrow keys"
            aria-valuenow={Math.round(rect?.width ?? 0)}
            onPointerDown={startResize('se')}
            onKeyDown={handleCornerKey}
            className="absolute z-30 -bottom-1 -right-1 w-6 h-6 pb-1.5 pr-1.5 cursor-nwse-resize touch-none flex items-end justify-end focus-visible:outline-2 focus-visible:outline-dashed"
          >
          </div>
        </>
      )}
    </div>
  );
}