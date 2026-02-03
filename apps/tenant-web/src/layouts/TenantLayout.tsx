import { Outlet, NavLink } from 'react-router-dom';
import { Home, Radio, LogOut } from 'lucide-react';
import { useSession } from '../lib/session';

export default function TenantLayout() {
  const { session, logout } = useSession();

  const navItems = [
    { to: '/app/home', icon: Home, label: 'Home' },
    { to: '/app/ping', icon: Radio, label: 'Ping' },
  ];

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-64 bg-indigo-900 text-white">
        <div className="p-4">
          <h1 className="text-xl font-bold">CRM Tenant App</h1>
          <p className="text-sm text-indigo-300 mt-1">{session?.email}</p>
        </div>

        <nav className="mt-6">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 hover:bg-indigo-800 transition-colors ${
                  isActive ? 'bg-indigo-800 border-l-4 border-indigo-400' : ''
                }`
              }
            >
              <item.icon size={20} />
              <span>{item.label}</span>
            </NavLink>
          ))}

          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-indigo-800 transition-colors mt-4 border-t border-indigo-700"
          >
            <LogOut size={20} />
            <span>Logout</span>
          </button>
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
