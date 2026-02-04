import { useState, useMemo } from 'react';
import { ColumnDef, SortingState, ColumnFiltersState } from '@tanstack/react-table';
import { AdvancedTable } from '../components/table/AdvancedTable';
import { ColumnManager } from '../components/table/ColumnManager';
import { format } from 'date-fns';

interface Payment {
  id: string;
  transactionDate: string;
  amount: number;
  status: 'pending' | 'completed' | 'failed';
  cardBrand: string;
  last4Digits: string;
  holderName: string;
  transactionId: string;
}

export default function PaymentsPage() {
  // Mock data - será substituído por API real
  const mockPayments: Payment[] = [
    {
      id: '1',
      transactionDate: new Date(2026, 1, 1).toISOString(),
      amount: 1500.00,
      status: 'completed',
      cardBrand: 'Visa',
      last4Digits: '4242',
      holderName: 'João Silva',
      transactionId: 'TXN001',
    },
    {
      id: '2',
      transactionDate: new Date(2026, 1, 2).toISOString(),
      amount: 3000.00,
      status: 'completed',
      cardBrand: 'Mastercard',
      last4Digits: '5555',
      holderName: 'Maria Santos',
      transactionId: 'TXN002',
    },
    {
      id: '3',
      transactionDate: new Date(2026, 1, 3).toISOString(),
      amount: 500.00,
      status: 'pending',
      cardBrand: 'American Express',
      last4Digits: '3782',
      holderName: 'Pedro Costa',
      transactionId: 'TXN003',
    },
    {
      id: '4',
      transactionDate: new Date(2026, 1, 3).toISOString(),
      amount: 750.00,
      status: 'failed',
      cardBrand: 'Visa',
      last4Digits: '1111',
      holderName: 'Ana Oliveira',
      transactionId: 'TXN004',
    },
  ];

  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [hiddenColumns, setHiddenColumns] = useState<string[]>([]);

  // Define columns
  const columns: ColumnDef<Payment>[] = useMemo(
    () => [
      {
        accessorKey: 'transactionDate',
        header: 'Data da Transação',
        cell: ({ getValue }) => {
          const date = getValue() as string;
          return format(new Date(date), 'dd/MM/yyyy HH:mm');
        },
        enableSorting: true,
      },
      {
        accessorKey: 'amount',
        header: 'Valor',
        cell: ({ getValue }) => {
          const amount = getValue() as number;
          return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL',
          }).format(amount);
        },
        enableSorting: true,
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ getValue }) => {
          const status = getValue() as string;
          const statusMap: Record<string, { label: string; color: string }> = {
            completed: { label: 'Concluído', color: 'bg-green-100 text-green-800' },
            pending: { label: 'Pendente', color: 'bg-yellow-100 text-yellow-800' },
            failed: { label: 'Falhou', color: 'bg-red-100 text-red-800' },
          };
          const config = statusMap[status] || statusMap.pending;
          return (
            <span className={`rounded-full px-2 py-1 text-xs font-semibold ${config.color}`}>
              {config.label}
            </span>
          );
        },
        enableSorting: true,
      },
      {
        accessorKey: 'cardBrand',
        header: 'Bandeira',
        enableSorting: true,
      },
      {
        accessorKey: 'last4Digits',
        header: 'Últimos 4 Dígitos',
        cell: ({ getValue }) => `••••${getValue()}`,
        enableSorting: true,
      },
      {
        accessorKey: 'holderName',
        header: 'Nome do Titular',
        enableSorting: true,
      },
      {
        accessorKey: 'transactionId',
        header: 'ID da Transação',
        enableSorting: true,
      },
    ],
    []
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
    // TODO: Persist to backend
  };

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Pagamentos</h1>
        <p className="mt-2 text-sm text-gray-600">
          Gerencie e visualize todos os pagamentos recebidos
        </p>
      </div>

      <div className="rounded-lg bg-white p-6 shadow">
        <AdvancedTable
          data={mockPayments}
          columns={visibleColumns}
          sorting={sorting}
          onSortingChange={setSorting}
          columnFilters={columnFilters}
          onColumnFiltersChange={setColumnFilters}
          globalFilter={globalFilter}
          onGlobalFilterChange={setGlobalFilter}
          onColumnOrderChange={handleColumnOrderChange}
          toolbar={
            <div className="flex gap-2">
              <ColumnManager columns={columnList} onToggleColumn={toggleColumn} />
            </div>
          }
        />
      </div>

      <div className="mt-6 rounded-lg bg-blue-50 p-4 text-sm text-blue-800">
        <p className="font-semibold">Informação:</p>
        <p className="mt-1">
          Dados de pagamentos estão sendo exibidos com dados de exemplo. Em breve, será integrado com o
          backend para exibir dados reais.
        </p>
      </div>
    </div>
  );
}
