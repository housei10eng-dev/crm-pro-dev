import { ReactNode, useMemo, useState } from 'react';
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
  VisibilityState,
  ColumnOrderState,
} from '@tanstack/react-table';
import {
  ChevronUp,
  ChevronDown,
  Search,
  X,
  GripVertical,
  Plus,
  MoreHorizontal,
} from 'lucide-react';

interface AdvancedTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  hiddenColumns?: string[];
  columnOrder?: string[];
  sorting: SortingState;
  onSortingChange: OnChangeFn<SortingState>;
  columnFilters: ColumnFiltersState;
  onColumnFiltersChange: OnChangeFn<ColumnFiltersState>;
  globalFilter: string;
  onGlobalFilterChange: (filter: string) => void;
  onColumnOrderChange?: (columnIds: string[]) => void;
  onToggleColumn?: (columnId: string) => void;
  onRenameColumn?: (columnId: string, newLabel: string, meta?: ColumnMeta) => void;
  onDeleteColumn?: (columnId: string, meta?: ColumnMeta) => void;
  onAddColumn?: () => void;
  addColumnLabel?: string;
  addColumnDisabled?: boolean;
  addColumnTooltip?: string;
  emptyStateLabel?: string;
  onRowClick?: (row: T) => void;
  loading?: boolean;
  toolbar?: ReactNode;
  editingRowId?: string | null;
  draftRow?: Record<string, unknown>;
  onStartCreateRow?: () => void;
  onCancelEdit?: () => void;
  onSaveEdit?: () => void;
}

export interface ColumnMeta {
  isCustom?: boolean;
  customFieldId?: string;
  label?: string;
  disableMenu?: boolean;
}

interface DraggableHeaderProps {
  id: string;
  children: ReactNode;
  isPlaceholder: boolean;
  canSort: boolean;
  onSort?: () => void;
  isSorted?: false | 'asc' | 'desc';
  meta?: ColumnMeta;
  onToggleColumn?: (columnId: string) => void;
  onRenameColumn?: (columnId: string, newLabel: string, meta?: ColumnMeta) => void;
  onDeleteColumn?: (columnId: string, meta?: ColumnMeta) => void;
}

