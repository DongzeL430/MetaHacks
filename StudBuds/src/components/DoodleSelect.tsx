import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent, ReactNode, RefObject } from 'react';
import { createPortal } from 'react-dom';

/*
 * Doodle-style replacements for <select> and for inputs with suggestions (<datalist>).
 * Browsers draw those drop-down lists themselves and they can't be styled, so these draw their own:
 * a hand-drawn list that matches the windows. The list renders at the top of the page, positioned
 * under (or above) its field, so no window edge can clip it.
 */

export interface SelectOption<T extends string | number> {
  value: T;
  label: string;
  disabled?: boolean;
}

/** The sketched list panel: same uneven-corner border as the windows */
const PANEL = [
  'fixed z-[90] overflow-auto p-1 font-sans text-ink bg-surface',
  'border-[2.5px] border-ink rounded-[12px_6px_14px_7px/7px_14px_6px_12px]',
  'shadow-[4px_5px_0_rgba(60,60,60,0.22)]',
  'motion-safe:transition motion-safe:duration-150 starting:opacity-0 starting:-translate-y-1',
].join(' ');

const OPTION = 'flex items-center gap-2 px-3 py-1.5 rounded-md cursor-pointer select-none text-base';

/** Places the list right under its field (or above it when there isn't room), and follows it on scroll */
function useAnchoredPosition(anchor: RefObject<HTMLElement | null>, open: boolean): CSSProperties {
  const [style, setStyle] = useState<CSSProperties>({ visibility: 'hidden' });

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const el = anchor.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const width = Math.max(r.width, 180);
      const spaceBelow = window.innerHeight - r.bottom - 8;
      const spaceAbove = r.top - 8;
      const flipUp = spaceBelow < 160 && spaceAbove > spaceBelow;
      setStyle({
        left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)),
        width,
        maxHeight: Math.min(280, flipUp ? spaceAbove : spaceBelow),
        ...(flipUp ? { bottom: window.innerHeight - r.top + 6 } : { top: r.bottom + 6 }),
      });
    };
    place(); // before the first paint, so it never flashes in the wrong spot
    let frame = 0;
    const onMove = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(place);
    };
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true); // any scrolling container, e.g. a window's body
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
    };
  }, [open, anchor]);

  return style;
}

/** Closes the list on a press anywhere outside the field and the list */
function useOutsidePress(open: boolean, refs: RefObject<HTMLElement | null>[], onOutside: () => void) {
  const onOutsideRef = useRef(onOutside);
  onOutsideRef.current = onOutside;
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!refs.some((r) => r.current?.contains(e.target as Node))) onOutsideRef.current();
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
    // refs are stable objects
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
}

