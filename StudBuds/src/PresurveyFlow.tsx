import { useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import AppWindow from './components/Appwindow';
import Taskbar, { TASKBAR_CLEARANCE } from './components/TaskBar';
import AvailabilityCalendar from './components/AvailabilityCalendar';
import MultipleChoiceSection from './components/MultipleChoiceSection';
import SurveyFooter, { StepDots } from './components/SurveyFooter';
import { SURVEY_SECTIONS } from './dataFiles/SurveySections';
import type { SurveySection } from './dataFiles/SurveySections';
import bg from './assets/paperbg.png';

export interface PreSurveyResult {
  /** Available slot keys like "mon|09:30", in the user's local time */
  availability: string[];
  timezone: string;
  /** Question id to chosen option */
  answers: Record<string, string>;
}

interface PreSurveyFlowProps {
  /** Shown in the taskbar next to the avatar */
  userName?: string;
  /** Replaces the default avatar drawing in the taskbar */
  avatar?: ReactNode;
  /** Content for the right side of the taskbar (clock, help link, etc.) */
  taskbarRight?: ReactNode;
  /** Multiple choice pages, one per category. Defaults to SURVEY_SECTIONS. */
  sections?: SurveySection[];
  /** Runs when the calendar page is submitted. Return a promise to show "Saving…"; throw to show an error. */
  onAvailabilitySubmit?: (slots: string[], timezone: string) => void | Promise<void>;
  /** Runs when the last page is submitted, with everything collected */
  onFinish?: (result: PreSurveyResult) => void | Promise<void>;
}

const CALENDAR_PAGE = {
  title: 'Availability',
  heading: 'When are you free to study?',
  bio: 'Mark the times you’re usually free each week. Everything starts as unavailable.',
};

const DONE_PAGE = {
  title: 'Done',
  heading: 'You’re all set',
  bio: 'Your schedule and answers are saved.',
};

export default function PreSurveyFlow({
  userName = 'Generated Name',
  avatar,
  taskbarRight,
  sections = SURVEY_SECTIONS,
  onAvailabilitySubmit,
  onFinish,
}: PreSurveyFlowProps) {
  const total = sections.length + 1; // calendar page + one page per category
  const timezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);

  const [step, setStep] = useState(0);
  const [completed, setCompleted] = useState<boolean[]>(() => Array(total).fill(false));
  const [availability, setAvailability] = useState<string[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [missing, setMissing] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDone, setIsDone] = useState(false);

  const section = step > 0 ? sections[step - 1] : null;
  const isLast = step === total - 1;

  const goTo = (next: number) => {
    setStep(next);
    setError('');
    setMissing(new Set());
  };

  const handleAnswer = (questionId: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
    if (!missing.has(questionId)) return;
    const next = new Set(missing);
    next.delete(questionId);
    setMissing(next);
    if (next.size === 0) setError('');
  };

  /** What's wrong with a page, or null if it's complete */
  const problemOn = (i: number): { error: string; missing: Set<string> } | null => {
    if (i === 0) {
      return availability.length > 0
        ? null
        : { error: 'Drag across the calendar to mark at least one time you’re free.', missing: new Set() };
    }
    const unanswered = sections[i - 1].questions.filter((q) => !answers[q.id]).map((q) => q.id);
    return unanswered.length > 0
      ? { error: 'Answer every question in this section to continue.', missing: new Set(unanswered) }
      : null;
  };

  const showProblem = (problem: { error: string; missing: Set<string> }) => {
    setMissing(problem.missing);
    setError(problem.error);
  };

  /** Clicking a progress dot. SurveyFooter only enables dots for pages the user has reached. */
  const jumpTo = (i: number) => {
    if (isSubmitting || i === step) return;
    goTo(i);
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSubmitting || isDone) return;

    // Check the current page before saving anything
    const problem = problemOn(step);
    if (problem) {
      showProblem(problem);
      return;
    }

    // The dots let people revisit pages, so check them all once more before finishing
    if (isLast) {
      for (let i = 0; i < total; i++) {
        const earlier = problemOn(i);
        if (earlier) {
          goTo(i);
          showProblem(earlier);
          return;
        }
      }
    }

    setIsSubmitting(true);
    setError('');
    try {
      if (!section) await onAvailabilitySubmit?.(availability, timezone);
      if (isLast) await onFinish?.({ availability, timezone, answers });
    } catch {
      setError('That didn’t save. Check your connection and try again.');
      return;
    } finally {
      setIsSubmitting(false);
    }

    setCompleted((prev) => prev.map((done, i) => (i === step ? true : done)));
    if (isLast) setIsDone(true);
    else goTo(step + 1);
  };

  // What the current step puts on the page
  const page = isDone ? DONE_PAGE : section ?? CALENDAR_PAGE;

  const stepContent = isDone ? (
    <p className="m-auto text-center text-lg">Thanks for filling this out.</p>
  ) : section ? (
    <MultipleChoiceSection
      key={section.id}
      section={section}
      values={answers}
      missing={missing}
      onAnswer={handleAnswer}
    />
  ) : (
    <AvailabilityCalendar
      key="calendar"
      defaultValue={availability}
      onChange={(slots) => {
        setAvailability(slots);
        if (slots.length > 0) setError('');
      }}
    />
  );

  // Heading and explanation sit at the top of the window, above the step's content
  const windowBody = (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="m-0 text-3xl leading-snug">{page.heading}</h1>
        {page.bio && <p className="m-0 opacity-80">{page.bio}</p>}
      </header>
      {stepContent}
    </>
  );

  const windowFooter = isDone ? (
    <StepDots total={total} step={-1} completed={completed} />
  ) : (
    <SurveyFooter
      total={total}
      step={step}
      completed={completed}
      onBack={() => goTo(step - 1)}
      onJump={jumpTo}
      isSubmitting={isSubmitting}
      error={error}
    />
  );

  return (
    <div className="doodle w-full h-dvh flex flex-col">
      <Taskbar userName={userName} avatar={avatar} right={taskbarRight} />

      <main className={`relative isolate flex-1 min-h-0 flex flex-col px-4 pb-4 md:px-6 md:pb-6 ${TASKBAR_CLEARANCE}`}>
        <div
          aria-hidden
          className="absolute inset-0 -z-10 pointer-events-none bg-cover bg-center opacity-30"
          style={{ backgroundImage: `url(${bg})` }}
        />
        <section className="flex-1 min-w-0 min-h-0 flex flex-col">
          <form onSubmit={handleSubmit} className="flex-1 min-h-0 flex flex-col" noValidate>
            {/* Desk area: the window moves and resizes inside this box and can't leave it */}
            <div className="flex-1 min-h-0 min-w-0">
              <AppWindow title={page.title} footer={windowFooter}>
                {windowBody}
              </AppWindow>
            </div>
          </form>
        </section>
      </main>
    </div>
  );
}