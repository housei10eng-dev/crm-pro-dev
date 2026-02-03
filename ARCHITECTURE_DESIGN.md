# Arquitetura Backend - CRM SaaS Multi-Tenant Enterprise

## 1. Stack Tecnológico & Justificativas

### Linguagem & Framework
**Node.js/TypeScript com NestJS**
- **Por quê**: 
  - Excelente para I/O intensivo (múltiplas queries LGPD, webhooks)
  - Ecossistema maturo (validação, serialização, DI)
  - NestJS força arquitetura modular (bounded contexts)
  - Rápido deploy e escalabilidade horizontal

**Alternativa considerada**: Go (Gin/Echo)
- Rejected: Menos ecosystem para RBAC/auditoria; Go é overkill para CRM (CPU-bound, não o nosso caso)

### Database Primária
**PostgreSQL 15+** (multi-tenant row-level)
- **Por quê**:
  - RLS (Row-Level Security) nativo = isolamento tenant
  - JSONB para colunas dinâmicas
  - Full-text search integrado
  - Particionamento por range (auditoria, histórico)
  - Transações ACID + serializable isolation
  - Suporte a event sourcing com WAL

### Cache & Session
**Redis 7+**
- Cache distributed (sessões, rate-limit, cache de permissões)
- Pub/Sub para eventos em tempo real
- Streams para audit logs antes do DB

### Message Queue
**Apache Kafka ou RabbitMQ**
- **Kafka**: High-throughput auditoria, event sourcing
- **RabbitMQ**: Simpler setup, ótimo para RBAC events
- **Escolha**: Kafka (auditoria imutável = importer, não deletar)

### Search Engine
**Elasticsearch** (não obrigatório, considerar)
- Full-text busca em contatos/leads
- Analytics em auditoria

### Observabilidade
- **Tracing**: Jaeger/OpenTelemetry
- **Logging**: ELK Stack (Elasticsearch + Logstash + Kibana) ou Grafana Loki
- **Metrics**: Prometheus + Grafana
- **APM**: Datadog ou New Relic (produção)

### Infrastructure
- **Container**: Docker
- **Orchestration**: Kubernetes (escalabilidade tenant isolation via namespaces)
- **CDN**: CloudFront/Cloudflare (assets, webhooks)
- **Object Storage**: S3 (documentos, backups)

---

## 2. Desenho de Módulos (Bounded Contexts - DDD)

```
┌─────────────────────────────────────────────────────────────────┐
│                      API Gateway + Auth                          │
│                (Rate Limit, CORS, Request Logging)              │
└────────────────┬────────────────────────────────────────────────┘
                 │
     ┌───────────┼───────────┬──────────┬──────────┬─────────┐
     │           │           │          │          │         │
┌────▼──┐ ┌─────▼──┐ ┌──────▼──┐ ┌───▼────┐ ┌──▼────┐ ┌───▼──┐
│Account│ │Contact │ │Opportunity
│& Org  │ │ & Lead │ │& Pipeline │ │Finance │ │Audit │ │Rules │
│       │ │ Mgmt   │ │(Deals)    │ │ & Pay  │ │System│ │Engine│
└───┬───┘ └───┬────┘ └────┬──────┘ └───┬────┘ └──┬───┘ └───┬──┘
    │         │            │            │         │         │
    └─────────┼────────────┼────────────┼─────────┼─────────┘
              │            │            │         │
         ┌────▼────────────▼────────────▼─────────▼───┐
         │        Event Bus (Kafka/Event Store)       │
         │    - Domain Events                         │
         │    - Audit Stream                          │
         └────┬──────────────────────────────────────┘
              │
    ┌─────────┼─────────┬──────────┐
    │         │         │          │
┌───▼──┐ ┌───▼──┐ ┌──▼────┐ ┌───▼────┐
│Queue │ │Analytics
│Worker│ │Cache │ │Search │ │Webhooks│
│(Jobs)│ │(Redis
│      │ │      │ │(ES)   │ │(Sync)  │
└──────┘ └──────┘ └───────┘ └────────┘
    │         │         │          │
    └─────────┼─────────┼──────────┘
              │
    ┌─────────▼──────────────────────┐
    │   Databases                     │
    │ - PostgreSQL (multi-tenant RLS) │
    │ - Audit DB (append-only)        │
    │ - Elasticsearch                 │
    │ - Redis (sessions/cache)        │
    └─────────────────────────────────┘
```

### Bounded Contexts Detalhados

#### 1. **Account & Organization (Identity & Tenancy)**
- User registration, SSO (OAuth2/SAML)
- Tenant provisioning
- Subscription management
- Domain validation (LGPD consent)
- **Output**: Domain events (UserCreated, TenantCreated, SubscriptionUpgraded)

#### 2. **Contact & Lead Management**
- CRUD contatos/leads
- Segmentação dinâmica (regras)
- Histórico de interações
- Campos customizados (JSONB)
- **Output**: ContactCreated, LeadConverted, InteractionLogged

#### 3. **Opportunity & Sales Pipeline**
- Deals, estágios, funil
- Previsão de vendas
- Relatórios de pipeline
- **Output**: DealCreated, DealMoved, DealClosed

#### 4. **Finance & Payments**
- Faturamento, invoices
- Integração com Stripe/Square
- Reconciliação
- Relatórios financeiros
- **Output**: PaymentProcessed, InvoiceGenerated, RefundRequested

#### 5. **Audit System**
- Event sourcing puro (append-only)
- Imutável (WORM)
- Consultas de auditoria
- Retenção por política LGPD
- **Output**: AuditEvent (internal only)

#### 6. **Rules Engine**
- Business rules dinâmicas (automações)
- Trigger em eventos
- Ações customizadas
- **Output**: RuleTriggered, RuleExecuted

#### 7. **Shared Services**
- RBAC & Permissions
- Notification (Email, SMS, Webhooks)
- Data Export (LGPD)
- Consent Management

---

## 3. Estratégia Multi-Tenant

### Escolha: **Row-Level Security (RLS) + Schema-per-Tenant (Hybrid)**

#### Por quê?

| Estratégia | Isolation | Complexity | Cost | Performance | Scale |
|------------|-----------|-----------|------|-------------|-------|
| **Row-Level (RLS)** | Compartilhado | ⭐ | ⭐ (Mínimo) | ⭐⭐⭐⭐ | 1000+ tenants |
| **Schema-per-T** | Isolado | ⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐⭐ | 100-500 tenants |
| **DB-per-Tenant** | 🔒 Máximo | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | 1-50 tenants |

### **Implementação Recomendada: RLS Base + Schema para Tenants Premium**

```sql
-- Base RLS Setup
CREATE TABLE tenants (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  plan ENUM ('starter', 'pro', 'enterprise'),
  schema_name VARCHAR(63) UNIQUE,  -- NULL = usa RLS
  created_at TIMESTAMP
);

CREATE TABLE contacts (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255),
  email VARCHAR(255),
  -- Colunas dinâmicas via JSONB
  custom_fields JSONB DEFAULT '{}',
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

-- RLS Policy
CREATE POLICY contacts_tenant_isolation ON contacts
  USING (tenant_id = current_setting('app.current_tenant_id')::UUID)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- Função para set tenant context
CREATE OR REPLACE FUNCTION set_tenant_context(tenant_uuid UUID)
RETURNS void AS $$
BEGIN
  PERFORM set_config('app.current_tenant_id', tenant_uuid::text, false);
END;
$$ LANGUAGE plpgsql;
```

### **Segregação de Dados Sensíveis (PII)**

```sql
-- Tabela segregada com acesso restrito
CREATE TABLE customer_pii (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  ssn_encrypted VARCHAR(255),  -- AES-256
  bank_account_encrypted VARCHAR(255),
  -- Auditoria imutável em tabela separada
  audit_log_id UUID,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

CREATE POLICY pii_access ON customer_pii
  USING (
    tenant_id = current_setting('app.current_tenant_id')::UUID 
    AND current_user_id() IN (SELECT user_id FROM role_assignments 
                              WHERE role = 'admin' OR role = 'compliance_officer')
  );
```

### **Estratégia de Escalabilidade**

```yaml
Tier Starter (RLS):
  - 1 Servidor PostgreSQL
  - Todos os tenants em schema público
  - Políticas RLS forçadas por app
  - Cache Redis compartilhado
  - Max: 10k+ tenants

Tier Pro (RLS + Isolamento):
  - RLS + secondary replica leitura
  - Read-only replica para relatórios pesados
  - Cache tenant-específico
  - Max: 100k tenants

Tier Enterprise (Schema-per-Tenant):
  - Schema dedicado por tenant
  - PostgreSQL dedicado ou RDS multi-AZ
  - Backup incremental diário
  - Compliance officer acesso limitado
  - Max: 1k tenants premium
```

---

## 4. Padrões Arquiteturais

### **Justificativa: Usar DDD + CQRS + Event-Driven (Seletivamente)**

#### ✅ **Usar CQRS Quando**:
- Finance (Pagamentos): Separar Command (ProcessPayment) de Query (GetInvoiceHistory)
- Audit System: Write-only (Append) + Read-optimized views
- Reporting: Queries complexas em snapshot separado

#### ✅ **Usar Event-Driven Quando**:
- Auditoria: Cada operação = evento imutável
- Notificações: DealClosed → dispara email, webhook
- Rules Engine: ContactCreated → avalia regras → executa ações

#### ❌ **Não Usar**:
- Simples CRUD (Contacts básicos): Overhead injustificado
- Operações síncronas críticas: Usar sync com fallback async

### **Implementação Prática: Layered + DDD**

