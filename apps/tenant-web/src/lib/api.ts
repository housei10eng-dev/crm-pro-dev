import { createApiClient, createAuthApi, createTenantApi, webStorage } from '@crm/api';

const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

let unauthorizedCallback: (() => void) | undefined;

export function setUnauthorizedCallback(callback: () => void) {
  unauthorizedCallback = callback;
}

export const apiClient = createApiClient({
  baseUrl,
  getToken: () => webStorage.getToken(),
  onUnauthorized: () => {
    webStorage.clearToken();
    if (unauthorizedCallback) {
      unauthorizedCallback();
    }
  },
});

export const authApi = createAuthApi(apiClient);
export const tenantApi = createTenantApi(apiClient);
