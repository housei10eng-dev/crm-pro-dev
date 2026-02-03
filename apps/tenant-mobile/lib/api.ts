import { createApiClient, createAuthApi, createTenantApi } from '@crm/api';
import { mobileStorage } from '@crm/api/storage/mobile';

const baseUrl = process.env.EXPO_PUBLIC_API_BASE_URL || 'http://localhost:3001';

let unauthorizedCallback: (() => void) | undefined;

export function setUnauthorizedCallback(callback: () => void) {
  unauthorizedCallback = callback;
}

export const apiClient = createApiClient({
  baseUrl,
  getToken: () => mobileStorage.getToken(),
  onUnauthorized: () => {
    mobileStorage.clearToken();
    if (unauthorizedCallback) {
      unauthorizedCallback();
    }
  },
});

export const authApi = createAuthApi(apiClient);
export const tenantApi = createTenantApi(apiClient);
