import { Routes, Route, Navigate } from 'react-router-dom';
import { useSession } from './lib/session';
import LoginPage from './pages/LoginPage';
import AdminLayout from './layouts/AdminLayout';
import DashboardPage from './pages/DashboardPage';
import CompaniesPage from './pages/CompaniesPage';
import CompanyDetailPage from './pages/CompanyDetailPage';
import AuditPage from './pages/AuditPage';
import EmployeesPage from './pages/EmployeesPage';
import SettingsPage from './pages/SettingsPage';
import PaymentsPage from './pages/PaymentsPage';
import DREPage from './pages/DREPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useSession();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-lg">Carregando...</div>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (session.scope !== 'admin') {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600">Acesso Negado</h1>
          <p className="mt-2">Conta de tenant não pode acessar o console admin.</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/admin"
        element={
          <ProtectedRoute>
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="companies" element={<CompaniesPage />} />
        <Route path="companies/:id" element={<CompanyDetailPage />} />
        <Route path="audit" element={<AuditPage />} />
        <Route path="employees" element={<EmployeesPage />} />
        <Route path="payments" element={<PaymentsPage />} />
        <Route path="dre" element={<DREPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/admin" replace />} />
    </Routes>
  );
}