```typescript
// src/contexts/contacts/domain/contact.entity.ts
@Entity()
export class Contact extends AggregateRoot {
  @PrimaryGeneratedColumn('uuid')
  id: UUID;

  @Column()
  tenantId: UUID;

  @Column()
  email: string;

  @Column('jsonb')
  customFields: Record<string, unknown>;

  // Domain events
  constructor(props: ContactProps) {
    super();
    Object.assign(this, props);
    this.addDomainEvent(new ContactCreatedEvent(this.id));
  }

  updateEmail(newEmail: string) {
    const oldEmail = this.email;
    this.email = newEmail;
    this.addDomainEvent(new ContactEmailChangedEvent(this.id, oldEmail, newEmail));
  }
}

// src/contexts/contacts/application/services/create-contact.service.ts
@Injectable()
export class CreateContactService implements ICommandHandler {
  constructor(
    private readonly repo: ContactRepository,
    private readonly auditService: AuditService,
    private readonly eventPublisher: EventPublisher,
  ) {}

  async execute(cmd: CreateContactCommand): Promise<Contact> {
    const contact = Contact.create(cmd);
    await this.repo.save(contact);
    
    // Publish domain events → Kafka
    await this.eventPublisher.publishAll(contact.getDomainEvents());
    
    // Audit log (redundant com event stream)
    await this.auditService.log({
      tenantId: cmd.tenantId,
      action: 'CONTACT_CREATED',
      resourceId: contact.id,
      changes: cmd,
      timestamp: new Date(),
    });

    return contact;
  }
}

// src/contexts/contacts/infrastructure/persistence/contact.repository.ts
@Injectable()
export class ContactRepository implements IContactRepository {
  constructor(private readonly db: Database) {}

  async save(contact: Contact): Promise<void> {
    const tenantId = getTenantContext(); // from middleware
    await this.db.query(
      `INSERT INTO contacts (id, tenant_id, email, custom_fields, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [contact.id, tenantId, contact.email, contact.customFields],
    );
  }

  async findById(id: UUID): Promise<Contact | null> {
    const tenantId = getTenantContext();
    const row = await this.db.query(
      `SELECT * FROM contacts WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
    return row ? Contact.reconstruct(row) : null;
  }
}
```

---

## 5. Modelo de Autorização (RBAC + ABAC)

### **Arquitetura: RBAC Base + ABAC para Policies Complexas**

```sql
-- RBAC Tables
CREATE TABLE roles (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  name VARCHAR(100),
  description TEXT,
  created_at TIMESTAMP
);

CREATE TABLE permissions (
  id UUID PRIMARY KEY,
  name VARCHAR(255) UNIQUE,  -- e.g., 'contact:read', 'payment:approve'
  resource VARCHAR(100),
  action VARCHAR(50),
  created_at TIMESTAMP
);

CREATE TABLE role_permissions (
  role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE user_roles (
  user_id UUID NOT NULL,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL,
  assigned_at TIMESTAMP,
  PRIMARY KEY (user_id, role_id, tenant_id)
);

-- ABAC: Attribute-based Conditions
CREATE TABLE permission_policies (
  id UUID PRIMARY KEY,
  permission_id UUID REFERENCES permissions(id),
  condition_type ENUM ('OWNER', 'TEAM_MEMBER', 'DEPARTMENT', 'CUSTOM_RULE'),
  condition_value JSONB,  -- e.g., {"department": "sales", "role_level": ">= manager"}
  created_at TIMESTAMP
);

-- Índices críticos
CREATE INDEX idx_user_roles_tenant ON user_roles(user_id, tenant_id);
CREATE INDEX idx_role_permissions ON role_permissions(role_id);
CREATE INDEX idx_contacts_tenant ON contacts(tenant_id);
```

### **Enforcement: Middleware + Service Layer**

```typescript
// src/shared/auth/rbac.guard.ts
@Injectable()
export class RBACGuard implements CanActivate {
  constructor(
    private readonly permissionService: PermissionService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const { userId, tenantId } = request.user;

    // Get required permission from decorator
    const requiredPermission = this.reflector.get<string>(
      'permission',
      context.getHandler(),
    );

    if (!requiredPermission) return true; // No requirement

    // Check cache first
    const cached = await this.permissionService.checkCachedPermission(
      userId,
      tenantId,
      requiredPermission,
    );

    if (cached !== null) return cached;

    // DB check + cache
    const hasPermission = await this.permissionService.hasPermission(
      userId,
      tenantId,
      requiredPermission,
    );

    return hasPermission;
  }
}

// src/shared/auth/permission.service.ts
@Injectable()
export class PermissionService {
  constructor(
    private readonly db: Database,
    private readonly cache: RedisService,
  ) {}

  async hasPermission(
    userId: UUID,
    tenantId: UUID,
    permission: string,
  ): Promise<boolean> {
    const cacheKey = `perm:${userId}:${tenantId}:${permission}`;
    
    // Redis cache 5min
    const cached = await this.cache.get(cacheKey);
    if (cached !== null) return cached === '1';

    // Query: user roles → role permissions
    const result = await this.db.query(
      `SELECT 1 FROM user_roles ur
       JOIN role_permissions rp ON ur.role_id = rp.role_id
       JOIN permissions p ON rp.permission_id = p.id
       WHERE ur.user_id = $1 
         AND ur.tenant_id = $2
         AND p.name = $3
       LIMIT 1`,
      [userId, tenantId, permission],
    );

    const hasAccess = result.length > 0;
    await this.cache.set(cacheKey, hasAccess ? '1' : '0', 300); // 5min TTL
    return hasAccess;
  }

  // ABAC Check (custom rules)
  async evaluateAttributePolicy(
    userId: UUID,
    tenantId: UUID,
    resource: string,
    action: string,
    attributes: Record<string, unknown>,
  ): Promise<boolean> {
    const policies = await this.db.query(
      `SELECT pp.condition_value FROM permission_policies pp
       JOIN permissions p ON pp.permission_id = p.id
       WHERE p.resource = $1 AND p.action = $2`,
      [resource, action],
    );

    for (const policy of policies) {
      if (this.evaluateCondition(policy.condition_value, attributes, userId)) {
        return true;
      }
    }
    return false;
  }

  private evaluateCondition(
    condition: Record<string, unknown>,
    attributes: Record<string, unknown>,
    userId: UUID,
  ): boolean {
    if (condition.type === 'OWNER') {
      return attributes.ownerId === userId;
    }
    if (condition.type === 'DEPARTMENT') {
      return attributes.department === condition.department;
    }
    // Custom rule evaluation
    return this.evaluateCustomRule(condition, attributes);
  }
}

// Decorator usage
@Post('/contacts')
@UseGuards(RBACGuard)
@CheckPermission('contact:create')
async createContact(@Body() cmd: CreateContactCommand) {
  return this.service.execute(cmd);
}
```

---

## 6. Estratégia de Auditoria Imutável (WORM)

### **Arquitetura: Event Sourcing + Append-Only Table**

```sql
-- Tabela de auditoria append-only
CREATE TABLE audit_events (
  id BIGSERIAL PRIMARY KEY,  -- Sequential ID
  event_id UUID UNIQUE NOT NULL,  -- Idempotency key
  tenant_id UUID NOT NULL,
  user_id UUID,
  action VARCHAR(100) NOT NULL,  -- CONTACT_CREATED, PAYMENT_PROCESSED, etc.
  resource_type VARCHAR(50),  -- contact, payment, user, etc.
  resource_id UUID,
  before_state JSONB,  -- Previous state
  after_state JSONB,   -- New state
  changes JSONB,       -- Diff
  ip_address INET,
  user_agent TEXT,
  metadata JSONB,  -- Custom data (e.g., reason, approval_id)
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  -- Índices para queries de auditoria
  CHECK (created_at >= CURRENT_TIMESTAMP - INTERVAL '10 years')
) PARTITION BY RANGE (created_at);

-- Partições por mês (auditoria pesada)
CREATE TABLE audit_events_2026_01 PARTITION OF audit_events
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
CREATE TABLE audit_events_2026_02 PARTITION OF audit_events
  FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');

-- Índices críticos
CREATE INDEX idx_audit_tenant_created ON audit_events(tenant_id, created_at DESC);
CREATE INDEX idx_audit_resource ON audit_events(resource_type, resource_id);
CREATE INDEX idx_audit_user ON audit_events(user_id, created_at DESC);
CREATE INDEX idx_audit_action ON audit_events(action);
CREATE UNIQUE INDEX idx_audit_event_id ON audit_events(event_id);

-- View para compliance (imutável)
CREATE IMMUTABLE VIEW audit_trail AS
SELECT * FROM audit_events
WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '7 years';
```

### **Kafka Event Stream (Redundancy)**

```typescript
// src/shared/audit/audit.service.ts
@Injectable()
export class AuditService {
  constructor(
    private readonly db: Database,
    private readonly kafka: KafkaService,
    private readonly logger: Logger,
  ) {}

  async logEvent(event: AuditEventDto): Promise<void> {
    const eventId = v4(); // Idempotency
    const now = new Date();

    try {
      // 1. Publish to Kafka FIRST (resiliency)
      await this.kafka.publish('audit-events', {
        eventId,
        ...event,
        timestamp: now.toISOString(),
      });

      // 2. Write to append-only table
      await this.db.query(
        `INSERT INTO audit_events 
        (event_id, tenant_id, user_id, action, resource_type, resource_id, 
         before_state, after_state, changes, ip_address, user_agent, metadata, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          eventId,
          event.tenantId,
          event.userId,
          event.action,
          event.resourceType,
          event.resourceId,
          JSON.stringify(event.beforeState || {}),
          JSON.stringify(event.afterState || {}),
          JSON.stringify(event.changes || {}),
          event.ipAddress,
          event.userAgent,
          JSON.stringify(event.metadata || {}),
          now,
        ],
      );

      this.logger.log(`Audit event ${eventId} logged`);
    } catch (error) {
      this.logger.error(`Audit logging failed: ${error.message}`);
      // Alert: Critical service down
      await this.alertService.sendCritical('Audit system failure');
      throw error;
    }
  }

  // Verificação de integridade (hash)
  async verifyIntegrity(eventId: UUID): Promise<boolean> {
    const event = await this.db.query(
      `SELECT *, 
              SHA256(CONCAT(event_id, tenant_id, created_at, action))::text as expected_hash
       FROM audit_events 
       WHERE event_id = $1`,
      [eventId],
    );

    if (!event) return false;

    // Compare com blockchain ou external notary (para enterprise)
    const isValid = await this.externalNotary.verify(eventId, event.expected_hash);
    return isValid;
  }

  // Query de auditoria
  async getAuditTrail(
    tenantId: UUID,
    filters: {
      startDate?: Date;
      endDate?: Date;
      userId?: UUID;
      action?: string;
      resourceId?: UUID;
    },
  ): Promise<AuditEvent[]> {
    let query = `SELECT * FROM audit_events WHERE tenant_id = $1`;
    const params: any[] = [tenantId];

    if (filters.startDate) {
      query += ` AND created_at >= $${params.length + 1}`;
      params.push(filters.startDate);
    }
    if (filters.endDate) {
      query += ` AND created_at < $${params.length + 1}`;
      params.push(filters.endDate);
    }
    if (filters.userId) {
      query += ` AND user_id = $${params.length + 1}`;
      params.push(filters.userId);
    }
    if (filters.action) {
      query += ` AND action = $${params.length + 1}`;
      params.push(filters.action);
    }
    if (filters.resourceId) {
      query += ` AND resource_id = $${params.length + 1}`;
      params.push(filters.resourceId);
    }

    query += ` ORDER BY created_at DESC LIMIT 10000`;
    return this.db.query(query, params);
  }
}

