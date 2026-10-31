interface StepDotsProps {
  total: number;
  /** Index of the page being shown. Pass -1 when no page is current. */
  step: number;
  completed: boolean[];
  /** Makes the dots clickable. Only pages the user has reached can be jumped to. */
  onSelect?: (index: number) => void;
  disabled?: boolean;
}

/** Filled = finished, orange = current page, hollow = not started */
export function StepDots({ total, step, completed, onSelect, disabled = false }: StepDotsProps) {
  // Every page before the first unfinished one is done, so the user may jump up to that page
  const firstUnfinished = completed.indexOf(false);
  const isReachable = (i: number) => firstUnfinished === -1 || i <= firstUnfinished;

  return (
    <ol aria-label="Survey progress" className="m-0 p-0 flex items-center justify-center gap-1 list-none">
      {Array.from({ length: total }, (_, i) => {
        const isCurrent = i === step;
        const isDone = completed[i];
        const state = isCurrent ? 'current' : isDone ? 'finished' : 'not started';
        const canJump = !!onSelect && !disabled && !isCurrent && isReachable(i);

        const dot = (
          <span
            aria-hidden="true"
            className={`block rounded-full border-2 border-[#3c3c3c] transition-all duration-150 ${
              isCurrent
                ? 'w-3.5 h-3.5 bg-[#F2A65A]'
                : isDone
                  ? 'w-2.5 h-2.5 bg-[#3c3c3c]'
                  : 'w-2.5 h-2.5 bg-transparent'
            } ${canJump ? 'group-hover:scale-125 group-hover:bg-[#F2A65A]/60' : ''}`}
          />
        );

        return (
          <li key={i} aria-current={isCurrent ? 'step' : undefined} className="flex list-none">
            {onSelect ? (
              <button
                type="button"
                onClick={() => onSelect(i)}
                disabled={!canJump}
                aria-label={`Page ${i + 1} of ${total}, ${state}`}
                title={canJump ? `Go to page ${i + 1}` : undefined}
                className="group w-6 h-6 p-0 flex items-center justify-center rounded-full border-0 [border-image:none] bg-transparent enabled:cursor-pointer disabled:cursor-default focus-visible:outline-offset-0!"
              >
                {dot}
              </button>
            ) : (
              <span className="w-6 h-6 flex items-center justify-center">
                <span className="sr-only">
                  Page {i + 1} of {total}, {state}
                </span>
                {dot}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

interface SurveyFooterProps {
  total: number;
  step: number;
  completed: boolean[];
  onBack: () => void;
  /** Called when a progress dot is clicked */
  onJump?: (index: number) => void;
  isSubmitting?: boolean;
  error?: string;
}

const FOOTER_BUTTON = 'px-3 py-0.5 text-sm';

export default function SurveyFooter({
  total,
  step,
  completed,
  onBack,
  onJump,
  isSubmitting = false,
  error,
}: SurveyFooterProps) {
  const isLast = step === total - 1;
  const submitLabel = isSubmitting ? 'Saving…' : isLast ? 'Finish' : 'Submit';

  return (
    <div className="flex flex-col gap-1">
      {error && (
        <p role="alert" className="m-0 text-sm text-[#B23A2E]">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          disabled={step <= 0 || isSubmitting}
          className={FOOTER_BUTTON}
        >
          Back
        </button>

        <div className="flex-1">
          <StepDots
            total={total}
            step={step}
            completed={completed}
            onSelect={onJump}
            disabled={isSubmitting}
          />
        </div>

        <button type="submit" disabled={isSubmitting} className={FOOTER_BUTTON}>
          {submitLabel}
        </button>
      </div>
    </div>
  );
}