import { Check, ChevronDown, Pencil, Save, Star, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';

export interface ViewItem {
  id: string;
  name: string;
  isDefault?: boolean;
}

interface ViewsSelectorProps {
  views: ViewItem[];
  activeViewId: string | null;
  onSelectView: (viewId: string) => void;
  onSaveAs: (name: string) => void;
  onRename: (viewId: string, name: string) => void;
  onSetDefault: (viewId: string) => void;
  onDelete: (viewId: string) => void;
}

export function ViewsSelector({
  views,
  activeViewId,
  onSelectView,
  onSaveAs,
  onRename,
  onSetDefault,
  onDelete,
}: ViewsSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showSaveAs, setShowSaveAs] = useState(false);
  const [showRename, setShowRename] = useState(false);
  const [viewName, setViewName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<ViewItem | null>(null);

  const sortedViews = useMemo(() => {
    return [...views].sort((a, b) => {
      const aDefault = a.name === 'Default';
      const bDefault = b.name === 'Default';
      if (aDefault && !bDefault) return -1;
      if (!aDefault && bDefault) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [views]);

  const activeView = useMemo(
    () => sortedViews.find((view) => view.id === activeViewId) || sortedViews[0],
    [sortedViews, activeViewId]
  );
  const canEditActive = Boolean(
    activeViewId && !(activeView?.name === 'Default')
  );

  const resetModal = () => {
    setViewName('');
    setShowSaveAs(false);
    setShowRename(false);
  };

  const handleDeleteView = (event: React.MouseEvent<HTMLButtonElement>, view: ViewItem) => {
    event.preventDefault();
    event.stopPropagation();
    setConfirmDelete(view);
  };

  const normalizeName = (name: string) => name.trim().toLowerCase();
  const nameExists = (name: string, excludeId?: string) => {
    const normalized = normalizeName(name);
    return views.some(
      (view) => normalizeName(view.name) === normalized && view.id !== excludeId
    );
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        <span>{activeView?.name || 'View atual'}</span>
        <ChevronDown className="h-4 w-4" />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute left-0 top-12 z-20 w-64 rounded-md border border-gray-200 bg-white shadow-lg">
            <div className="border-b border-gray-200 px-3 py-2 text-xs font-semibold uppercase text-gray-500">
              Views
            </div>
            <div className="max-h-64 overflow-y-auto p-1">
              {sortedViews.length === 0 && (
                <div className="px-3 py-2 text-sm text-gray-500">
                  Nenhuma view criada
                </div>
              )}
              {sortedViews.map((view) => {
                const isDefaultView = view.name === 'Default';
                return (
                <div
                  key={view.id}
                  className={`flex items-center justify-between rounded px-3 py-2 text-sm ${
                    view.id === activeViewId ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      onSelectView(view.id);
                      setIsOpen(false);
                    }}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    {isDefaultView && <Star className="h-4 w-4 text-yellow-500" />}
                    <span className="truncate">{view.name}</span>
                    {view.id === activeViewId && <Check className="h-4 w-4" />}
                  </button>
                  {!isDefaultView && (
                    <button
                      type="button"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                      }}
                      onClickCapture={(event) => handleDeleteView(event, view)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          handleDeleteView(
                            event as unknown as React.MouseEvent<HTMLButtonElement>,
                            view
                          );
                        }
                      }}
                      className="ml-2 text-gray-400 hover:text-red-600 pointer-events-auto"
                      title="Excluir"
                      aria-label={`Excluir view ${view.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
                );
              })}
            </div>
            <div className="border-t border-gray-200 p-2">
              <button
                onClick={() => {
                  setViewName('');
                  setShowSaveAs(true);
                  setIsOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm hover:bg-gray-50"
              >
                <Save className="h-4 w-4 text-gray-500" />
                Salvar como...
              </button>
              {activeViewId && (
                <>
                  <button
                    onClick={() => {
                      setViewName(activeView?.name || '');
                      setShowRename(true);
                      setIsOpen(false);
                    }}
                    disabled={!canEditActive}
                    className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Pencil className="h-4 w-4 text-gray-500" />
                    Renomear
                  </button>
                  <button
                    onClick={() => {
                      onSetDefault(activeViewId);
                      setIsOpen(false);
                    }}
                    disabled={!canEditActive}
                    className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Star className="h-4 w-4 text-gray-500" />
                    Definir como padrão
                  </button>
                </>
              )}
            </div>
          </div>
        </>
      )}

      {showSaveAs && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">Salvar como</h3>
            <input
              type="text"
              value={viewName}
              onChange={(e) => setViewName(e.target.value)}
              placeholder="Nome da view"
              maxLength={25}
              className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
              autoFocus
            />
            <p className="mb-4 text-xs text-gray-500">Máximo 25 caracteres</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={resetModal}
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  const nextName = viewName.trim().slice(0, 25);
                  if (!nextName) return;
                  if (nameExists(nextName)) {
                    alert('Já existe uma view com esse nome');
                    return;
                  }
                  onSaveAs(nextName);
                  resetModal();
                }}
                disabled={!viewName.trim()}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {showRename && activeViewId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">Renomear view</h3>
            <input
              type="text"
              value={viewName}
              onChange={(e) => setViewName(e.target.value)}
              placeholder="Novo nome"
              maxLength={25}
              className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
              autoFocus
            />
            <p className="mb-4 text-xs text-gray-500">Máximo 25 caracteres</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={resetModal}
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  const nextName = viewName.trim().slice(0, 25);
                  if (!nextName) return;
                  if (nameExists(nextName, activeViewId)) {
                    alert('Já existe uma view com esse nome');
                    return;
                  }
                  onRename(activeViewId, nextName);
                  resetModal();
                }}
                disabled={!viewName.trim()}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                Renomear
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
            <h3 className="mb-2 text-lg font-semibold text-gray-900">Excluir view</h3>
            <p className="mb-4 text-sm text-gray-600">
              Deseja realmente excluir a view{' '}
              <span className="font-semibold text-gray-900">"{confirmDelete.name}"</span>?
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmDelete(null)}
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  onDelete(confirmDelete.id);
                  setConfirmDelete(null);
                }}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
