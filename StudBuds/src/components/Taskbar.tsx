import { useEffect, useId, useRef, useState } from 'react';
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
  /** The user's name, shown next to the avatar */
  userName?: string;
  /** Replaces the default drawing. A picture shows on its own, without the round badge. Size it with w-full h-full. */
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
  /**
   * Shows the paintbrush button at the very right of the bar. Clicking it drops down a small tall
   * capsule with a sun (default theme) above a star (custom theme). `active` highlights the current one.
   */
  theme?: ThemeMenuProps;
  /** Shows the speaker button next to the paintbrush: the piece playing, mute and volume */
  music?: MusicMenuProps;
  /**
   * Makes the avatar and name clickable, e.g. to open the profile editor.
   * `open` makes it look pressed while that window is open.
   */
  profile?: { open?: boolean; onClick: () => void };
  /** Extra classes for the outer header */
  className?: string;
}

export type ThemeChoice = 'default' | 'custom';

interface ThemeMenuProps {
  active: ThemeChoice;
  onSelectDefault: () => void;
  onSelectCustom: () => void;
}

interface MusicMenuProps {
  /** The piece playing now */
  title: string;
  /** 0 to 1 */
  volume: number;
  muted: boolean;
  onVolume: (volume: number) => void;
  onToggleMute: () => void;
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5 md:w-[22px] md:h-[22px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" fill="currentColor" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5 md:w-[22px] md:h-[22px]" fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3.2l2.6 5.5 6 .7-4.4 4.1 1.2 5.9L12 16.5l-5.4 2.9 1.2-5.9-4.4-4.1 6-.7z" />
    </svg>
  );
}

/** A round white-icon button inside the theme drop-down */
function ThemeOption({ icon, label, active, onClick }: { icon: ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      title={label}
      className={[
        'shrink-0 w-10 h-10 p-0 flex items-center justify-center rounded-full',
        'border-0 [border-image:none] text-white transition-colors duration-150',
        active ? 'bg-paper/25' : 'bg-transparent hover:bg-paper/15',
      ].join(' ')}
    >
      {icon}
    </button>
  );
}

