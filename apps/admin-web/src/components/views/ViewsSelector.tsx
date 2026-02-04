import { Save, Trash2, Star } from 'lucide-react';
import { useState } from 'react';
import { useViews, useCreateView, useDeleteView, useSetDefaultView } from '../../hooks/useViews';
import { TableConfig } from '../../hooks/useTableConfig';

interface ViewsSelectorProps {
  entityType: 'company' | 'employee' | 'audit';
  currentConfig: TableConfig;
  onLoadView: (config: Partial<TableConfig>) => void;
}

interface ViewItem {
  id: string;
  name: string;
  isDefault?: boolean;
  config: TableConfig;
}

export function ViewsSelector({ entityType, currentConfig, onLoadView }: ViewsSelectorProps) {
  const { data: views } = useViews(entityType);
  const createMutation = useCreateView();
  const deleteMutation = useDeleteView();
  const setDefaultMutation = useSetDefaultView();
  
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [viewName, setViewName] = useState('');

  const handleSaveView = () => {
    if (!viewName.trim()) return;

    createMutation.mutate(
      {
        name: viewName,
        entityType,
        config: currentConfig,
      },
      {
        onSuccess: () => {
          setViewName('');
          setShowSaveModal(false);
        },
      }
    );
  };

  const handleLoadView = (viewConfig: Partial<TableConfig>) => {
    onLoadView(viewConfig);
  };

  const handleDeleteView = (viewId: string) => {
    if (confirm('Deseja realmente excluir esta visualização?')) {
      deleteMutation.mutate(viewId);
    }
  };

  const handleSetDefault = (viewId: string) => {
    setDefaultMutation.mutate({ viewId });
  };

  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        <select
          onChange={(e) => {
            const selectedView = (views as ViewItem[] | undefined)?.find(
              (v) => v.id === e.target.value
            );
            if (selectedView) {
              handleLoadView(selectedView.config);
            }
          }}
          className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        >
          <option value="">Visualizações Salvas</option>
          {(views as ViewItem[] | undefined)?.map((view) => (
            <option key={view.id} value={view.id}>
              {view.isDefault && '⭐ '}{view.name}
            </option>
          ))}
        </select>
      </div>

      <button
        onClick={() => setShowSaveModal(true)}
        className="flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        <Save className="h-4 w-4" />
        Salvar Visualização
      </button>

      {Array.isArray(views) && views.length > 0 && (
        <div className="flex gap-1">
          {(views as ViewItem[]).map((view) => (
            <div key={view.id} className="flex items-center gap-1 rounded-md border border-gray-200 bg-gray-50 px-2 py-1">
              <button
                onClick={() => handleSetDefault(view.id)}
                className={`${view.isDefault ? 'text-yellow-500' : 'text-gray-400 hover:text-yellow-500'}`}
                title="Definir como padrão"
              >
                <Star className="h-3 w-3" fill={view.isDefault ? 'currentColor' : 'none'} />
              </button>
              <span className="text-xs text-gray-700">{view.name}</span>
              <button
                onClick={() => handleDeleteView(view.id)}
                className="text-gray-400 hover:text-red-500"
                title="Excluir"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {showSaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">
              Salvar Visualização
            </h3>
            <input
              type="text"
              value={viewName}
              onChange={(e) => setViewName(e.target.value)}
              placeholder="Nome da visualização"
              className="mb-4 w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowSaveModal(false);
                  setViewName('');
                }}
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveView}
                disabled={!viewName.trim() || createMutation.isPending}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {createMutation.isPending ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
