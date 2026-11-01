import { Routes, Route } from 'react-router';
import AuthPage from './AuthPage.tsx';
import HomePage from './HomePage.tsx'
import PreSurveyFlow from './PresurveyFlow.tsx';
import RequireAuth from './RequireAuth.tsx';
import { saveAvailability } from './lib/onboarding.ts';
import { findCourses, savePrograms } from './lib/courses.ts';
// import Home from './pages/Home';
// import Profile from './pages/Profile';
// import NotFound from './pages/NotFound';
// import Layout from './Layout';

export default function App() {
  return (
    <Routes>
      <Route path="/h" element={<AuthPage />} />
     <Route path="/" element={<HomePage/>} />
     <Route path="/survey" element={<PreSurveyFlow/>} />
     {/* <Route
       path="/a"
       element={
         <RequireAuth>
           <PreSurveyFlow
             onAvailabilitySubmit={(slots) => saveAvailability(slots)}
             suggestCourses={findCourses}
             onAcademicsSubmit={savePrograms}
           />
         </RequireAuth>
       }
     /> */}

     
      {/* Pages that share a layout (nav bar, etc.)
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="profile" element={<Profile />} />
      </Route>

      <Route path="*" element={<NotFound />} /> */}
    </Routes>
  );
}