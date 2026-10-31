import type { ReactNode } from 'react';

/*
 * SIZING: the avatar is centered on the bar's bottom line, so half of it sits inside the bar.
 * The bar is (half the avatar) + 8px tall, which leaves 8px of clearance above the avatar
 * so it never touches or runs off the top of the screen.
 *   mobile: avatar 96px (w-24)  -> half 48px + 8px = 56px bar (h-14)
 *   md+:    avatar 144px (w-36) -> half 72px + 8px = 80px bar (md:h-20)
 * If you change the avatar size, change the bar height and TASKBAR_CLEARANCE to match.
 */

/**
 * Top padding a page needs so its content clears the half of the avatar
 * that hangs below the taskbar. Add it to the element right under <Taskbar />.
 */
// Avatar hangs 48px (mobile) / 72px (md+) below the bar. This leaves 8px under it.
export const TASKBAR_CLEARANCE = 'pt-14 md:pt-20';

interface TaskbarProps {
  /** The user's generated name, shown next to the avatar */
  userName?: string;
  /** Replaces the default avatar drawing. Size it with w-full h-full to fill the circle slot. */
  avatar?: ReactNode;
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

export default function Taskbar({
  userName = 'Generated Name',
  avatar,
  right,
  className = '',
}: TaskbarProps) {
  return (
    /* A slim full-width bar in a different shade than the page.
       The inset highlight on top and soft shadow underneath give it a raised, bevelled look.
       The hand-drawn line (doodle's <hr>) is its bottom edge; the avatar + name box sit on it. */
    <header
      className={`relative z-20 shrink-0 h-14 md:h-20 bg-[#EADBC8] shadow-[inset_0_2px_0_rgba(255,255,255,0.7),0_3px_6px_rgba(60,60,60,0.18)] ${className}`}
    >
      <hr className="absolute bottom-0 left-0 right-0 m-0" />

      {/* Left: avatar + name, attached, straddling the bar's bottom edge */}
      <div className="absolute bottom-0 left-4 md:left-10 translate-y-1/2 flex items-center">
        <div className="relative z-10 w-24 h-24 md:w-36 md:h-36 shrink-0">
          {avatar ?? <DefaultAvatar label={`${userName}'s avatar`} />}
        </div>

        <p className="doodle-border bg-[#FDF7F1] -ml-5 pl-8 pr-4 py-1 text-lg md:text-xl max-w-[12rem] md:max-w-xs truncate">
          {userName}
        </p>
      </div>

      {/* Right: system-tray style slot, sunken into the bar */}
      {right && (
        <div className="absolute right-3 md:right-6 top-1/2 -translate-y-[60%] flex items-center gap-3 px-3 py-1 text-sm md:text-base bg-[#DFCDB4] shadow-[inset_0_2px_3px_rgba(60,60,60,0.3)] rounded">
          {right}
        </div>
      )}
    </header>
  );
}