/** The paintbrush button and the small sun / star capsule it drops down */
function ThemeMenu({ active, onSelectDefault, onSelectCustom }: ThemeMenuProps) {
  const menuId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  // Close on a click anywhere else, or Escape
  useEffect(() => {
    if (!open) return;
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
  }, [open]);

  const choose = (select: () => void) => {
    select();
    setOpen(false);
  };

  return (
    <div ref={wrapRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={menuId}
        aria-label="Theme"
        title="Theme"
        className={[
          'w-10 h-10 md:w-11 md:h-11 p-0 flex items-center justify-center rounded-full',
          'border-0 [border-image:none] text-nav-ink transition-colors duration-150',
          open ? 'bg-paper/25' : 'bg-paper/10 hover:bg-paper/20',
        ].join(' ')}
      >
        <PaintbrushIcon />
      </button>

      {open && (
        <div
          id={menuId}
          role="group"
          aria-label="Choose a theme"
          // A tall capsule centered under the paintbrush: sun on top, star below
          className="absolute left-1/2 -translate-x-1/2 top-full mt-3 flex flex-col items-center gap-1 p-1.5 rounded-full bg-nav shadow-[0_10px_24px_-10px_rgba(40,30,20,0.6)] motion-safe:transition motion-safe:duration-150 starting:opacity-0 starting:-translate-y-1"
        >
          <ThemeOption icon={<SunIcon />} label="Default theme" active={active === 'default'} onClick={() => choose(onSelectDefault)} />
          <ThemeOption icon={<StarIcon />} label="Custom theme" active={active === 'custom'} onClick={() => choose(onSelectCustom)} />
        </div>
      )}
    </div>
  );
}

/** Speaker, with sound waves or, when muted, a cross */
function SpeakerIcon({ muted, className = 'w-5 h-5 md:w-6 md:h-6' }: { muted: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" />
      {muted ? <path d="M16 9.5l5 5M21 9.5l-5 5" /> : <path d="M15.5 9.2a4 4 0 0 1 0 5.6M18.3 6.6a7.6 7.6 0 0 1 0 10.8" />}
    </svg>
  );
}

/** The speaker button and the small panel it drops down: what's playing, mute, and volume */
function MusicMenu({ title, volume, muted, onVolume, onToggleMute }: MusicMenuProps) {
  const menuId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  // Close on a click anywhere else, or Escape
  useEffect(() => {
    if (!open) return;
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
  }, [open]);

  return (
    <div ref={wrapRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={muted ? 'Music (muted)' : 'Music'}
        title={muted ? 'Music (muted)' : `Music: ${title}`}
        className={[
          'w-10 h-10 md:w-11 md:h-11 p-0 flex items-center justify-center rounded-full',
          'border-0 [border-image:none] text-nav-ink transition-colors duration-150',
          open ? 'bg-paper/25' : 'bg-paper/10 hover:bg-paper/20',
        ].join(' ')}
      >
        <SpeakerIcon muted={muted} />
      </button>

      {open && (
        <div
          id={menuId}
          role="group"
          aria-label="Music"
          // Lines up with the bar's right end, so it never runs off a narrow screen
          className="absolute right-0 top-full mt-3 w-60 flex flex-col gap-2 p-3 rounded-2xl bg-nav text-nav-ink shadow-[0_10px_24px_-10px_rgba(40,30,20,0.6)] motion-safe:transition motion-safe:duration-150 starting:opacity-0 starting:-translate-y-1"
        >
          <p className="m-0 text-xs opacity-80">Now playing</p>
          <p className="m-0 -mt-1.5 text-sm truncate" title={title}>
            {title}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onToggleMute}
              aria-pressed={muted}
              aria-label="Mute music"
              title={muted ? 'Unmute' : 'Mute'}
              className={[
                'shrink-0 w-9 h-9 p-0 flex items-center justify-center rounded-full',
                'border-0 [border-image:none] text-nav-ink transition-colors duration-150',
                muted ? 'bg-paper/25' : 'bg-transparent hover:bg-paper/15',
              ].join(' ')}
            >
              <SpeakerIcon muted={muted} className="w-5 h-5" />
            </button>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={muted ? 0 : Math.round(volume * 100)}
              onChange={(e) => onVolume(Number(e.target.value) / 100)}
              aria-label="Music volume"
              // doodle.css frames every input; on a slider the frame throws off the track, so
              // the knob looked short of the end at full volume
              className="flex-1 min-w-0 m-0 p-0 border-0 [border-image:none] accent-accent"
            />
          </div>
        </div>
      )}
    </div>
  );
}

/** Paintbrush, drawn at 24x24 */
function PaintbrushIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5 md:w-6 md:h-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20.5 3.5 12.8 11.2" strokeWidth="2.4" />
      <path d="M10.4 9.6l4 4" />
      <path d="M10.6 11.4c-2.1-.3-3.9.9-4.3 3.1-.3 1.8-1.2 3.1-2.8 3.7 2.6 1.3 6.3.7 7.9-1.4 1.1-1.5 1-3.4-.8-5.4z" fill="currentColor" />
    </svg>
  );
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
        'border-0 [border-image:none] text-nav-ink transition-colors duration-150',
        'disabled:opacity-45 disabled:cursor-not-allowed',
        app.open ? 'bg-paper/25' : 'bg-transparent enabled:hover:bg-paper/15',
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
  theme,
  music,
  profile,
  className = '',
}: TaskbarProps) {
  const shownApps = apps.filter((app) => !app.hidden && (!visibleApps || visibleApps.includes(app.id)));

  return (
    // Floats over the page. The full-width strip ignores clicks so windows under it stay reachable;
    // only the pill itself is clickable. z-20 keeps it above windows dragged up under it.
    <header
      className={`pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center px-3 pt-3 md:px-6 md:pt-5 ${className}`}
    >
      <div
        className={[
          'pointer-events-auto w-full max-w-4xl flex items-center gap-1 sm:gap-2 p-1.5 md:p-2 rounded-full',
          'bg-nav text-nav-ink shadow-[0_14px_30px_-12px_rgba(40,30,20,0.55)]',
          // Slides down from above the screen when the page loads (skipped with reduced motion)
          'motion-safe:transition-[translate,opacity] motion-safe:duration-700 motion-safe:ease-[cubic-bezier(0.22,1,0.36,1)]',
          'starting:-translate-y-[calc(100%+2rem)] starting:opacity-0',
        ].join(' ')}
      >
        {/* Left: avatar badge with the user's name right next to it, in one light pill.
            A button when `profile` is given (opens the profile editor), plain otherwise. */}
        {(() => {
          const pill = [
            'shrink-0 min-w-0 max-w-[55%] sm:max-w-[16rem] flex items-center gap-2 rounded-full bg-paper text-ink-strong p-1 pr-4',
            'motion-safe:transition-opacity motion-safe:duration-500 motion-safe:delay-300 starting:opacity-0',
          ].join(' ');
          const contents = (
            <>
              {/* The default drawing sits in a round badge; a picture (a Muse avatar tile) shows on its own,
                  inset so its square corners stay inside the pill's rounded end */}
              <span
                className={`shrink-0 w-9 h-9 md:w-10 md:h-10 flex ${avatar ? 'p-1.5' : 'p-1 rounded-full bg-sand overflow-hidden'}`}
              >
                {avatar ?? <DefaultAvatar label={`${userName}'s avatar`} />}
              </span>
              <span className="min-w-0 truncate text-base md:text-lg">{userName}</span>
            </>
          );
          return profile ? (
            <button
              type="button"
              onClick={profile.onClick}
              aria-pressed={profile.open ?? false}
              aria-label={`${userName}: ${profile.open ? 'close' : 'edit'} your profile`}
              title="Edit your profile"
              // [border-image:none]: its own look, not a doodle button; the dashed ring shows hover
              className={`${pill} border-0 [border-image:none] text-left outline-2 outline-offset-2 outline-transparent hover:outline-dashed hover:outline-nav-ink ${
                profile.open ? 'outline-dashed outline-nav-ink' : ''
              }`}
            >
              {contents}
            </button>
          ) : (
            <div className={pill}>{contents}</div>
          );
        })()}

        {/* Middle: app links. Scrolls sideways if there are more than fit. */}
        <nav
          aria-label="Apps"
          className="flex-1 min-w-0 flex items-center gap-1 overflow-x-auto px-1 sm:px-2 motion-safe:transition-opacity motion-safe:duration-500 motion-safe:delay-[400ms] starting:opacity-0"
        >
          {shownApps.map((app) => (
            <TaskbarAppLink key={app.id} app={app} />
          ))}
        </nav>

        {right && <div className="shrink-0 hidden sm:flex items-center gap-3 px-3 text-sm">{right}</div>}

        {/* Very right: music, then the theme menu */}
        {music && <MusicMenu {...music} />}
        {theme && <ThemeMenu {...theme} />}
      </div>
    </header>
  );
}