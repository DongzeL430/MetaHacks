import type { KeyboardEvent } from 'react';

export interface ViewTab<T extends string> {
  id: T;
  label: string;
  /** Small number badge, hidden when 0 or left out */
  count?: number;
}

/** DOM ids, so a panel can point back at its tab (aria-labelledby) and tabs at the panel (aria-controls) */
export const viewTabId = (baseId: string, id: string) => `${baseId}-tab-${id}`;
export const viewPanelId = (baseId: string) => `${baseId}-panel`;

interface ViewTabsProps<T extends string> {
  /** From useId() in the window, shared with its panel */
  baseId: string;
  /** Screen reader name for the bar, e.g. "Your sessions" */
  label: string;
  tabs: ViewTab<T>[];
  value: T;
  onChange: (id: T) => void;
}

/**
 * A view switcher styled like the top nav bar: a warm gray capsule with the current view in a light pill.
 * Arrow keys, Home and End move between views. Pair it with a panel using viewPanelId / viewTabId.
 */
export default function ViewTabs<T extends string>({ baseId, label, tabs, value, onChange }: ViewTabsProps<T>) {
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = tabs.length - 1;
    const targets: Record<string, number> = {
      ArrowRight: index === last ? 0 : index + 1,
      ArrowLeft: index === 0 ? last : index - 1,
      Home: 0,
      End: last,
    };
    if (!(e.key in targets)) return;
    e.preventDefault();
    const next = tabs[targets[e.key]].id;
    onChange(next);
    requestAnimationFrame(() => document.getElementById(viewTabId(baseId, next))?.focus());
  };

  return (
    <div
      role="tablist"
      aria-label={label}
      className="shrink-0 self-start max-w-full flex items-center gap-1 p-1 rounded-full bg-nav overflow-x-auto"
    >
      {tabs.map((tab, index) => {
        const selected = tab.id === value;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={viewTabId(baseId, tab.id)}
            aria-selected={selected}
            aria-controls={viewPanelId(baseId)}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => onKey(e, index)}
            className={[
              'shrink-0 flex items-center gap-2 rounded-full px-4 py-1.5 text-sm md:text-base',
              'border-0 [border-image:none] transition-colors duration-150',
              selected ? 'bg-paper text-ink-strong' : 'bg-transparent text-nav-ink hover:bg-nav-ink/15',
            ].join(' ')}
          >
            {tab.label}
            {!!tab.count && (
              <span
                className={`min-w-5 px-1.5 rounded-full text-xs leading-5 text-center ${
                  selected ? 'bg-nav text-nav-ink' : 'bg-paper/25'
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}