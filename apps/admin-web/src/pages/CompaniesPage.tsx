import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  ColumnDef,
  SortingState,
  ColumnFiltersState,
  CellContext,
  ColumnSizingState,
} from '@tanstack/react-table';
import { Plus } from 'lucide-react';
import {
  useCompanies,
  useCreateCompany,
  useSaveCompanyCustomFields,
  useUpdateCompany,
} from '../hooks/useCompanies';
import {
  useCustomFields,
  useDeleteCustomField,
  useUpdateCustomField,
} from '../hooks/useCustomFields';
import { AdvancedTable } from '../components/table/AdvancedTable';
import { ColumnManager } from '../components/table/ColumnManager';
import { CustomFieldModal } from '../components/custom-fields/CustomFieldModal';
import { ViewsSelector } from '../components/views/ViewsSelector';
import { ConfirmCellChangeDialog } from '../components/ConfirmCellChangeDialog';
import { formatCpfCnpj } from '../utils/formatCpfCnpj';
import { format } from 'date-fns';
import { TableConfig } from '../hooks/useTableConfig';
import {
  useCreateView,
  useDeleteView,
  useSetDefaultView,
  useUpdateView,
  useViews,
} from '../hooks/useViews';

interface Company {
  id: string;
  name: string;
  cpfCnpj: string;
  email: string;
  phone: string;
  plan: string;
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

export default function CompaniesPage() {
  const { data: companies, isLoading } = useCompanies();
  const createCompany = useCreateCompany();
  const updateCompany = useUpdateCompany();
  const saveCustomFields = useSaveCompanyCustomFields();
  const { data: customFields } = useCustomFields('company');
  const updateCustomField = useUpdateCustomField();
  const deleteCustomField = useDeleteCustomField();
  const {
    data: viewsData,
    isLoading: viewsLoading,
    isError: viewsError,
  } = useViews('company');
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
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});
  const [columnLabels, setColumnLabels] = useState<Record<string, string>>({});
  const [isCreating, setIsCreating] = useState(false);
  const [newRow, setNewRow] = useState<Partial<Company>>({});
  const [newCustomFields, setNewCustomFields] = useState<Record<string, unknown>>({});
  const newRowRef = useRef<Partial<Company>>({});
  const newCustomFieldsRef = useRef<Record<string, unknown>>({});
  const [newRowId, setNewRowId] = useState<string | null>(null);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [deletedViewIds, setDeletedViewIds] = useState<Set<string>>(new Set());
  const [isNameLocked, setIsNameLocked] = useState(false);
  const [editingCell, setEditingCell] = useState<{ rowId: string; columnId: string } | null>(
    null
  );
  const [editingValue, setEditingValue] = useState('');
  const [editingOriginalValue, setEditingOriginalValue] = useState('');
  const [editingFieldLabel, setEditingFieldLabel] = useState('');
  const [confirmChange, setConfirmChange] = useState<
    | {
        rowId: string;
        columnId: string;
        fieldLabel: string;
        oldValue: string;
        newValue: string;
      }
    | null
  >(null);
  const tableContainerRef = useRef<HTMLDivElement | null>(null);
  const hasAppliedViewRef = useRef(false);
  const applyingViewRef = useRef(false);
  const skipNextPersistRef = useRef(false);
  const viewsRef = useRef<TableView[]>([]);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoCreatedViewRef = useRef(false);
  const skipAutoCreateRef = useRef(false);
  const suppressAutoCreateRef = useRef(false);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const lastCnpjRef = useRef<string | null>(null);
  const lastCnpjNameRef = useRef<string | null>(null);
  const cnpjLookupTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cnpjLookupInFlightRef = useRef<string | null>(null);

  useEffect(() => {
    newRowRef.current = newRow;
  }, [newRow]);

  useEffect(() => {
    newCustomFieldsRef.current = newCustomFields;
  }, [newCustomFields]);

  useEffect(() => {
    viewsRef.current = Array.isArray(viewsData) ? (viewsData as TableView[]) : [];
  }, [viewsData]);

  const formatCpfCnpjInput = useCallback((value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 14);
    if (digits.length <= 11) {
      return digits
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
    }
    return digits
      .replace(/(\d{2})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1/$2')
      .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
  }, []);

  const formatPhoneInput = useCallback((value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 13);
    if (digits.length <= 12) return digits;
    return digits
      .replace(/(\d{2})(\d)/, '+$1 $2')
      .replace(/(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{5})(\d)/, '$1-$2');
  }, []);

  const formatCellValue = useCallback(
    (columnId: string, value: string) => {
      if (columnId === 'cpfCnpj') return formatCpfCnpj(value);
      if (columnId === 'phone') return formatPhoneInput(value);
      return value;
    },
    [formatPhoneInput]
  );

  const handleCancelNewRow = useCallback(() => {
    setIsCreating(false);
    setNewRow({});
    setNewCustomFields({});
    setNewRowId(null);
    setIsNameLocked(false);
    lastCnpjRef.current = null;
    lastCnpjNameRef.current = null;
    if (cnpjLookupTimeoutRef.current) {
      clearTimeout(cnpjLookupTimeoutRef.current);
      cnpjLookupTimeoutRef.current = null;
    }
  }, []);

  const fetchCnpjName = useCallback(async (cnpj: string) => {
    const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
    if (!response.ok) {
      throw new Error(`CNPJ lookup failed: ${response.status}`);
    }
    const data = (await response.json()) as {
      razao_social?: string;
      nome_fantasia?: string;
    };
    const name = data.razao_social || data.nome_fantasia || '';
    return name ? String(name) : '';
  }, []);

  const applyCnpjName = useCallback((name: string) => {
    newRowRef.current = { ...newRowRef.current, name };
    if (nameInputRef.current) {
      nameInputRef.current.value = name;
    }
  }, []);

  const triggerCnpjLookup = useCallback(
    (cnpjDigits: string) => {
      if (cnpjDigits.length !== 14) return;
      if (cnpjLookupInFlightRef.current === cnpjDigits) return;
      if (lastCnpjRef.current === cnpjDigits && lastCnpjNameRef.current) {
        applyCnpjName(lastCnpjNameRef.current);
        return;
      }
      cnpjLookupInFlightRef.current = cnpjDigits;
      fetchCnpjName(cnpjDigits)
        .then((name) => {
          lastCnpjRef.current = cnpjDigits;
          lastCnpjNameRef.current = name || null;
          if (name) {
            applyCnpjName(name);
          }
        })
        .catch((error) => {
          // eslint-disable-next-line no-console
          console.warn('Falha ao buscar CNPJ', error);
          setIsNameLocked(false);
        })
        .finally(() => {
          if (cnpjLookupInFlightRef.current === cnpjDigits) {
            cnpjLookupInFlightRef.current = null;
          }
        });
    },
    [applyCnpjName, fetchCnpjName]
  );

  const updateNameLock = useCallback((cpfDigits: string) => {
    const nextLocked = cpfDigits.length === 14;
    setIsNameLocked((prev) => (prev === nextLocked ? prev : nextLocked));
  }, []);

  const scheduleCnpjLookup = useCallback(
    (cpfDigits: string) => {
      if (cnpjLookupTimeoutRef.current) {
        clearTimeout(cnpjLookupTimeoutRef.current);
        cnpjLookupTimeoutRef.current = null;
      }
      if (cpfDigits.length !== 14) return;
      cnpjLookupTimeoutRef.current = setTimeout(() => {
        triggerCnpjLookup(cpfDigits);
      }, 400);
    },
    [triggerCnpjLookup]
  );

  const handleSaveNewRow = useCallback(() => {
    const missing: string[] = [];
    const currentRow = newRowRef.current;
    const currentCustomFields = newCustomFieldsRef.current;
    if (!String(currentRow.name || '').trim()) missing.push(columnLabels.name || 'Nome');
    if (!String(currentRow.cpfCnpj || '').trim()) {
      missing.push(columnLabels.cpfCnpj || 'CPF/CNPJ');
    }
    if (!String(currentRow.email || '').trim()) missing.push(columnLabels.email || 'Email');
    if (!String(currentRow.phone || '').trim()) missing.push(columnLabels.phone || 'Telefone');
    if (!String(currentRow.plan || '').trim()) missing.push(columnLabels.plan || 'Plano');
    if (!String(currentRow.status || '').trim()) missing.push(columnLabels.status || 'Status');

    if (missing.length > 0) {
      alert(`Preencha as colunas obrigat??rias: ${missing.join(', ')}`);
      return;
    }

    const cpfDigits = String(currentRow.cpfCnpj).replace(/\D/g, '');
    if (![11, 14].includes(cpfDigits.length)) {
      alert('CPF/CNPJ inv??lido');
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(String(currentRow.email))) {
      alert('Email inv??lido');
      return;
    }
    const phoneDigits = String(currentRow.phone).replace(/\D/g, '');
    if (phoneDigits.length !== 13) {
      alert('Telefone inv??lido (13 d??gitos)');
      return;
    }

    const payload = {
      name: currentRow.name,
      cpfCnpj: currentRow.cpfCnpj,
      email: currentRow.email,
      phone: currentRow.phone,
      plan: currentRow.plan,
      status: currentRow.status || 'ACTIVE',
    };

    createCompany.mutate(payload, {
      onSuccess: (response) => {
        const created =
          (response as { data?: { id?: string } }).data ||
          (response as { id?: string });
        if (created?.id && Object.keys(currentCustomFields).length > 0) {
          saveCustomFields.mutate({
            id: created.id,
            values: Object.entries(currentCustomFields).map(([key, value]) => ({
              key,
              value,
            })),
          });
        }
        handleCancelNewRow();
      },
    });
  }, [columnLabels, createCompany, handleCancelNewRow, saveCustomFields]);

  // Base columns
  const planOptions = useMemo(() => ['FREE', 'PRO', 'ENTERPRISE'], []);
  const statusOptions = useMemo(() => ['ACTIVE', 'INACTIVE', 'SUSPENDED'], []);
  const statusLabels: Record<string, string> = {
    ACTIVE: 'Ativo',
    INACTIVE: 'Inativo',
    SUSPENDED: 'Suspenso',
  };

  const baseColumns: ColumnDef<Company>[] = useMemo(
    () => [
      {
        accessorKey: 'name',
        header: columnLabels.name || 'Nome',
        cell: ({ row, getValue }) => {
          if (row.original.__isNew) {
            return (
              <input
                key={newRowId || 'new'}
                ref={nameInputRef}
                defaultValue={String(newRowRef.current.name ?? '')}
                onChange={(event) => {
                  newRowRef.current = { ...newRowRef.current, name: event.target.value };
                }}
                onMouseDown={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') handleSaveNewRow();
                  if (event.key === 'Escape') handleCancelNewRow();
                }}
                readOnly={isNameLocked}
                className={`w-full rounded border px-2 py-1 text-sm pointer-events-auto ${
                  isNameLocked ? 'border-gray-200 bg-gray-100 text-gray-500' : 'border-gray-300'
                }`}
                placeholder="Nome"
              />
            );
          }
          return String(getValue() ?? '');
        },
        meta: {
          isCustom: false,
          label: columnLabels.name || 'Nome',
          editable: true,
          editor: 'text',
        },
        enableSorting: true,
      },
      {
        accessorKey: 'cpfCnpj',
        header: columnLabels.cpfCnpj || 'CPF/CNPJ',
        cell: ({ row, getValue }) => {
          if (row.original.__isNew) {
            return (
              <input
                key={newRowId || 'new'}
                defaultValue={String(newRowRef.current.cpfCnpj ?? '')}
                onChange={(event) => {
                  const masked = formatCpfCnpjInput(event.target.value);
                  event.currentTarget.value = masked;
                  newRowRef.current = { ...newRowRef.current, cpfCnpj: masked };
                  const digits = masked.replace(/\D/g, '');
                  updateNameLock(digits);
                  scheduleCnpjLookup(digits);
                }}
                onBlur={() => {
                  const digits = String(newRowRef.current.cpfCnpj ?? '').replace(/\D/g, '');
                  if (digits.length === 14) {
                    triggerCnpjLookup(digits);
                  }
                }}
                onMouseDown={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
                inputMode="numeric"
                onKeyDown={(event) => {
                  if (event.key === 'Enter') handleSaveNewRow();
                  if (event.key === 'Escape') handleCancelNewRow();
                }}
                className="w-full rounded border border-gray-300 px-2 py-1 text-sm pointer-events-auto"
                placeholder="CPF/CNPJ"
              />
            );
          }
          return formatCpfCnpj(getValue() as string);
        },
        meta: {
          isCustom: false,
          label: columnLabels.cpfCnpj || 'CPF/CNPJ',
          editable: true,
          editor: 'cpfCnpj',
        },
        enableSorting: true,
      },
      {
        accessorKey: 'email',
        header: columnLabels.email || 'Email',
        cell: ({ row, getValue }) => {
          if (row.original.__isNew) {
            return (
              <input
                key={newRowId || 'new'}
                defaultValue={String(newRowRef.current.email ?? '')}
                onChange={(event) => {
                  newRowRef.current = { ...newRowRef.current, email: event.target.value };
                }}
                onMouseDown={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
                type="email"
                onKeyDown={(event) => {
                  if (event.key === 'Enter') handleSaveNewRow();
                  if (event.key === 'Escape') handleCancelNewRow();
                }}
                className="w-full rounded border border-gray-300 px-2 py-1 text-sm pointer-events-auto"
                placeholder="Email"
              />
            );
          }
          return String(getValue() ?? '');
        },
        meta: {
          isCustom: false,
          label: columnLabels.email || 'Email',
          editable: true,
          editor: 'email',
        },
        enableSorting: true,
      },
      {
        accessorKey: 'phone',
        header: columnLabels.phone || 'Telefone',
        cell: ({ row, getValue }) => {
          if (row.original.__isNew) {
            return (
              <input
                key={newRowId || 'new'}
                defaultValue={String(newRowRef.current.phone ?? '')}
                onChange={(event) => {
                  const masked = formatPhoneInput(event.target.value);
                  event.currentTarget.value = masked;
                  newRowRef.current = { ...newRowRef.current, phone: masked };
                }}
                onMouseDown={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
                inputMode="tel"
                onKeyDown={(event) => {
                  if (event.key === 'Enter') handleSaveNewRow();
                  if (event.key === 'Escape') handleCancelNewRow();
                }}
                className="w-full rounded border border-gray-300 px-2 py-1 text-sm pointer-events-auto"
                placeholder="Telefone"
              />
            );
          }
          return String(getValue() ?? '');
        },
        meta: {
          isCustom: false,
          label: columnLabels.phone || 'Telefone',
          editable: true,
          editor: 'phone',
        },
        enableSorting: true,
      },
      {
        accessorKey: 'plan',
        header: columnLabels.plan || 'Plano',
        cell: ({ row, getValue }) => {
          if (row.original.__isNew) {
            return (
              <select
                key={newRowId || 'new'}
                defaultValue={String(newRowRef.current.plan ?? '')}
                onChange={(event) => {
                  newRowRef.current = { ...newRowRef.current, plan: event.target.value };
                }}
                onMouseDown={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') handleSaveNewRow();
                  if (event.key === 'Escape') handleCancelNewRow();
                }}
                className="w-full rounded border border-gray-300 px-2 py-1 text-sm pointer-events-auto"
              >
                <option value="">Selecione</option>
                {planOptions.map((plan) => (
                  <option key={plan} value={plan}>
                    {plan}
                  </option>
                ))}
              </select>
            );
          }
          return String(getValue() ?? '');
        },
        meta: {
          isCustom: false,
          label: columnLabels.plan || 'Plano',
          editable: true,
          editor: 'select',
          options: planOptions,
        },
        enableSorting: true,
      },
      {
        accessorKey: 'status',
        header: columnLabels.status || 'Status',
        cell: ({ row, getValue }) => {
          if (row.original.__isNew) {
            return (
              <select
                key={newRowId || 'new'}
                defaultValue={String(newRowRef.current.status ?? 'ACTIVE')}
                onChange={(event) => {
                  newRowRef.current = { ...newRowRef.current, status: event.target.value };
                }}
                onMouseDown={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') handleSaveNewRow();
                  if (event.key === 'Escape') handleCancelNewRow();
                }}
                className="w-full rounded border border-gray-300 px-2 py-1 text-sm pointer-events-auto"
              >
                {statusOptions.map((status) => (
                  <option key={status} value={status}>
                    {statusLabels[status] ?? status}
                  </option>
                ))}
              </select>
            );
          }
          const status = getValue() as string;
          const statusClass =
            status === 'ACTIVE'
              ? 'bg-green-100 text-green-800'
              : status === 'SUSPENDED'
                ? 'bg-yellow-100 text-yellow-800'
                : 'bg-red-100 text-red-800';
          return (
            <span
              className={`rounded-full px-2 py-1 text-xs font-semibold ${statusClass}`}
            >
              {statusLabels[status] ?? status}
            </span>
          );
        },
        meta: {
          isCustom: false,
          label: columnLabels.status || 'Status',
          editable: true,
          editor: 'select',
          options: statusOptions,
        },
        enableSorting: true,
      },
      {
        accessorKey: 'createdAt',
        header: columnLabels.createdAt || 'Criado em',
        cell: ({ row, getValue }) => {
          if (row.original.__isNew) return <span className="text-gray-400">-</span>;
          const date = getValue() as string;
          return format(new Date(date), 'dd/MM/yyyy HH:mm:ss');
        },
        meta: { isCustom: false, label: columnLabels.createdAt || 'Criado em' },
        enableSorting: true,
      },
    ],
    [
      columnLabels,
      newRowId,
      planOptions,
      formatCpfCnpjInput,
      formatPhoneInput,
      handleCancelNewRow,
      handleSaveNewRow,
      isNameLocked,
      scheduleCnpjLookup,
      triggerCnpjLookup,
      updateNameLock,
    ]
  );

  const actionColumn: ColumnDef<Company> = useMemo(
    () => ({
      id: 'actions',
      header: 'Ações',
      cell: ({ row }) => {
        if (!row.original.__isNew) {
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
    [handleCancelNewRow, handleSaveNewRow]
  );

  // Dynamic custom field columns
  const customFieldColumns: ColumnDef<Company>[] = useMemo(() => {
    if (!customFields?.fields) return [];
    
    return customFields.fields.map((field: { id?: string; key: string; label: string; type?: string; options?: string[] }) => ({
      id: `custom_${field.key}`,
      accessorFn: (row: Company) => row.customFields?.[field.key] ?? '',
      header: field.label,
      cell: ({ row, getValue }: CellContext<Company, unknown>) => {
        if (row.original.__isNew) {
          if (field.type === 'boolean') {
            return (
              <input
                key={`${newRowId || 'new'}-${field.key}`}
                type="checkbox"
                defaultChecked={Boolean(newCustomFieldsRef.current[field.key])}
                onChange={(event) => {
                  newCustomFieldsRef.current = {
                    ...newCustomFieldsRef.current,
                    [field.key]: event.target.checked,
                  };
                }}
                onMouseDown={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
              />
            );
          }
          if (field.type === 'category') {
            return (
              <select
                key={`${newRowId || 'new'}-${field.key}`}
                defaultValue={String(newCustomFieldsRef.current[field.key] ?? '')}
                onChange={(event) => {
                  newCustomFieldsRef.current = {
                    ...newCustomFieldsRef.current,
                    [field.key]: event.target.value,
                  };
                }}
                onMouseDown={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') handleSaveNewRow();
                  if (event.key === 'Escape') handleCancelNewRow();
                }}
                className="w-full rounded border border-gray-300 px-2 py-1 text-sm pointer-events-auto"
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
              key={`${newRowId || 'new'}-${field.key}`}
              defaultValue={String(newCustomFieldsRef.current[field.key] ?? '')}
              onChange={(event) => {
                newCustomFieldsRef.current = {
                  ...newCustomFieldsRef.current,
                  [field.key]: event.target.value,
                };
              }}
              onMouseDown={(event) => event.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                if (event.key === 'Enter') handleSaveNewRow();
                if (event.key === 'Escape') handleCancelNewRow();
              }}
              className="w-full rounded border border-gray-300 px-2 py-1 text-sm pointer-events-auto"
            />
          );
        }
        const value = getValue();
        return String(value ?? '-') || '-';
      },
      meta: {
        isCustom: true,
        customFieldId: field.id,
        label: field.label,
      },
      enableSorting: true,
    }));
  }, [customFields, newRowId, handleCancelNewRow, handleSaveNewRow]);

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
    return order.map((id) => columnMap.get(id)).filter(Boolean) as ColumnDef<Company>[];
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
      columnSizing,
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
      columnSizing,
      globalFilter,
    ]
  );

  const applyConfig = useCallback((config: Partial<TableConfig>) => {
    skipNextPersistRef.current = true;
    applyingViewRef.current = true;
    if (config.hiddenColumns) setHiddenColumns(config.hiddenColumns);
    if (config.columnsOrder) setColumnOrder(normalizeOrder(config.columnsOrder));
    if (config.columnLabels) setColumnLabels(config.columnLabels);
    if (config.columnSizing) setColumnSizing(config.columnSizing);
    if (config.sorting) {
      setSorting(Array.isArray(config.sorting) ? config.sorting : []);
    }
    if (config.filters) {
      setColumnFilters(Array.isArray(config.filters) ? config.filters : []);
    }
    if (config.globalSearch !== undefined) setGlobalFilter(config.globalSearch);
    requestAnimationFrame(() => {
      applyingViewRef.current = false;
    });
  }, [normalizeOrder]);

  useEffect(() => {
    setColumnOrder((prev) => {
      const next = normalizeOrder(prev);
      if (prev.length === next.length && prev.every((id, index) => id === next[index])) {
        return prev;
      }
      return next;
    });
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
        entityType: 'company',
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
      if (skipNextPersistRef.current) {
        skipNextPersistRef.current = false;
        return;
      }
      const views = viewsRef.current;
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
              entityType: 'company',
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
      const nextConfig = { ...buildConfig(), ...override };
      const activeConfig = activeView?.config ?? {};
      const normalize = (config: Partial<TableConfig>) => ({
        filters: config.filters ?? [],
        sorting: config.sorting ?? [],
        columnLabels: config.columnLabels ?? {},
        columnSizing: config.columnSizing ?? {},
        columnsOrder: config.columnsOrder ?? [],
        globalSearch: config.globalSearch ?? '',
        hiddenColumns: config.hiddenColumns ?? [],
      });
      if (JSON.stringify(normalize(activeConfig)) === JSON.stringify(normalize(nextConfig))) {
        return;
      }
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        updateView.mutate({
          id: activeViewId,
          data: { config: nextConfig },
        });
      }, 500);
    },
    [activeViewId, createView, updateView, buildConfig]
  );

  useEffect(() => {
    persistConfig();
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [hiddenColumns, sorting, columnFilters, globalFilter, columnOrder, columnLabels, persistConfig]);

  useEffect(() => {
    if (!isCreating || !newRowId) return;
    setTimeout(() => {
      const rowEl = tableContainerRef.current?.querySelector(
        `[data-row-id="${newRowId}"]`
      );
      rowEl?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      if (nameInputRef.current) {
        nameInputRef.current.focus();
      }
    }, 0);
  }, [isCreating, newRowId]);

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

  const handleColumnSizingChange = useCallback(
    (updater: ColumnSizingState | ((prev: ColumnSizingState) => ColumnSizingState)) => {
      setColumnSizing((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        persistConfig({ columnSizing: next });
        return next;
      });
    },
    [persistConfig]
  );

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
      { entityType: 'company', name, config: buildConfig() },
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
    const base = Array.isArray(companies) ? companies : [];
    if (!isCreating || !newRowId) return base;
    return [...base, { __isNew: true, id: newRowId } as Company];
  }, [companies, isCreating, newRowId]);

  const handleStartEditCell = useCallback(
    (row: Company, columnId: string, value: unknown, meta?: { label?: string }) => {
      if (!row?.id || row.__isNew) return;
      if (confirmChange) return;
      const rawValue = value === null || value === undefined ? '' : String(value);
      setEditingCell({ rowId: row.id, columnId });
      setEditingFieldLabel(meta?.label || columnId);
      setEditingOriginalValue(rawValue);
      setEditingValue(rawValue);
    },
    [confirmChange]
  );

  const handleCancelCellEdit = useCallback(() => {
    setEditingCell(null);
    setEditingValue('');
    setEditingOriginalValue('');
    setEditingFieldLabel('');
  }, []);

  const handleCommitEdit = useCallback(
    (row: Company, columnId: string, value: string) => {
      if (!editingCell || confirmChange) return;
      if (columnId === 'email' && value.trim()) {
        if (!/^\S+@\S+\.\S+$/.test(value)) {
          alert('Email invalido');
          return;
        }
      }
      if (columnId === 'cpfCnpj' && value.trim()) {
        const digits = value.replace(/\D/g, '');
        if (![11, 14].includes(digits.length)) {
          alert('CPF/CNPJ invalido');
          return;
        }
      }
      if (columnId === 'phone' && value.trim()) {
        const digits = value.replace(/\D/g, '');
        if (digits.length !== 13) {
          alert('Telefone invalido (13 digitos)');
          return;
        }
      }
      const normalize = (colId: string, val: string) => {
        if (colId === 'cpfCnpj' || colId === 'phone') {
          return val.replace(/\D/g, '');
        }
        return val.trim();
      };
      const nextValue = normalize(columnId, value);
      const prevValue = normalize(columnId, editingOriginalValue);
      handleCancelCellEdit();
      if (nextValue === prevValue) return;
      setConfirmChange({
        rowId: row.id,
        columnId,
        fieldLabel: editingFieldLabel,
        oldValue: editingOriginalValue,
        newValue: value,
      });
    },
    [confirmChange, editingCell, editingFieldLabel, editingOriginalValue, handleCancelCellEdit]
  );

  const handleConfirmChange = useCallback(() => {
    if (!confirmChange) return;
    const { rowId, columnId, newValue } = confirmChange;
    const payloadValue =
      columnId === 'cpfCnpj' || columnId === 'phone'
        ? newValue.replace(/\D/g, '')
        : newValue;
    updateCompany.mutate(
      { id: rowId, data: { [columnId]: payloadValue } },
      {
        onSuccess: () => {
          setConfirmChange(null);
        },
        onError: () => {
          alert('Erro ao salvar alteracao');
          setConfirmChange(null);
        },
      }
    );
  }, [confirmChange, updateCompany]);

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Empresas</h1>
        <div className="flex gap-2">
          <button
            onClick={() => {
              setSorting([]);
              const tempId = `__new__${Date.now()}`;
              setNewRowId(tempId);
              setEditingCell(null);
              setEditingValue('');
              setEditingOriginalValue('');
              setEditingFieldLabel('');
              setConfirmChange(null);
              setIsCreating(true);
              setIsNameLocked(false);
              lastCnpjRef.current = null;
              lastCnpjNameRef.current = null;
              if (cnpjLookupTimeoutRef.current) {
                clearTimeout(cnpjLookupTimeoutRef.current);
                cnpjLookupTimeoutRef.current = null;
              }
              newRowRef.current = { status: 'ACTIVE' };
              newCustomFieldsRef.current = {};
              setNewRow({ status: 'ACTIVE' });
              setNewCustomFields({});
            }}
            className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Nova Empresa
          </button>
        </div>
      </div>

      <div ref={tableContainerRef} className="rounded-lg bg-white p-6 shadow">
        <AdvancedTable
          data={tableData}
          columns={orderedColumns}
          hiddenColumns={hiddenColumns}
          columnOrder={columnOrder}
          columnSizing={columnSizing}
          draftRow={newRow as Record<string, unknown>}
          onCancelEdit={handleCancelNewRow}
          onSaveEdit={handleSaveNewRow}
          editingCell={editingCell}
          editingValue={editingValue}
          onStartEditCell={handleStartEditCell}
          onEditValueChange={(value) => {
            if (editingCell?.columnId === 'cpfCnpj') {
              setEditingValue(formatCpfCnpjInput(value));
              return;
            }
            if (editingCell?.columnId === 'phone') {
              setEditingValue(formatPhoneInput(value));
              return;
            }
            setEditingValue(value);
          }}
          onCommitEdit={handleCommitEdit}
          onCancelCellEdit={handleCancelCellEdit}
          sorting={sorting}
          onSortingChange={setSorting}
          columnFilters={columnFilters}
          onColumnFiltersChange={setColumnFilters}
          globalFilter={globalFilter}
          onGlobalFilterChange={setGlobalFilter}
          onColumnOrderChange={handleColumnOrderChange}
          onColumnSizingChange={handleColumnSizingChange}
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
        entityType="company"
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

      <ConfirmCellChangeDialog
        open={Boolean(confirmChange)}
        fieldLabel={confirmChange?.fieldLabel || ''}
        oldValue={
          confirmChange
            ? formatCellValue(confirmChange.columnId, confirmChange.oldValue)
            : ''
        }
        newValue={
          confirmChange
            ? formatCellValue(confirmChange.columnId, confirmChange.newValue)
            : ''
        }
        onCancel={() => setConfirmChange(null)}
        onConfirm={handleConfirmChange}
        isLoading={updateCompany.isPending}
      />
    </div>
  );
}
