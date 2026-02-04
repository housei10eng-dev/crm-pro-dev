import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { ColumnDef, SortingState, ColumnFiltersState } from '@tanstack/react-table';
import { AdvancedTable } from '../components/table/AdvancedTable';
import { ColumnManager } from '../components/table/ColumnManager';
import { format } from 'date-fns';
import { TableConfig } from '../hooks/useTableConfig';
import {
  useCreateView,
  useDeleteView,
  useSetDefaultView,
  useUpdateView,
  useViews,
} from '../hooks/useViews';
import { ViewsSelector } from '../components/views/ViewsSelector';

interface DREEntry {
  id: string;
  period: string;
  category: string;
  amount: number;
  type: 'revenue' | 'expense';
  description: string;
  date: string;
}

interface TableView {
  id: string;
  name?: string;
  config?: Partial<TableConfig>;
  isDefault?: boolean;
  createdAt?: string;
}

export default function DREPage() {
  const {
    data: viewsData,
    isLoading: viewsLoading,
    isError: viewsError,
  } = useViews('dre');
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

  // Define columns
  const columns: ColumnDef<DREEntry>[] = useMemo(
    () => [
      {
        accessorKey: 'period',
        header: columnLabels.period || 'Período',
        meta: { isCustom: false, label: columnLabels.period || 'Período' },
        enableSorting: true,
      },
      {
        accessorKey: 'category',
        header: columnLabels.category || 'Categoria',
        meta: { isCustom: false, label: columnLabels.category || 'Categoria' },
        enableSorting: true,
      },
      {
        accessorKey: 'type',
        header: columnLabels.type || 'Tipo',
        cell: ({ getValue }) => {
          const type = getValue() as string;
          return (
            <span
              className={`rounded-full px-2 py-1 text-xs font-semibold ${
                type === 'revenue'
                  ? 'bg-green-100 text-green-800'
                  : 'bg-red-100 text-red-800'
              }`}
            >
              {type === 'revenue' ? 'Receita' : 'Despesa'}
            </span>
          );
        },
        meta: { isCustom: false, label: columnLabels.type || 'Tipo' },
        enableSorting: true,
      },
      {
        accessorKey: 'amount',
        header: columnLabels.amount || 'Valor',
        cell: ({ getValue }) => {
          const amount = getValue() as number;
          return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL',
          }).format(amount);
        },
        meta: { isCustom: false, label: columnLabels.amount || 'Valor' },
        enableSorting: true,
      },
      {
        accessorKey: 'description',
        header: columnLabels.description || 'Descrição',
        meta: { isCustom: false, label: columnLabels.description || 'Descrição' },
        enableSorting: true,
      },
      {
        accessorKey: 'date',
        header: columnLabels.date || 'Data',
        cell: ({ getValue }) => {
          const date = getValue() as string;
          return format(new Date(date), 'dd/MM/yyyy');
        },
        meta: { isCustom: false, label: columnLabels.date || 'Data' },
        enableSorting: true,
      },
    ],
    [columnLabels]
  );
  const defaultOrder = useMemo(
    () =>
      columns.map((col) => {
        const colId = col.id || (col as { accessorKey?: string }).accessorKey;
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
        const colId = col.id || (col as { accessorKey?: string }).accessorKey;
        return [colId as string, col];
      })
    );
    return order.map((id) => columnMap.get(id)).filter(Boolean) as ColumnDef<DREEntry>[];
  }, [columns, columnOrder, normalizeOrder]);

  const columnList = useMemo(() => {
    const order = normalizeOrder(columnOrder);
    return order
      .map((id) => {
        const col = columns.find((c) => (c.id || (c as { accessorKey?: string }).accessorKey) === id);
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
        entityType: 'dre',
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
              entityType: 'dre',
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
      { entityType: 'dre', name, config: buildConfig() },
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

  const tableData: DREEntry[] = [];


  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">DRE - Demonstração do Resultado do Exercício</h1>
          <p className="mt-2 text-sm text-gray-600">
            Visualize receitas, despesas e lucro de suas operações
          </p>
        </div>
        <button
          disabled
          title="Endpoint ainda não disponível"
          className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white opacity-50"
        >
          Novo lançamento
        </button>
      </div>

      <div className="rounded-lg bg-white p-6 shadow">
        <AdvancedTable
          data={tableData}
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
          addColumnTooltip="Custom fields não disponíveis para DRE"
          emptyStateLabel="Endpoint ainda não disponível"
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
              />
            </div>
          }
        />
      </div>
    </div>
  );
}
