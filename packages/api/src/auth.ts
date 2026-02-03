import type { ApiClient } from './client';
import type { LoginRequest, LoginResponse, MeResponse } from './types';

export function createAuthApi(client: ApiClient) {
  return {
    login: async (data: LoginRequest): Promise<LoginResponse> => {
      const response = await client.post<LoginResponse>('/auth/login', data);
      return response.data;
    },

    me: async (): Promise<MeResponse> => {
      const response = await client.get<MeResponse>('/me');
      return response.data;
    },
  };
}
