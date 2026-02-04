import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { customFieldsApi } from '../lib/api';

export function useCustomFields(
  entityType: 'company' | 'employee' | 'audit' | 'payment' | 'dre'
) {
  return useQuery({
    queryKey: ['customFields', entityType],
    queryFn: async () => {
      const { data } = await customFieldsApi.list(entityType);
      if (data && typeof data === 'object' && 'fields' in data) {
        return data as { fields: unknown; values?: unknown };
      }
      return data;
    },
  });
}

export function useCreateCustomField() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: customFieldsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customFields'] });
    },
  });
}

export function useUpdateCustomField() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      customFieldsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customFields'] });
    },
  });
}

export function useDeleteCustomField() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: customFieldsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customFields'] });
    },
  });
}
