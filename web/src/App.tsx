import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './lib/auth-context';
import Layout from './components/Layout';
import LoginPage from './views/LoginPage';
import OverviewPage from './views/OverviewPage';
import FunnelsPage from './views/FunnelsPage';
import RetentionPage from './views/RetentionPage';
import EventsPage from './views/EventsPage';
import DashboardsPage from './views/DashboardsPage';
import AlertsPage from './views/AlertsPage';
import SettingsPage from './views/SettingsPage';

export default function App() {
  const { session } = useAuth();

  if (!session?.token) {
    return <LoginPage />;
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<OverviewPage />} />
        <Route path="/funnels" element={<FunnelsPage />} />
        <Route path="/retention" element={<RetentionPage />} />
        <Route path="/events" element={<EventsPage />} />
        <Route path="/dashboards" element={<DashboardsPage />} />
        <Route path="/alerts" element={<AlertsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
