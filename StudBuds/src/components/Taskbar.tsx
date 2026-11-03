import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

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
  /** Shows a small red dot on the link, e.g. for something waiting on the user */
  alert?: boolean;
  /** Hide this one link */
  hidden?: boolean;
  /**
   * Makes the link a drop-down instead (like "Upcoming"): clicking it lists these, and each one
   * usually toggles a window. The link is highlighted while any of their windows is open.
   */
  menu?: TaskbarMenuItem[];
}

/** One entry in a nav bar link's drop-down */
export interface TaskbarMenuItem {
  id: string;
  /** Text shown in the drop-down, e.g. "Croft" */
  name: string;
  /** Tooltip and screen reader name, e.g. "Open your croft" */
  label: string;
  /** Its window is open: the entry is highlighted */
  open?: boolean;
  onClick: () => void;
}

interface TaskbarProps {
  /** The user's name, shown next to the avatar */
  userName?: string;
  /** Replaces the default drawing. A picture is cropped to a circle, without the sand badge. Size it with w-full h-full. */
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
   * Apps that live in the gear menu at the very right of the bar instead of in the row of links,
   * e.g. the Upcoming drop-down. Each shows as its icon in the gear's capsule.
   */
  gearApps?: TaskbarApp[];
  /**
   * Adds the paintbrush to the gear menu: a sun (default theme) above a star (custom theme).
   * `active` highlights the current one.
   */
  theme?: ThemeMenuProps;
  /** Adds the speaker to the gear menu: the piece playing, mute and volume */
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

/**
 * The sun / star choices. They open right under the paintbrush, in the same column, so the gear
 * capsule just grows longer, with a thin line between the paintbrush and them.
 */
function ThemePanel({ active, onSelectDefault, onSelectCustom, onDone }: ThemeMenuProps & { onDone: () => void }) {
  const choose = (select: () => void) => {
    select();
    onDone();
  };
  return (
    <div
      role="group"
      aria-label="Choose a theme"
      data-tour="theme-panel"
      className="flex flex-col items-center gap-1 pt-1 border-t border-paper/25 motion-safe:transition motion-safe:duration-150 starting:opacity-0 starting:-translate-y-1"
    >
      <ThemeOption icon={<SunIcon />} label="Default theme" active={active === 'default'} onClick={() => choose(onSelectDefault)} />
      <ThemeOption icon={<StarIcon />} label="Custom theme" active={active === 'custom'} onClick={() => choose(onSelectCustom)} />
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

/** What's playing, mute, and volume, shown beside the speaker in the gear menu */
function MusicPanel({ title, volume, muted, onVolume, onToggleMute }: MusicMenuProps) {
  return (
    <div role="group" aria-label="Music" className={`${SIDE_PANEL} w-60 flex flex-col gap-2 p-3 rounded-2xl`}>
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
  );
}

/** A drop-down app's entries (e.g. Upcoming > Croft), shown beside its icon in the gear menu */
function AppMenuPanel({ app, menu, onDone }: { app: TaskbarApp; menu: TaskbarMenuItem[]; onDone: () => void }) {
  return (
    <div role="group" aria-label={app.label} className={`${SIDE_PANEL} flex flex-col items-stretch gap-1 p-1.5 rounded-3xl`}>
      <p className="m-0 px-4 pt-1 text-xs opacity-80 whitespace-nowrap">{app.name ?? app.label}</p>
      {menu.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => {
            item.onClick();
            onDone();
          }}
          aria-pressed={item.open ?? false}
          aria-label={item.label}
          title={item.label}
          className={[
            'px-4 py-1.5 rounded-full text-base text-left whitespace-nowrap',
            'border-0 [border-image:none] text-nav-ink transition-colors duration-150',
            item.open ? 'bg-paper/25' : 'bg-transparent hover:bg-paper/15',
          ].join(' ')}
        >
          {item.name}
        </button>
      ))}
    </div>
  );
}

/**
 * A panel beside its icon in the gear capsule: to the left of it in the bar, or, from the
 * bottom-left corner on phones (`data-corner` on the gear), to the right of it and growing upward
 */
