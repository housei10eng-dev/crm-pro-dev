export default function SettingsPage() {
  return (
    <div className="p-8">
      <h1 className="mb-6 text-3xl font-bold">Settings</h1>

      <div className="space-y-6">
        <div className="rounded-lg bg-white p-6 shadow">
          <h2 className="mb-4 text-xl font-semibold">Configurações Gerais</h2>
          <p className="text-gray-600">
            Esta seção permitirá configurar preferências do sistema, notificações e integrações.
          </p>
        </div>

        <div className="rounded-lg bg-white p-6 shadow">
          <h2 className="mb-4 text-xl font-semibold">Perfil</h2>
          <p className="text-gray-600">
            Gerencie suas informações pessoais e preferências de conta.
          </p>
        </div>
      </div>
    </div>
  );
}