/** Keeps the highlighted option visible while moving through a long list */
function useScrollActiveIntoView(listRef: RefObject<HTMLElement | null>, activeId: string | undefined) {
  useEffect(() => {
    if (!activeId) return;
    listRef.current?.querySelector(`[id="${CSS.escape(activeId)}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [listRef, activeId]);
}

function Check() {
  return (
    <svg viewBox="0 0 20 20" className="w-4 h-4 shrink-0" aria-hidden="true">
      <path d="M4 10.5l4 4 8-9" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      className={`w-4 h-4 shrink-0 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
      aria-hidden="true"
    >
      <path d="M5 7.5l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ------------------------------------------------------------------ *
 * DoodleSelect: pick one of a fixed list (replaces <select>)
 * ------------------------------------------------------------------ */

interface DoodleSelectProps<T extends string | number> {
  value: T | null;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  /** Shown when nothing is picked */
  placeholder?: string;
  disabled?: boolean;
  /** For a <label htmlFor> elsewhere */
  id?: string;
  'aria-label'?: string;
  className?: string;
}

/**
 * Keyboard: Enter, Space or the arrow keys open it; arrows, Home and End move; Enter or Space picks;
 * Escape closes; typing a letter jumps to the next option starting with it.
 */
export function DoodleSelect<T extends string | number>({
  value,
  options,
  onChange,
  placeholder = 'Choose…',
  disabled = false,
  id,
  'aria-label': ariaLabel,
  className = '',
}: DoodleSelectProps<T>) {
  const listId = useId();
  const optionId = (i: number) => `${listId}-option-${i}`;
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const style = useAnchoredPosition(buttonRef, open);

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null;

  useOutsidePress(open, [buttonRef, listRef], () => setOpen(false));
  useScrollActiveIntoView(listRef, open && active >= 0 ? optionId(active) : undefined);

  const nextEnabled = (from: number, step: number) => {
    for (let i = from + step; i >= 0 && i < options.length; i += step) if (!options[i].disabled) return i;
    return from;
  };

  const openList = () => {
    if (disabled) return;
    setActive(selectedIndex >= 0 ? selectedIndex : nextEnabled(-1, 1));
    setOpen(true);
  };

  const pick = (i: number) => {
    const option = options[i];
    if (!option || option.disabled) return;
    onChange(option.value);
    setOpen(false);
    buttonRef.current?.focus();
  };

  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
        openList();
      }
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActive((i) => nextEnabled(i, 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActive((i) => nextEnabled(i, -1));
        break;
      case 'Home':
        e.preventDefault();
        setActive(nextEnabled(-1, 1));
        break;
      case 'End':
        e.preventDefault();
        setActive(nextEnabled(options.length, -1));
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        pick(active);
        break;
      case 'Escape':
        e.preventDefault();
        e.stopPropagation(); // close only the list, not a popup window around it
        setOpen(false);
        break;
      case 'Tab':
        setOpen(false);
        break;
      default:
        // Type-ahead: jump to the next option starting with the typed letter
        if (e.key.length === 1 && /\S/.test(e.key)) {
          const letter = e.key.toLowerCase();
          for (let n = 1; n <= options.length; n++) {
            const i = (active + n) % options.length;
            if (!options[i].disabled && options[i].label.toLowerCase().startsWith(letter)) {
              setActive(i);
              break;
            }
          }
        }
    }
  };

  return (
    <>
      <button
        ref={buttonRef}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && active >= 0 ? optionId(active) : undefined}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKey}
        // data-doodle-field: in main.css, gets the dashed hover border but not the button tilt
        data-doodle-field=""
        className={`min-w-0 flex items-center justify-between gap-3 pl-3 pr-2.5 py-1 text-left disabled:opacity-50 ${className}`}
      >
        <span className={`truncate ${selected ? '' : 'opacity-60'}`}>{selected ? selected.label : placeholder}</span>
        <Chevron open={open} />
      </button>

      {open &&
        createPortal(
          <ul ref={listRef} id={listId} role="listbox" className={`m-0 list-none ${PANEL}`} style={style}>
            {options.map((o, i) => (
              <li
                key={String(o.value)}
                id={optionId(i)}
                role="option"
                aria-selected={o.value === value}
                aria-disabled={o.disabled || undefined}
                // Keeps focus on the field, so the list doesn't close before the click lands
                onPointerDown={(e) => e.preventDefault()}
                onPointerEnter={() => !o.disabled && setActive(i)}
                onClick={() => pick(i)}
                className={`${OPTION} ${i === active ? 'bg-sand' : ''} ${o.value === value ? 'font-bold' : ''} ${
                  o.disabled ? 'opacity-40 cursor-not-allowed' : ''
                }`}
              >
                <span className="flex-1 min-w-0">{o.label}</span>
                {o.value === value && <Check />}
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </>
  );
}

/* ------------------------------------------------------------------ *
 * DoodleCombobox: type anything, with suggestions (replaces <input list>)
 * ------------------------------------------------------------------ */

interface DoodleComboboxProps {
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  placeholder?: string;
  maxLength?: number;
  id?: string;
  'aria-label'?: string;
  inputRef?: RefObject<HTMLInputElement | null>;
  /** Most suggestions shown at once */
  maxShown?: number;
  /** Shown at the bottom of the list, e.g. a hint that custom text is fine */
  footer?: ReactNode;
  /** Marks the box as needing attention: red dashed border, and announced as invalid */
  invalid?: boolean;
  /** id of the message explaining what's wrong */
  describedBy?: string;
  /** Called with a suggestion when one is picked, instead of filling it into the box (for tag lists) */
  onPick?: (suggestion: string) => void;
  /** Called on Enter when no suggestion is highlighted (for tag lists: add what's typed) */
  onSubmit?: () => void;
}

/**
 * A normal text box: typing anything is allowed. The suggestion list only opens when the box is
 * clicked (or with the Down arrow from the keyboard), never just from focusing or tabbing in.
 * While open it filters as you type; arrows move, Enter picks the highlighted one, Escape closes it.
 */
export function DoodleCombobox({
  value,
  onChange,
  suggestions,
  placeholder,
  maxLength,
  id,
  'aria-label': ariaLabel,
  inputRef,
  maxShown = 8,
  footer,
  invalid = false,
  describedBy,
  onPick,
  onSubmit,
}: DoodleComboboxProps) {
  const listId = useId();
  const optionId = (i: number) => `${listId}-option-${i}`;
  const ownRef = useRef<HTMLInputElement>(null);
  const fieldRef = inputRef ?? ownRef;
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const query = value.trim().toLowerCase();
  const exact = suggestions.some((s) => s.toLowerCase() === query);
  // Everything when empty or when an exact suggestion was picked; otherwise what matches the typing
  const matches = (query && !exact ? suggestions.filter((s) => s.toLowerCase().includes(query)) : suggestions).slice(
    0,
    maxShown,
  );
  const showList = open && matches.length > 0;
  const style = useAnchoredPosition(fieldRef, showList);

  useOutsidePress(showList, [fieldRef, listRef], () => setOpen(false));
  useScrollActiveIntoView(listRef, showList && active >= 0 ? optionId(active) : undefined);

  const pick = (s: string) => {
    if (onPick) onPick(s);
    else onChange(s);
    setOpen(false);
    setActive(-1);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setOpen(true);
        setActive((i) => Math.min(matches.length - 1, i + 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActive((i) => Math.max(-1, i - 1));
        break;
      case 'Enter':
        e.preventDefault(); // never submits the page
        if (showList && active >= 0) pick(matches[active]);
        else {
          setOpen(false);
          onSubmit?.();
        }
        break;
      case 'Escape':
        if (showList) {
          e.preventDefault();
          e.stopPropagation(); // close only the list, not a popup window around it
          setOpen(false);
        }
        break;
      case 'Tab':
        setOpen(false);
        break;
    }
  };

  return (
    <>
      <input
        ref={fieldRef}
        id={id}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={showList && active >= 0 ? optionId(active) : undefined}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        value={value}
        onChange={(e) => {
          onChange(e.target.value); // filters the list if it's open, but doesn't open it
          setActive(-1);
        }}
        // Opens only on a click, not when the box gets focus (e.g. when a form opens and focuses it)
        onClick={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKey}
        placeholder={placeholder}
        maxLength={maxLength}
        autoComplete="off"
        className="w-full px-2 py-1"
        // Same dashed border style as hover and focus, in red, so it reads as "fill this in"
        style={invalid ? { outline: '2px dashed var(--color-danger-strong)', outlineOffset: -8 } : undefined}
      />

      {showList &&
        createPortal(
          <ul ref={listRef} id={listId} role="listbox" className={`m-0 list-none ${PANEL}`} style={style}>
            {matches.map((s, i) => (
              <li
                key={s}
                id={optionId(i)}
                role="option"
                aria-selected={i === active}
                onPointerDown={(e) => e.preventDefault()} // keep focus in the box
                onPointerEnter={() => setActive(i)}
                onClick={() => pick(s)}
                className={`${OPTION} ${i === active ? 'bg-sand' : ''}`}
              >
                {s}
              </li>
            ))}
            {footer && (
              <li role="presentation" className="px-3 pt-1.5 pb-1 text-xs opacity-60 border-t border-ink/15 mt-1">
                {footer}
              </li>
            )}
          </ul>,
          document.body,
        )}
    </>
  );
}