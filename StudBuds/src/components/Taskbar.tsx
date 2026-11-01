import type { ReactNode } from 'react';

/*
 * SIZING: the avatar is centered on the bar's bottom line, so half of it sits inside the bar.
 * Its diameter is fluid: it grows smoothly with the viewport width instead of jumping at a breakpoint.
 *
 *   --avatar = clamp(6rem, 4rem + 6vw, 9rem)
 *   -> 96px up to about 530px wide, growing to 144px by about 1300px wide.
 *
 * Everything else is derived from --avatar, so it all scales together:
 *   bar height     = half the avatar + 8px  (8px of clearance above the avatar)
 *   page clearance = the same value         (TASKBAR_CLEARANCE below)
 *   name box overlap and padding are fractions of --avatar
 *
 * To change the sizes, edit the clamp(...) in the TWO places marked below and keep them identical.
 * (Tailwind only generates classes it can read as literal text, so the value can't be shared
 * through a JS variable. Spaces are written as underscores inside the brackets.)
 */

/**
 * Top padding a page needs so its content clears the half of the avatar
 * that hangs below the taskbar. Add it to the element right under <Taskbar />.
 * Must use the same clamp(...) as the header below.
 */
export const TASKBAR_CLEARANCE = 'pt-[calc(clamp(6rem,4rem_+_6vw,9rem)/2_+_8px)]';

/** One app button in the taskbar, usually opening and closing an app window */
export interface TaskbarApp {
  /** Unique id, used by `visibleApps` */
  id: string;
  /** Tooltip and screen reader name, e.g. "Survey" */
  label: string;
  /** A small icon. An <svg> is sized to fit automatically. */
  icon: ReactNode;
  /** The app's window is open: the button looks pressed and gets a dot under it */
  open?: boolean;
  /** Usually toggles the app's window */
  onClick?: () => void;
  disabled?: boolean;
  /** Hide this one button */
  hidden?: boolean;
}

interface TaskbarProps {
  /** The user's generated name, shown next to the avatar */
  userName?: string;
  /** Replaces the default avatar drawing. Size it with w-full h-full to fill the circle slot. */
  avatar?: ReactNode;
  /** App buttons, in the order they appear */
  apps?: TaskbarApp[];
  /**
   * Which app ids to show on this page. Leave it out to show every app that isn't `hidden`.
   * e.g. visibleApps={['survey']} on one page, visibleApps={['survey', 'about']} on another.
   */
  visibleApps?: string[];
  /** Optional content for the right side (step counter, clock, etc.) */
  right?: ReactNode;
  /** Extra classes for the bar itself */
  className?: string;
}

function DefaultAvatar({ label }: { label: string }) {
  return (
    <svg className="w-full h-full" viewBox="0 0 48 48" role="img" aria-label={label}>
      {/* Filled with the page background color so it masks the line behind it */}
      <circle cx="24" cy="24" r="21" fill="#FDF7F1" stroke="currentColor" strokeWidth="3" />
      <ellipse cx="24" cy="20" rx="5" ry="4" fill="currentColor" />
      <path d="M8 38 Q24 14 40 38 Z" fill="currentColor" />
    </svg>
  );
}

