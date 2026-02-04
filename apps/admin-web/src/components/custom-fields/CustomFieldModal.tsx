import { X } from 'lucide-react';
import { useState } from 'react';
import { useCreateCustomField } from '../../hooks/useCustomFields';

interface CustomFieldModalProps {
  entityType: 'company' | 'employee' | 'audit' | 'payment' | 'dre';
  isOpen: boolean;
  onClose: () => void;
  onCreated?: (field: { key?: string; label?: string; type?: string }) => void;
}

const FIELD_TYPES = [
  { value: 'text', label: 'Texto' },
  { value: 'number', label: 'Número' },
  { value: 'date', label: 'Data' },
  { value: 'money', label: 'Dinheiro' },
  { value: 'boolean', label: 'Sim/Não' },
  { value: 'category', label: 'Categoria' },
];

export function CustomFieldModal({
  entityType,
  isOpen,
  onClose,
  onCreated,
}: CustomFieldModalProps) {
  const [label, setLabel] = useState('');
  const [key, setKey] = useState('');
  const [type, setType] = useState<string>('text');
  const [options, setOptions] = useState('');

  const createMutation = useCreateCustomField();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const generatedKey = key || `${generateKey(label)}_${Math.floor(Date.now() / 1000)}`;

    const fieldData: Record<string, unknown> = {
      label,
      key: generatedKey,
      type,
      entityType,
    };

    if (type === 'category' && options.trim()) {
      fieldData.options = options.split(',').map(o => o.trim()).filter(Boolean);
    }

    createMutation.mutate(fieldData, {
      onSuccess: (response) => {
        setLabel('');
        setKey('');
        setType('text');
        setOptions('');
        if (onCreated) {
          const maybeData =
            (response as { data?: { key?: string; label?: string; type?: string } }).data ||
            (response as { key?: string; label?: string; type?: string });
          onCreated(maybeData || { key: generatedKey, label, type });
        }
        onClose();
      },
    });
  };

  const generateKey = (label: string) => {
    return label
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  };

  const handleLabelChange = (value: string) => {
    setLabel(value);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Adicionar Campo Personalizado</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nome do Campo
            </label>
            <input
              type="text"
              required
              value={label}
              onChange={(e) => handleLabelChange(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
              placeholder="Ex: Data de Aniversário"
            />
          </div>


          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tipo de Campo
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
            >
              {FIELD_TYPES.map((ft) => (
                <option key={ft.value} value={ft.value}>
                  {ft.label}
                </option>
              ))}
            </select>
          </div>

          {type === 'category' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Opções (separadas por vírgula)
              </label>
              <input
                type="text"
                value={options}
                onChange={(e) => setOptions(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
                placeholder="Opção 1, Opção 2, Opção 3"
              />
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {createMutation.isPending ? 'Criando...' : 'Criar Campo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
