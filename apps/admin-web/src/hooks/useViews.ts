import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { viewsApi } from '../lib/api';

export function useViews(
  entityType: 'company' | 'employee' | 'audit' | 'payment' | 'dre' | 'dashboard'
) {
  return useQuery({
    queryKey: ['views', entityType],
    queryFn: async () => {
      const { data } = await viewsApi.list(entityType);
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
      console.error('useViews error', (error as any)?.response?.data || error);
    },
  });
}

export function useCreateView() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: viewsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['views'] });
    },
    onError: (error) => {
      console.error('createView error', (error as any)?.response?.data || error);
    },
  });
}

export function useUpdateView() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      viewsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['views'] });
    },
  });
}

export function useDeleteView() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: viewsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['views'] });
    },
  });
}

export function useSetDefaultView() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ viewId }: { viewId: string }) => viewsApi.setDefault(viewId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['views'] });
    },
  });
}
