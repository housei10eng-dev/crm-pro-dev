import axios from 'axios';

const API_URL = 'http://localhost:3001';

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const authApi = {
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }),
  me: () => api.get('/me'),
};

export const companiesApi = {
  list: (params?: Record<string, unknown>) => api.get('/admin/companies', { params }),
  getById: (id: string) => api.get(`/admin/companies/${id}`),
  create: (data: Record<string, unknown>) => api.post('/admin/companies', data),
  update: (id: string, data: Record<string, unknown>) => api.patch(`/admin/companies/${id}`, data),
  getCustomFields: (id: string) => api.get(`/admin/companies/${id}/custom-fields`),
  saveCustomFields: (id: string, values: Array<{ key: string; value: unknown }>) =>
    api.patch(`/admin/companies/${id}/custom-fields`, { values }),
};

export const employeesApi = {
  list: () => api.get('/admin/employees'),
  getById: (id: string) => api.get(`/admin/employees/${id}`),
  create: (data: Record<string, unknown>) => api.post('/admin/employees', data),
  update: (id: string, data: Record<string, unknown>) => api.patch(`/admin/employees/${id}`, data),
  getCustomFields: (id: string) => api.get(`/admin/employees/${id}/custom-fields`),
  saveCustomFields: (id: string, values: Array<{ key: string; value: unknown }>) =>
    api.patch(`/admin/employees/${id}/custom-fields`, { values }),
};

export const auditApi = {
  list: (params?: Record<string, unknown>) => api.get('/admin/audit', { params }),
};

export const customFieldsApi = {
  list: (entityType: 'company' | 'employee' | 'audit') =>
    api.get('/admin/custom-fields', { params: { entityType } }),
  create: (data: Record<string, unknown>) => api.post('/admin/custom-fields', data),
  update: (id: string, data: Record<string, unknown>) => api.patch(`/admin/custom-fields/${id}`, data),
  delete: (id: string) => api.delete(`/admin/custom-fields/${id}`),
};

export const viewsApi = {
  list: (entityType: 'company' | 'employee' | 'audit') =>
    api.get('/admin/views', { params: { entityType } }),
  create: (data: Record<string, unknown>) => api.post('/admin/views', data),
  update: (id: string, data: Record<string, unknown>) => api.patch(`/admin/views/${id}`, data),
  delete: (id: string) => api.delete(`/admin/views/${id}`),
  setDefault: (id: string) => api.post(`/admin/views/${id}/set-default`),
};

export const settingsApi = {
  get: () => api.get('/admin/settings'),
  update: (data: Record<string, unknown>) => api.put('/admin/settings', data),
};

// Legacy export for backwards compatibility
export const adminApi = {
  companies: companiesApi,
  employees: employeesApi,
  audit: auditApi,
  customFields: customFieldsApi,
  views: viewsApi,
  settings: settingsApi,
};