const SIDE_PANEL =
  'absolute right-full top-0 mr-3 group-data-corner/gear:right-auto group-data-corner/gear:left-full group-data-corner/gear:mr-0 group-data-corner/gear:ml-3 group-data-corner/gear:top-auto group-data-corner/gear:bottom-0 bg-nav text-nav-ink shadow-[0_10px_24px_-10px_rgba(40,30,20,0.6)] motion-safe:transition motion-safe:duration-150 starting:opacity-0 starting:translate-x-1';

/** One round icon in the gear capsule */
function GearOption({
  icon,
  label,
  active,
  expanded,
  onClick,
  tour,
}: {
  icon: ReactNode;
  label: string;
  /** `data-tour` name, so the welcome tour can point at it */
  tour?: string;
  /** Highlighted, e.g. one of its windows is open */
  active?: boolean;
  /** Its side panel is showing; leave out for a plain button */
  expanded?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={expanded}
      aria-label={label}
      title={label}
      data-tour={tour}
      className={[
        'shrink-0 w-10 h-10 p-0 flex items-center justify-center rounded-full',
        'border-0 [border-image:none] text-nav-ink transition-colors duration-150',
        expanded || active ? 'bg-paper/25' : 'bg-transparent hover:bg-paper/15',
      ].join(' ')}
    >
      <span aria-hidden="true" className="flex w-5 h-5 md:w-[22px] md:h-[22px] [&>svg]:w-full [&>svg]:h-full">
        {icon}
      </span>
    </button>
  );
}

/** Gear, drawn at 24x24 */
function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5 md:w-6 md:h-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

/**
 * The gear: a tall capsule of icons (the gear apps like Upcoming, the speaker, and the paintbrush),
 * each opening its own panel beside the capsule. Closes on a click elsewhere or Escape.
 *
 * In the bar (`corner` off), it sits at the very right and the capsule drops down. With `corner`
 * (small phones, under 380px wide), it floats in the bottom-left corner of the screen and the capsule rises above it.
 */
