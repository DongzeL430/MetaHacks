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
import { createPortal, flushSync } from 'react-dom';
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
  /** Pin: stops moving, resizing and tiling. Enabled unless set otherwise. */
  pin?: WindowControlState;
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
 * WINDOW MANAGER
 * Wrap a group of windows in <WindowManagerProvider>. It handles:
 *  - Stacking: the last window opened or clicked sits on top. Sizes never change on click.
 *  - Tiling: when a window opens, the unpinned windows are moved and resized into a pattern:
 *      2 windows  -> left and right halves
 *      3-4        -> quadrants (oldest top-left, then top-right, bottom-left, bottom-right)
 *      5 or more  -> no rearranging; the new window just opens on top
 *    Pinned windows and windows with `excludeFromLayout` are left alone and don't take a tile.
 *    Drag a tiled window by its title bar onto another tile to swap places (or into an empty
 *    quadrant to move there). Hold Shift while dragging to place it freely instead.
 *    On small screens (below `tilingMinWidth`, 768px by default) none of this applies:
 *    new windows simply open on top of the others.
 *  - Pinning: a pinned window can't be moved, resized or tiled.
 * Windows outside a provider work on their own, without tiling.
 * ------------------------------------------------------------------ */

/** Space between tiled windows, in px */
const TILE_GAP = 8;
/** How long windows take to glide into their tiles */
const TILE_MS = 380;

/** A tile, as fractions of the desk area (0 to 1) */
export interface Tile {
  left: number;
  top: number;
  width: number;
  height: number;
}

const HALF_LEFT: Tile = { left: 0, top: 0, width: 0.5, height: 1 };
const HALF_RIGHT: Tile = { left: 0.5, top: 0, width: 0.5, height: 1 };
const TOP_LEFT: Tile = { left: 0, top: 0, width: 0.5, height: 0.5 };
const TOP_RIGHT: Tile = { left: 0.5, top: 0, width: 0.5, height: 0.5 };
const BOTTOM_LEFT: Tile = { left: 0, top: 0.5, width: 0.5, height: 0.5 };
const BOTTOM_RIGHT: Tile = { left: 0.5, top: 0.5, width: 0.5, height: 0.5 };

/** Tile patterns by number of tiled windows. Counts not listed here don't rearrange anything. */
const LAYOUTS: Record<number, Tile[]> = {
  2: [HALF_LEFT, HALF_RIGHT],
  3: [TOP_LEFT, TOP_RIGHT, BOTTOM_LEFT],
  4: [TOP_LEFT, TOP_RIGHT, BOTTOM_LEFT, BOTTOM_RIGHT],
};

/** Spots a dragged window can be dropped into, by number of tiled windows (3 windows can use the empty quadrant) */
const DROP_SLOTS: Record<number, Tile[]> = {
  2: [HALF_LEFT, HALF_RIGHT],
  3: [TOP_LEFT, TOP_RIGHT, BOTTOM_LEFT, BOTTOM_RIGHT],
  4: [TOP_LEFT, TOP_RIGHT, BOTTOM_LEFT, BOTTOM_RIGHT],
};

const sameTile = (a: Tile | undefined, b: Tile | undefined) =>
  !!a && !!b && a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height;

interface WindowManagerActions {
  /** A window appeared. `tiled` = false keeps it out of the layout. */
  open: (id: string, tiled: boolean) => void;
  close: (id: string) => void;
  /** Bring to the front (z-order only, size untouched) */
  focus: (id: string) => void;
  setPinned: (id: string, pinned: boolean) => void;
  /** Move a tiled window into another tile, swapping with whoever is there */
  moveToTile: (id: string, tile: Tile) => void;
}

interface WindowManagerState {
  /** Back to front */
  zOrder: string[];
  /** In the order they opened, for handing out tiles */
  opened: string[];
  excluded: ReadonlySet<string>;
  pinned: ReadonlySet<string>;
  /**
   * Bumped each time windows are rearranged. Windows listed in `apply` move into their tile;
   * the rest stay where the user put them.
   */
  layout: { version: number; tiles: Record<string, Tile>; apply: string[] };
  /** False on small screens: no auto-arranging, no drop targets */
  tilingEnabled: boolean;
}

