import { Routes, Route } from 'react-router';
import AuthPage from './AuthPage.tsx';
import PreSurveyPage from './PreSurveyPage.tsx'
import PreSurveyFlow from './PresurveyFlow.tsx';
import RequireAuth from './RequireAuth.tsx';
import { saveAvailability } from './lib/onboarding.ts';
// import Home from './pages/Home';
// import Profile from './pages/Profile';
// import NotFound from './pages/NotFound';
// import Layout from './Layout';

export default function App() {
  return (
    <Routes>
      <Route path="/a" element={<AuthPage />} />
     <Route path="/s" element={<PreSurveyPage/>} />
     <Route
       path="/"
       element={
         <RequireAuth>
           <PreSurveyFlow onAvailabilitySubmit={(slots) => saveAvailability(slots)} />
         </RequireAuth>
       }
     />
      {/* Pages that share a layout (nav bar, etc.)
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="profile" element={<Profile />} />
      </Route>

      <Route path="*" element={<NotFound />} /> */}
    </Routes>
  );
}