import { Outlet, NavLink } from 'react-router-dom';
import { LayoutDashboard, Building2, FileText, Users, Settings, LogOut, CreditCard, TrendingUp } from 'lucide-react';
import { useSession } from '../lib/session';

export default function AdminLayout() {
  const { session, logout } = useSession();

  const navItems = [
    { to: '/admin/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/admin/companies', icon: Building2, label: 'Companies' },
    { to: '/admin/audit', icon: FileText, label: 'Audit' },
    { to: '/admin/employees', icon: Users, label: 'Employees' },
    { to: '/admin/payments', icon: CreditCard, label: 'Payments' },
    { to: '/admin/dre', icon: TrendingUp, label: 'DRE' },
    { to: '/admin/settings', icon: Settings, label: 'Settings' },
  ];

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-900 text-white">
        <div className="p-4">
          <h1 className="text-xl font-bold">CRM Admin Console</h1>
          <p className="text-sm text-gray-400 mt-1">{session?.email}</p>
        </div>

        <nav className="mt-6">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 hover:bg-gray-800 transition-colors ${
                  isActive ? 'bg-gray-800 border-l-4 border-blue-500' : ''
                }`
              }
            >
              <item.icon size={20} />
              <span>{item.label}</span>
            </NavLink>
          ))}

          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-800 transition-colors mt-4 border-t border-gray-700"
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
