import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { ColumnDef, SortingState, ColumnFiltersState } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { useEmployees } from '../hooks/useEmployees';
import { useCustomFields } from '../hooks/useCustomFields';
import { AdvancedTable } from '../components/table/AdvancedTable';
import { ColumnManager } from '../components/table/ColumnManager';
import { CustomFieldModal } from '../components/custom-fields/CustomFieldModal';
import { format } from 'date-fns';
import { TableConfig } from '../hooks/useTableConfig';
import { useCreateView, useUpdateView, useViews } from '../hooks/useViews';

interface Employee {
  id: string;
  name: string;
  email: string;
  roles: Array<{ role: string }>;
  status: string;
  createdAt: string;
  customFields?: Record<string, string | number | boolean>;
}

interface TableView {
  id: string;
  config?: Partial<TableConfig>;
  isDefault?: boolean;
  createdAt?: string;
}

export default function EmployeesPage() {
  const { data: employees, isLoading } = useEmployees();
  const { data: customFields } = useCustomFields('employee');
  const { data: viewsData } = useViews('employee');
  const updateView = useUpdateView();
  const createView = useCreateView();

  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [showFieldModal, setShowFieldModal] = useState(false);
  const [hiddenColumns, setHiddenColumns] = useState<string[]>([]);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const hasAppliedViewRef = useRef(false);
  const applyingViewRef = useRef(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Base columns
  const baseColumns: ColumnDef<Employee>[] = useMemo(
    () => [
      {
        accessorKey: 'name',
        header: 'Nome',
        enableSorting: true,
      },
      {
        accessorKey: 'email',
        header: 'Email',
        enableSorting: true,
      },
      {
        accessorKey: 'roles',
        header: 'Roles',
        cell: ({ getValue }) => {
          const roles = getValue() as Array<{ role: string }>;
          return roles.map(r => r.role).join(', ');
        },
        enableSorting: false,
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ getValue }) => {
          const status = getValue() as string;
          return (
            <span
              className={`rounded-full px-2 py-1 text-xs font-semibold ${
                status === 'ACTIVE'
                  ? 'bg-green-100 text-green-800'
                  : 'bg-red-100 text-red-800'
              }`}
            >
              {status}
            </span>
          );
        },
        enableSorting: true,
      },
      {
        accessorKey: 'createdAt',
        header: 'Criado em',
        cell: ({ getValue }) => {
          const date = getValue() as string;
          return format(new Date(date), 'dd/MM/yyyy');
        },
        enableSorting: true,
      },
    ],
    []
  );

  // Dynamic custom field columns
  const customFieldColumns: ColumnDef<Employee>[] = useMemo(() => {
    if (!customFields?.fields) return [];
    
    return customFields.fields.map((field: { key: string; label: string }) => ({
      id: `custom_${field.key}`,
      accessorFn: (row: Employee) => row.customFields?.[field.key] || '-',
      header: field.label,
      enableSorting: true,
    }));
  }, [customFields]);

  // All columns combined
  const columns = useMemo(
    () => [...baseColumns, ...customFieldColumns],
    [baseColumns, customFieldColumns]
  );

  const nonHideableColumnIds = useMemo(() => ['name'], []);

  const columnList = useMemo(
    () =>
      columns.map((col) => {
        const colId = col.id || (col as { accessorKey?: string }).accessorKey;
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
          const colId = col.id || (col as { accessorKey?: string }).accessorKey;
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
        entityType: 'employee',
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

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Colaboradores</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setShowFieldModal(true)}
            className="flex items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Plus className="h-4 w-4" />
            Campo Personalizado
          </button>
          <button className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
            <Plus className="h-4 w-4" />
            Novo Colaborador
          </button>
        </div>
      </div>

      <div className="rounded-lg bg-white p-6 shadow">
        <AdvancedTable
          data={employees || []}
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

      <CustomFieldModal
        entityType="employee"
        isOpen={showFieldModal}
        onClose={() => setShowFieldModal(false)}
      />
    </div>
  );
}
