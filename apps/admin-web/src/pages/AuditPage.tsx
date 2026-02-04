import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { ColumnDef, SortingState, ColumnFiltersState } from '@tanstack/react-table';
import { useAudit } from '../hooks/useAudit';
import { AdvancedTable } from '../components/table/AdvancedTable';
import { ColumnManager } from '../components/table/ColumnManager';
import { ViewsSelector } from '../components/views/ViewsSelector';
import { format } from 'date-fns';
import { TableConfig } from '../hooks/useTableConfig';
import {
  useCreateView,
  useDeleteView,
  useSetDefaultView,
  useUpdateView,
  useViews,
} from '../hooks/useViews';

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
  name?: string;
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
  const {
    data: viewsData,
    isLoading: viewsLoading,
    isError: viewsError,
  } = useViews('audit');
  const updateView = useUpdateView();
  const createView = useCreateView();
  const deleteView = useDeleteView();
  const setDefaultView = useSetDefaultView();

  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [hiddenColumns, setHiddenColumns] = useState<string[]>([]);
  const [columnOrder, setColumnOrder] = useState<string[]>([]);
  const [columnLabels, setColumnLabels] = useState<Record<string, string>>({});
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const hasAppliedViewRef = useRef(false);
  const applyingViewRef = useRef(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoCreatedViewRef = useRef(false);

  const columns: ColumnDef<AuditLog>[] = useMemo(
    () => [
      {
        accessorKey: 'createdAt',
        header: columnLabels.createdAt || 'Data/Hora',
        cell: ({ getValue }) => {
          const date = getValue() as string | null | undefined;
          return safeFormatDate(date);
        },
        meta: { isCustom: false, label: columnLabels.createdAt || 'Data/Hora' },
        enableSorting: true,
      },
      {
        accessorKey: 'entityType',
        header: columnLabels.entityType || 'Entidade',
        meta: { isCustom: false, label: columnLabels.entityType || 'Entidade' },
        enableSorting: true,
      },
      {
        accessorKey: 'entityId',
        header: columnLabels.entityId || 'ID da Entidade',
        cell: ({ getValue }) => {
          const id = getValue() as string | null | undefined;
          if (!id) return <span className="text-gray-400">-</span>;
          return <span className="font-mono text-xs">{id.slice(0, 8)}...</span>;
        },
        meta: { isCustom: false, label: columnLabels.entityId || 'ID da Entidade' },
        enableSorting: false,
      },
      {
        accessorKey: 'action',
        header: columnLabels.action || 'Ação',
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
        meta: { isCustom: false, label: columnLabels.action || 'Ação' },
        enableSorting: true,
      },
      {
        accessorKey: 'field',
        header: columnLabels.field || 'Campo',
        meta: { isCustom: false, label: columnLabels.field || 'Campo' },
        enableSorting: true,
      },
      {
        accessorKey: 'oldValue',
        header: columnLabels.oldValue || 'Valor Anterior',
        cell: ({ getValue }) => {
          const value = getValue();
          const rendered = safeRenderValue(value);
          return rendered !== '-' ? (
            <span className="text-gray-600">{rendered}</span>
          ) : (
            <span className="text-gray-400">-</span>
          );
        },
        meta: { isCustom: false, label: columnLabels.oldValue || 'Valor Anterior' },
        enableSorting: false,
      },
      {
        accessorKey: 'newValue',
        header: columnLabels.newValue || 'Novo Valor',
        cell: ({ getValue }) => {
          const value = getValue();
          const rendered = safeRenderValue(value);
          return rendered !== '-' ? (
            <span className="text-gray-900 font-medium">{rendered}</span>
          ) : (
            <span className="text-gray-400">-</span>
          );
        },
        meta: { isCustom: false, label: columnLabels.newValue || 'Novo Valor' },
        enableSorting: false,
      },
      {
        accessorKey: 'actorRole',
        header: columnLabels.actorRole || 'Ator',
        meta: { isCustom: false, label: columnLabels.actorRole || 'Ator' },
        enableSorting: true,
      },
    ],
    [columnLabels]
  );

  const nonHideableColumnIds = useMemo(() => ['createdAt'], []);

  const defaultOrder = useMemo(
    () =>
      columns.map((col) => {
        const colId = (col as { accessorKey?: string }).accessorKey;
        return colId as string;
      }),
    [columns]
  );

  const normalizeOrder = useCallback(
    (order?: string[]) => {
      if (!order || order.length === 0) return defaultOrder;
      const valid = order.filter((id) => defaultOrder.includes(id));
      const missing = defaultOrder.filter((id) => !valid.includes(id));
      return [...valid, ...missing];
    },
    [defaultOrder]
  );

  const orderedColumns = useMemo(() => {
    const order = normalizeOrder(columnOrder);
    const columnMap = new Map(
      columns.map((col) => {
        const colId = (col as { accessorKey?: string }).accessorKey;
        return [colId as string, col];
      })
    );
    return order.map((id) => columnMap.get(id)).filter(Boolean) as ColumnDef<AuditLog>[];
  }, [columns, columnOrder, normalizeOrder]);

  const columnList = useMemo(() => {
    const order = normalizeOrder(columnOrder);
    return order
      .map((id) => {
        const col = columns.find((c) => (c as { accessorKey?: string }).accessorKey === id);
        if (!col) return null;
        const colHeader = (col as { header?: string }).header;
        return {
          id,
          label: colHeader as string,
          visible: !hiddenColumns.includes(id),
        };
      })
      .filter(Boolean) as { id: string; label: string; visible: boolean }[];
  }, [columns, columnOrder, hiddenColumns, normalizeOrder]);

  const buildConfig = useCallback(
    (columnsOrder?: string[]): TableConfig => ({
      columnsOrder: normalizeOrder(columnsOrder || columnOrder),
      hiddenColumns,
      columnLabels,
      filters: columnFilters,
      sorting,
      globalSearch: globalFilter,
    }),
    [
      normalizeOrder,
      columnOrder,
      hiddenColumns,
      columnLabels,
      columnFilters,
      sorting,
      globalFilter,
    ]
  );

  const applyConfig = useCallback((config: Partial<TableConfig>) => {
    applyingViewRef.current = true;
    if (config.hiddenColumns) setHiddenColumns(config.hiddenColumns);
    if (config.columnsOrder) setColumnOrder(normalizeOrder(config.columnsOrder));
    if (config.columnLabels) setColumnLabels(config.columnLabels);
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
  }, [normalizeOrder]);

  useEffect(() => {
    setColumnOrder((prev) => normalizeOrder(prev));
  }, [normalizeOrder]);

  useEffect(() => {
    const views = Array.isArray(viewsData) ? (viewsData as TableView[]) : [];
    if (views.length === 0) return;
    const current = activeViewId ? views.find((view) => view.id === activeViewId) : undefined;
    const fallback = views.find((view) => view.name === 'Default') || views[views.length - 1];
    const nextView = current || fallback;
    if (!current && fallback) {
      setActiveViewId(fallback.id);
    }
    autoCreatedViewRef.current = false;
    if (!hasAppliedViewRef.current && nextView?.config) {
      applyConfig(nextView.config);
      hasAppliedViewRef.current = true;
    }
  }, [viewsData, activeViewId, applyConfig]);

  useEffect(() => {
    if (viewsLoading || viewsError) return;
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
  }, [viewsData, viewsLoading, viewsError, buildConfig, createView]);

  const persistConfig = useCallback(
    (override?: Partial<TableConfig>) => {
      if (!activeViewId || applyingViewRef.current) return;
      const views = Array.isArray(viewsData) ? (viewsData as TableView[]) : [];
      const activeView = views.find((view) => view.id === activeViewId);
      if (activeView?.name === 'Default') {
        const existing = views.find((view) => view.name === 'Minha view');
        if (existing?.id) {
          setActiveViewId(existing.id);
          updateView.mutate({
            id: existing.id,
            data: { config: { ...buildConfig(), ...override } },
          });
          return;
        }
        if (!autoCreatedViewRef.current) {
          autoCreatedViewRef.current = true;
          createView.mutate(
            {
              entityType: 'audit',
              name: 'Minha view',
              config: { ...buildConfig(), ...override },
            },
            {
              onSuccess: (response) => {
                const created =
                  (response as { data?: TableView }).data ||
                  (response as unknown as TableView);
                if (created?.id) setActiveViewId(created.id);
              },
              onError: () => {
                autoCreatedViewRef.current = true;
              },
            }
          );
        }
        return;
      }
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        updateView.mutate({
          id: activeViewId,
          data: { config: { ...buildConfig(), ...override } },
        });
      }, 500);
    },
    [activeViewId, viewsData, createView, updateView, buildConfig]
  );

  useEffect(() => {
    persistConfig();
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [hiddenColumns, sorting, columnFilters, globalFilter, columnOrder, columnLabels, persistConfig]);

  const toggleColumn = (columnId: string) => {
    if (nonHideableColumnIds.includes(columnId)) return;
    setHiddenColumns((prev) =>
      prev.includes(columnId) ? prev.filter((id) => id !== columnId) : [...prev, columnId]
    );
  };

  const handleColumnOrderChange = (newOrder: string[]) => {
    setColumnOrder(newOrder);
    persistConfig({ columnsOrder: newOrder });
  };

  const handleRenameColumn = (columnId: string, newLabel: string) => {
    const nextLabels = { ...columnLabels, [columnId]: newLabel };
    setColumnLabels(nextLabels);
    persistConfig({ columnLabels: nextLabels });
  };

  const views = useMemo(() => {
    const list = Array.isArray(viewsData) ? (viewsData as TableView[]) : [];
    return list.map((view) => ({
      id: view.id,
      name: (view as { name?: string }).name || 'View',
      isDefault: view.name === 'Default',
    }));
  }, [viewsData]);

  const handleSelectView = (viewId: string) => {
    const list = Array.isArray(viewsData) ? (viewsData as TableView[]) : [];
    const selected = list.find((view) => view.id === viewId);
    if (!selected) return;
    setActiveViewId(selected.id);
    autoCreatedViewRef.current = false;
    if (selected.config) applyConfig(selected.config);
  };

  const handleSaveAs = (name: string) => {
    createView.mutate(
      { entityType: 'audit', name, config: buildConfig() },
      {
        onSuccess: (response) => {
          const created =
            (response as { data?: TableView }).data ||
            (response as unknown as TableView);
          if (created?.id) setActiveViewId(created.id);
        },
      }
    );
  };

  const handleRename = (viewId: string, name: string) => {
    updateView.mutate({ id: viewId, data: { name } });
  };

  const handleSetDefault = (viewId: string) => {
    setDefaultView.mutate({ viewId });
  };

  const handleDelete = (viewId: string) => {
    deleteView.mutate(viewId, {
      onSuccess: () => {
        if (activeViewId === viewId) {
          const list = Array.isArray(viewsData) ? (viewsData as TableView[]) : [];
          const remaining = list.filter((view) => view.id !== viewId);
          const next = remaining.find((view) => view.name === 'Default') || remaining[0];
          setActiveViewId(next?.id || null);
          if (next?.config) applyConfig(next.config);
        }
      },
    });
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
            columns={orderedColumns}
            hiddenColumns={hiddenColumns}
            columnOrder={columnOrder}
            sorting={sorting}
            onSortingChange={setSorting}
            columnFilters={columnFilters}
            onColumnFiltersChange={setColumnFilters}
            globalFilter={globalFilter}
            onGlobalFilterChange={setGlobalFilter}
            onColumnOrderChange={handleColumnOrderChange}
            onToggleColumn={toggleColumn}
            onRenameColumn={handleRenameColumn}
            onAddColumn={() => {}}
            addColumnLabel="Criar coluna"
            addColumnDisabled
            addColumnTooltip="Custom fields não disponíveis para auditoria"
            loading={isLoading}
            toolbar={
              <div className="flex gap-2">
                <ViewsSelector
                  views={views}
                  activeViewId={activeViewId}
                  onSelectView={handleSelectView}
                  onSaveAs={handleSaveAs}
                  onRename={handleRename}
                  onSetDefault={handleSetDefault}
                  onDelete={handleDelete}
                />
                <ColumnManager
                  columns={columnList}
                  onToggleColumn={toggleColumn}
                  onReorder={handleColumnOrderChange}
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