function GearMenu({
  apps,
  music,
  theme,
  corner = false,
  className = '',
}: {
  apps: TaskbarApp[];
  music?: MusicMenuProps;
  theme?: ThemeMenuProps;
  corner?: boolean;
  className?: string;
}) {
  const menuId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  // Which icon's side panel is showing: an app id, 'music' or 'theme'
  const [section, setSection] = useState<string | null>(null);
  // Light up the gear while a window from one of its apps is open
  const anyAppOpen = apps.some((app) => app.open || app.menu?.some((item) => item.open));

  const close = () => {
    setOpen(false);
    setSection(null);
  };
  const toggleSection = (id: string) => setSection((s) => (s === id ? null : id));

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      // Reading the welcome tour's popup about this menu doesn't close it
      const target = e.target as Element;
      if (!wrapRef.current?.contains(target) && !target.closest?.('[data-tour-popup]')) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // The first Escape closes a side panel, the next the whole menu
      if (section) setSection(null);
      else {
        close();
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, section]);

  return (
    <div
      ref={wrapRef}
      data-corner={corner || undefined}
      className={[
        'group/gear shrink-0',
        corner
          ? // Mirrors the chat button in the bottom-right corner: same 16px gap, same 40px size
          'pointer-events-auto fixed z-20 left-4 bottom-4'
          : 'relative',
        className,
      ].join(' ')}
    >
      <button
        ref={buttonRef}
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-expanded={open}
        aria-controls={menuId}
        aria-label="Settings"
        title="Settings"
        data-tour="settings"
        className={[
          'p-0 flex items-center justify-center rounded-full',
          'border-0 [border-image:none] text-nav-ink transition-colors duration-150',
          corner
            ? // On the page itself: its own dark disc, with a dashed ring when pressed
              `w-10 h-10 bg-nav shadow-[0_10px_24px_-10px_rgba(40,30,20,0.6)] outline-2 outline-offset-2 ${
                open || anyAppOpen ? 'outline-dashed outline-nav' : 'outline-transparent'
              }`
            : `w-10 h-10 md:w-11 md:h-11 ${open || anyAppOpen ? 'bg-paper/25' : 'bg-paper/10 hover:bg-paper/20'}`,
        ].join(' ')}
      >
        <GearIcon />
      </button>

      {open && (
        <div
          id={menuId}
          role="group"
          aria-label="Settings"
          // A tall capsule centered under the gear, or above it in the corner
          className={`absolute left-1/2 -translate-x-1/2 ${
            corner ? 'bottom-full mb-3 starting:translate-y-1' : 'top-full mt-3 starting:-translate-y-1'
          } flex flex-col items-center gap-1 p-1.5 rounded-full bg-nav shadow-[0_10px_24px_-10px_rgba(40,30,20,0.6)] motion-safe:transition motion-safe:duration-150 starting:opacity-0`}
        >
          {apps.map((app) => {
            const menu = app.menu;
            return (
              <div key={app.id} className="relative">
                <GearOption
                  icon={app.icon}
                  label={app.label}
                  active={app.open || menu?.some((item) => item.open)}
                  expanded={menu ? section === app.id : undefined}
                  onClick={() => {
                    if (menu) return toggleSection(app.id);
                    app.onClick?.();
                    close();
                  }}
                />
                {menu && section === app.id && <AppMenuPanel app={app} menu={menu} onDone={close} />}
              </div>
            );
          })}
          {music && (
            <div className="relative">
              <GearOption
                icon={<SpeakerIcon muted={music.muted} />}
                label={music.muted ? 'Music (muted)' : `Music: ${music.title}`}
                expanded={section === 'music'}
                onClick={() => toggleSection('music')}
              />
              {section === 'music' && <MusicPanel {...music} />}
            </div>
          )}
          {theme && (
            // The theme choices stack below the paintbrush, extending the capsule downward
            <div className="flex flex-col items-center gap-1">
              <GearOption icon={<PaintbrushIcon />} label="Theme" expanded={section === 'theme'} onClick={() => toggleSection('theme')} tour="theme-button" />
              {section === 'theme' && <ThemePanel {...theme} onDone={close} />}
            </div>
          )}
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

const LINK_CLASSES = (active: boolean) =>
  [
    'shrink-0 flex items-center gap-2 rounded-full px-3 sm:px-4 py-2 text-base md:text-lg',
    'border-0 [border-image:none] text-nav-ink transition-colors duration-150',
    'disabled:opacity-45 disabled:cursor-not-allowed',
    active ? 'bg-paper/25' : 'bg-transparent enabled:hover:bg-paper/15',
  ].join(' ');

function LinkIcon({ icon }: { icon?: ReactNode }) {
  return icon ? (
    <span aria-hidden="true" className="flex sm:hidden w-5 h-5 [&>svg]:w-full [&>svg]:h-full">
      {icon}
    </span>
  ) : null;
}

/**
 * A nav bar link with a drop-down (TaskbarApp.menu). The list is drawn on top of the page, under
 * the link, because the row of links scrolls sideways on narrow screens and would cut it off.
 * Closes on a click elsewhere, Escape, or a resize.
 */
function TaskbarMenuLink({ app, menu }: { app: TaskbarApp; menu: TaskbarMenuItem[] }) {
  const menuId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  const name = app.name ?? app.label;
  const anyOpen = menu.some((item) => item.open);

  const close = () => setAt(null);
  const toggle = () => {
    if (at) return close();
    const r = buttonRef.current?.getBoundingClientRect();
    if (r) setAt({ left: r.left + r.width / 2, top: r.bottom + 12 });
  };

  useEffect(() => {
    if (!at) return;
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!buttonRef.current?.contains(target) && !listRef.current?.contains(target)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close();
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', close);
    };
  }, [at]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        disabled={app.disabled}
        aria-expanded={!!at}
        aria-controls={menuId}
        aria-label={app.label}
        title={app.label}
        className={LINK_CLASSES(!!at || anyOpen)}
      >
        <LinkIcon icon={app.icon} />
        <span className={app.icon ? 'hidden sm:inline' : ''}>{name}</span>
        <svg viewBox="0 0 12 12" className="hidden sm:block w-3 h-3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2.5 4.5 6 8l3.5-3.5" />
        </svg>
      </button>
      {at &&
        createPortal(
          <div
            ref={listRef}
            id={menuId}
            role="group"
            aria-label={app.label}
            style={{ left: at.left, top: at.top }}
            // The same capsule as the theme menu, centered under the link
            className="doodle fixed z-30 -translate-x-1/2 flex flex-col items-stretch gap-1 p-1.5 rounded-3xl bg-nav text-nav-ink shadow-[0_10px_24px_-10px_rgba(40,30,20,0.6)] motion-safe:transition motion-safe:duration-150 starting:opacity-0 starting:-translate-y-1"
          >
            {menu.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  item.onClick();
                  close();
                }}
                aria-pressed={item.open ?? false}
                aria-label={item.label}
                title={item.label}
                className={[
                  'px-4 py-1.5 rounded-full text-base text-left whitespace-nowrap',
                  'border-0 [border-image:none] text-nav-ink transition-colors duration-150',
                  item.open ? 'bg-paper/25' : 'bg-transparent hover:bg-paper/15',
                ].join(' ')}
              >
                {item.name}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}

/** Text link on the dark bar. Open apps get a soft highlight; on narrow screens only the icon shows. */
function TaskbarAppLink({ app }: { app: TaskbarApp }) {
  if (app.menu) return <TaskbarMenuLink app={app} menu={app.menu} />;
  const name = app.name ?? app.label;
  return (
    <button
      type="button"
      onClick={app.onClick}
      disabled={app.disabled}
      aria-pressed={app.open ?? false}
      aria-label={app.label}
      title={app.label}
      // The welcome tour points at nav bar apps by id
      data-tour={`app-${app.id}`}
      className={`relative ${LINK_CLASSES(app.open ?? false)}`}
    >
      <LinkIcon icon={app.icon} />
      <span className={app.icon ? 'hidden sm:inline' : ''}>{name}</span>
      {/* Same fixed red as the Activity button's unread dot, inside the link so the bar never clips it */}
      {app.alert && (
        <span
          aria-hidden="true"
          className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-[#e5484d] ring-2 ring-nav motion-safe:transition-transform motion-safe:duration-200 starting:scale-0"
        />
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
  gearApps = [],
  theme,
  music,
  profile,
  className = '',
}: TaskbarProps) {
  const shownApps = apps.filter((app) => !app.hidden && (!visibleApps || visibleApps.includes(app.id)));
  const shownGearApps = gearApps.filter((app) => !app.hidden);
  const hasGear = shownGearApps.length > 0 || !!music || !!theme;

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
            'shrink-0 min-w-0 max-w-[55%] sm:max-w-[16rem] flex items-center gap-2 rounded-full bg-paper text-ink-strong p-1 sm:pr-4',
            'motion-safe:transition-opacity motion-safe:duration-500 motion-safe:delay-300 starting:opacity-0',
          ].join(' ');
          const contents = (
            <>
              {/* The default drawing sits in a round badge; a picture (a Muse avatar tile) is cropped
                  to a circle of its own */}
              {avatar ? (
                <span className="shrink-0 w-9 h-9 md:w-10 md:h-10 flex p-1">
                  <span className="w-full h-full flex rounded-full overflow-hidden">{avatar}</span>
                </span>
              ) : (
                <span className="shrink-0 w-9 h-9 md:w-10 md:h-10 flex p-1 rounded-full bg-sand overflow-hidden">
                  <DefaultAvatar label={`${userName}'s avatar`} />
                </span>
              )}
              {/* Phones show only the avatar, leaving room for the links */}
              <span className="hidden sm:inline min-w-0 truncate text-base md:text-lg">{userName}</span>
            </>
          );
          return profile ? (
            <button
              type="button"
              onClick={profile.onClick}
              aria-pressed={profile.open ?? false}
              aria-label={`${userName}: ${profile.open ? 'close' : 'edit'} your profile`}
              title="Edit your profile"
              data-tour="profile"
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

        {/* Middle: app links. Scrolls sideways (swipe or trackpad) if there are more than fit,
            with the scroll bar hidden. */}
        <nav
          aria-label="Apps"
          className="flex-1 min-w-0 flex items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden px-1 sm:px-2 motion-safe:transition-opacity motion-safe:duration-500 motion-safe:delay-[400ms] starting:opacity-0"
        >
          {shownApps.map((app) => (
            <TaskbarAppLink key={app.id} app={app} />
          ))}
        </nav>

        {right && <div className="shrink-0 hidden sm:flex items-center gap-3 px-3 text-sm">{right}</div>}

        {/* Very right: the gear, holding the gear apps, music and theme */}
        {hasGear && <GearMenu apps={shownGearApps} music={music} theme={theme} className="hidden min-[380px]:block" />}
      </div>

      {/* Small phones (under 380px wide): the gear floats in the bottom-left corner of the screen instead */}
      {hasGear && <GearMenu corner apps={shownGearApps} music={music} theme={theme} className="min-[380px]:hidden" />}
    </header>
  );
}