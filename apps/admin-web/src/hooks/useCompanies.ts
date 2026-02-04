import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { companiesApi } from '../lib/api';

export function useCompanies(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: ['companies', params],
    queryFn: async () => {
      const { data } = await companiesApi.list(params);
      if (data && typeof data === 'object' && 'data' in data) {
        return (data as { data: unknown }).data;
      }
      return data;
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
