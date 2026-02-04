import { Settings, Eye, EyeOff, Search, Lock } from 'lucide-react';
import { useMemo, useState } from 'react';

interface Column {
  id: string;
  label: string;
  visible: boolean;
}

interface ColumnManagerProps {
  columns: Column[];
  onToggleColumn: (columnId: string) => void;
  nonHideableColumnIds?: string[];
  searchable?: boolean;
}

export function ColumnManager({
  columns,
  onToggleColumn,
  nonHideableColumnIds = [],
  searchable = true,
}: ColumnManagerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const filteredColumns = useMemo(() => {
    if (!searchable || searchTerm.trim() === '') return columns;
    const query = searchTerm.toLowerCase();
    return columns.filter((column) => String(column.label).toLowerCase().includes(query));
  }, [columns, searchTerm, searchable]);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        <Settings className="h-4 w-4" />
        Colunas
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 top-12 z-20 w-64 rounded-md border border-gray-200 bg-white shadow-lg">
            <div className="border-b border-gray-200 px-4 py-2">
              <h3 className="text-sm font-semibold text-gray-700">
                Gerenciar Colunas
              </h3>
            </div>
            {searchable && (
              <div className="border-b border-gray-200 p-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Buscar coluna..."
                    className="w-full rounded-md border border-gray-200 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>
            )}
            <div className="max-h-96 overflow-y-auto p-2">
              {filteredColumns.map((column) => {
                const isLocked = nonHideableColumnIds.includes(column.id);
                return (
                  <button
                    key={column.id}
                    onClick={() => (isLocked ? null : onToggleColumn(column.id))}
                    className={`flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm ${
                      isLocked ? 'cursor-not-allowed opacity-60' : 'hover:bg-gray-50'
                    }`}
                    aria-disabled={isLocked}
                  >
                    {isLocked ? (
                      <Lock className="h-4 w-4 text-gray-400" />
                    ) : column.visible ? (
                      <Eye className="h-4 w-4 text-blue-500" />
                    ) : (
                      <EyeOff className="h-4 w-4 text-gray-400" />
                    )}
                    <span className={column.visible ? 'text-gray-900' : 'text-gray-400'}>
                      {column.label}
                    </span>
                  </button>
                );
              })}
              {filteredColumns.length === 0 && (
                <div className="px-3 py-2 text-sm text-gray-500">
                  Nenhuma coluna encontrada.
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