// Idempotency + duplication check
@Post('/contacts')
@Idempotent()
async createContact(
  @Headers('Idempotency-Key') idempotencyKey: string,
  @Body() cmd: CreateContactCommand,
) {
  return this.auditService.logEvent({
    action: 'CONTACT_CREATED',
    resourceType: 'contact',
    tenantId: cmd.tenantId,
    changes: cmd,
    metadata: { idempotencyKey },
  });
}
```

### **Retenção e Arquivamento (LGPD)**

```yaml
Política de Retenção:
  Auditoria Ativa (Acesso rápido):
    - 1 ano em hot storage (PostgreSQL)
    - Particionado por mês
    - Indices completos

  Auditoria Fria (Acesso lento, conformidade):
    - 6 anos em S3 (Glacier)
    - Comprimido + cifrado (AES-256)
    - Verificação de integridade mensal

  Eliminação (após prazo legal):
    - Anonimização antes de deletar
    - Audit log de deletion (meta-audit)
    - Certificado de destruição emitido
```

---

## 7. Estratégia de Performance

### **Indexação Crítica**

```sql
-- Multi-tenant queries (mais frequentes)
CREATE INDEX idx_contacts_tenant_email ON contacts(tenant_id, email)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_contacts_tenant_created ON contacts(tenant_id, created_at DESC);

-- Busca full-text (JSONB + GIN)
CREATE INDEX idx_custom_fields_gin ON contacts USING GIN (custom_fields);
CREATE INDEX idx_contact_search ON contacts USING GiST (
  to_tsvector('portuguese', name || ' ' || email)
);

-- Auditoria
CREATE INDEX idx_audit_partition ON audit_events(tenant_id, created_at DESC)
  TABLESPACE audit_space;  -- SSD dedicado

-- Acessos frequentes
CREATE INDEX idx_role_assignments_user ON user_roles(user_id, tenant_id);

-- BRIN para time-series (auditoria longa)
CREATE INDEX idx_audit_time_brin ON audit_events 
  USING BRIN (created_at) 
  WITH (pages_per_range = 128);
```

### **Particionamento de Tabelas Grandes**

```sql
-- Auditoria por data (query efficiency)
CREATE TABLE audit_events (
  ... (schema acima)
) PARTITION BY RANGE (YEAR(created_at), MONTH(created_at));

-- Contacts por tenant (para enterprise muito grande)
CREATE TABLE contacts (
  ... 
) PARTITION BY HASH (tenant_id) INTO 32;  -- Para 100k+ tenants
```

### **Caching Strategy**

```typescript
// src/shared/cache/cache.service.ts
@Injectable()
export class CacheService {
  constructor(private redis: RedisService) {}

  // Cache Tiers
  private readonly TTLs = {
    ROLE_PERMISSIONS: 300,  // 5min (muda raramente)
    USER_CONTACTS: 60,      // 1min (muda frequentemente)
    TENANT_SETTINGS: 3600,  // 1h
    AUDIT_SUMMARY: 1800,    // 30min
  };

  async getRolePermissions(userId: UUID, tenantId: UUID): Promise<string[]> {
    const key = `perms:${userId}:${tenantId}`;
    
    const cached = await this.redis.get(key);
    if (cached) return JSON.parse(cached);

    const perms = await this.db.query(
      `SELECT p.name FROM user_roles ur
       JOIN role_permissions rp ON ur.role_id = rp.role_id
       JOIN permissions p ON rp.permission_id = p.id
       WHERE ur.user_id = $1 AND ur.tenant_id = $2`,
      [userId, tenantId],
    );

    await this.redis.set(
      key,
      JSON.stringify(perms.map(p => p.name)),
      this.TTLs.ROLE_PERMISSIONS,
    );

    return perms;
  }

  // Invalidation pattern
  async invalidateUserPermissions(userId: UUID): Promise<void> {
    const pattern = `perms:${userId}:*`;
    await this.redis.deletePattern(pattern);
  }
}
```

### **Query Optimization**

```typescript
// N+1 Prevention: Batch loading
@Injectable()
export class ContactLoader {
  constructor(private db: Database) {}

  async batchLoadByIds(tenantId: UUID, ids: UUID[]): Promise<Map<UUID, Contact>> {
    const contacts = await this.db.query(
      `SELECT * FROM contacts WHERE tenant_id = $1 AND id = ANY($2)`,
      [tenantId, ids],
    );
    
    const map = new Map();
    contacts.forEach(c => map.set(c.id, c));
    return map;
  }
}

// Dataloader pattern (GraphQL-style)
@Injectable()
export class DataLoaderService {
  private loaders = new Map<string, DataLoader>();

  getContactLoader(tenantId: UUID): DataLoader {
    const key = `contact:${tenantId}`;
    if (!this.loaders.has(key)) {
      this.loaders.set(
        key,
        new DataLoader(
          async (ids: UUID[]) => {
            const contacts = await this.contactLoader.batchLoadByIds(tenantId, ids);
            return ids.map(id => contacts.get(id));
          },
          { cache: true }, // Cache during request
        ),
      );
    }
    return this.loaders.get(key);
  }
}
```

### **Aggregation & Reporting**

```typescript
// Materialized views para relatórios pesados
CREATE MATERIALIZED VIEW contact_summary AS
SELECT 
  tenant_id,
  COUNT(*) as total_contacts,
  COUNT(CASE WHEN email IS NOT NULL THEN 1 END) as contacts_with_email,
  COUNT(DISTINCT source) as unique_sources,
  MAX(created_at) as last_contact_created,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY lifetime_value) as median_value
FROM contacts
GROUP BY tenant_id;

CREATE INDEX idx_contact_summary_tenant ON contact_summary(tenant_id);

-- Refresh nightly ou com trigger incremental
REFRESH MATERIALIZED VIEW CONCURRENTLY contact_summary;

// Read from MV em queries
async getContactMetrics(tenantId: UUID) {
  return this.db.query(
    `SELECT * FROM contact_summary WHERE tenant_id = $1`,
    [tenantId],
  );
}
```

### **Search Optimization (Elasticsearch opcional)**

```yaml
Elasticsearch Strategy:
  Quando usar:
    - Full-text search: Contatos por nome/email
    - Agregações: Análise de leads por fonte
    - Analytics: Dashboard de vendas

  Implementação:
    - Índice separado por tenant (isolation)
    - Sync via Kafka (eventual consistency)
    - TTL: 30 dias (histórico, não source of truth)

  Query:
    GET /contacts-{tenant_id}/_search
    {
      "query": {
        "multi_match": {
          "query": "john",
          "fields": ["name^2", "email", "company"]
        }
      },
      "filter": {
        "range": {"created_at": {"gte": "2026-01-01"}}
      }
    }
```

---

## 8. Resiliência: Retries, Idempotência, Outbox, DLQ

### **Padrão Outbox (Garantia de Entrega)**

```sql
-- Outbox table (transactional guarantee)
CREATE TABLE outbox (
  id BIGSERIAL PRIMARY KEY,
  aggregate_id UUID NOT NULL,
  aggregate_type VARCHAR(100),
  event_type VARCHAR(100),
  payload JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  published_at TIMESTAMP,
  retry_count INT DEFAULT 0,
  last_error TEXT,
  CONSTRAINT outbox_published_check CHECK (published_at IS NULL OR published_at > created_at)
);

CREATE INDEX idx_outbox_unpublished ON outbox(created_at) 
  WHERE published_at IS NULL;
```

### **Outbox Publisher (Kafka)**

```typescript
// src/shared/outbox/outbox-publisher.service.ts
@Injectable()
export class OutboxPublisherService {
  constructor(
    private readonly db: Database,
    private readonly kafka: KafkaService,
    private readonly logger: Logger,
  ) {}

  // Durante transação de negócio
  async publishEvent(aggregateId: UUID, event: DomainEvent): Promise<void> {
    const db = this.db; // Usar mesma transação
    
    // Inserir evento E outbox entry na mesma transação
    await db.query(
      `INSERT INTO outbox (aggregate_id, aggregate_type, event_type, payload)
       VALUES ($1, $2, $3, $4)`,
      [
        aggregateId,
        event.aggregateType,
        event.type,
        JSON.stringify(event.payload),
      ],
    );
    // commit da transação pelo repositório
  }

  // Worker: Polling Outbox
  @Cron('*/5 * * * * *')  // A cada 5s
  async publishUnpublishedEvents(): Promise<void> {
    const unpublished = await this.db.query(
      `SELECT * FROM outbox 
       WHERE published_at IS NULL 
       AND retry_count < 5
       ORDER BY created_at ASC
       LIMIT 100`,
    );

    for (const entry of unpublished) {
      try {
        await this.kafka.publish(entry.event_type, entry.payload);
        
        await this.db.query(
          `UPDATE outbox SET published_at = NOW() WHERE id = $1`,
          [entry.id],
        );

        this.logger.log(`Outbox event ${entry.id} published`);
      } catch (error) {
        await this.db.query(
          `UPDATE outbox 
           SET retry_count = retry_count + 1,
               last_error = $2
           WHERE id = $1`,
          [entry.id, error.message],
        );

        this.logger.warn(
          `Outbox event ${entry.id} retry (attempt ${entry.retry_count + 1})`,
        );

        // Exponential backoff: esperar antes de retry
        if (entry.retry_count >= 5) {
          await this.alertService.sendAlert(
            `Outbox event ${entry.id} failed after 5 retries`,
          );
        }
      }
    }
  }
}
```

### **Idempotência**

```typescript
// src/shared/idempotency/idempotency.decorator.ts
@Injectable()
export class IdempotencyService {
  constructor(
    private readonly redis: RedisService,
    private readonly db: Database,
  ) {}

