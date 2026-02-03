import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import type { ApiClientConfig } from './types';

export function createApiClient(config: ApiClientConfig): AxiosInstance {
  const client = axios.create({
    baseURL: config.baseUrl,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  // Request interceptor to add token
  client.interceptors.request.use(async (requestConfig) => {
    const token = await config.getToken();
    if (token && requestConfig.headers) {
      requestConfig.headers.Authorization = `Bearer ${token}`;
    }
    return requestConfig;
  });

  // Response interceptor for 401 handling
  client.interceptors.response.use(
    (response) => response,
    (error) => {
      if (error.response?.status === 401 && config.onUnauthorized) {
        config.onUnauthorized();
      }
      return Promise.reject(error);
    }
  );

  return client;
}

export type ApiClient = AxiosInstance;
