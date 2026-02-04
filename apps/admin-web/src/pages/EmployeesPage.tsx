import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { ColumnDef, SortingState, ColumnFiltersState, CellContext } from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import { useCreateEmployee, useEmployees, useSaveEmployeeCustomFields } from '../hooks/useEmployees';
import {
  useCustomFields,
  useDeleteCustomField,
  useUpdateCustomField,
} from '../hooks/useCustomFields';
import { AdvancedTable } from '../components/table/AdvancedTable';
import { ColumnManager } from '../components/table/ColumnManager';
import { CustomFieldModal } from '../components/custom-fields/CustomFieldModal';
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

interface Employee {
  id: string;
  name: string;
  email: string;
  roles: Array<{ role: string }>;
  status: string;
  createdAt: string;
  customFields?: Record<string, string | number | boolean>;
  __isNew?: boolean;
}

interface TableView {
  id: string;
  name?: string;
  config?: Partial<TableConfig>;
  isDefault?: boolean;
  createdAt?: string;
}

export default function EmployeesPage() {
  const { data: employees, isLoading } = useEmployees();
  const createEmployee = useCreateEmployee();
  const saveCustomFields = useSaveEmployeeCustomFields();
  const { data: customFields } = useCustomFields('employee');
  const updateCustomField = useUpdateCustomField();
  const deleteCustomField = useDeleteCustomField();
  const {
    data: viewsData,
    isLoading: viewsLoading,
    isError: viewsError,
  } = useViews('employee');
  const updateView = useUpdateView();
  const createView = useCreateView();
  const deleteView = useDeleteView();
  const setDefaultView = useSetDefaultView();

  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [showFieldModal, setShowFieldModal] = useState(false);
  const [hiddenColumns, setHiddenColumns] = useState<string[]>([]);
  const [columnOrder, setColumnOrder] = useState<string[]>([]);
  const [columnLabels, setColumnLabels] = useState<Record<string, string>>({});
  const [isCreating, setIsCreating] = useState(false);
  const [newRow, setNewRow] = useState<Partial<Employee>>({});
  const [newCustomFields, setNewCustomFields] = useState<Record<string, unknown>>({});
  const [newRowId, setNewRowId] = useState<string | null>(null);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [deletedViewIds, setDeletedViewIds] = useState<Set<string>>(new Set());
  const tableContainerRef = useRef<HTMLDivElement | null>(null);
  const hasAppliedViewRef = useRef(false);
  const applyingViewRef = useRef(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoCreatedViewRef = useRef(false);
  const skipAutoCreateRef = useRef(false);
  const suppressAutoCreateRef = useRef(false);
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  const handleCancelNewRow = useCallback(() => {
    setIsCreating(false);
    setNewRow({});
    setNewCustomFields({});
    setNewRowId(null);
    setEditingRowId(null);
  }, []);

  const handleSaveNewRow = useCallback(() => {
    if (!newRow.name) {
      alert('Nome é obrigatório');
      return;
    }
    if (!newRow.email) {
      alert('Email é obrigatório');
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(String(newRow.email))) {
      alert('Email inválido');
      return;
    }

    const rolesValue = (newRow.roles as unknown as string[]) || [];
    const payload = {
      name: newRow.name,
      email: newRow.email,
      status: newRow.status || 'ACTIVE',
      roles: rolesValue.length > 0 ? rolesValue.map((role) => ({ role })) : undefined,
    };

    createEmployee.mutate(payload, {
      onSuccess: (response) => {
        const created =
          (response as { data?: { id?: string } }).data ||
          (response as { id?: string });
        if (created?.id && Object.keys(newCustomFields).length > 0) {
          saveCustomFields.mutate({
            id: created.id,
            values: Object.entries(newCustomFields).map(([key, value]) => ({
              key,
              value,
            })),
          });
        }
        handleCancelNewRow();
      },
    });
  }, [createEmployee, handleCancelNewRow, newCustomFields, newRow, saveCustomFields]);

  const roleOptions = useMemo(() => {
    const list = Array.isArray(employees)
      ? Array.from(
          new Set(
            employees
              .flatMap((employee: Employee) => employee.roles || [])
              .map((role) => role.role)
              .filter((value) => value && value.trim())
          )
        )
      : [];
    return list.length > 0 ? list : ['ADMIN', 'MANAGER', 'USER'];
  }, [employees]);

  // Base columns
  const baseColumns: ColumnDef<Employee>[] = useMemo(
    () => [
      {
        accessorKey: 'name',
        header: columnLabels.name || 'Nome',
        cell: ({ row, getValue }) => {
          const isEditing = row.original.id === editingRowId;
          if (isEditing) {
            return (
              <input
                ref={nameInputRef}
                value={(newRow.name as string) || ''}
                onChange={(event) => setNewRow((prev) => ({ ...prev, name: event.target.value }))}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') handleSaveNewRow();
                  if (event.key === 'Escape') handleCancelNewRow();
                }}
                className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                placeholder="Nome"
              />
            );
          }
          return String(getValue() ?? '');
        },
        meta: { isCustom: false, label: columnLabels.name || 'Nome' },
        enableSorting: true,
      },
      {
        accessorKey: 'email',
        header: columnLabels.email || 'Email',
        cell: ({ row, getValue }) => {
          const isEditing = row.original.id === editingRowId;
          if (isEditing) {
            return (
              <input
                value={(newRow.email as string) || ''}
                onChange={(event) => setNewRow((prev) => ({ ...prev, email: event.target.value }))}
                type="email"
                onKeyDown={(event) => {
                  if (event.key === 'Enter') handleSaveNewRow();
                  if (event.key === 'Escape') handleCancelNewRow();
                }}
                className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                placeholder="Email"
              />
            );
          }
          return String(getValue() ?? '');
        },
        meta: { isCustom: false, label: columnLabels.email || 'Email' },
        enableSorting: true,
      },
      {
        accessorKey: 'roles',
        header: columnLabels.roles || 'Roles',
        cell: ({ row, getValue }) => {
          const isEditing = row.original.id === editingRowId;
          if (isEditing) {
            return (
              <select
                multiple
                value={(newRow.roles as unknown as string[]) || []}
                onChange={(event) => {
                  const selected = Array.from(event.target.selectedOptions).map((option) => option.value);
                  setNewRow((prev) => ({ ...prev, roles: selected as unknown as Array<{ role: string }> }));
                }}
                className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
              >
                {roleOptions.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            );
          }
          const roles = getValue() as Array<{ role: string }>;
          return roles.map(r => r.role).join(', ');
        },
        meta: { isCustom: false, label: columnLabels.roles || 'Roles' },
        enableSorting: false,
      },
      {
        accessorKey: 'status',
        header: columnLabels.status || 'Status',
        cell: ({ row, getValue }) => {
          const isEditing = row.original.id === editingRowId;
          if (isEditing) {
            return (
              <select
                value={(newRow.status as string) || 'ACTIVE'}
                onChange={(event) => setNewRow((prev) => ({ ...prev, status: event.target.value }))}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') handleSaveNewRow();
                  if (event.key === 'Escape') handleCancelNewRow();
                }}
                className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
              >
                <option value="ACTIVE">Ativo</option>
                <option value="INACTIVE">Inativo</option>
              </select>
            );
          }
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
        meta: { isCustom: false, label: columnLabels.status || 'Status' },
        enableSorting: true,
      },
      {
        accessorKey: 'createdAt',
        header: columnLabels.createdAt || 'Criado em',
        cell: ({ row, getValue }) => {
          if (row.original.id === editingRowId) return <span className="text-gray-400">-</span>;
          const date = getValue() as string;
          return format(new Date(date), 'dd/MM/yyyy');
        },
        meta: { isCustom: false, label: columnLabels.createdAt || 'Criado em' },
        enableSorting: true,
      },
    ],
    [
      columnLabels,
      createEmployee,
      editingRowId,
      handleCancelNewRow,
      handleSaveNewRow,
      newCustomFields,
      newRow,
      roleOptions,
      saveCustomFields,
    ]
  );

  const actionColumn: ColumnDef<Employee> = useMemo(
    () => ({
      id: 'actions',
      header: 'Ações',
      cell: ({ row }) => {
        if (row.original.id !== editingRowId) {
          return <span className="text-gray-400">-</span>;
        }
        return (
          <div className="flex items-center gap-2">
            <button
              onClick={(event) => {
                event.stopPropagation();
                handleSaveNewRow();
              }}
              className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700"
            >
              Salvar
            </button>
            <button
              onClick={(event) => {
                event.stopPropagation();
                handleCancelNewRow();
              }}
              className="rounded-md border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancelar
            </button>
          </div>
        );
      },
      meta: { isCustom: false, label: 'Ações', disableMenu: true },
      enableSorting: false,
    }),
    [editingRowId, handleCancelNewRow, handleSaveNewRow]
  );

  // Dynamic custom field columns
  const customFieldColumns: ColumnDef<Employee>[] = useMemo(() => {
    if (!customFields?.fields) return [];
    
    return customFields.fields.map((field: { id?: string; key: string; label: string; type?: string; options?: string[] }) => ({
      id: `custom_${field.key}`,
      accessorFn: (row: Employee) => row.customFields?.[field.key] || '-',
      header: field.label,
      cell: ({ row, getValue }: CellContext<Employee, unknown>) => {
        if (row.original.id === editingRowId) {
          const value = newCustomFields[field.key];
          if (field.type === 'boolean') {
            return (
              <input
                type="checkbox"
                checked={Boolean(value)}
                onChange={(event) =>
                  setNewCustomFields((prev) => ({ ...prev, [field.key]: event.target.checked }))
                }
              />
            );
          }
          if (field.type === 'category') {
            return (
              <select
                value={(value as string) || ''}
                onChange={(event) =>
                  setNewCustomFields((prev) => ({ ...prev, [field.key]: event.target.value }))
                }
                onKeyDown={(event) => {
                  if (event.key === 'Enter') handleSaveNewRow();
                  if (event.key === 'Escape') handleCancelNewRow();
                }}
                className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
              >
                <option value="">Selecione</option>
                {(field.options || []).map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            );
          }
          return (
            <input
              type={field.type === 'number' || field.type === 'money' ? 'number' : field.type === 'date' ? 'date' : 'text'}
              value={(value as string) || ''}
              onChange={(event) =>
                setNewCustomFields((prev) => ({ ...prev, [field.key]: event.target.value }))
              }
              onKeyDown={(event) => {
                if (event.key === 'Enter') handleSaveNewRow();
                if (event.key === 'Escape') handleCancelNewRow();
              }}
              className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
            />
          );
        }
        return String(getValue() ?? '-');
      },
      meta: {
        isCustom: true,
        customFieldId: field.id,
        label: field.label,
      },
      enableSorting: true,
    }));
  }, [customFields, editingRowId, handleCancelNewRow, handleSaveNewRow, newCustomFields]);

  // All columns combined
  const columns = useMemo(
    () => [...baseColumns, ...customFieldColumns, actionColumn],
    [baseColumns, customFieldColumns, actionColumn]
  );

  const nonHideableColumnIds = useMemo(() => ['name', 'actions'], []);

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
    return order.map((id) => columnMap.get(id)).filter(Boolean) as ColumnDef<Employee>[];
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
  }, [viewsData, viewsLoading, viewsError, buildConfig, createView]);

  const persistConfig = useCallback(
    (override?: Partial<TableConfig>) => {
      if (!activeViewId || applyingViewRef.current) return;
      const views = Array.isArray(viewsData) ? (viewsData as TableView[]) : [];
      const activeView = views.find((view) => view.id === activeViewId);
      if (activeView?.name === 'Default') {
        if (skipAutoCreateRef.current) {
          skipAutoCreateRef.current = false;
          return;
        }
        if (suppressAutoCreateRef.current) return;
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
              entityType: 'employee',
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

  useEffect(() => {
    if (!isCreating || !editingRowId) return;
    setTimeout(() => {
      const rowEl = tableContainerRef.current?.querySelector(
        `[data-row-id="${editingRowId}"]`
      );
      rowEl?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      if (nameInputRef.current) {
        nameInputRef.current.focus();
      }
    }, 0);
  }, [isCreating, editingRowId]);

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

  const handleRenameColumn = (
    columnId: string,
    newLabel: string,
    meta?: { isCustom?: boolean; customFieldId?: string }
  ) => {
    if (meta?.isCustom && meta.customFieldId) {
      updateCustomField.mutate({ id: meta.customFieldId, data: { label: newLabel } });
      return;
    }
    const nextLabels = { ...columnLabels, [columnId]: newLabel };
    setColumnLabels(nextLabels);
    persistConfig({ columnLabels: nextLabels });
  };

  const handleDeleteColumn = (columnId: string, meta?: { customFieldId?: string }) => {
    if (!meta?.customFieldId) return;
    deleteCustomField.mutate(meta.customFieldId, {
      onSuccess: () => {
        setHiddenColumns((prev) => {
          const updatedHidden = prev.filter((id) => id !== columnId);
          persistConfig({ hiddenColumns: updatedHidden });
          return updatedHidden;
        });
        setColumnOrder((prev) => {
          const updatedOrder = prev.filter((id) => id !== columnId);
          persistConfig({ columnsOrder: updatedOrder });
          return updatedOrder;
        });
      },
    });
  };

  const views = useMemo(() => {
    const list = Array.isArray(viewsData) ? (viewsData as TableView[]) : [];
    const filtered = list.filter((view) => !deletedViewIds.has(view.id));
    return filtered.map((view) => ({
      id: view.id,
      name: (view as { name?: string }).name || 'View',
      isDefault: view.name === 'Default',
    }));
  }, [viewsData, deletedViewIds]);

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
      { entityType: 'employee', name, config: buildConfig() },
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
    const list = Array.isArray(viewsData) ? (viewsData as TableView[]) : [];
    const target = list.find((view) => view.id === viewId);
    if (target?.name === 'Minha view') {
      suppressAutoCreateRef.current = true;
    }
    deleteView.mutate(viewId, {
      onSuccess: () => {
        setDeletedViewIds((prev) => new Set(prev).add(viewId));
        if (activeViewId === viewId) {
          skipAutoCreateRef.current = true;
          const list = Array.isArray(viewsData) ? (viewsData as TableView[]) : [];
          const defaultView = list.find((view) => view.name === 'Default');
          if (defaultView?.id) {
            setActiveViewId(defaultView.id);
            if (defaultView.config) applyConfig(defaultView.config);
          } else {
            const remaining = list.filter((view) => view.id !== viewId);
            const next = remaining[0];
            setActiveViewId(next?.id || null);
            if (next?.config) applyConfig(next.config);
          }
        }
      },
      onError: (error) => {
        const message =
          (error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          'Erro ao excluir a view';
        // eslint-disable-next-line no-console
        console.error('Erro ao excluir view', error);
        alert(message);
      },
    });
  };

  const tableData = useMemo(() => {
    const base = Array.isArray(employees) ? employees : [];
    if (!isCreating || !newRowId) return base;
    return [...base, { ...newRow, __isNew: true, id: newRowId } as Employee];
  }, [employees, isCreating, newRow, newRowId]);

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Colaboradores</h1>
        <div className="flex gap-2">
          <button
            onClick={() => {
              setSorting([]);
              const tempId = `__new__${Date.now()}`;
              setNewRowId(tempId);
              setEditingRowId(tempId);
              setIsCreating(true);
              setNewRow({ status: 'ACTIVE' });
              setNewCustomFields({});
            }}
            className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Novo Colaborador
          </button>
        </div>
      </div>

      <div ref={tableContainerRef} className="rounded-lg bg-white p-6 shadow">
        <AdvancedTable
          data={tableData}
          columns={orderedColumns}
          hiddenColumns={hiddenColumns}
          columnOrder={columnOrder}
          editingRowId={editingRowId}
          draftRow={newRow as Record<string, unknown>}
          onCancelEdit={handleCancelNewRow}
          onSaveEdit={handleSaveNewRow}
          sorting={sorting}
          onSortingChange={setSorting}
          columnFilters={columnFilters}
          onColumnFiltersChange={setColumnFilters}
          globalFilter={globalFilter}
          onGlobalFilterChange={setGlobalFilter}
          onColumnOrderChange={handleColumnOrderChange}
          onToggleColumn={toggleColumn}
          onRenameColumn={handleRenameColumn}
          onDeleteColumn={handleDeleteColumn}
          onAddColumn={() => setShowFieldModal(true)}
          addColumnLabel="Criar coluna"
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

      <CustomFieldModal
        entityType="employee"
        isOpen={showFieldModal}
        onClose={() => setShowFieldModal(false)}
        onCreated={(field) => {
          if (!field.key) return;
          setColumnOrder((prev) => {
            const next = prev.filter((id) => id !== `custom_${field.key}`);
            const actionIndex = next.indexOf('actions');
            const updated =
              actionIndex === -1
                ? [...next, `custom_${field.key}`]
                : [
                    ...next.slice(0, actionIndex),
                    `custom_${field.key}`,
                    ...next.slice(actionIndex),
                  ];
            persistConfig({ columnsOrder: updated });
            return updated;
          });
        }}
      />
    </div>
  );
}
