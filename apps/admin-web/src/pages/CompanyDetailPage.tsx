import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { adminApi } from '../lib/api';

export default function CompanyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: company, isLoading, error } = useQuery({
    queryKey: ['company', id],
    queryFn: async () => {
      const { data } = await adminApi.companies.getById(id!);
      return data;
    },
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="text-lg">Carregando...</div>
      </div>
    );
  }

  if (error || !company) {
    return (
      <div className="p-8">
        <div className="text-red-600">Erro ao carregar empresa</div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <button
        onClick={() => navigate('/admin/companies')}
        className="mb-4 flex items-center gap-2 text-blue-600 hover:text-blue-700"
      >
        <ArrowLeft size={20} />
        Voltar
      </button>

      <div className="rounded-lg bg-white p-6 shadow">
        <h1 className="mb-6 text-2xl font-bold">{company.name}</h1>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-gray-500">CPF/CNPJ</label>
            <p className="mt-1 text-gray-900">{company.cpfCnpj}</p>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-500">Tipo</label>
            <p className="mt-1 text-gray-900">{company.type}</p>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-500">Plano</label>
            <p className="mt-1 text-gray-900">{company.plan}</p>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-500">Status</label>
            <p className="mt-1">
              <span
                className={`rounded-full px-2 py-1 text-xs font-semibold ${
                  company.status === 'ACTIVE'
                    ? 'bg-green-100 text-green-800'
                    : 'bg-red-100 text-red-800'
                }`}
              >
                {company.status}
              </span>
            </p>
          </div>

          {company.segment && (
            <div>
              <label className="text-sm font-medium text-gray-500">Segmento</label>
              <p className="mt-1 text-gray-900">{company.segment}</p>
            </div>
          )}

          {company.email && (
            <div>
              <label className="text-sm font-medium text-gray-500">Email</label>
              <p className="mt-1 text-gray-900">{company.email}</p>
            </div>
          )}

          {company.phone && (
            <div>
              <label className="text-sm font-medium text-gray-500">Telefone</label>
              <p className="mt-1 text-gray-900">{company.phone}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
