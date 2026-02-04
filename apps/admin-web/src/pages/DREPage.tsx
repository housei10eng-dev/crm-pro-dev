import { useState, useMemo } from 'react';
import { ColumnDef, SortingState, ColumnFiltersState } from '@tanstack/react-table';
import { AdvancedTable } from '../components/table/AdvancedTable';
import { ColumnManager } from '../components/table/ColumnManager';
import { format } from 'date-fns';

interface DREEntry {
  id: string;
  period: string;
  category: string;
  amount: number;
  type: 'revenue' | 'expense';
  description: string;
  date: string;
}

export default function DREPage() {
  // Mock data - será substituído por cálculos reais do backend
  const mockDREData: DREEntry[] = [
    {
      id: '1',
      period: '02/2026',
      category: 'Receita de Assinatura',
      amount: 15000.00,
      type: 'revenue',
      description: 'Receita mensal de assinnaturas',
      date: new Date(2026, 1, 28).toISOString(),
    },
    {
      id: '2',
      period: '02/2026',
      category: 'Receita de Serviços',
      amount: 5000.00,
      type: 'revenue',
      description: 'Receita de serviços customizados',
      date: new Date(2026, 1, 28).toISOString(),
    },
    {
      id: '3',
      period: '02/2026',
      category: 'Folha de Pagamento',
      amount: 8000.00,
      type: 'expense',
      description: 'Salários e encargos',
      date: new Date(2026, 1, 28).toISOString(),
    },
    {
      id: '4',
      period: '02/2026',
      category: 'Infraestrutura',
      amount: 2000.00,
      type: 'expense',
      description: 'Custos de servidor e hosting',
      date: new Date(2026, 1, 28).toISOString(),
    },
    {
      id: '5',
      period: '02/2026',
      category: 'Impostos',
      amount: 3000.00,
      type: 'expense',
      description: 'Impostos e contribuições',
      date: new Date(2026, 1, 28).toISOString(),
    },
    {
      id: '6',
      period: '02/2026',
      category: 'Marketing',
      amount: 1500.00,
      type: 'expense',
      description: 'Despesas com marketing e publicidade',
      date: new Date(2026, 1, 28).toISOString(),
    },
  ];

  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [hiddenColumns, setHiddenColumns] = useState<string[]>([]);

  // Define columns
  const columns: ColumnDef<DREEntry>[] = useMemo(
    () => [
      {
        accessorKey: 'period',
        header: 'Período',
        enableSorting: true,
      },
      {
        accessorKey: 'category',
        header: 'Categoria',
        enableSorting: true,
      },
      {
        accessorKey: 'type',
        header: 'Tipo',
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
        accessorKey: 'description',
        header: 'Descrição',
        enableSorting: true,
      },
      {
        accessorKey: 'date',
        header: 'Data',
        cell: ({ getValue }) => {
          const date = getValue() as string;
          return format(new Date(date), 'dd/MM/yyyy');
        },
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

  // Calculate totals
  const totals = useMemo(() => {
    const revenues = mockDREData
      .filter((item) => item.type === 'revenue')
      .reduce((sum, item) => sum + item.amount, 0);
    const expenses = mockDREData
      .filter((item) => item.type === 'expense')
      .reduce((sum, item) => sum + item.amount, 0);
    return {
      revenues,
      expenses,
      profit: revenues - expenses,
    };
  }, []);

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">DRE - Demonstração do Resultado do Exercício</h1>
        <p className="mt-2 text-sm text-gray-600">
          Visualize receitas, despesas e lucro de suas operações
        </p>
      </div>

      {/* Summary Cards */}
      <div className="mb-6 grid grid-cols-3 gap-4">
        <div className="rounded-lg bg-white p-6 shadow">
          <p className="text-sm font-medium text-gray-600">Receita Total</p>
          <p className="mt-2 text-2xl font-bold text-green-600">
            {new Intl.NumberFormat('pt-BR', {
              style: 'currency',
              currency: 'BRL',
            }).format(totals.revenues)}
          </p>
        </div>
        <div className="rounded-lg bg-white p-6 shadow">
          <p className="text-sm font-medium text-gray-600">Despesa Total</p>
          <p className="mt-2 text-2xl font-bold text-red-600">
            {new Intl.NumberFormat('pt-BR', {
              style: 'currency',
              currency: 'BRL',
            }).format(totals.expenses)}
          </p>
        </div>
        <div className="rounded-lg bg-white p-6 shadow">
          <p className="text-sm font-medium text-gray-600">Lucro Líquido</p>
          <p className={`mt-2 text-2xl font-bold ${totals.profit >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
            {new Intl.NumberFormat('pt-BR', {
              style: 'currency',
              currency: 'BRL',
            }).format(totals.profit)}
          </p>
        </div>
      </div>

      <div className="rounded-lg bg-white p-6 shadow">
        <AdvancedTable
          data={mockDREData}
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
          Dados de DRE estão sendo exibidos com dados de exemplo. Em breve, será integrado com o
          backend para cálculos automáticos baseados nos dados reais de receitas e despesas.
        </p>
      </div>
    </div>
  );
}
