import { useSession } from '../lib/session';

export default function HomePage() {
  const { session } = useSession();

  return (
    <div className="p-8">
      <h1 className="mb-6 text-3xl font-bold">Bem-vindo ao Tenant App</h1>

      <div className="rounded-lg bg-white p-6 shadow">
        <h2 className="mb-4 text-xl font-semibold">Informações da Conta</h2>
        <dl className="space-y-2">
          <div>
            <dt className="text-sm font-medium text-gray-500">Nome</dt>
            <dd className="text-gray-900">{session?.name}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">Email</dt>
            <dd className="text-gray-900">{session?.email}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">Tenant</dt>
            <dd className="text-gray-900">{session?.tenantName || session?.tenantId}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">Roles</dt>
            <dd className="text-gray-900">{session?.roles.join(', ')}</dd>
          </div>
        </dl>
      </div>

      <div className="mt-6 rounded-lg bg-indigo-50 p-6">
        <h2 className="mb-2 text-lg font-semibold text-indigo-900">
          Funcionalidades em Desenvolvimento
        </h2>
        <p className="text-indigo-700">
          Em breve você terá acesso a recursos exclusivos do tenant, como dashboards
          personalizados, relatórios e muito mais.
        </p>
      </div>
    </div>
  );
}
