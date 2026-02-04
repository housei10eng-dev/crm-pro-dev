import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { ColumnDef, SortingState, ColumnFiltersState } from '@tanstack/react-table';
import { useAudit } from '../hooks/useAudit';
import { AdvancedTable } from '../components/table/AdvancedTable';
import { ColumnManager } from '../components/table/ColumnManager';
import { format } from 'date-fns';
import { TableConfig } from '../hooks/useTableConfig';
import { useCreateView, useUpdateView, useViews } from '../hooks/useViews';

interface AuditLog {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  actorRole: string;
  createdAt: string;
}

interface TableView {
  id: string;
  config?: Partial<TableConfig>;
  isDefault?: boolean;
  createdAt?: string;
}

function safeFormatDate(value: string | null | undefined) {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return format(parsed, 'dd/MM/yyyy HH:mm:ss');
}

function safeRenderValue(value: unknown) {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (typeof value === 'object') {
    const maybeName = (value as { name?: string }).name;
    if (maybeName) return maybeName;
    try {
      return JSON.stringify(value);
    } catch {
      return '[obj]';
    }
  }
  return String(value);
}

export default function AuditPage() {
  const { data: auditData, isLoading } = useAudit();
  const { data: viewsData } = useViews('audit');
  const updateView = useUpdateView();
  const createView = useCreateView();

  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [hiddenColumns, setHiddenColumns] = useState<string[]>([]);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const hasAppliedViewRef = useRef(false);
  const applyingViewRef = useRef(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const columns: ColumnDef<AuditLog>[] = useMemo(
    () => [
      {
        accessorKey: 'createdAt',
        header: 'Data/Hora',
        cell: ({ getValue }) => {
          const date = getValue() as string | null | undefined;
          return safeFormatDate(date);
        },
        enableSorting: true,
      },
      {
        accessorKey: 'entityType',
        header: 'Entidade',
        enableSorting: true,
      },
      {
        accessorKey: 'entityId',
        header: 'ID da Entidade',
        cell: ({ getValue }) => {
          const id = getValue() as string | null | undefined;
          if (!id) return <span className="text-gray-400">-</span>;
          return <span className="font-mono text-xs">{id.slice(0, 8)}...</span>;
        },
        enableSorting: false,
      },
      {
        accessorKey: 'action',
        header: 'Ação',
        cell: ({ getValue }) => {
          const action = (getValue() as string | null | undefined) || 'UNKNOWN';
          const colors = {
            CREATE: 'bg-green-100 text-green-800',
            UPDATE: 'bg-blue-100 text-blue-800',
            DELETE: 'bg-red-100 text-red-800',
          };
          return (
            <span className={`rounded-full px-2 py-1 text-xs font-semibold ${colors[action as keyof typeof colors] || 'bg-gray-100 text-gray-800'}`}>
              {action}
            </span>
          );
        },
        enableSorting: true,
      },
      {
        accessorKey: 'field',
        header: 'Campo',
        enableSorting: true,
      },
      {
        accessorKey: 'oldValue',
        header: 'Valor Anterior',
        cell: ({ getValue }) => {
          const value = getValue();
          const rendered = safeRenderValue(value);
          return rendered !== '-' ? (
            <span className="text-gray-600">{rendered}</span>
          ) : (
            <span className="text-gray-400">-</span>
          );
        },
        enableSorting: false,
      },
      {
        accessorKey: 'newValue',
        header: 'Novo Valor',
        cell: ({ getValue }) => {
          const value = getValue();
          const rendered = safeRenderValue(value);
          return rendered !== '-' ? (
            <span className="text-gray-900 font-medium">{rendered}</span>
          ) : (
            <span className="text-gray-400">-</span>
          );
        },
        enableSorting: false,
      },
      {
        accessorKey: 'actorRole',
        header: 'Ator',
        enableSorting: true,
      },
    ],
    []
  );

  const nonHideableColumnIds = useMemo(() => ['createdAt'], []);

  const columnList = useMemo(
    () =>
      columns.map((col) => {
        const colId = (col as { accessorKey?: string }).accessorKey;
        const colHeader = (col as { header?: string }).header;
        return {
          id: colId as string,
          label: colHeader as string,
          visible: !hiddenColumns.includes(colId as string),
        };
      }),
    [columns, hiddenColumns]
  );

  const buildConfig = useCallback(
    (columnsOrder?: string[]): TableConfig => ({
      columnsOrder:
        columnsOrder ||
        columns.map((col) => {
          const colId = (col as { accessorKey?: string }).accessorKey;
          return colId as string;
        }),
      hiddenColumns,
      filters: columnFilters,
      sorting,
      globalSearch: globalFilter,
    }),
    [columns, hiddenColumns, columnFilters, sorting, globalFilter]
  );

  const applyConfig = useCallback((config: Partial<TableConfig>) => {
    applyingViewRef.current = true;
    if (config.hiddenColumns) setHiddenColumns(config.hiddenColumns);
    if (config.sorting) {
      setSorting(Array.isArray(config.sorting) ? config.sorting : []);
    }
    if (config.filters) {
      setColumnFilters(Array.isArray(config.filters) ? config.filters : []);
    }
    if (config.globalSearch !== undefined) setGlobalFilter(config.globalSearch);
    setTimeout(() => {
      applyingViewRef.current = false;
    }, 0);
  }, []);

  useEffect(() => {
    const views = Array.isArray(viewsData) ? (viewsData as TableView[]) : [];
    if (views.length === 0) return;
    const active = views.find((view) => view.isDefault) || views[views.length - 1];
    setActiveViewId(active.id);
    if (!hasAppliedViewRef.current && active.config) {
      applyConfig(active.config);
      hasAppliedViewRef.current = true;
    }
  }, [viewsData, applyConfig]);

  useEffect(() => {
    const views = Array.isArray(viewsData) ? (viewsData as TableView[]) : [];
    if (views.length > 0 || createView.isPending) return;
    createView.mutate(
      {
        entityType: 'audit',
        name: 'Default',
        config: buildConfig(),
        isDefault: true,
      },
      {
        onSuccess: (response) => {
          const created =
            (response as { data?: TableView }).data ||
            (response as unknown as TableView);
          if (created?.id) setActiveViewId(created.id);
        },
      }
    );
  }, [viewsData, buildConfig, createView]);

  const persistConfig = useCallback(
    (override?: Partial<TableConfig>) => {
      if (!activeViewId || applyingViewRef.current) return;
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        updateView.mutate({
          id: activeViewId,
          data: { config: { ...buildConfig(), ...override } },
        });
      }, 500);
    },
    [activeViewId, updateView, buildConfig]
  );

  useEffect(() => {
    persistConfig();
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [hiddenColumns, persistConfig]);

  const toggleColumn = (columnId: string) => {
    if (nonHideableColumnIds.includes(columnId)) return;
    setHiddenColumns((prev) =>
      prev.includes(columnId) ? prev.filter((id) => id !== columnId) : [...prev, columnId]
    );
  };

  const handleColumnOrderChange = (newOrder: string[]) => {
    persistConfig({ columnsOrder: newOrder });
  };

  try {
    return (
      <div className="p-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Logs de Auditoria</h1>
          <p className="mt-2 text-sm text-gray-600">
            Visualize todas as alterações realizadas no sistema com WORM (Write Once Read Many).
          </p>
        </div>

        <div className="rounded-lg bg-white p-6 shadow">
          <AdvancedTable
            data={Array.isArray(auditData?.data) ? auditData?.data : []}
            columns={columns}
            hiddenColumns={hiddenColumns}
            sorting={sorting}
            onSortingChange={setSorting}
            columnFilters={columnFilters}
            onColumnFiltersChange={setColumnFilters}
            globalFilter={globalFilter}
            onGlobalFilterChange={setGlobalFilter}
            onColumnOrderChange={handleColumnOrderChange}
            loading={isLoading}
            toolbar={
              <div className="flex gap-2">
                <ColumnManager
                  columns={columnList}
                  onToggleColumn={toggleColumn}
                  nonHideableColumnIds={nonHideableColumnIds}
                />
              </div>
            }
          />
        </div>
      </div>
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro desconhecido';
    return (
      <div className="p-8">
        <div className="rounded-lg bg-white p-6 shadow">
          <h1 className="text-2xl font-bold text-red-600">Erro ao carregar auditoria</h1>
          <p className="mt-2 text-sm text-gray-700">{message}</p>
        </div>
      </div>
    );
  }
}