/** Open windows currently taking part in the layout */
const tiledWindows = (s: WindowManagerState) =>
  s.opened.filter((w) => s.layout.tiles[w] && !s.excluded.has(w) && !s.pinned.has(w));

const EMPTY_MANAGER: WindowManagerState = {
  zOrder: [],
  opened: [],
  excluded: new Set(),
  pinned: new Set(),
  layout: { version: 0, tiles: {}, apply: [] },
  tilingEnabled: false,
};

// Two contexts: the actions never change, so registering a window never re-runs because the state moved
const WindowManagerActionsContext = createContext<WindowManagerActions | null>(null);
const WindowManagerStateContext = createContext<WindowManagerState>(EMPTY_MANAGER);

/** The manager's actions (open / close / focus / pin a window by id), for components inside a WindowManagerProvider */
export const useWindowManager = () => useContext(WindowManagerActionsContext);

/**
 * Lets several windows share one desk area. Each window goes in its own full-size layer, so they
 * all measure the same area, and the layer lets clicks through to whatever is underneath.
 * The desk area needs `relative`.
 */
export function WindowLayer({ children }: { children: ReactNode }) {
  return <div className="absolute inset-0 pointer-events-none [&>*]:pointer-events-auto">{children}</div>;
}

export function WindowManagerProvider({
  children,
  tilingMinWidth = 768,
}: {
  children: ReactNode;
  /** Screen width (px) below which windows stop tiling and just stack on top of each other */
  tilingMinWidth?: number;
}) {
  const [state, setState] = useState<WindowManagerState>(EMPTY_MANAGER);

  // Tiling only on screens at least tilingMinWidth wide. Follows the window as it's resized.
  const query = `(min-width: ${tilingMinWidth}px)`;
  const [tilingEnabled, setTilingEnabled] = useState(
    () => typeof window === 'undefined' || window.matchMedia(query).matches,
  );
  useEffect(() => {
    const media = window.matchMedia(query);
    const onChange = () => setTilingEnabled(media.matches);
    onChange();
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [query]);
  // The actions below never change, so they read the current value through a ref
  const tilingRef = useRef(tilingEnabled);
  tilingRef.current = tilingEnabled;

  const actions = useMemo<WindowManagerActions>(
    () => ({
      open: (id, tiled) =>
        setState((prev) => {
          if (prev.opened.includes(id)) return prev;
          const opened = [...prev.opened, id];
          const excluded = new Set(prev.excluded);
          if (tiled) excluded.delete(id);
          else excluded.add(id);
          const zOrder = [...prev.zOrder.filter((w) => w !== id), id];

          // Rearrange only on a big enough screen, and only when the new window itself takes part
          const takesPart = tilingRef.current && tiled && !prev.pinned.has(id);
          const tiledIds = opened.filter((w) => !excluded.has(w) && !prev.pinned.has(w));
          const pattern = LAYOUTS[tiledIds.length];
          const layout =
            takesPart && pattern
              ? {
                  version: prev.layout.version + 1,
                  tiles: Object.fromEntries(tiledIds.map((w, i) => [w, pattern[i]])),
                  apply: tiledIds,
                }
              : prev.layout;

          return { ...prev, opened, excluded, zOrder, layout };
        }),
      close: (id) =>
        setState((prev) =>
          prev.opened.includes(id)
            ? { ...prev, opened: prev.opened.filter((w) => w !== id), zOrder: prev.zOrder.filter((w) => w !== id) }
            : prev,
        ),
      focus: (id) =>
        setState((prev) =>
          !prev.zOrder.includes(id) || prev.zOrder[prev.zOrder.length - 1] === id
            ? prev
            : { ...prev, zOrder: [...prev.zOrder.filter((w) => w !== id), id] },
        ),
      moveToTile: (id, tile) =>
        setState((prev) => {
          const current = prev.layout.tiles[id];
          if (!current || sameTile(current, tile)) return prev;
          const occupant = tiledWindows(prev).find((w) => w !== id && sameTile(prev.layout.tiles[w], tile));
          const tiles = { ...prev.layout.tiles, [id]: tile };
          if (occupant) tiles[occupant] = current; // swap
          return {
            ...prev,
            layout: { version: prev.layout.version + 1, tiles, apply: occupant ? [id, occupant] : [id] },
          };
        }),
      setPinned: (id, pinned) =>
        setState((prev) => {
          if (prev.pinned.has(id) === pinned) return prev;
          const next = new Set(prev.pinned);
          if (pinned) next.add(id);
          else next.delete(id);
          return { ...prev, pinned: next };
        }),
    }),
    [],
  );

  const value = useMemo(() => ({ ...state, tilingEnabled }), [state, tilingEnabled]);

  return (
    <WindowManagerActionsContext.Provider value={actions}>
      <WindowManagerStateContext.Provider value={value}>{children}</WindowManagerStateContext.Provider>
    </WindowManagerActionsContext.Provider>
  );
}

/* ------------------------------------------------------------------ */

/** A fixed size in px, or a function that works it out from the desk area's size when the window opens */
export type InitialSize =
  | { width: number; height: number }
  | ((area: { width: number; height: number }) => { width: number; height: number });

interface AppWindowProps {
  /** Text shown in the title bar */
  title?: ReactNode;
  /** Stable id for the window manager. Optional; one is generated if left out. */
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
  /**
   * Opens at this size, centered. Without it, the window opens filling its area.
   * Pass a function to size it relative to the desk, e.g. ({ width, height }) => ({ width: width * 0.6, height: height * 0.8 }).
   */
  initialSize?: InitialSize;
  /** Makes the window unclickable and unfocusable, e.g. while a popup sits on top of it */
  inactive?: boolean;
  /** Keep this window out of the tiling layout (e.g. a modal popup) */
  excludeFromLayout?: boolean;
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
  onMove: (dx: number, dy: number, ev: PointerEvent) => void,
  onEnd?: () => void,
) => {
  target.setPointerCapture(e.pointerId);
  const startX = e.clientX;
  const startY = e.clientY;

  const move = (ev: PointerEvent) => onMove(ev.clientX - startX, ev.clientY - startY, ev);
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
  inactive = false,
  excludeFromLayout = false,
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
  /** Where a dragged tiled window would land, in viewport pixels (shown as a dashed outline) */
  const [dropPreview, setDropPreview] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const [isRebounding, setIsRebounding] = useState(false);
  const reboundTimer = useRef<number | undefined>(undefined);
  const [selfOpen, setSelfOpen] = useState(true);
  const isOpen = open ?? selfOpen;
  // Latest callback, for the Escape listener below
  const onFullscreenChangeRef = useRef(onFullscreenChange);
  onFullscreenChangeRef.current = onFullscreenChange;
  const reducedMotion = usePrefersReducedMotion();

  const closeState = controls?.close ?? 'disabled';
  const fullscreenState = controls?.fullscreen ?? 'disabled';
  const pinState = controls?.pin ?? 'enabled';

  /* ---------- Window manager ---------- */
  const autoId = useId();
  const windowId = id ?? autoId;
  const manager = useContext(WindowManagerActionsContext);
  const managerState = useContext(WindowManagerStateContext);

  // Registered before the first paint, so a tile handed out on opening is in place right away
  useLayoutEffect(() => {
    if (!manager || !isOpen) return;
    manager.open(windowId, !excludeFromLayout);
    return () => manager.close(windowId);
  }, [manager, isOpen, windowId, excludeFromLayout]);

  // Pinned state lives in the manager (it affects tiling); a window on its own keeps it locally
  const [selfPinned, setSelfPinned] = useState(false);
  const pinned = manager ? managerState.pinned.has(windowId) : selfPinned;
  const togglePin = () => (manager ? manager.setPinned(windowId, !pinned) : setSelfPinned(!pinned));

  const stackIndex = managerState.zOrder.indexOf(windowId);
  const tile = managerState.layout.tiles[windowId];
  const layoutVersion = managerState.layout.version;

  const canResize = resizable && !isFullscreen && !pinned;
  const canMove = movable && !isFullscreen && !pinned;
  const canFullscreen = fullscreenState === 'enabled' && !pinned;

  /* ---------- Measuring ---------- */

  /**
   * Current window edges and the area it's allowed to occupy, in viewport pixels.
   * Uses the layout size and the saved position rather than getBoundingClientRect,
   * because the on-screen box can be mid-animation (popping in, springing back or gliding into a tile).
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

    // Drop slots: only on big screens, for a window that's part of a 2 to 4 window layout
    const tiled = manager && managerState.tilingEnabled ? tiledWindows(managerState) : [];
    const slots = tile && tiled.includes(windowId) ? DROP_SLOTS[tiled.length] ?? [] : [];
    const areaW = box.right - box.left;
    const areaH = box.bottom - box.top;
    const slotRect = (t: Tile) => ({
      left: box.left + t.left * areaW,
      top: box.top + t.top * areaH,
      width: t.width * areaW,
      height: t.height * areaH,
    });
    let dropTarget: Tile | null = null;

    trackPointer(
      e.currentTarget,
      e,
      (dx, dy, ev) => {
        last.x = clamp(baseX + dx, dragMinX, dragMaxX);
        last.y = clamp(baseY + dy, dragMinY, dragMaxY);
        frame.style.translate = `${last.x - baseX}px ${last.y - baseY}px`;

        if (slots.length === 0) return;
        // The slot under the pointer, unless it's this window's own (or Shift is held for free placement)
        const hit = ev.shiftKey
          ? null
          : slots.find((t) => {
              const r = slotRect(t);
              return ev.clientX >= r.left && ev.clientX < r.left + r.width && ev.clientY >= r.top && ev.clientY < r.top + r.height;
            }) ?? null;
        const next = hit && !sameTile(hit, tile) ? hit : null;
        const changed = next === null ? dropTarget !== null : !sameTile(next, dropTarget ?? undefined);
        if (changed) {
          dropTarget = next;
          setDropPreview(next ? slotRect(next) : null); // re-renders only when the target changes
        }
      },
      () => {
        setIsDragging(false);
        frame.style.willChange = '';
        setDropPreview(null);

        if (dropTarget && manager) {
          // Dropped on another tile: settle where it was let go, then glide into the new tile
          // (whoever was there glides into this window's old one)
          frame.style.translate = '';
          flushSync(() => setRect({ x: last.x, y: last.y, width, height }));
          manager.moveToTile(windowId, dropTarget);
          return;
        }

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

  // Spawn position, every time the window opens: centered at initialSize, or filling its area
  // (which is centered too) when there's no initialSize. Runs before the first paint, so nothing jumps.
  // If the window manager hands out a tile on opening, the tile replaces this, also before the first paint.
  useLayoutEffect(() => {
    if (!isOpen) return;
    stopRebound();
    if (!initialSize) {
      setRect(null);
      return;
    }
    const parent = frameRef.current?.parentElement;
    if (!parent) return;
    const box = getContentBox(parent);
    const areaW = box.right - box.left;
    const areaH = box.bottom - box.top;
    const size = typeof initialSize === 'function' ? initialSize({ width: areaW, height: areaH }) : initialSize;
    const width = Math.round(clamp(size.width, Math.min(minWidth, areaW), areaW));
    const height = Math.round(clamp(size.height, Math.min(minHeight, areaH), areaH));
    setRect({ x: (areaW - width) / 2, y: (areaH - height) / 2, width, height });
    // Only when it opens: after that, size and position are up to the user (and tiling)
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

  /* ---------- Tiling ---------- */
  const [isTiling, setIsTiling] = useState(false);
  const tilingTimer = useRef<number | undefined>(undefined);
  // False until the window has been on screen for a frame: a brand-new window jumps straight to its tile
  const shownRef = useRef(false);
  useEffect(() => {
    shownRef.current = isOpen;
  }, [isOpen]);

  // When the manager rearranges, move + resize into this window's tile (gliding there if already on screen)
  useLayoutEffect(() => {
    if (!tile || pinned || isFullscreen || !isOpen) return;
    if (!managerState.layout.apply.includes(windowId)) return;
    const parent = frameRef.current?.parentElement;
    if (!parent) return;

    const box = getContentBox(parent);
    const areaW = box.right - box.left;
    const areaH = box.bottom - box.top;
    const gap = TILE_GAP / 2; // half on each shared edge, none against the desk's outer edges
    const x = tile.left * areaW + (tile.left > 0 ? gap : 0);
    const y = tile.top * areaH + (tile.top > 0 ? gap : 0);
    const right = (tile.left + tile.width) * areaW - (tile.left + tile.width < 1 ? gap : 0);
    const bottom = (tile.top + tile.height) * areaH - (tile.top + tile.height < 1 ? gap : 0);
    const target = { x, y, width: right - x, height: bottom - y };

    stopRebound();

    if (!shownRef.current || reducedMotion) {
      setRect(target);
      return;
    }

    // Turn on the position/size transition first, then move, so the move animates
    setIsTiling(true);
    const frame = requestAnimationFrame(() => setRect(target));
    window.clearTimeout(tilingTimer.current);
    tilingTimer.current = window.setTimeout(() => setIsTiling(false), TILE_MS + 80);
    return () => cancelAnimationFrame(frame);
    // Only when a new layout is handed out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutVersion]);

  useEffect(() => () => window.clearTimeout(tilingTimer.current), []);

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
    if (!canFullscreen || (e.target as HTMLElement).closest('button')) return;
    toggleFullscreen();
  };

  // The pop-in, the rebound and tiling animate; nothing does with reduced motion
  const transition = reducedMotion
    ? 'none'
    : [
        `scale 260ms ${EASE_OUT}`,
        'opacity 200ms ease-out',
        // The spring-back animates translate only, so it also stays off the layout and paint path
        ...(isRebounding ? [`translate ${REBOUND_MS}ms ${SPRING}`] : []),
        // Gliding into a tile: only while a rearrange is running, so dragging and resizing stay instant
        ...(isTiling
          ? ['left', 'top', 'width', 'height'].map((p) => `${p} ${TILE_MS}ms ${EASE_OUT}`)
          : []),
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
        transition,
      };

  // Paper chips that sit on top of the title bar. Hover lifts and tilts them, press pushes them in.
  const titleButton = [
    'shrink-0 w-8 h-8 p-0 flex items-center justify-center rounded-md',
    'border-2 border-[#3c3c3c] [border-image:none]',
    'shadow-[2px_2px_0_rgba(60,60,60,0.35)] transition duration-150 ease-out',
    'disabled:opacity-45 disabled:cursor-not-allowed disabled:shadow-none',
    'enabled:hover:shadow-[3px_4px_0_#3c3c3c] enabled:active:shadow-[1px_1px_0_#3c3c3c]',
    'motion-safe:enabled:hover:-translate-y-0.5 motion-safe:enabled:hover:-rotate-6',
    'motion-safe:enabled:active:translate-y-0 motion-safe:enabled:active:rotate-0',
  ].join(' ');

  if (!isOpen) return null;

  return (
    <>
      {dropPreview &&
        createPortal(
          <div
            aria-hidden="true"
            className="pointer-events-none fixed z-[25] rounded-md border-2 border-dashed border-[#3c3c3c] bg-[#F2A65A]/20 motion-safe:transition-opacity motion-safe:duration-150 starting:opacity-0"
            style={{
              left: dropPreview.left + TILE_GAP / 2,
              top: dropPreview.top + TILE_GAP / 2,
              width: dropPreview.width - TILE_GAP,
              height: dropPreview.height - TILE_GAP,
            }}
          />,
          document.body,
        )}
    <div
      ref={frameRef}
      style={frameStyle}
      // Clicking anywhere on a window brings it to the front (its size stays the same)
      onPointerDownCapture={() => manager?.focus(windowId)}
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
            {pinState !== 'hidden' && (
              <button
                type="button"
                className={`${titleButton} ${pinned ? 'bg-[#F2A65A]' : 'bg-[#FDF7F1] enabled:hover:bg-[#EADBC8]'}`}
                onClick={togglePin}
                disabled={pinState === 'disabled' || isFullscreen}
                aria-pressed={pinned}
                aria-label={pinned ? 'Unpin window' : 'Pin window'}
                title={pinned ? 'Unpin (allow moving and resizing)' : 'Pin (stop moving, resizing and auto-arranging)'}
              >
                <svg viewBox="0 0 20 20" className="w-4 h-4" aria-hidden="true">
                  <path
                    d="M7.5 2.5h5l-.8 5 2.8 2.8v1.7h-9v-1.7L8.3 7.5zM10 12v5.5"
                    fill={pinned ? 'currentColor' : 'none'}
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            )}

            {fullscreenState !== 'hidden' && (
              <button
                type="button"
                className={`${titleButton} bg-[#FDF7F1] enabled:hover:bg-[#BFE3C4]`}
                onClick={toggleFullscreen}
                disabled={!canFullscreen}
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
                className={`${titleButton} bg-[#FDF7F1] enabled:hover:bg-[#F2A99E]`}
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
    </>
  );
}