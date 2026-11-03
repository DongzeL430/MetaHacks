import { useEffect, useState } from 'react';
import { Navigate, Routes, Route, useLocation, useNavigate } from 'react-router';
import AuthPage from './AuthPage.tsx';
import HomePage from './HomePage.tsx';
import PreSurveyFlow from './PresurveyFlow.tsx';
import RequireAuth from './RequireAuth.tsx';
import Tour, { useFirstTimeTour } from './components/Tour.tsx';
import type { TourStep } from './components/Tour.tsx';
import { supabase } from './lib/supabase.ts';
import { finishOnboarding, saveAnswers, saveAvailability } from './lib/onboarding.ts';
import { findCourses, matchCourses, saveAcademics } from './lib/courses.ts';
import { deleteMyAccount, loadSurveyProgress, useMyProfile } from './lib/profile.ts';
import type { SurveyProgress } from './lib/profile.ts';
import { useStudyData } from './lib/study.ts';
import { prefetchStudySpots, useStudySpots } from './lib/spots.ts';
import { SURVEY_SECTIONS } from './dataFiles/SurveySections.ts';

/** The first thing a new account sees: what the survey is for, and how to close this popup */
const SURVEY_TOUR: TourStep[] = [
  {
    title: 'Welcome to StudBuds!',
    closeOnly: true,
    body: (
      <>
        <p className="m-0">We’re glad you’re here.</p>
        <p className="m-0">
          First, fill out this short survey: when you’re free, what you’re studying, and how you like to work. We use
          your answers to match you with other students who fit.
        </p>
        <p className="m-0 font-bold">When you’re done reading, close this with the glowing ✕ to get started.</p>
      </>
    ),
  },
];

/** The pre-survey, saving each page as the student goes */
function SurveyPage() {
  const navigate = useNavigate();
  const tour = useFirstTimeTour('survey');
  // Muse starts finding the school's study spots when the account is created (AuthPage). This
  // covers a student who confirmed their email somewhere else; it shares the same request.
  useEffect(() => prefetchStudySpots(), []);
  // Pages already saved (a reload partway through). If they can't be read, it starts fresh.
  const [saved, setSaved] = useState<SurveyProgress | null | 'none'>(null);
  useEffect(() => {
    loadSurveyProgress().then(setSaved, (err) => {
      console.warn('survey progress not loaded', err);
      setSaved('none');
    });
  }, []);
  if (saved === null) {
    return (
      <main className="doodle min-h-dvh flex items-center justify-center p-6">
        <p role="status" className="m-0 text-lg">
          Loading your survey…
        </p>
      </main>
    );
  }
  const progress = saved === 'none' ? undefined : saved;
  return (
    <>
      {tour.status === 'open' && <Tour steps={SURVEY_TOUR} onClose={tour.close} />}
      <PreSurveyFlow
        userName={progress?.nickname}
        avatar={
          progress?.avatarUrl ? (
            <img src={progress.avatarUrl} alt="" className="w-full h-full object-cover rounded-none border-0 [border-image:none]" />
          ) : undefined
        }
        initial={progress}
        onAvailabilitySubmit={(slots) => saveAvailability(slots)}
        suggestCourses={findCourses}
        matchCourses={matchCourses}
        onAcademicsSubmit={saveAcademics}
        onAnswersSubmit={(answers) => saveAnswers(answers, SURVEY_SECTIONS)}
        onFinish={async ({ answers }) => {
          await saveAnswers(answers, SURVEY_SECTIONS);
          await finishOnboarding();
          // Straight to Home: the welcome tour first, then the Study Lobbies window
          navigate('/', { replace: true, state: { fromSurvey: true } });
        }}
      />
    </>
  );
}

