import type { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth-context';

const NAV = [
  { to: '/', label: 'Overview', icon: '📈' },
  { to: '/funnels', label: 'Funnels', icon: '🪜' },
  { to: '/retention', label: 'Retention', icon: '🔁' },
  { to: '/events', label: 'Events', icon: '📄' },
  { to: '/dashboards', label: 'Dashboards', icon: '🗂️' },
  { to: '/alerts', label: 'Alerts', icon: '🔔' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
];

export default function Layout({ children }: { children: ReactNode }) {
  const { session, logout, user } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">N</span>
          <span className="brand-name">Nimbus</span>
        </div>
        <nav className="nav">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <span className="nav-icon">{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="project-chip" title={session?.projectName ?? 'No project'}>
            <span className="project-dot" />
            <span className="project-name">{session?.projectName ?? 'No project'}</span>
          </div>
          <div className="user-row">
            <span className="user-email">{user?.email}</span>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                logout();
                navigate('/');
              }}
            >
              Sign out
            </button>
          </div>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