  async executeIdempotent<T>(
    idempotencyKey: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    // Check if already processed
    const cached = await this.redis.get(`idempotency:${idempotencyKey}`);
    if (cached) return JSON.parse(cached);

    // Execute
    const result = await fn();

    // Cache result (com TTL)
    await this.redis.set(
      `idempotency:${idempotencyKey}`,
      JSON.stringify(result),
      3600, // 1h
    );

    // Log in DB (audit trail)
    await this.db.query(
      `INSERT INTO idempotency_log (key, result) VALUES ($1, $2)
       ON CONFLICT (key) DO NOTHING`,
      [idempotencyKey, JSON.stringify(result)],
    );

    return result;
  }
}

// Uso em Controller
@Post('/payments')
async processPayment(
  @Headers('Idempotency-Key') key: string,
  @Body() cmd: ProcessPaymentCommand,
) {
  return this.idempotencyService.executeIdempotent(key, () =>
    this.paymentService.processPayment(cmd),
  );
}
```

### **Dead Letter Queue (DLQ)**

```typescript
// src/shared/messaging/dlq.service.ts
@Injectable()
export class DLQService {
  constructor(
    private readonly kafka: KafkaService,
    private readonly db: Database,
  ) {}

  async consumeWithDLQ(
    topic: string,
    handler: (msg: any) => Promise<void>,
  ): Promise<void> {
    this.kafka.subscribe(topic, async (message) => {
      let retries = 0;
      const maxRetries = 3;

      while (retries < maxRetries) {
        try {
          await handler(message);
          return; // Success
        } catch (error) {
          retries++;
          this.logger.warn(
            `Message processing failed (retry ${retries}/${maxRetries}): ${error.message}`,
          );

          if (retries < maxRetries) {
            // Exponential backoff
            await this.sleep(Math.pow(2, retries) * 1000);
          }
        }
      }

      // All retries exhausted → DLQ
      await this.kafka.publish('dlq', {
        originalTopic: topic,
        message,
        error: error.message,
        timestamp: new Date(),
      });

      // Log para manual review
      await this.db.query(
        `INSERT INTO dead_letters (topic, message, error, created_at)
         VALUES ($1, $2, $3, NOW())`,
        [topic, JSON.stringify(message), error.message],
      );

      // Alert
      await this.alertService.sendAlert(
        `Message sent to DLQ from topic ${topic}`,
      );
    });
  }

  // Manual DLQ processing
  async processDLQMessage(dlqId: UUID): Promise<void> {
    const dlq = await this.db.query(
      `SELECT * FROM dead_letters WHERE id = $1`,
      [dlqId],
    );

    if (!dlq) throw new Error('DLQ message not found');

    // Reprocess ou escalate
    // Normalmente: análise humana → correção → replay
  }
}
```

### **Retry Policy (Exponential Backoff)**

```typescript
// src/shared/resilience/retry.decorator.ts
export function Retry(options: {
  maxAttempts?: number;
  delay?: number;
  backoff?: 'linear' | 'exponential';
} = {}) {
  const { maxAttempts = 3, delay = 1000, backoff = 'exponential' } = options;

  return function decorator(
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ) {
    const original = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      let lastError: Error;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          return await original.apply(this, args);
        } catch (error) {
          lastError = error;
          
          if (attempt < maxAttempts) {
            const waitTime =
              backoff === 'exponential'
                ? delay * Math.pow(2, attempt - 1)
                : delay * attempt;

            this.logger?.warn(
              `Attempt ${attempt}/${maxAttempts} failed. Retrying in ${waitTime}ms...`,
            );

            await new Promise(resolve => setTimeout(resolve, waitTime));
          }
        }
      }

      throw lastError;
    };

    return descriptor;
  };
}

// Uso
@Retry({ maxAttempts: 3, backoff: 'exponential' })
async sendWebhook(url: string, payload: any): Promise<void> {
  return this.httpClient.post(url, payload).toPromise();
}
```

### **Circuit Breaker (External Services)**

```typescript
// src/shared/resilience/circuit-breaker.ts
@Injectable()
export class CircuitBreakerService {
  private breakers = new Map<string, CircuitBreaker>();

  getBreaker(service: string): CircuitBreaker {
    if (!this.breakers.has(service)) {
      this.breakers.set(
        service,
        new CircuitBreaker(
          {
            name: service,
            fallback: this.fallback.bind(this),
            rollingCountTimeout: 10000,
            rollingCountBuckets: 10,
            name: service,
            volumeThreshold: 5,
            errorThresholdPercentage: 50,
            resetTimeout: 30000,
          },
        ),
      );
    }
    return this.breakers.get(service);
  }

  async executeWithBreaker<T>(
    service: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    const breaker = this.getBreaker(service);
    return breaker.execute(fn);
  }

  private fallback(error: Error, args: any[]) {
    this.logger.error(
      `Circuit breaker open for service. Fallback activated: ${error.message}`,
    );
    // Retornar cached data, default value, ou lançar erro customizado
  }
}
```

---

## 9. Checklist LGPD + Políticas de Retenção

### **LGPD Compliance Checklist**

- [ ] **Consentimento**
  - [ ] Explicit opt-in para coleta de dados
  - [ ] Registrar consent_given_at e consent_document_id
  - [ ] Opção de revogação de consentimento
  - [ ] Terceiros mencionados explicitamente

- [ ] **Retenção de Dados**
  - [ ] Policy definida por data type (contatos: 3 anos pós-contrato)
  - [ ] Automação de exclusão via cron job
  - [ ] Auditoria de deleção (meta-audit)
  - [ ] Backup retention policy alinhada

- [ ] **Direito ao Esquecimento**
  - [ ] Endpoint `DELETE /data/user/{id}` (pseudonymization)
  - [ ] Cascata: deletar contatos → leads → opportunities → interactions
  - [ ] Audit trail do processo
  - [ ] Email de confirmação ao usuário

- [ ] **Transparência & Acesso**
  - [ ] Endpoint `GET /data/user/{id}/export` (GDPR format)
  - [ ] Formato: JSON estruturado + PDF
  - [ ] Download dentro de 30 dias
  - [ ] Histórico de acessos à própria data

- [ ] **Segurança**
  - [ ] Criptografia em trânsito (TLS 1.3+)
  - [ ] Criptografia em repouso (AES-256)
  - [ ] Access logging (quem acessou, quando)
  - [ ] Intrusion detection

- [ ] **DPO & Governance**
  - [ ] Data Processing Agreement (DPA) com tenants
  - [ ] Privacy Policy atualizada
  - [ ] Data Inventory (mapa de dados sensíveis)
  - [ ] Risk Assessment (DPIA)

- [ ] **Notificação de Breach**
  - [ ] Alertas automáticos em acesso suspeito
  - [ ] Escalação para compliance officer
  - [ ] Notificar autoridades em 72h

### **Data Retention Policy Table**

```sql
CREATE TABLE retention_policies (
  id UUID PRIMARY KEY,
  data_type VARCHAR(100),  -- 'contact', 'payment', 'audit', etc.
  retention_days INT,
  reason VARCHAR(255),  -- 'contractual', 'legal', 'business'
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  activated_by_user_id UUID REFERENCES users(id)
);

INSERT INTO retention_policies VALUES
('contact', 1095, 'Contractual relationship + 3 years'),
('payment', 2555, 'Tax requirement + 7 years'),
('audit', 2555, 'Compliance + 7 years'),
('session', 30, 'Security'),
('temp_download', 30, 'Cleanup'),
('consent_revoked', 90, 'Right to forget transition');
```

### **Automated Deletion Cron**

```typescript
// src/shared/compliance/retention-cleanup.service.ts
@Injectable()
export class RetentionCleanupService {
  constructor(
    private readonly db: Database,
    private readonly auditService: AuditService,
    private readonly logger: Logger,
  ) {}

  @Cron('0 2 * * *')  // 2 AM daily
  async cleanupExpiredData(): Promise<void> {
    const policies = await this.db.query(
      `SELECT * FROM retention_policies`,
    );

    for (const policy of policies) {
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() - policy.retention_days);

      // Soft delete (preserve audit trail)
      await this.db.query(
        `UPDATE ${policy.data_type}s 
         SET deleted_at = NOW(), deletion_reason = 'automated_retention'
         WHERE created_at < $1 AND deleted_at IS NULL`,
        [expiryDate],
      );

      // Audit meta-deletion
      await this.auditService.logEvent({
        action: 'DATA_RETENTION_CLEANUP',
        resourceType: policy.data_type,
        metadata: { retention_days: policy.retention_days },
      });

      this.logger.log(
        `Cleaned up ${policy.data_type} older than ${expiryDate.toISOString()}`,
      );
    }

