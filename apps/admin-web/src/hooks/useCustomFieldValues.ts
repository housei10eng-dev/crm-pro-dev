import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { companiesApi, employeesApi } from '../lib/api';

export function useCustomFieldValues(
  entityType: 'company' | 'employee',
  entityId: string
) {
  const api = entityType === 'company' ? companiesApi : employeesApi;

  return useQuery({
    queryKey: ['customFieldValues', entityType, entityId],
    queryFn: async () => {
      const { data } = await api.getCustomFields(entityId);
      return data;
    },
    enabled: !!entityId,
  });
}

export function useSaveCustomFieldValues(entityType: 'company' | 'employee') {
  const queryClient = useQueryClient();
  const api = entityType === 'company' ? companiesApi : employeesApi;

  return useMutation({
    mutationFn: ({ entityId, values }: { entityId: string; values: Array<{ key: string; value: unknown }> }) =>
      api.saveCustomFields(entityId, values),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['customFieldValues', entityType, variables.entityId],
      });
    },
  });
}
