import type { ApiClient } from './client';
import type { PingResponse } from './types';

export function createTenantApi(client: ApiClient) {
  return {
    ping: async (): Promise<PingResponse> => {
      const response = await client.get<PingResponse>('/app/ping');
      return response.data;
    },
  };
}
