import { useQuery } from '@tanstack/react-query';
import { auditApi } from '../lib/api';

export function useAudit(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: ['audit', params],
    queryFn: async () => {
      const { data } = await auditApi.list(params);
      if (data && typeof data === 'object' && 'data' in data) {
        return data as { data: unknown };
      }
      return { data } as { data: unknown };
    },
  });
}
