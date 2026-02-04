import { useCompanies } from '../hooks/useCompanies';
import { useEmployees } from '../hooks/useEmployees';
import { useAudit } from '../hooks/useAudit';
import { Building2, Users, Activity, TrendingUp, CheckCircle } from 'lucide-react';
import { format } from 'date-fns';

export default function DashboardPage() {
  const { data: companies, isLoading: loadingCompanies } = useCompanies();
  const { data: employees, isLoading: loadingEmployees } = useEmployees();
  const { data: auditData, isLoading: loadingAudit } = useAudit();

  const totalCompanies = (Array.isArray(companies) ? companies : [])?.length || 0;
  const activeCompanies = (Array.isArray(companies) ? companies : [])?.filter((c: { status: string }) => c.status === 'ACTIVE').length || 0;
  const totalEmployees = (Array.isArray(employees) ? employees : [])?.length || 0;
  const recentAuditLogs = Array.isArray(auditData?.data) ? auditData?.data?.length : 0;

  const cards = [
    {
      title: 'Total de Empresas',
      value: totalCompanies,
      icon: Building2,
      color: 'blue',
      bgColor: 'bg-blue-50',
      textColor: 'text-blue-600',
      loading: loadingCompanies,
    },
    {
      title: 'Empresas Ativas',
      value: activeCompanies,
      icon: CheckCircle,
      color: 'green',
      bgColor: 'bg-green-50',
      textColor: 'text-green-600',
      loading: loadingCompanies,
    },
    {
      title: 'Colaboradores',
      value: totalEmployees,
      icon: Users,
      color: 'purple',
      bgColor: 'bg-purple-50',
      textColor: 'text-purple-600',
      loading: loadingEmployees,
    },
    {
      title: 'Logs de Auditoria',
      value: recentAuditLogs,
      icon: Activity,
      color: 'orange',
      bgColor: 'bg-orange-50',
      textColor: 'text-orange-600',
      loading: loadingAudit,
    },
  ];

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-2 text-sm text-gray-600">
          Visão geral do sistema em tempo real • Atualizado em {format(new Date(), "dd/MM/yyyy 'às' HH:mm")}
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
        {cards.map((card, index) => {
          const Icon = card.icon;
          return (
            <div key={index} className="rounded-lg bg-white p-6 shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">{card.title}</p>
                  {card.loading ? (
                    <div className="mt-2 h-8 w-16 animate-pulse rounded bg-gray-200" />
                  ) : (
                    <p className={`mt-2 text-3xl font-bold ${card.textColor}`}>
                      {card.value.toLocaleString('pt-BR')}
                    </p>
                  )}
                </div>
                <div className={`rounded-full ${card.bgColor} p-3`}>
                  <Icon className={`h-6 w-6 ${card.textColor}`} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Welcome Section */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 p-6 shadow text-white">
          <h2 className="text-2xl font-bold mb-2">Bem-vindo ao CRM PRO</h2>
          <p className="text-blue-100 mb-4">
            Sistema de gestão empresarial com custom fields dinâmicos, visualizações personalizadas e auditoria imutável.
          </p>
          <div className="flex gap-4">
            <div className="flex-1 rounded-lg bg-white/20 backdrop-blur-sm p-4">
              <div className="text-3xl font-bold">{activeCompanies}</div>
              <div className="text-sm text-blue-100">Empresas Ativas</div>
            </div>
            <div className="flex-1 rounded-lg bg-white/20 backdrop-blur-sm p-4">
              <div className="text-3xl font-bold">{totalEmployees}</div>
              <div className="text-sm text-blue-100">Colaboradores</div>
            </div>
          </div>
        </div>

        {/* System Status */}
        <div className="rounded-lg bg-white p-6 shadow border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Status do Sistema</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg bg-green-50">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <span className="text-sm font-medium text-gray-900">API Backend</span>
              </div>
              <span className="text-xs font-semibold text-green-600">ONLINE</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-green-50">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <span className="text-sm font-medium text-gray-900">Banco de Dados</span>
              </div>
              <span className="text-xs font-semibold text-green-600">CONECTADO</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-green-50">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <span className="text-sm font-medium text-gray-900">Auditoria WORM</span>
              </div>
              <span className="text-xs font-semibold text-green-600">ATIVO</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-blue-50">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-blue-600" />
                <span className="text-sm font-medium text-gray-900">Custom Fields</span>
              </div>
              <span className="text-xs font-semibold text-blue-600">HABILITADO</span>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="mt-8 rounded-lg bg-white p-6 shadow border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Ações Rápidas</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <a
            href="/admin/companies"
            className="flex items-center gap-3 rounded-lg border-2 border-gray-200 p-4 hover:border-blue-500 hover:bg-blue-50 transition-colors"
          >
            <Building2 className="h-5 w-5 text-gray-600" />
            <div>
              <div className="font-medium text-gray-900">Gerenciar Empresas</div>
              <div className="text-xs text-gray-500">Visualizar e editar empresas</div>
            </div>
          </a>
          <a
            href="/admin/employees"
            className="flex items-center gap-3 rounded-lg border-2 border-gray-200 p-4 hover:border-blue-500 hover:bg-blue-50 transition-colors"
          >
            <Users className="h-5 w-5 text-gray-600" />
            <div>
              <div className="font-medium text-gray-900">Colaboradores</div>
              <div className="text-xs text-gray-500">Gerenciar equipe</div>
            </div>
          </a>
          <a
            href="/admin/audit"
            className="flex items-center gap-3 rounded-lg border-2 border-gray-200 p-4 hover:border-blue-500 hover:bg-blue-50 transition-colors"
          >
            <Activity className="h-5 w-5 text-gray-600" />
            <div>
              <div className="font-medium text-gray-900">Logs de Auditoria</div>
              <div className="text-xs text-gray-500">Visualizar histórico</div>
            </div>
          </a>
        </div>
      </div>
    </div>
  );
}
