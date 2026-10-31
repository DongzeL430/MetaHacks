import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode } from 'react';

type ResizeEdge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

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

interface AppWindowProps {
  /** Text shown in the title bar */
  title?: ReactNode;
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
  /** The X button is disabled unless this is set to false */
  closeDisabled?: boolean;
  /** The full screen button is disabled unless this is set to false */
  fullscreenDisabled?: boolean;
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

const SHADOW_RESTING =
  'shadow-[5px_7px_0_rgba(60,60,60,0.2),0_14px_30px_-6px_rgba(60,60,60,0.35)]';
const SHADOW_LIFTED =
  'shadow-[8px_11px_0_rgba(60,60,60,0.18),0_22px_40px_-8px_rgba(60,60,60,0.42)]';

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

export default function AppWindow({
  title = 'Untitled',
  children,
  footer,
  resizable = true,
  movable = true,
  minWidth = 280,
  minHeight = 200,
  closeDisabled = true,
  fullscreenDisabled = true,
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

  const canResize = resizable && !isFullscreen;
  const canMove = movable && !isFullscreen;

  /** Current window edges and the area it's allowed to occupy, in viewport pixels */
  const measure = () => {
    const frame = frameRef.current;
    const parent = frame?.parentElement;
    if (!frame || !parent) return null;
    return { start: frame.getBoundingClientRect(), box: getContentBox(parent) };
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

  const startResize = (edge: ResizeEdge) => (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!canResize || e.button !== 0) return;
    const measured = measure();
    if (!measured) return;

    e.preventDefault();
    const { start, box } = measured;
    trackPointer(e.currentTarget, e, (dx, dy) => setRect(resizeFrom(edge, start, box, dx, dy)));
  };

  /** Dragging the title bar slides the window around inside its area */
  const startMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!canMove || e.button !== 0) return;
    if ((e.target as HTMLElement).closest('button')) return;
    const measured = measure();
    if (!measured) return;

    e.preventDefault();
    const { start, box } = measured;
    const baseX = start.left - box.left;
    const baseY = start.top - box.top;
    const maxX = Math.max(0, box.right - box.left - start.width);
    const maxY = Math.max(0, box.bottom - box.top - start.height);

    setIsDragging(true);
    trackPointer(
      e.currentTarget,
      e,
      (dx, dy) =>
        setRect({
          x: clamp(baseX + dx, 0, maxX),
          y: clamp(baseY + dy, 0, maxY),
          width: start.width,
          height: start.height,
        }),
      () => setIsDragging(false),
    );
  };

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
  }, [minWidth, minHeight]);

  const toggleFullscreen = () => {
    const next = !isFullscreen;
    setIsFullscreen(next);
    onFullscreenChange?.(next);
  };

  const rectStyle =
    rect && !isFullscreen
      ? { left: rect.x, top: rect.y, width: rect.width, height: rect.height }
      : { left: 0, top: 0, width: '100%', height: '100%' };

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

  return (
    <div
      ref={frameRef}
      style={{ ...rectStyle, minWidth, minHeight, maxWidth: '100%', maxHeight: '100%' }}
      className={`relative ${className}`}
    >
      {/* SURFACE: the window's fill. Inset so its edges tuck under the hand-drawn line. */}
      <div
        style={{ inset: SURFACE_INSET }}
        className={`absolute flex flex-col overflow-hidden bg-[#FDF7F1] transition-shadow duration-200 ${
          isDragging ? SHADOW_LIFTED : SHADOW_RESTING
        }`}
      >
        {/* TITLE BAR: drag it to move the window */}
        <div
          onPointerDown={startMove}
          className={`shrink-0 flex items-center gap-3 pl-4 pr-2.5 py-2 bg-[#EADBC8] touch-none select-none ${
            canMove ? (isDragging ? 'cursor-grabbing' : 'cursor-grab') : ''
          }`}
        >
          <p className="flex-1 min-w-0 m-0 truncate text-lg">{title}</p>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className={`${titleButton} enabled:hover:bg-[#BFE3C4]`}
              onClick={toggleFullscreen}
              disabled={fullscreenDisabled}
              aria-label={isFullscreen ? 'Exit full screen' : 'Full screen'}
              title={isFullscreen ? 'Exit full screen' : 'Full screen'}
            >
              <svg viewBox="0 0 20 20" className="w-4 h-4" aria-hidden="true">
                <path
                  d="M3 8V3h5M12 3h5v5M17 12v5h-5M8 17H3v-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>

            <button
              type="button"
              className={`${titleButton} enabled:hover:bg-[#F2A99E]`}
              onClick={onClose}
              disabled={closeDisabled}
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
          </div>
        </div>

        {/* Divider between the title bar and the window contents, edge to edge */}
        <hr className="m-0 shrink-0" />

        <div className={`flex-1 min-h-0 overflow-auto ${BODY_BG} ${bodyClassName}`}>{children}</div>

        {footer && (
          <>
            <hr className="m-0 shrink-0" />
            <div className={`shrink-0 bg-[#F6EDE2] ${footerClassName}`}>{footer}</div>
          </>
        )}
      </div>

      {/* Hand-drawn frame, painted over the surface's edges */}
      <div aria-hidden="true" className="doodle-border pointer-events-none absolute inset-0 z-10" />

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