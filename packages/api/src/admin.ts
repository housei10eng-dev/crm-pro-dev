import type { ApiClient } from './client';
import type { CompaniesResponse, Company, AuditLog, Employee } from './types';

export function createAdminApi(client: ApiClient) {
  return {
    companies: {
      list: async (params?: { limit?: number; cursor?: string }): Promise<CompaniesResponse> => {
        const response = await client.get<CompaniesResponse>('/admin/companies', { params });
        return response.data;
      },

      get: async (id: string): Promise<Company> => {
        const response = await client.get<Company>(`/admin/companies/${id}`);
        return response.data;
      },

      create: async (data: Partial<Company>): Promise<Company> => {
        const response = await client.post<Company>('/admin/companies', data);
        return response.data;
      },

      update: async (id: string, data: Partial<Company>): Promise<Company> => {
        const response = await client.patch<Company>(`/admin/companies/${id}`, data);
        return response.data;
      },

      unlockCritical: async (id: string, password: string): Promise<{ sessionId: string }> => {
        const response = await client.post(`/admin/companies/${id}/unlock-critical`, {
          password,
        });
        return response.data;
      },
    },

    audit: {
      list: async (params?: {
        entity_type?: string;
        entity_id?: string;
      }): Promise<AuditLog[]> => {
        const response = await client.get<AuditLog[]>('/admin/audit', { params });
        return response.data;
      },
    },

    employees: {
      list: async (): Promise<Employee[]> => {
        const response = await client.get<Employee[]>('/admin/employees');
        return response.data;
      },

      create: async (data: Partial<Employee>): Promise<Employee> => {
        const response = await client.post<Employee>('/admin/employees', data);
        return response.data;
      },
    },
  };
}
