import { useState } from 'react';
import { Save, Upload, Palette, Shield } from 'lucide-react';
import { useSettings, useUpdateSettings } from '../hooks/useSettings';

export default function SettingsPage() {
  const { data: settings, isLoading } = useSettings();
  const updateMutation = useUpdateSettings();

  const [brandName, setBrandName] = useState('');
  const [logo, setLogo] = useState('');
  const [loginBackground, setLoginBackground] = useState('');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  // Initialize form when settings load
  useState(() => {
    if (settings) {
      setBrandName(settings.brandName || '');
      setLogo(settings.logo || '');
      setLoginBackground(settings.loginBackground || '');
      setTheme(settings.theme || 'light');
    }
  });

  const handleSave = () => {
    updateMutation.mutate({
      brandName,
      logo,
      loginBackground,
      theme,
    });
  };

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="text-lg">Carregando configurações...</div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Configurações</h1>
          <p className="mt-2 text-sm text-gray-600">
            Personalize a aparência e comportamento do Admin Console.
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={updateMutation.isPending}
          className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {updateMutation.isPending ? 'Salvando...' : 'Salvar Alterações'}
        </button>
      </div>

      <div className="space-y-6">
        {/* Branding Section */}
        <div className="rounded-lg bg-white p-6 shadow">
          <div className="mb-4 flex items-center gap-2">
            <Upload className="h-5 w-5 text-gray-700" />
            <h2 className="text-xl font-semibold text-gray-900">Identidade Visual</h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nome da Marca
              </label>
              <input
                type="text"
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
                placeholder="CRM PRO"
                className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
              />
              <p className="mt-1 text-xs text-gray-500">
                Exibido no cabeçalho e na página de login.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                URL do Logo
              </label>
              <input
                type="url"
                value={logo}
                onChange={(e) => setLogo(e.target.value)}
                placeholder="https://example.com/logo.png"
                className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
              />
              <p className="mt-1 text-xs text-gray-500">
                Logo exibido na sidebar e no login (recomendado: 200x50px).
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                URL do Background de Login
              </label>
              <input
                type="url"
                value={loginBackground}
                onChange={(e) => setLoginBackground(e.target.value)}
                placeholder="https://example.com/background.jpg"
                className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
              />
              <p className="mt-1 text-xs text-gray-500">
                Imagem de fundo da página de login (recomendado: 1920x1080px).
              </p>
            </div>
          </div>
        </div>

        {/* Theme Section */}
        <div className="rounded-lg bg-white p-6 shadow">
          <div className="mb-4 flex items-center gap-2">
            <Palette className="h-5 w-5 text-gray-700" />
            <h2 className="text-xl font-semibold text-gray-900">Tema</h2>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Modo de Cor
              </label>
              <div className="flex gap-4">
                <button
                  onClick={() => setTheme('light')}
                  className={`flex-1 rounded-lg border-2 p-4 text-center transition-colors ${
                    theme === 'light'
                      ? 'border-blue-600 bg-blue-50'
                      : 'border-gray-300 hover:border-gray-400'
                  }`}
                >
                  <div className="text-2xl mb-2">☀️</div>
                  <div className="font-medium">Claro</div>
                </button>
                <button
                  onClick={() => setTheme('dark')}
                  className={`flex-1 rounded-lg border-2 p-4 text-center transition-colors ${
                    theme === 'dark'
                      ? 'border-blue-600 bg-blue-50'
                      : 'border-gray-300 hover:border-gray-400'
                  }`}
                >
                  <div className="text-2xl mb-2">🌙</div>
                  <div className="font-medium">Escuro</div>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Security Section */}
        <div className="rounded-lg bg-white p-6 shadow">
          <div className="mb-4 flex items-center gap-2">
            <Shield className="h-5 w-5 text-gray-700" />
            <h2 className="text-xl font-semibold text-gray-900">Segurança</h2>
          </div>

          <div className="space-y-4">
            <div className="rounded-lg bg-yellow-50 p-4 border border-yellow-200">
              <h3 className="text-sm font-semibold text-yellow-900 mb-1">
                Sistema de Auditoria WORM
              </h3>
              <p className="text-xs text-yellow-800">
                O sistema possui auditoria imutável ativada. Todas as alterações são registradas de forma permanente e não podem ser editadas ou excluídas.
              </p>
            </div>

            <div className="rounded-lg bg-green-50 p-4 border border-green-200">
              <h3 className="text-sm font-semibold text-green-900 mb-1">
                LGPD Compliance
              </h3>
              <p className="text-xs text-green-800">
                Dados sensíveis são redactados automaticamente nos logs. Campos de pagamento protegidos com metadata JSON.
              </p>
            </div>

            <div className="rounded-lg bg-red-50 p-4 border border-red-200">
              <h3 className="text-sm font-semibold text-red-900 mb-1">
                Zona de Perigo
              </h3>
              <p className="text-xs text-red-800 mb-3">
                Ações irreversíveis que afetam todo o sistema. Use com extrema cautela.
              </p>
              <button
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
                disabled
              >
                Limpar Todos os Custom Fields (Em breve)
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
