import { Link, NavLink, Outlet } from 'react-router-dom';
import { Factory, ClipboardList, Wrench, LogOut } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

/**
 * Minimal MVP layout: top bar with branding + user, left rail with a few
 * sections. No mobile-specific gymnastics yet — Factory is a desktop tool
 * at the workshop. We can revisit for tablet later.
 */
const NAV = [
  { to: '/', label: 'Tableau de bord', icon: Factory, end: true },
  { to: '/production-orders', label: 'Ordres de fabrication', icon: ClipboardList },
  { to: '/assemblies', label: 'Assemblages', icon: Wrench },
];

export default function AppLayout() {
  const { user, logout } = useAuth();
  return (
    <div className="min-h-screen bg-[--k-bg] text-[--k-text] flex flex-col">
      <header className="bg-[--k-surface] border-b border-[--k-border] px-4 h-12 flex items-center gap-4">
        <Link to="/" className="font-semibold flex items-center gap-2">
          <Factory className="h-5 w-5 text-[--k-primary]" />
          Bornes Factory
        </Link>
        <div className="flex-1" />
        {user && (
          <div className="flex items-center gap-3 text-[13px]">
            <span className="text-[--k-muted]">{user.fullName || user.username}</span>
            <button
              type="button"
              onClick={logout}
              className="inline-flex items-center gap-1 text-[--k-muted] hover:text-[--k-danger]"
            >
              <LogOut className="h-4 w-4" />
              Déconnexion
            </button>
          </div>
        )}
      </header>

      <div className="flex flex-1 min-h-0">
        <aside className="w-56 shrink-0 bg-[--k-surface] border-r border-[--k-border] p-2 space-y-1">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] ${
                  isActive
                    ? 'bg-[--k-primary-2] text-[--k-primary] font-medium'
                    : 'text-[--k-text] hover:bg-[--k-surface-2]'
                }`
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </aside>

        <main className="flex-1 min-w-0 overflow-y-auto p-5">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