/** Paper chip like the window buttons. Open apps look pressed in and get a dot underneath. */
function TaskbarAppButton({ app }: { app: TaskbarApp }) {
  return (
    <button
      type="button"
      onClick={app.onClick}
      disabled={app.disabled}
      aria-pressed={app.open ?? false}
      aria-label={app.label}
      title={app.label}
      className={[
        'relative shrink-0 w-10 h-10 md:w-11 md:h-11 p-0 flex items-center justify-center rounded-md',
        'border-2 border-[#3c3c3c] [border-image:none] transition duration-150 ease-out',
        'disabled:opacity-45 disabled:cursor-not-allowed',
        app.open
          ? 'bg-[#DFCDB4] shadow-[inset_0_2px_3px_rgba(60,60,60,0.35)]'
          : [
              'bg-[#FDF7F1] shadow-[2px_2px_0_rgba(60,60,60,0.35)]',
              'enabled:hover:shadow-[3px_4px_0_#3c3c3c] enabled:active:shadow-[1px_1px_0_#3c3c3c]',
              'motion-safe:enabled:hover:-translate-y-0.5 motion-safe:enabled:active:translate-y-0',
            ].join(' '),
      ].join(' ')}
    >
      <span aria-hidden="true" className="flex w-5 h-5 md:w-6 md:h-6 [&>svg]:w-full [&>svg]:h-full">
        {app.icon}
      </span>
      {app.open && (
        <span aria-hidden="true" className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-[#3c3c3c]" />
      )}
    </button>
  );
}

export default function Taskbar({
  userName = 'Generated Name',
  avatar,
  apps = [],
  visibleApps,
  right,
  className = '',
}: TaskbarProps) {
  const shownApps = apps.filter((app) => !app.hidden && (!visibleApps || visibleApps.includes(app.id)));

  return (
    /* A slim full-width bar in a different shade than the page.
       The inset highlight on top and soft shadow underneath give it a raised, bevelled look.
       The hand-drawn line (doodle's <hr>) is its bottom edge; the avatar + name box sit on it.
       The first two classes define --avatar and size the bar from it (clamp #1 of 2). */
    <header
      className={`relative z-20 shrink-0 [--avatar:clamp(6rem,4rem_+_6vw,9rem)] h-[calc(var(--avatar)/2_+_8px)] ${className}`}
    >
      {/* Bar fill. Stops 3px short of the bottom so its straight edge hides under the wobbly
          hand-drawn line instead of showing below it. */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 bottom-[3px] bg-[#EADBC8] shadow-[inset_0_2px_0_rgba(255,255,255,0.7),0_3px_6px_rgba(60,60,60,0.18)]"
      />
      <hr className="absolute bottom-0 left-0 right-0 m-0" />

      {/* Left: avatar + name, attached, straddling the bar's bottom edge */}
      <div className="absolute bottom-0 left-4 md:left-10 translate-y-1/2 flex items-center">
        <div className="relative z-10 w-[var(--avatar)] h-[var(--avatar)] shrink-0">
          {avatar ?? <DefaultAvatar label={`${userName}'s avatar`} />}
        </div>

        {/* Tucks under the avatar by 15% of its size. Three layers: the fill (inset 5px so its
            corners hide under the hand-drawn line), the text, then the frame drawn on top.
            The 10px in the padding is the frame's thickness; the rest clears the avatar overlap. */}
        <div className="relative min-w-0 max-w-[12rem] md:max-w-xs ml-[calc(var(--avatar)*-0.15)]">
          <div aria-hidden="true" className="absolute inset-[5px] bg-[#FDF7F1]" />
          <p className="relative m-0 truncate text-lg md:text-xl py-[calc(10px_+_0.25rem)] pr-[calc(10px_+_1rem)] pl-[calc(10px_+_var(--avatar)*0.15_+_12px)]">
            {userName}
          </p>
          <div aria-hidden="true" className="doodle-border pointer-events-none absolute inset-0" />
        </div>
      </div>

      {/* Right: app buttons, then the system-tray slot. Vertically centered in the bar fill. */}
      {(shownApps.length > 0 || right) && (
        <div className="absolute right-3 md:right-6 top-0 bottom-[3px] flex items-center gap-3 md:gap-4">
          {shownApps.length > 0 && (
            <nav aria-label="Apps" className="flex items-center gap-2">
              {shownApps.map((app) => (
                <TaskbarAppButton key={app.id} app={app} />
              ))}
            </nav>
          )}

          {right && (
            <div className="flex items-center gap-3 px-3 py-1 text-sm md:text-base bg-[#DFCDB4] shadow-[inset_0_2px_3px_rgba(60,60,60,0.3)] rounded">
              {right}
            </div>
          )}
        </div>
      )}
    </header>
  );
}