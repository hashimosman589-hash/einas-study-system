import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth.jsx';
import { Spinner } from './components/ui.jsx';
import Layout from './layouts/Layout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Lectures from './pages/Lectures.jsx';
import Summaries from './pages/Summaries.jsx';
import Exams from './pages/Exams.jsx';
import Results from './pages/Results.jsx';
import ResultDetail from './pages/ResultDetail.jsx';
import Review from './pages/Review.jsx';
import Study from './pages/Study.jsx';
import Chat from './pages/Chat.jsx';
import Admin from './pages/Admin.jsx';

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><Spinner className="w-10 h-10 text-brand-600" /></div>;
  }
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function GuestOnly({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center"><Spinner className="w-10 h-10 text-brand-600" /></div>;
  if (user) return <Navigate to="/" replace />;
  return children;
}

function RequireAdmin({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center"><Spinner className="w-10 h-10 text-brand-600" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'admin') return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<GuestOnly><Login /></GuestOnly>} />
        <Route element={<RequireAuth><Layout /></RequireAuth>}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/lectures" element={<Lectures />} />
          <Route path="/summaries" element={<Summaries />} />
          <Route path="/exams" element={<Exams />} />
          <Route path="/review" element={<Review />} />
          <Route path="/study" element={<Study />} />
          <Route path="/chat/:id" element={<Chat />} />
          <Route path="/results" element={<Results />} />
          <Route path="/results/:id" element={<ResultDetail />} />
          <Route path="/admin" element={<RequireAdmin><Admin /></RequireAdmin>} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
