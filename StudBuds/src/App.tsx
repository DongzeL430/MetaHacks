import { Routes, Route } from 'react-router';
import AuthPage from './AuthPage.tsx';
import PreSurveyPage from './PreSurveyPage.tsx'
// import Home from './pages/Home';
// import Profile from './pages/Profile';
// import NotFound from './pages/NotFound';
// import Layout from './Layout';

export default function App() {
  return (
    <Routes>
      <Route path="/a" element={<AuthPage />} />
     <Route path="/" element={<PreSurveyPage/>} />
      {/* Pages that share a layout (nav bar, etc.)
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="profile" element={<Profile />} />
      </Route>

      <Route path="*" element={<NotFound />} /> */}
    </Routes>
  );
}