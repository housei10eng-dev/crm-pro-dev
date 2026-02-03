export type Scope = 'admin' | 'tenant';

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
}

export interface MeResponse {
  id: string;
  email: string;
  name: string;
  tenantId: string;
  roles: string[];
  scope: Scope;
  tenantName?: string;
}

export interface Session extends MeResponse {
  accessToken: string;
}

export interface Company {
  id: string;
  name: string;
  cpfCnpj: string;
  type: string;
  plan: string;
  status: string;
  currentRevenue: number;
  segment?: string;
  email?: string;
  phone?: string;
  createdAt: string;
}

export interface CompaniesResponse {
  data: Company[];
  meta?: {
    total?: number;
    cursor?: string;
  };
}

export interface AuditLog {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  field: string;
  oldValue: any;
  newValue: any;
  actorId: string | null;
  actorRole: string;
  createdAt: string;
}

export interface Employee {
  id: string;
  email: string;
  name: string;
  status: string;
  roles: string[];
  createdAt: string;
}

export interface PingResponse {
  ok: boolean;
  scope: string;
  tenantId?: string;
  userId?: string;
}

export interface ApiClientConfig {
  baseUrl: string;
  getToken: () => string | null | Promise<string | null>;
  onUnauthorized?: () => void;
}
