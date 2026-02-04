import { useMemo, useEffect, useRef, useState } from 'react';
import { useCompanies } from '../hooks/useCompanies';
import { useEmployees } from '../hooks/useEmployees';
import { useAudit } from '../hooks/useAudit';
import { useCreateView, useUpdateView, useViews } from '../hooks/useViews';
import {
  Building2,
  Users,
  Activity,
  TrendingUp,
  CheckCircle,
  DollarSign,
  Wallet,
  Percent,
  Receipt,
  ArrowLeftRight,
} from 'lucide-react';
import { format } from 'date-fns';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  arrayMove,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

type CardSize = 'sm' | 'lg';

interface DashboardLayoutItem {
  id: string;
  size: CardSize;
}

interface DashboardView {
  id: string;
  name?: string;
  isDefault?: boolean;
  config?: { layout?: DashboardLayoutItem[] };
}

interface DashboardCard {
  id: string;
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  textColor: string;
  bgColor: string;
  loading?: boolean;
}

const FILTER_OPTIONS = [
  { value: 'month_current', label: 'Mês atual' },
  { value: 'year_current', label: 'Ano atual' },
  { value: '01', label: 'Janeiro' },
  { value: '02', label: 'Fevereiro' },
  { value: '03', label: 'Março' },
  { value: '04', label: 'Abril' },
  { value: '05', label: 'Maio' },
  { value: '06', label: 'Junho' },
  { value: '07', label: 'Julho' },
  { value: '08', label: 'Agosto' },
  { value: '09', label: 'Setembro' },
  { value: '10', label: 'Outubro' },
  { value: '11', label: 'Novembro' },
  { value: '12', label: 'Dezembro' },
];

const DEFAULT_LAYOUT: DashboardLayoutItem[] = [
  { id: 'revenue_total', size: 'lg' },
  { id: 'revenue_month', size: 'sm' },
  { id: 'revenue_open', size: 'sm' },
  { id: 'ticket_avg', size: 'sm' },
  { id: 'churn', size: 'sm' },
  { id: 'mom_growth', size: 'sm' },
  { id: 'companies_total', size: 'sm' },
  { id: 'companies_active', size: 'sm' },
  { id: 'employees_total', size: 'sm' },
  { id: 'audit_logs', size: 'sm' },
];

