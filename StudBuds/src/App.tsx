import { useEffect } from 'react';
import { Navigate, Routes, Route, useLocation, useNavigate } from 'react-router';
import AuthPage from './AuthPage.tsx';
import HomePage from './HomePage.tsx';
import PreSurveyFlow from './PresurveyFlow.tsx';
import RequireAuth from './RequireAuth.tsx';
import { supabase } from './lib/supabase.ts';
import { finishOnboarding, saveAnswers, saveAvailability } from './lib/onboarding.ts';
import { findCourses, matchCourses, saveAcademics } from './lib/courses.ts';
import { deleteMyAccount, useMyProfile } from './lib/profile.ts';
import { useStudyData } from './lib/study.ts';
import { prefetchStudySpots, useStudySpots } from './lib/spots.ts';
import { SURVEY_SECTIONS } from './dataFiles/SurveySections.ts';

/** The pre-survey, saving each page as the student goes */
function SurveyPage() {
  const navigate = useNavigate();
  // At sign-up, Muse starts finding this school's study spots (once per school) for the host form
  useEffect(() => prefetchStudySpots(), []);
  return (
    <PreSurveyFlow
      onAvailabilitySubmit={(slots) => saveAvailability(slots)}
      suggestCourses={findCourses}
      matchCourses={matchCourses}
      onAcademicsSubmit={saveAcademics}
      onFinish={async ({ answers }) => {
        await saveAnswers(answers, SURVEY_SECTIONS);
        await finishOnboarding();
        // Straight to Home, with the Study Lobbies window open
        navigate('/', { replace: true, state: { openLobbies: true } });
      }}
    />
  );
}

/** Home, filled with the student's own profile and live lobbies. Logging out or deleting sends them to /login. */
function Home() {
  const me = useMyProfile();
  const study = useStudyData();
  const studySpots = useStudySpots();
  const location = useLocation();
  const openLobbies = (location.state as { openLobbies?: boolean } | null)?.openLobbies ?? false;

  // Refusals ("This session is full.") show in the nav bar for a few seconds
  const { error, clearError } = study;
  useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(clearError, 6000);
    return () => window.clearTimeout(timer);
  }, [error, clearError]);

  // The profile window and nav bar start from the loaded profile, so wait for it
  if (!me.ready || !study.ready) return null;
  return (
    <HomePage
      userName={me.nickname}
      avatar={
        me.avatarUrl ? (
          // doodle.css frames every image; the utilities turn that off for the avatar tile
          <img src={me.avatarUrl} alt="" className="w-full h-full object-contain rounded-none border-0 [border-image:none]" />
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
      openLobbiesAtStart={openLobbies}
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
