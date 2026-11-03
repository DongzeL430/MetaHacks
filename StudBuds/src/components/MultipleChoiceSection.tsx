import type { SurveySection } from '../dataFiles/SurveySections.ts';

interface MultipleChoiceSectionProps {
  section: SurveySection;
  /** Current answers, keyed by question id */
  values: Record<string, string>;
  /** Question ids to flag as unanswered */
  missing?: Set<string>;
  onAnswer: (questionId: string, value: string) => void;
}

export default function MultipleChoiceSection({
  section,
  values,
  missing,
  onAnswer,
}: MultipleChoiceSectionProps) {
  return (
    <div className="flex flex-col gap-5">
      {section.questions.map((q) => {
        const isMissing = missing?.has(q.id) ?? false;
        const errorId = `${q.id}-error`;

        return (
          <fieldset
            key={q.id}
            className="m-0 min-w-0 px-4 pb-4 pt-2"
            aria-describedby={isMissing ? errorId : undefined}
          >
            <legend className="px-2 text-lg">{q.prompt}</legend>

            {isMissing && (
              <p id={errorId} className="m-0 mb-2 text-sm text-danger">
                Pick one to continue.
              </p>
            )}

            <div className="grid gap-2 sm:grid-cols-2">
              {q.options.map((option) => (
                <label
                  key={option}
                  className="flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer transition-colors hover:bg-sand/60 has-checked:bg-sand"
                >
                  <input
                    type="radio"
                    name={q.id}
                    value={option}
                    checked={values[q.id] === option}
                    onChange={() => onAnswer(q.id, option)}
                    className="shrink-0"
                  />
                  <span>{option}</span>
                </label>
              ))}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}