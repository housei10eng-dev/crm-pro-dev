import { useQuery } from '@tanstack/react-query';
import { tenantApi } from '../lib/api';

export default function PingPage() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['ping'],
    queryFn: () => tenantApi.ping(),
  });

  return (
    <div className="p-8">
      <h1 className="mb-6 text-3xl font-bold">Ping Test</h1>

      <div className="rounded-lg bg-white p-6 shadow">
        <p className="mb-4 text-gray-600">
          Este endpoint testa a conectividade com o backend na rota <code>/app/ping</code>.
        </p>

        {isLoading && <div className="text-gray-600">Carregando...</div>}

        {error && (
          <div className="rounded bg-red-100 p-4 text-red-700">
            Erro: {(error as Error).message}
          </div>
        )}

        {data && (
          <div className="rounded bg-green-100 p-4">
            <h3 className="mb-2 font-semibold text-green-900">Resposta do Servidor:</h3>
            <pre className="overflow-auto text-sm text-green-800">
              {JSON.stringify(data, null, 2)}
            </pre>
          </div>
        )}

        <button
          onClick={() => refetch()}
          className="mt-4 rounded bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700"
        >
          Testar Novamente
        </button>
      </div>
    </div>
  );
}
