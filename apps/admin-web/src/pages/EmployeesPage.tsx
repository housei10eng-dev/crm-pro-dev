import { useState, useMemo } from 'react';
import { ColumnDef, SortingState, ColumnFiltersState } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { useEmployees } from '../hooks/useEmployees';
import { useCustomFields } from '../hooks/useCustomFields';
import { AdvancedTable } from '../components/table/AdvancedTable';
import { ColumnManager } from '../components/table/ColumnManager';
import { CustomFieldModal } from '../components/custom-fields/CustomFieldModal';
import { format } from 'date-fns';
import { TableConfig } from '../hooks/useTableConfig';

interface Employee {
  id: string;
  name: string;
  email: string;
  roles: Array<{ role: string }>;
  status: string;
  createdAt: string;
  customFields?: Record<string, string | number | boolean>;
}

export default function EmployeesPage() {
  const { data: employees, isLoading } = useEmployees();
  const { data: customFields } = useCustomFields('employee');

  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [showFieldModal, setShowFieldModal] = useState(false);
  const [hiddenColumns, setHiddenColumns] = useState<string[]>([]);

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

  // Column visibility management
  const visibleColumns = useMemo(
    () => columns.filter((col) => {
      const colId = col.id || (col as { accessorKey?: string }).accessorKey;
      return !hiddenColumns.includes(colId as string);
    }),
    [columns, hiddenColumns]
  );

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

  const toggleColumn = (columnId: string) => {
    setHiddenColumns((prev) =>
      prev.includes(columnId) ? prev.filter((id) => id !== columnId) : [...prev, columnId]
    );
  };

  const handleColumnOrderChange = (newOrder: string[]) => {
    // TODO: Persist to backend via Views API
    // await viewsApi.updateColumnOrder('employee', newOrder);
  };

  const handleLoadView = (config: Partial<TableConfig>) => {
    if (config.hiddenColumns) setHiddenColumns(config.hiddenColumns);
    if (config.sorting) setSorting(config.sorting);
    if (config.filters) setColumnFilters(config.filters);
    if (config.globalSearch) setGlobalFilter(config.globalSearch);
  };

  const currentConfig = {
    columnsOrder: columns.map((col) => {
      const colId = col.id || (col as { accessorKey?: string }).accessorKey;
      return colId as string;
    }),
    hiddenColumns,
    filters: columnFilters,
    sorting,
    globalSearch: globalFilter,
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
          columns={visibleColumns}
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
              <ColumnManager columns={columnList} onToggleColumn={toggleColumn} />
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