function DraggableHeader({
  id,
  children,
  isPlaceholder,
  canSort,
  onSort,
  isSorted,
  meta,
  onToggleColumn,
  onRenameColumn,
  onDeleteColumn,
}: DraggableHeaderProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useSortable({
    id,
  });

  const [menuOpen, setMenuOpen] = useState(false);

  const style = {
    transform: CSS.Transform.toString(transform),
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <th
      ref={setNodeRef}
      style={style}
      className={`group px-4 py-3 text-left text-sm font-semibold text-gray-700 ${
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
          {(onToggleColumn || onRenameColumn || onDeleteColumn) && !meta?.disableMenu && (
            <div className="relative ml-auto">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setMenuOpen((prev) => !prev);
                }}
                className="opacity-0 transition-opacity group-hover:opacity-100"
                title="Ações da coluna"
              >
                <MoreHorizontal className="h-4 w-4 text-gray-500" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-6 z-20 w-40 rounded-md border border-gray-200 bg-white p-1 text-sm shadow-lg">
                  {onRenameColumn && (
                    <button
                      type="button"
                      className="w-full rounded px-3 py-2 text-left hover:bg-gray-50"
                      onClick={(event) => {
                        event.stopPropagation();
                        const nextLabel = prompt('Renomear coluna', meta?.label || String(children));
                        if (nextLabel && nextLabel.trim()) {
                          onRenameColumn(id, nextLabel.trim(), meta);
                        }
                        setMenuOpen(false);
                      }}
                    >
                      Renomear
                    </button>
                  )}
                  {onToggleColumn && (
                    <button
                      type="button"
                      className="w-full rounded px-3 py-2 text-left hover:bg-gray-50"
                      onClick={(event) => {
                        event.stopPropagation();
                        onToggleColumn(id);
                        setMenuOpen(false);
                      }}
                    >
                      Ocultar
                    </button>
                  )}
                  {onDeleteColumn && meta?.isCustom && (
                    <button
                      type="button"
                      className="w-full rounded px-3 py-2 text-left text-red-600 hover:bg-red-50"
                      onClick={(event) => {
                        event.stopPropagation();
                        if (confirm('Deseja realmente excluir esta coluna?')) {
                          onDeleteColumn(id, meta);
                        }
                        setMenuOpen(false);
                      }}
                    >
                      Excluir
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </th>
  );
}

export function AdvancedTable<T>({
  data,
  columns,
  hiddenColumns,
  columnOrder,
  sorting,
  onSortingChange,
  columnFilters,
  onColumnFiltersChange,
  globalFilter,
  onGlobalFilterChange,
  onColumnOrderChange,
  onToggleColumn,
  onRenameColumn,
  onDeleteColumn,
  onAddColumn,
  addColumnLabel = 'Adicionar coluna',
  addColumnDisabled = false,
  addColumnTooltip,
  emptyStateLabel = 'Nenhum resultado encontrado',
  onRowClick,
  loading,
  toolbar,
  editingRowId,
}: AdvancedTableProps<T>) {
  const showAddColumn = Boolean(onAddColumn);
  const columnVisibility = useMemo<VisibilityState | undefined>(() => {
    if (!hiddenColumns || hiddenColumns.length === 0) return undefined;
    return hiddenColumns.reduce<VisibilityState>((acc, columnId) => {
      acc[columnId] = false;
      return acc;
    }, {});
  }, [hiddenColumns]);

  const resolvedColumnOrder = useMemo<ColumnOrderState | undefined>(() => {
    if (!columnOrder || columnOrder.length === 0) return undefined;
    return columnOrder;
  }, [columnOrder]);

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnFilters,
      globalFilter,
      ...(columnVisibility ? { columnVisibility } : {}),
      ...(resolvedColumnOrder ? { columnOrder: resolvedColumnOrder } : {}),
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
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor)
  );

  const headerGroups = table.getHeaderGroups();
  const visibleLeafColumns = table.getVisibleLeafColumns();
  const headerIds = visibleLeafColumns.map((col) => col.id);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = headerIds.findIndex((id) => id === String(active.id));
      const newIndex = headerIds.findIndex((id) => id === String(over.id));

      if (oldIndex !== -1 && newIndex !== -1) {
        const newOrder = arrayMove(headerIds, oldIndex, newIndex);
        onColumnOrderChange?.(newOrder);
      }
    }
  };

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
                    {headerGroup.headers
                      .filter((header) => header.column.getIsVisible())
                      .map((header) => (
                        <DraggableHeader
                          key={header.id}
                          id={header.id}
                          isPlaceholder={header.isPlaceholder}
                          canSort={header.column.getCanSort()}
                          onSort={() => header.column.toggleSorting()}
                          isSorted={header.column.getIsSorted()}
                          meta={header.column.columnDef.meta as ColumnMeta | undefined}
                          onToggleColumn={onToggleColumn}
                          onRenameColumn={onRenameColumn}
                          onDeleteColumn={onDeleteColumn}
                        >
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                        </DraggableHeader>
                      ))}
                  </SortableContext>
                  {showAddColumn && (
                    <th className="px-2 py-2 text-right">
                      <button
                        type="button"
                        onClick={onAddColumn}
                        disabled={addColumnDisabled}
                        className={`inline-flex h-8 w-8 items-center justify-center rounded-full border border-dashed border-gray-300 text-gray-500 ${
                          addColumnDisabled
                            ? 'cursor-not-allowed opacity-50'
                            : 'hover:border-blue-400 hover:text-blue-600'
                        }`}
                        aria-label={addColumnLabel}
                        title={addColumnTooltip || addColumnLabel}
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </th>
                  )}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td
                    colSpan={visibleLeafColumns.length + (showAddColumn ? 1 : 0)}
                    className="px-4 py-8 text-center text-gray-500"
                  >
                    Carregando...
                  </td>
                </tr>
              ) : table.getRowModel().rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={visibleLeafColumns.length + (showAddColumn ? 1 : 0)}
                    className="px-4 py-8 text-center text-gray-500"
                  >
                    {emptyStateLabel}
                  </td>
                </tr>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => onRowClick?.(row.original)}
                    data-row-id={(row.original as { id?: string }).id}
                    data-editing={
                      editingRowId &&
                      (row.original as { id?: string }).id === editingRowId
                        ? 'true'
                        : undefined
                    }
                    className={onRowClick ? 'cursor-pointer hover:bg-gray-50' : ''}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-4 py-3 text-sm text-gray-900">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                    {showAddColumn && <td className="px-2 py-3" />}
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