/** Home, filled with the student's own profile and live lobbies. Logging out or deleting sends them to /login. */
function Home() {
  const me = useMyProfile();
  const study = useStudyData();
  const studySpots = useStudySpots();
  const location = useLocation();
  const fromSurvey = (location.state as { fromSurvey?: boolean } | null)?.fromSurvey ?? false;
  // Just finished the survey: a short tour of Home, shown once per account
  const tour = useFirstTimeTour('home', fromSurvey);

  // Refusals ("This session is full.") show in the nav bar for a few seconds
  const { error, clearError } = study;
  useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(clearError, 6000);
    return () => window.clearTimeout(timer);
  }, [error, clearError]);

  // The profile window and nav bar start from the loaded profile, so wait for it
  // ...and whether the tour shows, so the lobbies don't open first and then hide behind it.
  // While waiting, say so; if a first load failed (both hooks keep retrying), say that instead
  // of leaving the page blank.
  if (!me.ready || !study.ready || tour.status === 'checking') {
    const trouble = (!study.ready && !!study.error) || me.failed;
    return (
      <main className="doodle min-h-dvh flex flex-col items-center justify-center gap-3 p-6 text-center">
        <p role="status" className="m-0 text-lg">
          {trouble ? 'Can’t reach StudBuds right now. Trying again…' : 'Loading StudBuds…'}
        </p>
        {trouble && (
          <button type="button" onClick={() => window.location.reload()} className="px-4 py-1">
            Retry now
          </button>
        )}
      </main>
    );
  }
  return (
    <>
      <HomePage
        userName={me.nickname}
        avatar={
          me.avatarUrl ? (
            // doodle.css frames every image; the utilities turn that off for the avatar tile
            <img src={me.avatarUrl} alt="" className="w-full h-full object-cover rounded-none border-0 [border-image:none]" />
          ) : undefined
        }
        avatarUrl={me.avatarUrl}
        taskbarRight={
          error ? (
            <p role="alert" className="m-0 max-w-[16rem] text-sm leading-tight">
              {error}
            </p>
          ) : undefined
        }
        people={study.people}
        locationSuggestions={studySpots}
        myAvailability={me.availability}
        mySubjects={[...new Set([...me.seekingHelpWith, ...me.coursesTaken])]}
        initialStudyState={study.state}
        studyState={study.state}
        onRefreshStudy={study.refresh}
        openLobbiesAtStart={fromSurvey}
        welcomeTour={tour.status === 'open' ? { onDone: tour.close } : undefined}
        onStudyAction={(action) => void study.act(action)}
        initialProfile={{
          availability: me.availability,
          contact: me.contact,
          coursesTaken: me.coursesTaken,
          seekingHelpWith: me.seekingHelpWith,
          courses: me.courses,
          answers: me.answers,
        }}
        onSaveProfile={me.save}
        onRedrawAvatar={me.redrawAvatar}
        identityChangesLeft={me.changesLeft}
        onLogOut={() => void supabase.auth.signOut()}
        onDeleteAccount={deleteMyAccount}
      />
      {error && (
        // On phones the nav bar has no room for it, so the same message shows as a note over the page
        <p
          role="alert"
          className="sm:hidden fixed inset-x-4 bottom-20 z-[80] m-0 px-3 py-2 rounded-md border-2 border-danger bg-paper text-sm shadow-md motion-safe:transition-opacity motion-safe:duration-200 starting:opacity-0"
        >
          {error}
        </p>
      )}
    </>
  );
}

/**
 * /login: sign up, log in, reset a password, delete an account.
 * /survey: the pre-survey, for signed-in students who haven't finished it.
 * /: Home, for students who have. Anyone else is sent where they belong.
 */
export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<AuthPage />} />
      {/* Old address of the auth page */}
      <Route path="/h" element={<Navigate to="/login" replace />} />
      <Route
        path="/survey"
        element={
          // Each page gets its own key: without one, React reuses the same RequireAuth (and its
          // "not finished" status) when moving from the survey to Home, and Home bounced back
          <RequireAuth key="survey" need="new">
            <SurveyPage />
          </RequireAuth>
        }
      />
      <Route
        path="/"
        element={
          <RequireAuth key="home" need="onboarded">
            <Home />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