function SortableCard({
  card,
  size,
  onToggleSize,
}: {
  card: DashboardCard;
  size: CardSize;
  onToggleSize: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  const sizeClass = size === 'lg' ? 'md:col-span-2 lg:col-span-2' : 'md:col-span-1 lg:col-span-1';
  const Icon = card.icon;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`rounded-lg bg-white p-6 shadow-sm border border-gray-200 transition-shadow cursor-grab ${sizeClass}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-gray-600">{card.title}</p>
          </div>
          {card.subtitle && <p className="mt-1 text-xs text-gray-500">{card.subtitle}</p>}
          {card.loading ? (
            <div className="mt-3 h-8 w-24 animate-pulse rounded bg-gray-200" />
          ) : (
            <p className={`mt-3 text-3xl font-bold ${card.textColor}`}>{card.value}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className={`rounded-full ${card.bgColor} p-3`}>
            <Icon className={`h-6 w-6 ${card.textColor}`} />
          </div>
          <button
            type="button"
            onClick={onToggleSize}
            className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
            title="Alternar tamanho"
          >
            <ArrowLeftRight className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-2 text-xs text-gray-400">
        <span>Arraste para reordenar</span>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { data: companies, isLoading: loadingCompanies } = useCompanies();
  const { data: employees, isLoading: loadingEmployees } = useEmployees();
  const { data: auditData, isLoading: loadingAudit } = useAudit();
  const layoutStorageKey = 'admin-dashboard-layout';
  const dashboardViews = useViews('dashboard');
  const createView = useCreateView();
  const updateView = useUpdateView();

  const viewsAvailable = !dashboardViews.isError;
  const viewsData = dashboardViews.data;
  const [activeViewId, setActiveViewId] = useState<string | null>(null);

  const [filter, setFilter] = useState('month_current');
  const [layout, setLayout] = useState<DashboardLayoutItem[]>(DEFAULT_LAYOUT);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  const totalCompanies = (Array.isArray(companies) ? companies : [])?.length || 0;
  const activeCompanies = (Array.isArray(companies) ? companies : [])?.filter((c: { status: string }) => c.status === 'ACTIVE').length || 0;
  const totalEmployees = (Array.isArray(employees) ? employees : [])?.length || 0;
  const recentAuditLogs = Array.isArray(auditData?.data) ? auditData?.data?.length : 0;

  const periodLabel = useMemo(() => {
    const option = FILTER_OPTIONS.find((item) => item.value === filter);
    return option?.label || 'Período';
  }, [filter]);

  const cards = useMemo<DashboardCard[]>(
    () => [
      {
        id: 'revenue_total',
        title: 'Receita total',
        value: '—',
        subtitle: periodLabel,
        icon: DollarSign,
        bgColor: 'bg-green-50',
        textColor: 'text-green-600',
      },
      {
        id: 'revenue_month',
        title: 'Receita do mês',
        value: '—',
        icon: Wallet,
        bgColor: 'bg-emerald-50',
        textColor: 'text-emerald-600',
      },
      {
        id: 'revenue_open',
        title: 'Receita em aberto',
        value: '—',
        icon: Receipt,
        bgColor: 'bg-yellow-50',
        textColor: 'text-yellow-600',
      },
      {
        id: 'ticket_avg',
        title: 'Ticket médio',
        value: '—',
        icon: TrendingUp,
        bgColor: 'bg-blue-50',
        textColor: 'text-blue-600',
      },
      {
        id: 'churn',
        title: 'Churn',
        value: '—',
        icon: Percent,
        bgColor: 'bg-rose-50',
        textColor: 'text-rose-600',
      },
      {
        id: 'mom_growth',
        title: 'Crescimento MoM',
        value: '—',
        icon: TrendingUp,
        bgColor: 'bg-indigo-50',
        textColor: 'text-indigo-600',
      },
      {
        id: 'companies_total',
        title: 'Total de Empresas',
        value: totalCompanies.toLocaleString('pt-BR'),
        icon: Building2,
        bgColor: 'bg-blue-50',
        textColor: 'text-blue-600',
        loading: loadingCompanies,
      },
      {
        id: 'companies_active',
        title: 'Empresas Ativas',
        value: activeCompanies.toLocaleString('pt-BR'),
        icon: CheckCircle,
        bgColor: 'bg-green-50',
        textColor: 'text-green-600',
        loading: loadingCompanies,
      },
      {
        id: 'employees_total',
        title: 'Colaboradores',
        value: totalEmployees.toLocaleString('pt-BR'),
        icon: Users,
        bgColor: 'bg-purple-50',
        textColor: 'text-purple-600',
        loading: loadingEmployees,
      },
      {
        id: 'audit_logs',
        title: 'Logs de Auditoria',
        value: recentAuditLogs.toLocaleString('pt-BR'),
        icon: Activity,
        bgColor: 'bg-orange-50',
        textColor: 'text-orange-600',
        loading: loadingAudit,
      },
    ],
    [
      activeCompanies,
      loadingAudit,
      loadingCompanies,
      loadingEmployees,
      periodLabel,
      recentAuditLogs,
      totalCompanies,
      totalEmployees,
    ]
  );

  const cardMap = useMemo(() => new Map(cards.map((card) => [card.id, card])), [cards]);

  useEffect(() => {
    if (viewsAvailable) {
      const list = Array.isArray(viewsData) ? (viewsData as DashboardView[]) : [];
      if (list.length === 0) return;
      const active = list.find((view) => view.name === 'Default') || list[0];
      setActiveViewId(active.id);
      if (active.config?.layout && active.config.layout.length > 0) {
        setLayout(active.config.layout);
      }
      return;
    }

    const savedLayoutRaw = localStorage.getItem(layoutStorageKey);
    if (!savedLayoutRaw) return;
    try {
      const savedLayout = JSON.parse(savedLayoutRaw) as DashboardLayoutItem[];
      if (Array.isArray(savedLayout) && savedLayout.length > 0) {
        setLayout(savedLayout);
      }
    } catch {
      localStorage.removeItem(layoutStorageKey);
    }
  }, [viewsAvailable, viewsData, layoutStorageKey]);

  useEffect(() => {
    if (!viewsAvailable || dashboardViews.isLoading || dashboardViews.isError) return;
    const list = Array.isArray(viewsData) ? (viewsData as DashboardView[]) : [];
    if (list.length > 0 || createView.isPending) return;
    createView.mutate(
      {
        entityType: 'dashboard',
        name: 'Default Dashboard',
        isDefault: true,
        config: { layout },
      },
      {
        onSuccess: (response) => {
          const created =
            (response as { data?: DashboardView }).data ||
            (response as unknown as DashboardView);
          if (created?.id) setActiveViewId(created.id);
        },
      }
    );
  }, [viewsAvailable, viewsData, createView, layout, dashboardViews.isLoading, dashboardViews.isError]);

  useEffect(() => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      if (viewsAvailable) {
        if (!activeViewId) return;
        updateView.mutate({ id: activeViewId, data: { config: { layout } } });
        return;
      }
      localStorage.setItem(layoutStorageKey, JSON.stringify(layout));
    }, 600);
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [layout, viewsAvailable, activeViewId, updateView, layoutStorageKey]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = layout.findIndex((item) => item.id === active.id);
    const newIndex = layout.findIndex((item) => item.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    setLayout((prev) => arrayMove(prev, oldIndex, newIndex));
  };

  const toggleSize = (id: string) => {
    setLayout((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, size: item.size === 'sm' ? 'lg' : 'sm' } : item
      )
    );
  };

  const handleGenerateReport = () => {
    const report = {
      generatedAt: new Date().toISOString(),
      filter,
      cards: cards.map((card) => ({
        id: card.id,
        title: card.title,
        value: card.value,
        subtitle: card.subtitle,
      })),
    };

    const jsonBlob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const jsonUrl = URL.createObjectURL(jsonBlob);
    const jsonLink = document.createElement('a');
    jsonLink.href = jsonUrl;
    jsonLink.download = 'dashboard-report.json';
    jsonLink.click();
    URL.revokeObjectURL(jsonUrl);

    const csvHeader = 'id,title,value,subtitle\n';
    const csvBody = report.cards
      .map((card) =>
        `${card.id},"${card.title}","${card.value}","${card.subtitle || ''}"`
      )
      .join('\n');
    const csvBlob = new Blob([csvHeader + csvBody], { type: 'text/csv;charset=utf-8;' });
    const csvUrl = URL.createObjectURL(csvBlob);
    const csvLink = document.createElement('a');
    csvLink.href = csvUrl;
    csvLink.download = 'dashboard-report.csv';
    csvLink.click();
    URL.revokeObjectURL(csvUrl);
  };

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-2 text-sm text-gray-600">
          Visão geral do sistema em tempo real • Atualizado em {format(new Date(), "dd/MM/yyyy 'às' HH:mm")}
        </p>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-600">Filtro</label>
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            {FILTER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={handleGenerateReport}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Gerar relatório
        </button>
      </div>

      {/* KPI Cards */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={layout.map((item) => item.id)} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4 mb-8">
            {layout.map((item) => {
              const card = cardMap.get(item.id);
              if (!card) return null;
              return (
                <SortableCard
                  key={item.id}
                  card={card}
                  size={item.size}
                  onToggleSize={() => toggleSize(item.id)}
                />
              );
            })}
          </div>
        </SortableContext>
      </DndContext>

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
