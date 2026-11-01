import { useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import AppWindow, { WindowManagerProvider } from './components/AppWindow';
import AboutYouWindow from './components/AboutYouWindow';
import Taskbar, { TASKBAR_CLEARANCE } from './components/TaskBar';
import AvailabilityCalendar from './components/AvailabilityCalendar';
import CoursesSection, {
  cleanAcademics,
  emptyAcademics,
  validateAcademics,
} from './components/CoursesSection';
import type { AcademicProfile, CourseSuggestionQuery } from './components/CoursesSection';
import MultipleChoiceSection from './components/MultipleChoiceSection';
import SurveyFooter, { StepDots } from './components/SurveyFooter';
import { SURVEY_SECTIONS } from './dataFiles/SurveySections';
import type { SurveySection } from './dataFiles/SurveySections';
import bg from './assets/paperbg.png';

export interface PreSurveyResult {
  /** Available slot keys like "mon|09:30", in the user's local time */
  availability: string[];
  timezone: string;
  /** Major, minor, year and courses (blank rows removed) */
  academics: AcademicProfile;
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
  /** Show the Courses page after the calendar (default true) */
  includeCourses?: boolean;
  /** Search that returns expected course names for the About you window's "Find courses" button */
  suggestCourses?: (query: CourseSuggestionQuery) => Promise<string[]>;
  /** Runs when the calendar page is submitted. Return a promise to show "Saving…"; throw to show an error. */
  onAvailabilitySubmit?: (slots: string[], timezone: string) => void | Promise<void>;
  /** Runs when the Courses page is submitted. Same rules as onAvailabilitySubmit. */
  onAcademicsSubmit?: (academics: AcademicProfile) => void | Promise<void>;
  /** Runs when the last page is submitted, with everything collected */
  onFinish?: (result: PreSurveyResult) => void | Promise<void>;
}

/** Each page of the flow, in order */
type Step = { kind: 'calendar' } | { kind: 'courses' } | { kind: 'questions'; section: SurveySection };

type Problem = { error: string; missing: Set<string> };

const CALENDAR_PAGE = {
  title: 'Availability',
  heading: 'When are you free to study?',
  bio: 'Mark the times you’re usually free each week. Everything starts as unavailable.',
};

const COURSES_PAGE = {
  title: 'Courses',
  heading: 'What are you studying?',
  bio: 'Add courses you’ve taken or are taking now, and how confident you feel in each.',
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
  includeCourses = true,
  suggestCourses,
  onAvailabilitySubmit,
  onAcademicsSubmit,
  onFinish,
}: PreSurveyFlowProps) {
  const steps = useMemo(() => {
    const list: Step[] = [{ kind: 'calendar' }];
    if (includeCourses) list.push({ kind: 'courses' });
    for (const section of sections) list.push({ kind: 'questions', section });
    return list;
  }, [includeCourses, sections]);

  const total = steps.length;
  const timezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);

  const [step, setStep] = useState(0);
  const [completed, setCompleted] = useState<boolean[]>(() => Array(total).fill(false));
  const [availability, setAvailability] = useState<string[]>([]);
  const [academics, setAcademics] = useState<AcademicProfile>(emptyAcademics);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [missing, setMissing] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDone, setIsDone] = useState(false);
  // About you popup (course auto-fill)
  const [aboutOpen, setAboutOpen] = useState(false);
  const [isWindowFullscreen, setIsWindowFullscreen] = useState(false);
  // Closing the survey window only hides it. Answers stay, and it can be reopened.
  const [windowOpen, setWindowOpen] = useState(true);
  const [autofillNotice, setAutofillNotice] = useState('');
  const openerRef = useRef<HTMLElement | null>(null);

  const current = steps[step];
  const isLast = step === total - 1;

  const goTo = (next: number) => {
    setStep(next);
    setError('');
    setMissing(new Set());
    setAutofillNotice('');
    setAboutOpen(false);
  };

  const openAutofill = () => {
    openerRef.current = document.activeElement as HTMLElement | null;
    setAboutOpen(true);
  };

  const closeAutofill = () => {
    setAboutOpen(false);
    // Put focus back on the button that opened it, once the main window is active again
    requestAnimationFrame(() => openerRef.current?.focus());
  };

  const handleAutofilled = (added: number) => {
    setAutofillNotice(`Added ${added} suggested course${added === 1 ? '' : 's'}. Rate each one or remove it.`);
    closeAutofill();
  };

  const handleAnswer = (questionId: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
    if (!missing.has(questionId)) return;
    const next = new Set(missing);
    next.delete(questionId);
    setMissing(next);
    if (next.size === 0) setError('');
  };

  const handleAcademicsChange = (next: AcademicProfile) => {
    setAcademics(next);
    if (missing.size === 0) return;
    // Clear errors as they get fixed, without flagging rows the user is still filling in
    const stillMissing = validateAcademics(next)?.missing ?? new Set<string>();
    const remaining = new Set([...missing].filter((key) => stillMissing.has(key)));
    setMissing(remaining);
    if (remaining.size === 0) setError('');
  };

  /** What's wrong with a page, or null if it's complete */
  const problemOn = (i: number): Problem | null => {
    const s = steps[i];
    switch (s.kind) {
      case 'calendar':
        return availability.length > 0
          ? null
          : { error: 'Drag across the calendar to mark at least one time you’re free.', missing: new Set() };
      case 'courses': {
        const problem = validateAcademics(academics);
        return problem && { error: problem.message, missing: problem.missing };
      }
      case 'questions': {
        const unanswered = s.section.questions.filter((q) => !answers[q.id]).map((q) => q.id);
        return unanswered.length > 0
          ? { error: 'Answer every question in this section to continue.', missing: new Set(unanswered) }
          : null;
      }
    }
  };

  const showProblem = (problem: Problem) => {
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
      if (current.kind === 'calendar') await onAvailabilitySubmit?.(availability, timezone);
      if (current.kind === 'courses') await onAcademicsSubmit?.(cleanAcademics(academics));
      if (isLast) {
        await onFinish?.({ availability, timezone, academics: cleanAcademics(academics), answers });
      }
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
  const page = isDone
    ? DONE_PAGE
    : current.kind === 'calendar'
      ? CALENDAR_PAGE
      : current.kind === 'courses'
        ? COURSES_PAGE
        : current.section;

  let stepContent: ReactNode;
  if (isDone) {
    stepContent = <p className="m-auto text-center text-lg">Thanks for filling this out.</p>;
  } else if (current.kind === 'calendar') {
    stepContent = (
      <AvailabilityCalendar
        key="calendar"
        defaultValue={availability}
        onChange={(slots) => {
          setAvailability(slots);
          if (slots.length > 0) setError('');
        }}
      />
    );
  } else if (current.kind === 'courses') {
    stepContent = (
      <CoursesSection
        value={academics}
        onChange={handleAcademicsChange}
        missing={missing}
        onOpenAutofill={openAutofill}
        notice={autofillNotice}
      />
    );
  } else {
    stepContent = (
      <MultipleChoiceSection
        key={current.section.id}
        section={current.section}
        values={answers}
        missing={missing}
        onAnswer={handleAnswer}
      />
    );
  }

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

  const showAboutWindow = !isDone && current.kind === 'courses';

  return (
    <div className="doodle w-full h-dvh flex flex-col">
      <Taskbar userName={userName} avatar={avatar} right={taskbarRight} />

      {/* No `isolate` / z-index on main: a full screen window has to be able to rise above the taskbar */}
      <main className={`relative flex-1 min-h-0 flex flex-col px-4 pb-4 md:px-6 md:pb-6 ${TASKBAR_CLEARANCE}`}>
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none bg-cover bg-center opacity-30"
          style={{ backgroundImage: `url(${bg})` }}
        />
        {/* `relative` keeps the section painted above the paper background */}
        <section className="relative flex-1 min-w-0 min-h-0 flex flex-col">
          <form onSubmit={handleSubmit} className="flex-1 min-h-0 flex flex-col" noValidate>
            {/* Desk area: windows rest inside this box. They can be dragged out over the padding,
                but spring back in when let go. */}
            <div className="relative flex-1 min-h-0 min-w-0">
              {/* Windows inside share a stack: the newest is in front, the ones behind shrink a little */}
              <WindowManagerProvider>
              <AppWindow
                id="survey"
                title={page.title}
                footer={windowFooter}
                open={windowOpen}
                onClose={() => setWindowOpen(false)}
                controls={{ close: 'disabled', fullscreen: 'enabled' }}
                onFullscreenChange={setIsWindowFullscreen}
                inactive={aboutOpen}
              >
                {windowBody}
              </AppWindow>

              {!windowOpen && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center">
                  <p className="m-0 text-lg">The survey window is closed. Your answers are still here.</p>
                  <button type="button" onClick={() => setWindowOpen(true)} className="px-4 py-1">
                    Open survey
                  </button>
                </div>
              )}

              {/* Pops up above the survey window, inside the same desk area */}
              {aboutOpen && showAboutWindow && (
                <AboutYouWindow
                  value={academics}
                  onChange={handleAcademicsChange}
                  onClose={closeAutofill}
                  suggestCourses={suggestCourses}
                  onFilled={handleAutofilled}
                  coverScreen={isWindowFullscreen}
                />
              )}
              </WindowManagerProvider>
            </div>
          </form>
        </section>
      </main>
    </div>
  );
}