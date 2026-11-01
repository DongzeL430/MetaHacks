import type { ReactNode } from 'react';

/*
 * A floating, pill-shaped nav bar: a light pill with the avatar and the user's name on the left,
 * then the app links, on a warm gray capsule.
 *
 * The bar floats OVER the top of the page (position: absolute), so the page's background
 * image runs all the way to the top edge behind it. Content below needs TASKBAR_CLEARANCE
 * so it starts under the bar instead of behind it.
 */

/**
 * Top padding for the page content under <Taskbar />: the bar's top gap + its height + a small gap.
 *   phones: 12px + 56px bar + 12px = 80px
 *   md+:    20px + 64px bar + 16px = 100px
 * If you change the bar's padding or badge size below, update these numbers.
 */
export const TASKBAR_CLEARANCE = 'pt-20 md:pt-[6.25rem]';

/** One app link in the bar, usually opening and closing an app window */
export interface TaskbarApp {
  /** Unique id, used by `visibleApps` */
  id: string;
  /** Tooltip and screen reader name, e.g. "Open study lobbies" */
  label: string;
  /** Short text shown in the bar, e.g. "Lobbies". Falls back to `label`. */
  name?: string;
  /** Small icon, shown instead of the text on narrow screens. An <svg> is sized to fit automatically. */
  icon?: ReactNode;
  /** The app's window is open: the link is highlighted */
  open?: boolean;
  /** Usually toggles the app's window */
  onClick?: () => void;
  disabled?: boolean;
  /** Hide this one link */
  hidden?: boolean;
}

interface TaskbarProps {
  /** The user's name, shown next to the avatar*/
  userName?: string;
  /** Replaces the default drawing in the round badge. Size it with w-full h-full. */
  avatar?: ReactNode;
  /** App links, in the order they appear */
  apps?: TaskbarApp[];
  /**
   * Which app ids to show on this page. Leave it out to show every app that isn't `hidden`.
   * e.g. visibleApps={['lobbies']} on one page, visibleApps={['lobbies', 'connections']} on another.
   */
  visibleApps?: string[];
  /** Optional extra content at the right end of the bar (step counter, clock, etc.) */
  right?: ReactNode;
  /** Extra classes for the outer header */
  className?: string;
}

function DefaultAvatar({ label }: { label: string }) {
  return (
    <svg className="w-full h-full" viewBox="0 0 48 48" role="img" aria-label={label}>
      <ellipse cx="24" cy="19" rx="6" ry="5" fill="currentColor" />
      <path d="M11 38 Q24 16 37 38 Z" fill="currentColor" />
    </svg>
  );
}

/** Text link on the dark bar. Open apps get a soft highlight; on narrow screens only the icon shows. */
function TaskbarAppLink({ app }: { app: TaskbarApp }) {
  const name = app.name ?? app.label;
  return (
    <button
      type="button"
      onClick={app.onClick}
      disabled={app.disabled}
      aria-pressed={app.open ?? false}
      aria-label={app.label}
      title={app.label}
      className={[
        'shrink-0 flex items-center gap-2 rounded-full px-3 sm:px-4 py-2 text-base md:text-lg',
        'border-0 [border-image:none] text-[#FDF7F1] transition-colors duration-150',
        'disabled:opacity-45 disabled:cursor-not-allowed',
        app.open ? 'bg-[#FDF7F1]/25' : 'bg-transparent enabled:hover:bg-[#FDF7F1]/15',
      ].join(' ')}
    >
      {app.icon && (
        <span aria-hidden="true" className="flex sm:hidden w-5 h-5 [&>svg]:w-full [&>svg]:h-full">
          {app.icon}
        </span>
      )}
      <span className={app.icon ? 'hidden sm:inline' : ''}>{name}</span>
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
    // Floats over the page. The full-width strip ignores clicks so windows under it stay reachable;
    // only the pill itself is clickable. z-20 keeps it above windows dragged up under it.
    <header
      className={`pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center px-3 pt-3 md:px-6 md:pt-5 ${className}`}
    >
      <div className="pointer-events-auto w-full max-w-4xl flex items-center gap-1 sm:gap-2 p-1.5 md:p-2 rounded-full bg-[#6B5E54] text-[#FDF7F1] shadow-[0_14px_30px_-12px_rgba(40,30,20,0.55)]">
        {/* Left: avatar badge with the user's name right next to it, in one light pill */}
        <div className="shrink-0 min-w-0 max-w-[55%] sm:max-w-[16rem] flex items-center gap-2 rounded-full bg-[#FDF7F1] text-[#2b2b2b] p-1 pr-4">
          <div className="shrink-0 w-9 h-9 md:w-10 md:h-10 p-1 rounded-full bg-[#EADBC8] overflow-hidden">
            {avatar ?? <DefaultAvatar label={`${userName}'s avatar`} />}
          </div>
          <p className="m-0 min-w-0 truncate text-base md:text-lg">{userName}</p>
        </div>

        {/* Middle: app links. Scrolls sideways if there are more than fit. */}
        <nav aria-label="Apps" className="flex-1 min-w-0 flex items-center gap-1 overflow-x-auto px-1 sm:px-2">
          {shownApps.map((app) => (
            <TaskbarAppLink key={app.id} app={app} />
          ))}
        </nav>

        {right && <div className="shrink-0 hidden sm:flex items-center gap-3 px-3 text-sm">{right}</div>}
      </div>
    </header>
  );
}