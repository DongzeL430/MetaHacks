import { useId } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import AppWindow from './AppWindow';

export interface BrowserTab {
  id: string;
  label: string;
  /** Small icon before the label, e.g. an avatar */
  icon?: ReactNode;
}

interface BrowserWindowProps {
  id: string;
  open: boolean;
  /** Window title. Defaults to the active tab's label. */
  title?: string;
  tabs: BrowserTab[];
  activeId: string | null;
  onSelect: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  /** Closing the window should close every tab, like a browser */
  onClose: () => void;
  /** Text in the fake address bar for the active tab */
  address?: string;
  initialSize?: { width: number; height: number };
  /** The active tab's page */
  children?: ReactNode;
}

/**
 * An app window that works like a browser: tabs along the top, one page showing at a time.
 * Click a tab to switch, its x (or middle-click, or Delete) to close it.
 * Arrow keys, Home and End move between tabs.
 */
export default function BrowserWindow({
  id,
  open,
  title,
  tabs,
  activeId,
  onSelect,
  onCloseTab,
  onClose,
  address,
  initialSize = { width: 640, height: 580 },
  children,
}: BrowserWindowProps) {
  const baseId = useId();
  const tabDomId = (tabId: string) => `${baseId}-tab-${tabId}`;
  const panelId = `${baseId}-panel`;
  const active = tabs.find((t) => t.id === activeId) ?? tabs[0];

  const focusTab = (tabId: string) =>
    requestAnimationFrame(() => document.getElementById(tabDomId(tabId))?.focus());

  const handleTabKey = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = tabs.length - 1;
    const targets: Record<string, number> = {
      ArrowRight: index === last ? 0 : index + 1,
      ArrowLeft: index === 0 ? last : index - 1,
      Home: 0,
      End: last,
    };

    if (e.key in targets) {
      e.preventDefault();
      const next = tabs[targets[e.key]];
      onSelect(next.id);
      focusTab(next.id);
    } else if (e.key === 'Delete') {
      e.preventDefault();
      const neighbor = tabs[index + 1] ?? tabs[index - 1];
      onCloseTab(tabs[index].id);
      if (neighbor) focusTab(neighbor.id);
    }
  };

  return (
    <AppWindow
      id={id}
      title={title ?? active?.label ?? 'Browser'}
      open={open}
      onClose={onClose}
      controls={{ close: 'enabled', fullscreen: 'enabled' }}
      initialSize={initialSize}
      minWidth={320}
      minHeight={300}
      bodyClassName="p-0 flex flex-col"
    >
      {/* TAB STRIP */}
      <div
        role="tablist"
        aria-label="Open tabs"
        className="shrink-0 flex items-end gap-1 px-2 pt-2 bg-[#F6EDE2] border-b-2 border-[#3c3c3c]/40 overflow-x-auto"
      >
        {tabs.map((tab, index) => {
          const selected = tab.id === active?.id;
          return (
            <div
              key={tab.id}
              className={[
                'relative shrink-0 flex items-center max-w-[12rem] rounded-t-md border-2 border-b-0',
                // The active tab overlaps the strip's bottom line so it joins the page below, like a browser
                selected
                  ? 'bg-[#FFFDFA] border-[#3c3c3c]/50 -mb-[2px] pb-[2px] z-10'
                  : 'bg-[#EADBC8]/70 border-[#3c3c3c]/20 hover:bg-[#EADBC8]',
                // New tabs slide up into place
                'motion-safe:transition motion-safe:duration-200 starting:opacity-0 starting:translate-y-2',
              ].join(' ')}
            >
              <button
                type="button"
                role="tab"
                id={tabDomId(tab.id)}
                aria-selected={selected}
                aria-controls={panelId}
                tabIndex={selected ? 0 : -1}
                onClick={() => onSelect(tab.id)}
                onAuxClick={(e) => {
                  if (e.button === 1) {
                    e.preventDefault();
                    onCloseTab(tab.id); // middle-click closes, like a browser
                  }
                }}
                onKeyDown={(e) => handleTabKey(e, index)}
                className="min-w-0 flex items-center gap-2 pl-2 pr-1 py-1.5 border-0 [border-image:none] bg-transparent text-sm"
              >
                {tab.icon}
                <span className="truncate">{tab.label}</span>
              </button>

              <button
                type="button"
                onClick={() => onCloseTab(tab.id)}
                aria-label={`Close ${tab.label}`}
                title="Close tab"
                tabIndex={-1}
                className="shrink-0 w-6 h-6 mr-1 p-0 flex items-center justify-center rounded border-0 [border-image:none] bg-transparent transition-colors hover:bg-[#F2A99E]"
              >
                <svg viewBox="0 0 20 20" className="w-3 h-3" aria-hidden="true">
                  <path d="M5 5l10 10M15 5L5 15" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>

      {active && (
        <>
          {address && (
            // Address bar: just for the browser feel
            <div aria-hidden="true" className="shrink-0 px-3 py-1.5 border-b border-[#3c3c3c]/15">
              <span className="block truncate rounded-full border-2 border-[#3c3c3c]/25 px-3 py-0.5 text-xs opacity-75">
                {address}
              </span>
            </div>
          )}

          {/* PAGE: keyed by tab so switching fades the new page in */}
          <div
            key={active.id}
            role="tabpanel"
            id={panelId}
            aria-labelledby={tabDomId(active.id)}
            tabIndex={0}
            className="flex-1 min-h-0 overflow-auto p-4 flex flex-col gap-5 motion-safe:transition-opacity motion-safe:duration-200 starting:opacity-0"
          >
            {children}
          </div>
        </>
      )}
    </AppWindow>
  );
}