import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { companiesApi } from '../lib/api';

export function useCompanies(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: ['companies', JSON.stringify(params ?? {})],
    queryFn: async () => {
      const { data } = await companiesApi.list(params);
      if (data && typeof data === 'object' && 'data' in data) {
        return (data as { data: unknown }).data;
      }
      return data;
    },
    refetchOnWindowFocus: false,
    staleTime: 30000,
    retry: (failureCount, error) => {
      const status = (error as { response?: { status?: number } })?.response?.status;
      if (status === 401 || status === 403) return false;
      return failureCount < 1;
    },
    onError: (error) => {
      console.error('useCompanies error', (error as any)?.response?.data || error);
    },
  });
}

export function useCompany(id: string) {
  return useQuery({
    queryKey: ['companies', id],
    queryFn: async () => {
      const { data } = await companiesApi.getById(id);
      return data;
    },
    enabled: !!id,
  });
}

export function useCreateCompany() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => companiesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] });
    },
    onError: (error: any) => {
      console.error('createCompany error', error?.response?.data || error);
      const msg = error?.response?.data?.message || 'Erro ao criar empresa';
      alert(Array.isArray(msg) ? msg.join('\n') : msg);
    },
  });
}

export function useUpdateCompany() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      companiesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] });
    },
  });
}

export function useSaveCompanyCustomFields() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id: string; values: Array<{ key: string; value: unknown }> }) =>
      companiesApi.saveCustomFields(id, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] });
    },
  });
}
