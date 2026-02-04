import { ReactNode } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  ColumnDef,
  SortingState,
  ColumnFiltersState,
  OnChangeFn,
} from '@tanstack/react-table';
import { ChevronUp, ChevronDown, Search, X, GripVertical } from 'lucide-react';

interface AdvancedTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  sorting: SortingState;
  onSortingChange: OnChangeFn<SortingState>;
  columnFilters: ColumnFiltersState;
  onColumnFiltersChange: OnChangeFn<ColumnFiltersState>;
  globalFilter: string;
  onGlobalFilterChange: (filter: string) => void;
  onColumnOrderChange?: (columnIds: string[]) => void;
  onRowClick?: (row: T) => void;
  loading?: boolean;
  toolbar?: ReactNode;
}

interface DraggableHeaderProps {
  id: string;
  children: ReactNode;
  isPlaceholder: boolean;
  canSort: boolean;
  onSort?: () => void;
  isSorted?: false | 'asc' | 'desc';
}

function DraggableHeader({
  id,
  children,
  isPlaceholder,
  canSort,
  onSort,
  isSorted,
}: DraggableHeaderProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useSortable({
    id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <th
      ref={setNodeRef}
      style={style}
      className={`px-4 py-3 text-left text-sm font-semibold text-gray-700 ${
        isDragging ? 'bg-blue-50' : ''
      }`}
    >
      {isPlaceholder ? null : (
        <div className="flex items-center gap-2">
          <div
            {...attributes}
            {...listeners}
            className="flex cursor-grab items-center gap-1 active:cursor-grabbing"
          >
            <GripVertical className="h-4 w-4 text-gray-400" />
          </div>
          <div
            className={canSort ? 'flex cursor-pointer select-none items-center gap-2' : ''}
            onClick={() => onSort?.()}
          >
            {children}
            {canSort && (
              <span className="text-gray-400">
                {isSorted === 'asc' ? (
                  <ChevronUp className="h-4 w-4" />
                ) : isSorted === 'desc' ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <div className="h-4 w-4" />
                )}
              </span>
            )}
          </div>
        </div>
      )}
    </th>
  );
}

export function AdvancedTable<T>({
  data,
  columns,
  sorting,
  onSortingChange,
  columnFilters,
  onColumnFiltersChange,
  globalFilter,
  onGlobalFilterChange,
  onColumnOrderChange,
  onRowClick,
  loading,
  toolbar,
}: AdvancedTableProps<T>) {
  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnFilters,
      globalFilter,
    },
    onSortingChange,
    onColumnFiltersChange,
    onGlobalFilterChange,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const sensors = useSensors(
    useSensor(PointerSensor, {
      distance: 8 as any,
    }),
    useSensor(KeyboardSensor)
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const headerGroups = table.getHeaderGroups();
      const headers = headerGroups[0]?.headers || [];

      const oldIndex = headers.findIndex((h) => h.id === String(active.id));
      const newIndex = headers.findIndex((h) => h.id === String(over.id));

      if (oldIndex !== -1 && newIndex !== -1) {
        const newOrder = arrayMove(
          headers.map((h) => h.id),
          oldIndex,
          newIndex
        );
        onColumnOrderChange?.(newOrder);
      }
    }
  };

  const headerGroups = table.getHeaderGroups();
  const headerIds = headerGroups[0]?.headers.map((h) => h.id) || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar..."
            value={globalFilter}
            onChange={(e) => onGlobalFilterChange(e.target.value)}
            className="w-full rounded-md border border-gray-300 py-2 pl-10 pr-10 focus:border-blue-500 focus:outline-none"
          />
          {globalFilter && (
            <button
              onClick={() => onGlobalFilterChange('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {toolbar}
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <table className="w-full">
            <thead className="bg-gray-50">
              {headerGroups.map((headerGroup) => (
                <tr key={headerGroup.id}>
                  <SortableContext
                    items={headerIds}
                    strategy={horizontalListSortingStrategy}
                  >
                    {headerGroup.headers.map((header) => (
                      <DraggableHeader
                        key={header.id}
                        id={header.id}
                        isPlaceholder={header.isPlaceholder}
                        canSort={header.column.getCanSort()}
                        onSort={header.column.getToggleSortingHandler()}
                        isSorted={header.column.getIsSorted()}
                      >
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                      </DraggableHeader>
                    ))}
                  </SortableContext>
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td
                    colSpan={columns.length}
                    className="px-4 py-8 text-center text-gray-500"
                  >
                    Carregando...
                  </td>
                </tr>
              ) : table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length}
                    className="px-4 py-8 text-center text-gray-500"
                  >
                    Nenhum resultado encontrado
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => onRowClick?.(row.original)}
                    className={onRowClick ? 'cursor-pointer hover:bg-gray-50' : ''}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-4 py-3 text-sm text-gray-900">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </DndContext>
      </div>
    </div>
  );
}
