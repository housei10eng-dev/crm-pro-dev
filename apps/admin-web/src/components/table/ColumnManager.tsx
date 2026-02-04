import { Settings, Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';

interface Column {
  id: string;
  label: string;
  visible: boolean;
}

interface ColumnManagerProps {
  columns: Column[];
  onToggleColumn: (columnId: string) => void;
}

export function ColumnManager({ columns, onToggleColumn }: ColumnManagerProps) {
  const [isOpen, setIsOpen] = useState(false);

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
            <div className="max-h-96 overflow-y-auto p-2">
              {columns.map((column) => (
                <button
                  key={column.id}
                  onClick={() => onToggleColumn(column.id)}
                  className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm hover:bg-gray-50"
                >
                  {column.visible ? (
                    <Eye className="h-4 w-4 text-blue-500" />
                  ) : (
                    <EyeOff className="h-4 w-4 text-gray-400" />
                  )}
                  <span className={column.visible ? 'text-gray-900' : 'text-gray-400'}>
                    {column.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
