import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ArmiesPage } from './pages/ArmiesPage';
import { KingdomPage } from './pages/KingdomPage';
import { LeadersPage } from './pages/LeadersPage';
import { SettlementsPage } from './pages/SettlementsPage';
import { SkillsPage } from './pages/SkillsPage';

function NotFound() {
  return (
    <div className="card mx-auto max-w-md text-center">
      <h1 className="mb-2 text-2xl font-bold">Page not found</h1>
      <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">
        That page does not exist (yet).
      </p>
      <Link to="/kingdom" className="btn-primary inline-block">
        Back to the kingdom
      </Link>
    </div>
  );
}

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/kingdom" replace />} />
        <Route path="/kingdom" element={<KingdomPage />} />
        <Route path="/skills" element={<SkillsPage />} />
        <Route path="/leaders" element={<LeadersPage />} />
        <Route path="/settlements" element={<SettlementsPage />} />
        <Route path="/armies" element={<ArmiesPage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}