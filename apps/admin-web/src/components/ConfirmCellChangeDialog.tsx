import { ReactNode } from 'react';

interface ConfirmCellChangeDialogProps {
  open: boolean;
  fieldLabel: string;
  oldValue: ReactNode;
  newValue: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export function ConfirmCellChangeDialog({
  open,
  fieldLabel,
  oldValue,
  newValue,
  onConfirm,
  onCancel,
  isLoading,
}: ConfirmCellChangeDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
        <h3 className="mb-2 text-lg font-semibold text-gray-900">Confirmar alteracao</h3>
        <div className="mb-4 text-sm text-gray-700">
          <div className="mb-2">
            <span className="font-medium text-gray-900">Campo:</span> {fieldLabel}
          </div>
          <div className="mb-2">
            <span className="font-medium text-gray-900">Valor anterior:</span> {oldValue}
          </div>
          <div>
            <span className="font-medium text-gray-900">Novo valor:</span> {newValue}
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isLoading ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}