    // Hard delete após 30 dias de soft delete (para LGPD)
    await this.db.query(
      `DELETE FROM contacts WHERE deleted_at IS NOT NULL 
       AND deleted_at < NOW() - INTERVAL '30 days'`,
    );
  }

  // Right to be forgotten
  async anonymizeUser(userId: UUID, tenantId: UUID): Promise<void> {
    const transaction = await this.db.beginTransaction();

    try {
      // 1. Pseudonymize PII
      await transaction.query(
        `UPDATE contacts 
         SET 
           email = CONCAT('deleted_', MD5(id)::text, '@deleted.local'),
           name = 'Deleted User',
           phone = NULL,
           custom_fields = custom_fields - 'ssn'
         WHERE tenant_id = $1 AND created_by = $2`,
        [tenantId, userId],
      );

      // 2. Log deletion
      await this.auditService.logEvent({
        action: 'USER_DATA_ANONYMIZED',
        tenantId,
        userId,
        metadata: { reason: 'right_to_be_forgotten' },
      });

      // 3. Email confirmation
      await this.notificationService.sendEmail(userId, {
        template: 'data-deletion-confirmation',
        timestamp: new Date().toISOString(),
      });

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  // GDPR Export
  async exportUserData(userId: UUID, tenantId: UUID): Promise<ExportBundle> {
    const contacts = await this.db.query(
      `SELECT * FROM contacts WHERE tenant_id = $1 AND created_by = $2`,
      [tenantId, userId],
    );

    const interactions = await this.db.query(
      `SELECT * FROM interactions WHERE tenant_id = $1 AND user_id = $2`,
      [tenantId, userId],
    );

    const auditLog = await this.db.query(
      `SELECT * FROM audit_events WHERE tenant_id = $1 AND user_id = $2
       ORDER BY created_at DESC LIMIT 1000`,
      [tenantId, userId],
    );

    return {
      contacts,
      interactions,
      auditLog,
      exportedAt: new Date(),
    };
  }
}
```

---

## 10. Diagrama Textual da Arquitetura

```
╔═════════════════════════════════════════════════════════════════════════════╗
║                    CRM SaaS Multi-Tenant Enterprise                          ║
║                            Architecture Overview                             ║
╚═════════════════════════════════════════════════════════════════════════════╝

┌──────────────────────────────────────────────────────────────────────────────┐
│                          CLIENT LAYER (Browser)                              │
├──────────────────────────────────────────────────────────────────────────────┤
│  React SPA / Vue / Angular (Tenant-aware UI)                                 │
│  Stores: Redux (auth, tenant context)                                       │
│  Locale: pt-BR / es / en                                                     │
└──────────────────────┬───────────────────────────────────────────────────────┘
                       │ HTTPS/TLS 1.3
                       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                          API GATEWAY LAYER                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────────────────────┐  │
│ │ API Gateway (Kong / AWS APIGateway)                                     │  │
│ │  - Request validation (OpenAPI 3.0)                                     │  │
│ │  - Rate limiting (tenant/user level)                                    │  │
│ │  - CORS, JWT validation                                                │  │
│ │  - Request logging + tracing (X-Trace-ID)                              │  │
│ │  - Route to microservices                                              │  │
│ └─────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│ ┌─────────────────────────────────────────────────────────────────────────┐  │
│ │ Authentication Service                                                   │  │
│ │  - JWT generation (HS256 / RS256)                                       │  │
│ │  - SSO: OAuth2 (Google, GitHub), SAML (Enterprise)                      │  │
│ │  - MFA: TOTP, SMS                                                       │  │
│ │  - Session store (Redis)                                                │  │
│ └─────────────────────────────────────────────────────────────────────────┘  │
└──────────────┬───────────────────────────────────────────────────┬───────────┘
               │ Set tenant context via middleware                  │
               ▼                                                    ▼
         ┌──────────────────────┐                       ┌───────────────────────┐
         │ extract from JWT     │                       │ extract from subdomain│
         │ set_tenant_context() │                       │ or header             │
         └──────────────────────┘                       └───────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│                        MICROSERVICES LAYER (NestJS)                          │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Account & Organization Microservice                                    │ │
│  │ ┌──────────────────────────────────────────────────────────────────┐  │ │
│  │ │ API Routes:                                                      │  │ │
│  │ │  POST   /tenants                    (Create org)               │  │ │
│  │ │  GET    /tenants/{id}              (Get details)              │  │ │
│  │ │  PATCH  /tenants/{id}              (Update settings)          │  │ │
│  │ │  DELETE /tenants/{id}              (Soft delete)              │  │ │
│  │ │  POST   /users                      (Invite user)             │  │ │
│  │ │  PATCH  /users/{id}/roles          (Assign roles)            │  │ │
│  │ │  GET    /subscriptions/{id}        (Billing info)            │  │ │
│  │ └──────────────────────────────────────────────────────────────┘  │ │
│  │ ┌──────────────────────────────────────────────────────────────────┐  │ │
│  │ │ Domain Logic (DDD):                                              │  │ │
│  │ │  - TenantAggregateRoot                                           │  │ │
│  │ │  - TenantRepository (DB persistence)                            │  │ │
│  │ │  - CreateTenantCommand / TenantCreatedEvent                     │  │ │
│  │ └──────────────────────────────────────────────────────────────────┘  │ │
│  │ ┌──────────────────────────────────────────────────────────────────┐  │ │
│  │ │ Event Publishing:                                                │  │ │
│  │ │  - TenantCreatedEvent → Kafka (outbox pattern)                   │  │ │
│  │ │  - UserInvitedEvent → send welcome email                        │  │ │
│  │ │  - SubscriptionUpgradedEvent → provision resources              │  │ │
│  │ └──────────────────────────────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Contact & Lead Management Microservice                                 │ │
│  │ ┌──────────────────────────────────────────────────────────────────┐  │ │
│  │ │ API Routes:                                                      │  │ │
│  │ │  POST   /contacts              (Create contact + validation)   │  │ │
│  │ │  GET    /contacts              (List, filter, search)         │  │ │
│  │ │  GET    /contacts/{id}         (Detail + history)             │  │ │
│  │ │  PATCH  /contacts/{id}         (Update w/ change tracking)    │  │ │
│  │ │  DELETE /contacts/{id}         (Soft delete)                  │  │ │
│  │ │  POST   /contacts/{id}/fields  (Set custom fields)            │  │ │
│  │ │  POST   /contacts/bulk-import  (CSV/Excel import)             │  │ │
│  │ │  GET    /contacts/export       (LGPD export)                  │  │ │
│  │ └──────────────────────────────────────────────────────────────┘  │ │
│  │ ┌──────────────────────────────────────────────────────────────────┐  │ │
│  │ │ Features:                                                        │  │ │
│  │ │  - JSONB custom fields (dynamism)                               │  │ │
│  │ │  - Full-text search (name, email, company)                      │  │ │
│  │ │  - Tags & segments (dynamic groups)                             │  │ │
│  │ │  - Duplicate detection (email, phone)                           │  │ │
│  │ │  - Timeline: interactions, calls, emails, notes                 │  │ │
│  │ │  - Attachments (S3)                                             │  │ │
│  │ │  - Activity scoring (weighted events)                           │  │ │
│  │ └──────────────────────────────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Opportunity & Sales Pipeline Microservice                              │ │
│  │ ┌──────────────────────────────────────────────────────────────────┐  │ │
│  │ │ API Routes:                                                      │  │ │
│  │ │  POST   /deals                  (Create deal)                  │  │ │
│  │ │  PATCH  /deals/{id}/stage       (Move in pipeline)             │  │ │
│  │ │  GET    /deals/forecast         (Win forecast)                 │  │ │
│  │ │  GET    /pipeline/analytics     (Conversion rates)             │  │ │
│  │ │  POST   /deals/{id}/activities  (Log calls, emails)            │  │ │
│  │ └──────────────────────────────────────────────────────────────────┘  │ │
│  │ ┌──────────────────────────────────────────────────────────────────┐  │ │
│  │ │ Features:                                                        │  │ │
│  │ │  - Configurable pipeline stages (per org)                       │  │ │
│  │ │  - Probability weighting                                        │  │ │
│  │ │  - Expected value calculation                                   │  │ │
│  │ │  - Forecast accuracy tracking                                   │  │ │
│  │ │  - Activity auto-logging from integrations                      │  │ │
│  │ │  - Deal split/won/lost tracking                                 │  │ │
│  │ └──────────────────────────────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Finance & Payments Microservice (CQRS pattern)                          │ │
│  │ ┌──────────────────────────────────────────────────────────────────┐  │ │
│  │ │ Commands:                                                        │  │ │
│  │ │  POST   /invoices                (Generate from deals)         │  │ │
│  │ │  POST   /payments                (Process via Stripe/Square)   │  │ │
│  │ │  POST   /payments/{id}/refund    (Refund request)              │  │ │
│  │ │                                                                 │  │ │
│  │ │ Queries:                                                        │  │ │
│  │ │  GET    /invoices                (List, filter by tenant)      │  │ │
│  │ │  GET    /invoices/{id}           (Detail + history)            │  │ │
│  │ │  GET    /financials/summary      (Dashboard metrics)           │  │ │
│  │ │  GET    /financials/reconciliation (A/R status)                │  │ │
│  │ └──────────────────────────────────────────────────────────────────┘  │ │
│  │ ┌──────────────────────────────────────────────────────────────────┐  │ │
│  │ │ Features:                                                        │  │ │
│  │ │  - Multi-currency (BRL, USD, EUR)                               │  │ │
│  │ │  - Tax calculation (ICMS, ISS, PIS/COFINS)                      │  │ │
│  │ │  - Payment gateway abstraction (Stripe, Square, Adyen)          │  │ │
│  │ │  - Idempotency key enforcement                                  │  │ │
│  │ │  - Webhook reconciliation                                       │  │ │
│  │ │  - PCI DSS compliance (no card storage)                         │  │ │
│  │ │  - Soft delete for audit trail                                  │  │ │
│  │ └──────────────────────────────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Audit System Microservice (Event Sourcing puro)                         │ │
│  │ ┌──────────────────────────────────────────────────────────────────┐  │ │
│  │ │ API Routes:                                                      │  │ │
│  │ │  GET    /audit/trail              (Query audit log)             │  │ │
│  │ │  GET    /audit/{resourceId}       (Resource history)            │  │ │
│  │ │  GET    /audit/export             (Compliance export)           │  │ │
│  │ │  POST   /audit/verify             (Integrity check)             │  │ │
│  │ └──────────────────────────────────────────────────────────────────┘  │ │
│  │ ┌──────────────────────────────────────────────────────────────────┐  │ │
│  │ │ Implementation:                                                  │  │ │
│  │ │  - Append-only table (audit_events)                             │  │ │
│  │ │  - Partitioned by date (query performance)                      │  │ │
│  │ │  - Immutable view (archive table)                               │  │ │
│  │ │  - Dual-write to Kafka (redundancy)                             │  │ │
│  │ │  - SHA256 hash verification (integrity)                         │  │ │
│  │ │  - Retention policy enforcement                                 │  │ │
│  │ │  - DPO access control (read-only)                               │  │ │
│  │ └──────────────────────────────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Rules Engine Microservice                                              │ │
│  │ ┌──────────────────────────────────────────────────────────────────┐  │ │
│  │ │ API Routes:                                                      │  │ │
│  │ │  POST   /rules                  (Create automation rule)       │  │ │
│  │ │  GET    /rules                  (List rules)                   │  │ │
│  │ │  GET    /rules/{id}/executions  (Audit rule runs)              │  │ │
│  │ │  DELETE /rules/{id}             (Deactivate)                   │  │ │
│  │ └──────────────────────────────────────────────────────────────────┘  │ │
│  │ ┌──────────────────────────────────────────────────────────────────┐  │ │
│  │ │ Rules Examples:                                                  │  │ │
│  │ │  IF   contact.created AND source = "web"                        │  │ │
│  │ │  THEN assign to sales.team[round-robin]                        │  │ │
│  │ │                                                                 │  │ │
│  │ │  IF   deal.value > 100k AND stage = "negotiation"              │  │ │
│  │ │  THEN send email to [sales_director]                           │  │ │
│  │ │                                                                 │  │ │
│  │ │  IF   payment.status = "failed" AND attempts > 3                │  │ │
│  │ │  THEN webhook to support_system, create ticket                 │  │ │
│  │ └──────────────────────────────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Shared Services (Library NestJS Module)                                │ │
│  │ ┌──────────────────────────────────────────────────────────────────┐  │ │
│  │ │ 1. RBAC Service                                                  │  │ │
│  │ │    - Check permissions (cached in Redis)                        │  │ │
│  │ │    - ABAC policy evaluation                                     │  │ │
│  │ │    - Role assignment management                                 │  │ │
│  │ │                                                                 │  │ │
│  │ │ 2. Notification Service                                         │  │ │
│  │ │    - Email (Sendgrid / AWS SES)                                │  │ │
│  │ │    - SMS (Twilio)                                              │  │ │
│  │ │    - In-app (push via WebSocket)                               │  │ │
│  │ │    - Webhooks (outgoing integrations)                          │  │ │
│  │ │                                                                 │  │ │
│  │ │ 3. Storage Service                                              │  │ │
│  │ │    - S3 abstraction (upload, delete, signed URLs)              │  │ │
│  │ │    - Virus scan (ClamAV)                                       │  │ │
│  │ │    - CDN caching (CloudFront)                                  │  │ │
│  │ │                                                                 │  │ │
│  │ │ 4. Compliance Service                                           │  │ │
│  │ │    - GDPR export (user data download)                          │  │ │
│  │ │    - Right to forget (anonymization)                           │  │ │
│  │ │    - Retention policy enforcement                              │  │ │
│  │ │    - Consent tracking                                          │  │ │
│  │ │                                                                 │  │ │
│  │ │ 5. Integration Service                                          │  │ │
│  │ │    - Zapier, Make, n8n webhooks                                │  │ │
│  │ │    - Email sync (Nylas)                                        │  │ │
│  │ │    - Calendar (Google Calendar API)                            │  │ │
│  │ └──────────────────────────────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
                                   │
                    ┌──────────────┼──────────────┐
                    │              │              │
                    ▼              ▼              ▼
        ┌──────────────┐  ┌───────────────┐  ┌─────────┐
        │   Event Bus  │  │  Data Layer   │  │ Workers │
        │   (Kafka)    │  │  (PostgreSQL) │  │ (Queue) │
        └──────────────┘  └───────────────┘  └─────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│                            EVENT BUS LAYER (Kafka)                           │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Topics (Event Streams):                                                    │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ tenant-events (Replicas: 3, Retention: 30 days)                     │  │
│  │  - TenantCreated                                                    │  │
│  │  - SubscriptionUpgraded                                             │  │
│  │  - TenantDeleted                                                    │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ contact-events (Replicas: 3, Retention: 90 days)                    │  │
│  │  - ContactCreated (triggers: rules, webhooks)                       │  │
│  │  - ContactUpdated                                                   │  │
│  │  - ContactDeleted (GDPR compliance)                                 │  │
│  │  - Consumers: RulesEngine, Notifications, Analytics                │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ deal-events (Replicas: 3, Retention: 90 days)                       │  │
│  │  - DealCreated → assignment rule                                    │  │
│  │  - DealMoved (stage change) → notification                          │  │
│  │  - DealClosed (won/lost) → invoice generation                       │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ audit-events (Replicas: 3, Retention: 7 YEARS)                      │  │
│  │  - Every CREATE, UPDATE, DELETE operation                           │  │
│  │  - Immutable: append-only with distributed logging                  │  │
│  │  - Consumers: Audit service (DB), Compliance checks                │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ payment-events (Replicas: 3, Retention: 7 years, PCI scope)         │  │
│  │  - PaymentRequested (Stripe async webhook)                          │  │
│  │  - PaymentSucceeded → Invoice marked paid                           │  │
│  │  - PaymentFailed → Retry logic + notification                       │  │
│  │  - RefundRequested                                                  │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ notification-events (Replicas: 2, Retention: 30 days)               │  │
│  │  - EmailRequested (to: Sendgrid worker)                             │  │
│  │  - SMSRequested                                                     │  │
│  │  - WebhookTriggered (to: integration worker)                        │  │
│  │  - Consumers: Notification workers (email, SMS, webhook)            │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  Consumer Groups:                                                           │
│  - audit-consumer       : Persists to audit DB                             │
│  - rules-consumer       : Evaluates business rules                         │
│  - notification-consumer: Sends emails/SMS                                 │
│  - analytics-consumer   : Updates materialized views                       │
│  - search-consumer      : Indexes in Elasticsearch                         │
│                                                                              │
│  DLQ Topics (Failures):                                                     │
│  - contact-events-dlq      (manual intervention)                            │
│  - payment-events-dlq      (payment reconciliation)                         │
│  - notification-events-dlq (retry logic)                                    │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│                        DATA LAYER (PostgreSQL + Redis)                       │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  PRIMARY PostgreSQL Cluster (Multi-AZ)                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ Master Node (us-east-1a)                                             │  │
│  │  - Replication: synchronous to standby                              │  │
│  │  - Backups: WAL archiving to S3                                     │  │
│  │  - Schemas:                                                          │  │
│  │    ├─ public (RLS-enabled multi-tenant tables)                       │  │
│  │    │  ├─ tenants                                                    │  │
│  │    │  ├─ users                                                      │  │
│  │    │  ├─ contacts (+ custom_fields JSONB, RLS policies)             │  │
│  │    │  ├─ deals                                                      │  │
│  │    │  ├─ interactions                                               │  │
│  │    │  ├─ invoices                                                   │  │
│  │    │  ├─ payments                                                   │  │
│  │    │  ├─ audit_events (append-only, partitioned by date)           │  │
│  │    │  ├─ outbox (transactional outbox for Kafka)                    │  │
│  │    │  └─ idempotency_log (deduplication)                            │  │
│  │    │                                                                 │  │
│  │    ├─ roles_schema (RBAC)                                            │  │
│  │    │  ├─ roles                                                      │  │
│  │    │  ├─ permissions                                                │  │
│  │    │  ├─ role_permissions                                           │  │
│  │    │  ├─ user_roles                                                 │  │
│  │    │  └─ permission_policies (ABAC rules)                           │  │
│  │    │                                                                 │  │
│  │    ├─ pii_schema (segregated, stricter RLS)                         │  │
│  │    │  ├─ customer_pii (encrypted fields)                            │  │
│  │    │  └─ payment_methods (PCI DSS compliance)                       │  │
│  │    │                                                                 │  │
│  │    └─ compliance_schema                                              │  │
│  │       ├─ consent_logs                                               │  │
│  │       ├─ retention_policies                                         │  │
│  │       └─ data_deletions                                             │  │
│  │                                                                     │  │
│  │  Partitioning:                                                      │  │
│  │  - contacts: by tenant_id (for enterprise tier)                     │  │
│  │  - audit_events: by month (rolling 7 years)                         │  │
│  │  - interactions: by tenant_id + date (historical)                   │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  REPLICA PostgreSQL (Async, us-east-1b)                                     │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ Read-only for:                                                       │  │
│  │  - Audit queries (historical)                                        │  │
│  │  - Heavy analytics (materialized views)                              │  │
│  │  - Compliance exports (GDPR)                                         │  │
│  │  - Reporting dashboard                                              │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  AUDIT Archive PostgreSQL (S3 + Glacier, 7 years)                            │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ Immutable copy of audit_events                                       │  │
│  │ - Quarterly snapshots                                                │  │
│  │ - Compressed + AES-256 encrypted                                     │  │
│  │ - Quarterly integrity checks (SHA256 verification)                   │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  REDIS Cache Layer                                                          │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ Cache Cluster (Sentinel High Availability)                           │  │
│  │                                                                       │  │
│  │ Structures:                                                           │  │
│  │  String:                                                              │  │
│  │   perm:{user_id}:{tenant_id}      → cached permissions (5min TTL)    │  │
│  │   idempotency:{key}               → idempotency response (1h TTL)    │  │
│  │   session:{session_id}            → user session (24h TTL)          │  │
│  │                                                                       │  │
│  │  Hash:                                                                │  │
│  │   contact:{id}                    → contact details (1min)           │  │
│  │   tenant:{id}:settings            → org config (1h)                  │  │
│  │                                                                       │  │
│  │  Sorted Set:                                                          │  │
│  │   rate_limit:{user_id}            → sliding window (per minute)      │  │
│  │   trending_contacts:{tenant_id}   → recent contacts (30 days)        │  │
│  │                                                                       │  │
│  │  Stream:                                                              │  │
│  │   audit_stream                    → pre-write audit queue (backup)   │  │
│  │   notification_queue              → pending notifications (async)    │  │
│  │                                                                       │  │
│  │  Pub/Sub:                                                             │  │
│  │   real-time.{tenant_id}           → WebSocket broadcasts             │  │
│  │   audit.{resource_id}             → live audit log subscribers       │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ELASTICSEARCH (Optional, for search)                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ Indices:                                                              │  │
│  │  contacts-{year}-{month}          → full-text search                 │  │
│  │  audit-{year}-{month}             → compliance search                │  │
│  │                                                                       │  │
│  │ Sync via Kafka consumer:                                              │  │
│  │  contact-events → ES index (async, 5sec lag)                         │  │
│  │  TTL: 30 days (snapshot, not authoritative)                          │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│                      WORKER/JOB QUEUE LAYER (Bull/RabbitMQ)                  │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Job Queues (Scalable workers, auto-retry):                                │
│                                                                              │
│  ┌─────────────────────┐  ┌─────────────────────┐  ┌──────────────────┐   │
│  │ Email Queue         │  │ SMS Queue           │  │ Webhook Queue    │   │
│  │ Bull/RabbitMQ       │  │ Bull/RabbitMQ       │  │ Bull/RabbitMQ    │   │
│  │                     │  │                     │  │                  │   │
│  │ Jobs:              │  │ Jobs:              │  │ Jobs:            │   │
│  │ - SendEmail         │  │ - SendSMS           │  │ - InvokeWebhook  │   │
│  │ - NewsleterEmails   │  │ - OTPVerification   │  │ - RetrySyncErr   │   │
│  │ - ImportContacts    │  │ - PaymentReminder   │  │ - IntegrationSA  │   │
│  │ - DailyReports      │  │                     │  │                  │   │
│  │                     │  │ Workers: 10+        │  │ Workers: 5       │   │
│  │ Workers: 20+ (CPU)  │  │ (I/O bound)         │  │ (timeout 60s)    │   │
│  │ (I/O async)         │  │ Max retries: 5      │  │ DLQ on failure   │   │
│  │ Max retries: 3      │  │ Backoff: exp        │  │                  │   │
│  │ Backoff: exp        │  │                     │  │                  │   │
│  └─────────────────────┘  └─────────────────────┘  └──────────────────┘   │
│                                                                              │
│  ┌─────────────────────┐  ┌─────────────────────┐  ┌──────────────────┐   │
│  │ Data Cleanup        │  │ Audit Archival      │  │ Notification     │   │
│  │ (Cron)              │  │ (Monthly)           │  │ (Real-time)      │   │
│  │                     │  │                     │  │                  │   │
│  │ Jobs:              │  │ Jobs:              │  │ Features:        │   │
│  │ - DeleteExpired     │  │ - ArchiveAuditDB    │  │ - WebSocket emit │   │
│  │ - CompressArchives  │  │ - VerifyIntegrity   │  │ - event routing  │   │
│  │ - AnonymizeGDPR     │  │ - NotifyCompliance  │  │ - tenant-scoped  │   │
│  │                     │  │ - BackupToGlacier   │  │ - read receipts  │   │
│  │ Schedule: daily     │  │ Schedule: monthly   │  │                  │   │
│  │ (2 AM UTC)          │  │ (3 AM UTC)          │  │ Connections: 5k+ │   │
│  └─────────────────────┘  └─────────────────────┘  └──────────────────┘   │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────┐      │
│  │ Reports & Analytics Processing (Heavy lifting)                  │      │
│  │ Bull Queue with workers in dedicated pod                        │      │
│  │                                                                 │      │
│  │ Jobs:                                                            │      │
│  │ - GenerateSalesForecast (monthly, ~100s per tenant)            │      │
│  │ - ExportContactsCSV (user-triggered, max 100k rows)            │      │
│  │ - DailyActivityDigest (async, scheduled)                       │      │
│  │ - ComplianceReportGen (LGPD audit trail export)                │      │
│  │ - MLScoring (lead probability, churn risk)                     │      │
│  │                                                                 │      │
│  │ Workers: 5 (CPU heavy, dedicated EC2)                           │      │
│  │ Memory: 4GB per worker                                          │      │
│  │ Timeout: 30 minutes                                             │      │
│  │ Retries: 2 (compute intensive)                                 │      │
│  └─────────────────────────────────────────────────────────────────┘      │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│                       OBSERVABILITY LAYER                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Tracing (Distributed)                                                      │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ Jaeger / OpenTelemetry Collector                                    │  │
│  │  - Trace every request (API → Services → DB)                       │  │
│  │  - Sample rate: 10% production, 100% staging                       │  │
│  │  - Latency SLI: P99 < 500ms                                        │  │
│  │  - Alerts: > 1s response time                                      │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  Metrics (Prometheus)                                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ Key Metrics:                                                         │  │
│  │  - api_request_duration_seconds{endpoint, method, status}          │  │
│  │  - db_query_duration_seconds{operation, table, tenant}             │  │
│  │  - cache_hit_ratio{service}                                        │  │
│  │  - kafka_consumer_lag{topic, group}                                │  │
│  │  - payment_processing_time{gateway}                                │  │
│  │  - audit_log_latency_seconds (must be < 5s)                        │  │
│  │  - rbac_permission_check_cache_hit_ratio                           │  │
│  │  - queue_job_duration_seconds{queue_name}                          │  │
│  │                                                                     │  │
│  │ Dashboards (Grafana):                                               │  │
│  │  - System Health (CPU, memory, disk)                               │  │
│  │  - API Performance (requests, errors, latency)                     │  │
│  │  - Database (connections, query time, replication lag)             │  │
│  │  - Audit System (events/sec, ingestion latency)                    │  │
│  │  - Security (failed logins, rbac denials, suspicious access)       │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  Logging (Structured)                                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ ELK Stack / Grafana Loki                                             │  │
│  │                                                                      │  │
│  │ Log Format (JSON):                                                   │  │
│  │  {                                                                   │  │
│  │    "timestamp": "2026-02-03T14:30:00Z",                             │  │
│  │    "level": "INFO",                                                 │  │
│  │    "service": "contacts-service",                                   │  │
│  │    "trace_id": "xyz-123",                                           │  │
│  │    "span_id": "abc-456",                                            │  │
│  │    "tenant_id": "org-uuid",                                         │  │
│  │    "user_id": "user-uuid",                                          │  │
│  │    "request_id": "req-789",                                         │  │
│  │    "method": "POST",                                                │  │
│  │    "path": "/contacts",                                             │  │
│  │    "status": 201,                                                   │  │
│  │    "duration_ms": 145,                                              │  │
│  │    "message": "Contact created successfully",                       │  │
│  │    "context": {...}                                                 │  │
│  │  }                                                                   │  │
│  │                                                                      │  │
│  │ Log Retention:                                                       │  │
│  │  - Info/Warn: 30 days (hot)                                         │  │
│  │  - Error/Critical: 1 year                                           │  │
│  │  - Audit logs: 7 years (cold storage)                               │  │
│  │                                                                     │  │
│  │ Alerts:                                                              │  │
│  │  - Error rate > 1%                                                  │  │
│  │  - P99 latency > 500ms                                              │  │
│  │  - RLS policy failure                                               │  │
│  │  - Audit ingestion delay > 5s                                       │  │
│  │  - DLQ message accumulation                                         │  │
│  │  - Payment webhook failure (PagerDuty)                              │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  APM (Application Performance Monitoring)                                   │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ Datadog / New Relic / Elastic APM                                   │  │
│  │  - End-to-end tracing                                               │  │
│  │  - Service dependencies                                             │  │
│  │  - Error tracking + root cause                                      │  │
│  │  - Database slow query analysis                                     │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  Security Monitoring                                                        │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ Threat Detection:                                                    │  │
│  │  - Failed auth attempts > 5/minute per user → lock account          │  │
│  │  - RLS policy bypass attempts → CRITICAL alert                      │  │
│  │  - Unauthorized cross-tenant access → forensic logging              │  │
│  │  - API key reuse → revoke + notify                                  │  │
│  │  - Bulk data exports (export > 100MB) → approval queue              │  │
│  │                                                                      │  │
│  │ SIEM Integration:                                                    │  │
│  │  - Send audit logs to Splunk / ArcSight                             │  │
│  │  - Correlate with firewall / WAF logs                               │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│                       DEPLOYMENT & INFRASTRUCTURE                            │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Kubernetes Cluster (EKS / GKE)                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ Namespaces:                                                           │  │
│  │  - production                                                        │  │
│  │  - staging                                                          │  │
│  │  - development                                                      │  │
│  │                                                                      │  │
│  │ Deployments:                                                         │  │
│  │  - api-gateway (3 replicas, auto-scale up to 10)                    │  │
│  │  - contacts-service (5 replicas, HPA: 50% CPU)                      │  │
│  │  - deals-service (3 replicas)                                       │  │
│  │  - payments-service (5 replicas, crash loop backoff protection)     │  │
│  │  - audit-service (3 replicas, local SSD cache)                      │  │
│  │  - rules-engine (2 replicas, CPU intensive)                         │  │
│  │  - workers (email/sms: 10, webhooks: 5, reports: 3)                 │  │
│  │                                                                      │  │
│  │ Persistence:                                                         │  │
│  │  - StatefulSet: PostgreSQL + replicas (data durability)             │  │
│  │  - StatefulSet: Redis Sentinel (HA cache)                           │  │
│  │  - ConfigMaps: App configuration                                    │  │
│  │  - Secrets: API keys, DB credentials (vault integration)            │  │
│  │                                                                      │  │
│  │ Networking:                                                          │  │
│  │  - Service mesh (Istio optional, for advanced traffic mgmt)         │  │
│  │  - Network policies: enforce inter-pod communication rules          │  │
│  │  - Ingress: TLS termination, rate limiting                          │  │
│  │                                                                      │  │
│  │ Node Pools:                                                          │  │
│  │  - On-demand (standard workloads)                                   │  │
│  │  - Spot instances (workers, analytics, cost optimization)           │  │
│  │  - GPU nodes (optional, for ML scoring)                             │  │
│  │                                                                      │  │
│  │ Pod Policies:                                                        │  │
│  │  - Resource requests/limits (CPU, memory)                           │  │
│  │  - Health checks: liveness, readiness probes                        │  │
│  │  - Security: non-root user, read-only filesystem                    │  │
│  │  - Affinity: spread replicas across zones                           │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  Container Registry                                                         │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ ECR / Artifactory                                                    │  │
│  │  - Image tagging: {service}:{version}-{git-sha}                      │  │
│  │  - Scanning: Trivy (vulnerabilities)                                 │  │
│  │  - Retention: 30 versions per service                                │  │
│  │  - Signing: Cosign (image provenance)                                │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  CI/CD (GitOps)                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ GitHub Actions / GitLab CI                                          │  │
│  │  - Trigger: push to main/develop                                    │  │
│  │  - Steps:                                                            │  │
│  │    1. Build: npm run build (TypeScript)                             │  │
│  │    2. Test: npm run test (Jest, coverage > 80%)                     │  │
│  │    3. Lint: ESLint + Prettier                                       │  │
│  │    4. Docker build + push to ECR                                    │  │
│  │    5. Scan image (Trivy)                                            │  │
│  │    6. Update Helm chart                                             │  │
│  │    7. ArgoCD sync (Kubernetes apply)                                │  │
│  │                                                                      │  │
│  │ Deployments:                                                         │  │
│  │  - Blue-green: 100% traffic cut-over                                │  │
│  │  - Canary: 10% → 50% → 100% (monitor SLOs)                          │  │
│  │  - Rollback: automatic if error rate > 5%                           │  │
│  │                                                                      │  │
│  │ Monitoring:                                                          │  │
│  │  - SLOs: 99.5% availability (payment-critical)                      │  │
│  │  - SLOs: 99% for standard services                                   │  │
│  │  - Error budget: 4 hours downtime per month                         │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  Backup & Disaster Recovery                                                │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ Database:                                                             │  │
│  │  - Continuous replication to standby                                │  │
│  │  - WAL archiving to S3 (immutable)                                  │  │
│  │  - Daily snapshots (RDS automated)                                  │  │
│  │  - RTO: 15 minutes (standby promotion)                              │  │
│  │  - RPO: < 1 minute (continuous replication)                         │  │
│  │                                                                      │  │
│  │ Compliance Backups:                                                  │  │
│  │  - Monthly audit DB export to Glacier                               │  │
│  │  - Legal hold: immutable backup copies                              │  │
│  │  - Verification: monthly integrity checks                           │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘

═════════════════════════════════════════════════════════════════════════════════

FLUXOS CRÍTICOS:

1. FLUXO: Criar Contato (happy path)
   ────────────────────────────────
   
   Client Browser
         ↓ POST /contacts (JWT + Idempotency-Key header)
   API Gateway
         ↓ Validate JWT, extract tenant_id, set_tenant_context()
   Contact Service
         ↓ RBACGuard (check 'contact:create' permission from cache)
         ↓ CreateContactCommand handler
         ↓ ContactRepository.save() {
            - Validar email (não duplicado em tenant)
            - Aplicar regras de negócio (JSONB custom fields)
            - Insert into contacts (com tenant_id, RLS policy valida)
            - Insert into outbox (same transaction)
            - Return Contact entity
         }
         ↓ Publish domain events:
            - Contact.getDomainEvents() → [ContactCreatedEvent]
            - OutboxPublisher.publishEvent() (faz insert já feito)
         ↓ Return 201 + {id, email, ...}
   
   Asynchronously:
         ↓ OutboxPublisher cron (a cada 5s):
            - SELECT * FROM outbox WHERE published_at IS NULL
            - PUBLISH ContactCreatedEvent to Kafka
            - UPDATE outbox SET published_at = NOW()
         ↓ Kafka broker (contact-events topic)
         ↓ Rules Engine Consumer:
            - Evaluate regras (e.g., "IF source=web THEN assign to sales")
            - Dispara RuleExecutedEvent
         ↓ Notification Consumer:
            - Enfileira job SendEmail(sales_rep@..., "New contact assigned")
         ↓ Audit Consumer:
            - Insere em audit_events (append-only)
         ↓ Search Consumer:
            - Indexa em Elasticsearch (async, 5sec lag)

2. FLUXO: Processar Pagamento (CQRS + Idempotência)
   ───────────────────────────────────────────────
   
   POST /payments { amount: 100.00, deal_id: "xyz", idempotency_key: "key-123" }
         ↓
   IdempotencyService.executeIdempotent("key-123", async () => {
     // Check cache + DB
     const cached = await redis.get("idempotency:key-123")
     if (cached) return cached  // ← Idempotência garantida
     
     // Execute
     ProcessPaymentCommand handler:
       ↓ Validate: deal exists, permissions
       ↓ Call Stripe API (create payment intent)
       ↓ ON SUCCESS → Insert payment row (soft delete aware)
       ↓ ON FAILURE → Throw error (no retry in handler)
         - Bull queue retries com exponential backoff
       ↓ Publish PaymentRequestedEvent
         - Outbox: INSERT para idempotência Kafka
       
     // Cache result (idempotency)
     await redis.set("idempotency:key-123", result, 3600)
     await db.insert("idempotency_log", {key, result})
     return result
   })
   
   Webhook async (Stripe → /webhooks/stripe):
         ↓ Stripe webhook event (PaymentIntent.succeeded)
         ↓ Verify signature (Stripe secret)
         ↓ TransactionId idempotency check (prevent double processing)
         ↓ PaymentWebhookHandler:
            - Mark payment as succeeded
            - Publish PaymentSucceededEvent
            - Outbox → Kafka
         ↓ Finance Service Consumer:
            - Auto-generate invoice
            - Mark deal as won + invoiced
         ↓ Notification Consumer:
            - Email: "Payment received"

3. FLUXO: Auditoria Imutável (WORM)
   ──────────────────────────────
   
   Operação qualquer (CREATE, UPDATE, DELETE):
         ↓
   AuditService.logEvent({
     action: 'CONTACT_EMAIL_UPDATED',
     tenant_id,
     user_id,
     resource_id: contact.id,
     before_state: {email: 'old@ex.com'},
     after_state: {email: 'new@ex.com'},
     metadata: {...}
   })
         ↓
   Kafka.publish('audit-events', event) // FIRST (resilient)
         ↓
   INSERT audit_events (...) // DB insert (transactional)
         ↓
   Retenção automática (cron daily 2 AM):
         ↓
   SELECT data_type, retention_days FROM retention_policies
     WHERE data_type = 'contact'
     → retention_days = 1095 (3 anos)
         ↓
   UPDATE contacts SET deleted_at = NOW() 
     WHERE created_at < (NOW - 1095 days) AND deleted_at IS NULL
     → Soft delete (preserva audit trail)
         ↓
   Compliance (após 30 dias de soft delete):
         ↓
   DELETE FROM contacts WHERE deleted_at < (NOW - 30 days)
     AND deletion_reason = 'automated_retention'
         ↓
   Archive to S3 Glacier (quarterly):
         ↓
   SELECT * FROM audit_events WHERE created_at IN [range]
     → COMPRESS + ENCRYPT (AES-256)
     → UPLOAD to S3 Glacier
     → VERIFY hash (SHA256)

4. FLUXO: RBAC Check (Permissões Cacheadas)
   ──────────────────────────────────────────
   
   GET /contacts/search?q=john
         ↓
   RBACGuard.canActivate():
         ↓
     const permission = 'contact:read'
     const userId = req.user.id
     const tenantId = getTenantContext()
         ↓
     try {
       cached = await redis.get(`perm:${userId}:${tenantId}:${permission}`)
       if (cached !== null) return cached === '1'  // 5-min TTL, 99%+ hit rate
     } catch (cacheError) {
       // Fallthrough: DB check se cache falha
     }
         ↓
     // DB fallback (miss ou error)
     SELECT 1 FROM user_roles ur
       JOIN role_permissions rp ON ur.role_id = rp.role_id
       JOIN permissions p ON rp.permission_id = p.id
       WHERE ur.user_id = userId AND ur.tenant_id = tenantId
         AND p.name = 'contact:read'
     LIMIT 1
         ↓
     hasAccess = (result.length > 0)
     await redis.set(`perm:${userId}:${tenantId}:${permission}`, 
                     hasAccess ? '1' : '0', 300)  // Cache miss
         ↓
     return hasAccess

   Event: Role assignment changed:
         ↓
     await permissionService.invalidateUserPermissions(userId)
     → DELETE pattern: `perm:${userId}:*`  (cascade invalidation)

5. FLUXO: Exportação GDPR (Right to Data Portability)
   ────────────────────────────────────────────────
   
   POST /compliance/data-export { user_id: "..." }
         ↓
   ComplianceService.exportUserData():
         ↓
     // Check permission: user can only export own data (unless DPO)
     if (!isCurrentUser(user_id) && !hasRole('compliance_officer')) {
       throw ForbiddenError()
     }
         ↓
     // Gather data (read-only replica)
     SELECT * FROM contacts WHERE created_by = user_id AND tenant_id
     SELECT * FROM interactions WHERE user_id AND tenant_id
     SELECT * FROM audit_events WHERE user_id AND tenant_id
       LIMIT 10000 (paginated se muito grande)
         ↓
     // Format as JSON + PDF
     const bundle = {
       metadata: {exportedAt, user_id, format_version},
       contacts: [...],
       interactions: [...],
       auditLog: [...]
     }
         ↓
     // Generate PDF (reportlab / PDFKit)
     const pdf = generatePDFReport(bundle)
         ↓
     // Upload to S3 (temporary, 30-day retention)
     const signedUrl = await s3.upload(buffer, {
       Key: `exports/${user_id}/${timestamp}.json`,
       ServerSideEncryption: 'AES256',
       Expires: 30 * 24 * 3600
     })
         ↓
     // Email to user
     await emailService.send({
       to: user.email,
       subject: 'Your Data Export - Ready for Download',
       link: signedUrl,
       expiresIn: '30 days'
     })
         ↓
     // Log in audit
     await auditService.logEvent({
       action: 'USER_DATA_EXPORTED',
       user_id,
       metadata: { export_size_mb: buffer.length / 1024 }
     })
     
═════════════════════════════════════════════════════════════════════════════════
```

---

## Resumo Executivo

### ✅ Stack Escolhido
- **Backend**: Node.js + NestJS (TypeScript)
- **DB**: PostgreSQL 15+ (RLS multi-tenant)
- **Cache**: Redis 7+ (Sentinel HA)
- **Queue**: Kafka (auditoria imutável)
- **Search**: Elasticsearch (opcional)
- **Container**: Docker + Kubernetes

### ✅ Isolamento Multi-Tenant
- **RLS (Row-Level Security)** por padrão (escala para 1000+ tenants)
- **Schema-per-Tenant** para enterprise premium
- **Segregação PII**: tabelas separadas, criptografia AES-256

### ✅ Autorização
- **RBAC**: 3 camadas (user → role → permissions)
- **ABAC**: políticas customizadas (department, owner)
- **Cache**: Redis (5min TTL, invalidação por evento)

### ✅ Auditoria Imutável
- **Append-only** table (audit_events)
- **Particionamento** por mês (7 anos retenção)
- **Kafka** (redundancy, event sourcing)
- **Integridade**: SHA256, quarterly verifications

### ✅ Performance
- **Índices multi-tenant** (tenant_id, date, search)
- **Materialized views** (relatórios pesados)
- **Cache tiers**: Redis (hot) + Elasticsearch (search)
- **Replicação leitura** para auditoria/compliance

### ✅ Resiliência
- **Outbox pattern**: garantia de entrega (Kafka + DB)
- **Idempotência**: Redis + DB log
- **Retry**: exponential backoff, circuit breaker
- **DLQ**: manual intervention, alertas automáticas

### ✅ LGPD
- Consentimento explícito + versionamento
- Retenção automática (3-7 anos por tipo)
- Right to be forgotten (pseudonymization + soft delete)
- GDPR export endpoint (JSON + PDF)
- DPO audit access (RLS + compliance role)

---

**Próximos passos**: Implementar inicialmente serviço Account + Contact (bounded contexts menores), depois escalar com Finance + Rules Engine.

