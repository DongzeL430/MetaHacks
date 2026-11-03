import { useEffect, useId, useRef, useState } from 'react';
import AppWindow, { WINDOW_ACCENTS } from './AppWindow';

/** Longest theme description allowed */
export const MAX_THEME_PROMPT = 300;
const MIN_THEME_PROMPT = 5;

/** Starting ideas: clicking one fills the box, ready to edit */
const EXAMPLES = [
  'Cozy autumn colors with warm oranges and browns',
  'Calm ocean blues, clean and minimal',
  'Soft pastel spring with light greens and pinks',
  'Dark mode with high contrast and neon accents',
];

interface ThemePromptWindowProps {
  open: boolean;
  onClose: () => void;
  /**
   * Turns the description into a theme. Return (or resolve) when it's applied; throw to show an error.
   * Leave out until generation is connected: the window explains it isn't available yet.
   */
  onGenerate?: (prompt: string) => void | Promise<void>;
  /** Name of the user's saved custom theme, when it isn't in use right now */
  savedThemeName?: string;
  /** Switches back to the saved custom theme */
  onUseSaved?: () => void;
}

/**
 * Popup that explains custom themes and takes a description of the look the user wants.
 * Dims the page, floats above every window, and stays out of the tiling layout.
 * Closes with its X, Cancel, Escape, or a click on the dimmed area.
 * Render it in the desk area (which needs `relative`), not inside a WindowLayer.
 */
export default function ThemePromptWindow({ open, onClose, onGenerate, savedThemeName, onUseSaved }: ThemePromptWindowProps) {
  const titleId = useId();
  const fieldId = useId();
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const [prompt, setPrompt] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');

  // Fresh, focused box each time it opens
  useEffect(() => {
    if (!open) return;
    setPrompt('');
    setError('');
    setWorking(false);
    requestAnimationFrame(() => boxRef.current?.focus());
  }, [open]);

  if (!open) return null;

  const trimmed = prompt.trim();
  const tooShort = trimmed.length < MIN_THEME_PROMPT;
  const canGenerate = !!onGenerate && !tooShort && !working;

  const generate = async () => {
    if (!canGenerate || !onGenerate) return;
    setWorking(true);
    setError('');
    try {
      await onGenerate(trimmed);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t make that theme. Try describing it a little differently.');
    } finally {
      setWorking(false);
    }
  };

  const footerNote = !onGenerate
    ? 'Custom themes aren’t connected yet.'
    : working
      ? 'Making your theme…'
      : error || (tooShort ? 'Describe the look you want to get started.' : '');

  return (
    <>
      {/* Dims the whole page, nav bar included. Clicking it closes the popup. */}
      <div
        aria-hidden="true"
        onPointerDown={onClose}
        className="fixed inset-0 z-[45] bg-ink/25 motion-safe:transition-opacity motion-safe:duration-200 starting:opacity-0"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="absolute inset-0 z-50 p-3"
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            onClose();
          }
        }}
      >
        <AppWindow
          title="Custom theme"
          titleId={titleId}
          accent={WINDOW_ACCENTS.lilac}
          info="Describe a look and StudBuds makes a theme from it. Your theme only changes colors and styling, never how the app works. Pick the sun in the theme menu to go back to the default look."
          onClose={onClose}
          excludeFromLayout
          controls={{ close: 'enabled', fullscreen: 'hidden', pin: 'hidden' }}
          initialSize={({ width, height }) => ({
            width: Math.min(width * 0.92, 520),
            height: Math.min(height * 0.88, 520),
          })}
          minWidth={280}
          minHeight={300}
          footer={
            <div className="flex flex-wrap items-center gap-3">
              <p role="status" className={`m-0 flex-1 min-w-[10rem] text-sm ${error ? 'text-danger' : 'opacity-80'}`}>
                {footerNote}
              </p>
              <button type="button" onClick={onClose} className="px-3 py-0.5 text-sm">
                Cancel
              </button>
              <button type="button" onClick={() => void generate()} disabled={!canGenerate} className="px-3 py-0.5 text-sm">
                {working ? 'Making…' : 'Make my theme'}
              </button>
            </div>
          }
        >
          <div className="flex flex-col gap-1">
            <h2 className="m-0 text-xl">Make StudBuds your own</h2>
            <p className="m-0 text-sm opacity-80">
              Describe how you want the app to look: colors, a mood, a season, anything. We’ll turn it into a theme
              for you. You can always switch back to the default look with the sun in the theme menu.
            </p>
          </div>

          {savedThemeName && onUseSaved && (
            <div className="flex flex-wrap items-center gap-3 p-3 rounded-md border-2 border-ink/25 bg-paper">
              <span className="flex-1 min-w-[10rem] text-sm">
                Your saved theme: <strong>{savedThemeName}</strong>
              </span>
              <button type="button" onClick={onUseSaved} className="px-3 py-0.5 text-sm">
                Use it again
              </button>
            </div>
          )}

          <label htmlFor={fieldId} className="flex flex-col gap-1">
            <span className="text-sm">Your theme idea</span>
            <textarea
              id={fieldId}
              ref={boxRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                // Ctrl/Cmd + Enter makes the theme; plain Enter adds a new line
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  void generate();
                }
              }}
              rows={4}
              maxLength={MAX_THEME_PROMPT}
              placeholder="e.g. A calm forest theme with soft greens and warm wood tones"
              className="w-full px-2 py-1 resize-y"
            />
            <span className="self-end text-xs opacity-60">
              {prompt.length} / {MAX_THEME_PROMPT}
            </span>
          </label>

          <div className="flex flex-col gap-2">
            <p className="m-0 text-sm opacity-80">Need an idea? Try one of these:</p>
            <div className="flex flex-wrap gap-2">
              {EXAMPLES.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => {
                    setPrompt(example);
                    boxRef.current?.focus();
                  }}
                  className="px-2.5 py-1 text-xs text-left rounded-md border-2 border-ink/40 [border-image:none] bg-paper transition-colors hover:bg-sand"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>
        </AppWindow>
      </div>
    </>
  );
}