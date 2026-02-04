import { Settings, Eye, EyeOff, Search, Lock, GripVertical } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  arrayMove,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface Column {
  id: string;
  label: string;
  visible: boolean;
}

interface ColumnManagerProps {
  columns: Column[];
  onToggleColumn: (columnId: string) => void;
  onReorder?: (columnIds: string[]) => void;
  nonHideableColumnIds?: string[];
  searchable?: boolean;
}

interface DraggableColumnItemProps {
  id: string;
  label: string;
  visible: boolean;
  isLocked: boolean;
  onToggle: () => void;
  draggable: boolean;
}

function DraggableColumnItem({
  id,
  label,
  visible,
  isLocked,
  onToggle,
  draggable,
}: DraggableColumnItemProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useSortable({
    id,
    disabled: !draggable,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={() => (isLocked ? null : onToggle())}
      className={`flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm ${
        isLocked ? 'cursor-not-allowed opacity-60' : 'hover:bg-gray-50'
      }`}
      style={style}
      aria-disabled={isLocked}
    >
      <span
        {...attributes}
        {...listeners}
        className={`flex items-center ${draggable ? 'cursor-grab' : 'cursor-default'} text-gray-400`}
      >
        <GripVertical className="h-4 w-4" />
      </span>
      {isLocked ? (
        <Lock className="h-4 w-4 text-gray-400" />
      ) : visible ? (
        <Eye className="h-4 w-4 text-blue-500" />
      ) : (
        <EyeOff className="h-4 w-4 text-gray-400" />
      )}
      <span className={visible ? 'text-gray-900' : 'text-gray-400'}>{label}</span>
    </button>
  );
}

export function ColumnManager({
  columns,
  onToggleColumn,
  onReorder,
  nonHideableColumnIds = [],
  searchable = true,
}: ColumnManagerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    })
  );

  const filteredColumns = useMemo(() => {
    if (!searchable || searchTerm.trim() === '') return columns;
    const query = searchTerm.toLowerCase();
    return columns.filter((column) => String(column.label).toLowerCase().includes(query));
  }, [columns, searchTerm, searchable]);

  const draggableEnabled = searchTerm.trim() === '';

  const handleDragEnd = (event: DragEndEvent) => {
    if (!onReorder) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    if (nonHideableColumnIds.includes(String(active.id))) return;
    const ids = columns.map((col) => col.id);
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    const newOrder = arrayMove(ids, oldIndex, newIndex);
    onReorder(newOrder);
  };

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
              {onReorder && draggableEnabled ? (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={columns.map((col) => col.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {filteredColumns.map((column) => {
                      const isLocked = nonHideableColumnIds.includes(column.id);
                      return (
                        <DraggableColumnItem
                          key={column.id}
                          id={column.id}
                          label={String(column.label)}
                          visible={column.visible}
                          isLocked={isLocked}
                          onToggle={() => onToggleColumn(column.id)}
                          draggable={draggableEnabled && !isLocked}
                        />
                      );
                    })}
                  </SortableContext>
                </DndContext>
              ) : (
                filteredColumns.map((column) => {
                  const isLocked = nonHideableColumnIds.includes(column.id);
                  return (
                    <DraggableColumnItem
                      key={column.id}
                      id={column.id}
                      label={String(column.label)}
                      visible={column.visible}
                      isLocked={isLocked}
                      onToggle={() => onToggleColumn(column.id)}
                      draggable={false}
                    />
                  );
                })
              )}
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
