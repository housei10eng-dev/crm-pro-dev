import { ReactNode, useCallback, useMemo, useRef, useState, type CSSProperties } from 'react';
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
  ColumnSizingState,
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
  columnSizing?: ColumnSizingState;
  sorting: SortingState;
  onSortingChange: OnChangeFn<SortingState>;
  columnFilters: ColumnFiltersState;
  onColumnFiltersChange: OnChangeFn<ColumnFiltersState>;
  globalFilter: string;
  onGlobalFilterChange: (filter: string) => void;
  onColumnOrderChange?: (columnIds: string[]) => void;
  onColumnSizingChange?: OnChangeFn<ColumnSizingState>;
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
  editingCell?: { rowId: string; columnId: string } | null;
  editingValue?: string;
  onStartEditCell?: (row: T, columnId: string, value: unknown, meta?: ColumnMeta) => void;
  onEditValueChange?: (value: string) => void;
  onCommitEdit?: (row: T, columnId: string, value: string, meta?: ColumnMeta) => void;
  onCancelCellEdit?: () => void;
}

export interface ColumnMeta {
  isCustom?: boolean;
  customFieldId?: string;
  label?: string;
  disableMenu?: boolean;
  editable?: boolean;
  editor?: 'text' | 'email' | 'phone' | 'cpfCnpj' | 'select';
  options?: string[];
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
  canResize?: boolean;
  onResize?: (event: React.MouseEvent<HTMLDivElement>) => void;
  onAutoSize?: () => void;
  isResizing?: boolean;
  size?: number;
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
  canResize,
  onResize,
  onAutoSize,
  isResizing,
  size,
}: DraggableHeaderProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useSortable({
    id,
  });

  const [menuOpen, setMenuOpen] = useState(false);

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    opacity: isDragging ? 0.5 : 1,
    ...(size ? { width: size } : {}),
  };

  return (
    <th
      ref={setNodeRef}
      style={style}
      className={`group relative px-4 py-3 text-left text-sm font-semibold text-gray-700 ${
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
      {canResize && (
        <div
          onMouseDown={onResize}
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => {
            event.stopPropagation();
            onAutoSize?.();
          }}
          className={`absolute right-0 top-0 h-full w-1 cursor-col-resize select-none ${
            isResizing ? 'bg-blue-400' : 'bg-transparent'
          }`}
        />
      )}
    </th>
  );
}

export function AdvancedTable<T>({
  data,
  columns,
  hiddenColumns,
  columnOrder,
  columnSizing,
  sorting,
  onSortingChange,
  columnFilters,
  onColumnFiltersChange,
  globalFilter,
  onGlobalFilterChange,
  onColumnOrderChange,
  onColumnSizingChange,
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
  editingCell,
  editingValue,
  onStartEditCell,
  onEditValueChange,
  onCommitEdit,
  onCancelCellEdit,
}: AdvancedTableProps<T>) {
  const showAddColumn = Boolean(onAddColumn);
  const measureCanvasRef = useRef<HTMLCanvasElement | null>(null);
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
    getRowId: (originalRow, index) => {
      const id = (originalRow as { id?: string | number })?.id;
      return id ? String(id) : String(index);
    },
    state: {
      sorting,
      columnFilters,
      globalFilter,
      ...(columnSizing ? { columnSizing } : {}),
      ...(columnVisibility ? { columnVisibility } : {}),
      ...(resolvedColumnOrder ? { columnOrder: resolvedColumnOrder } : {}),
    },
    onSortingChange,
    onColumnFiltersChange,
    onGlobalFilterChange,
    onColumnSizingChange,
    columnResizeMode: 'onEnd',
    enableColumnResizing: true,
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

  const measureTextWidth = useCallback((text: string) => {
    if (typeof document === 'undefined') return text.length * 8;
    if (!measureCanvasRef.current) {
      measureCanvasRef.current = document.createElement('canvas');
    }
    const context = measureCanvasRef.current.getContext('2d');
    if (!context) return text.length * 8;
    context.font = '14px ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif';
    return context.measureText(text).width;
  }, []);

  const handleAutoSizeColumn = useCallback(
    (columnId: string) => {
      if (!onColumnSizingChange) return;
      const header = table.getHeaderGroups()[0]?.headers.find(
        (item) => item.column.id === columnId
      );
      const headerLabel =
        typeof header?.column.columnDef.header === 'string'
          ? header.column.columnDef.header
          : header?.column.id || columnId;
      let maxWidth = measureTextWidth(String(headerLabel));
      table.getRowModel().rows.forEach((row) => {
        const value = row.getValue(columnId);
        const text = value === null || value === undefined ? '' : String(value);
        maxWidth = Math.max(maxWidth, measureTextWidth(text));
      });
      const nextSize = Math.min(600, Math.max(80, Math.ceil(maxWidth + 40)));
      onColumnSizingChange((prev) => ({ ...prev, [columnId]: nextSize }));
    },
    [measureTextWidth, onColumnSizingChange, table]
  );

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
                          canResize={header.column.getCanResize()}
                          onResize={header.getResizeHandler()}
                          onAutoSize={() => handleAutoSizeColumn(header.column.id)}
                          isResizing={header.column.getIsResizing()}
                          size={header.getSize()}
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
                    onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                    data-row-id={(row.original as { id?: string }).id}
                    data-editing={
                      editingRowId &&
                      (row.original as { id?: string }).id === editingRowId
                        ? 'true'
                        : undefined
                    }
                    className={onRowClick ? 'cursor-pointer hover:bg-gray-50' : ''}
                  >
                    {row.getVisibleCells().map((cell) => {
                      const meta = cell.column.columnDef.meta as ColumnMeta | undefined;
                      const rowId = String((row.original as { id?: string }).id || row.id);
                      const isNewRow = Boolean(
                        (row.original as { __isNew?: boolean }).__isNew
                      );
                      const isEditingCell =
                        editingCell?.rowId === rowId && editingCell?.columnId === cell.column.id;
                      const editable = Boolean(meta?.editable && onStartEditCell);
                      if (isEditingCell && editable && onEditValueChange && onCommitEdit) {
                        if (meta?.editor === 'select') {
                          return (
                            <td
                              key={cell.id}
                              className="px-4 py-3 text-sm text-gray-900"
                              style={{ width: cell.column.getSize() }}
                            >
                              <select
                                autoFocus
                                value={editingValue || ''}
                                onChange={(event) => {
                                  onEditValueChange(event.target.value);
                                  onCommitEdit(
                                    row.original,
                                    cell.column.id,
                                    event.target.value,
                                    meta
                                  );
                                }}
                                onKeyDown={(event) => {
                                  if (event.key === 'Escape') {
                                    onCancelCellEdit?.();
                                  }
                                }}
                                className="w-full rounded border border-blue-400 px-2 py-1 text-sm"
                              >
                                {(meta.options || []).map((option) => (
                                  <option key={option} value={option}>
                                    {option}
                                  </option>
                                ))}
                              </select>
                            </td>
                          );
                        }
                        const inputType =
                          meta?.editor === 'email'
                            ? 'email'
                            : meta?.editor === 'phone'
                              ? 'tel'
                              : 'text';
                        return (
                          <td
                            key={cell.id}
                            className="px-4 py-3 text-sm text-gray-900"
                            style={{ width: cell.column.getSize() }}
                          >
                            <input
                              autoFocus
                              value={editingValue || ''}
                              type={inputType}
                              onChange={(event) => onEditValueChange(event.target.value)}
                              onBlur={() => {
                                onCommitEdit(
                                  row.original,
                                  cell.column.id,
                                  editingValue || '',
                                  meta
                                );
                              }}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                  onCommitEdit(
                                    row.original,
                                    cell.column.id,
                                    editingValue || '',
                                    meta
                                  );
                                }
                                if (event.key === 'Escape') {
                                  onCancelCellEdit?.();
                                }
                              }}
                              className="w-full rounded border border-blue-400 px-2 py-1 text-sm"
                            />
                          </td>
                        );
                      }
                      return (
                        <td
                          key={cell.id}
                          className={`px-4 py-3 text-sm text-gray-900 ${
                            editable ? 'cursor-text' : ''
                          } ${isNewRow ? 'pointer-events-auto' : ''}`}
                          style={{ width: cell.column.getSize() }}
                          onDoubleClick={() => {
                            if (!editable || isNewRow) return;
                            onStartEditCell?.(
                              row.original,
                              cell.column.id,
                              cell.getValue(),
                              meta
                            );
                          }}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      );
                    })}
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
