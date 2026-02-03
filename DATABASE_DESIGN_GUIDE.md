-- ═══════════════════════════════════════════════════════════════════════════════
-- DDL + Database Design Guide - CRM SaaS Multi-Tenant
-- ═══════════════════════════════════════════════════════════════════════════════

# 1. DDL COMPLETO (Schema Overview)

## Tabelas Core por Categoria:

### A. Tenant & Organization
- tenants: Base para isolamento multi-tenant
- users: Master users (1 login = acesso a múltiplos tenants futuramente)
- roles: Role definitions (admin, manager, sales, custom)
- permissions: Global permission catalog (shared across tenants)
- role_permissions: Mapping com suporte a ABAC (conditions)
- user_roles: User assignment com soft delete via revoked_at

### B. CRM Core
- companies: Clientes/Prospects (com governança de campos sensíveis)
- contacts: Leads/Contacts (email, CPF, custom fields)
- deals: Opportunities (pipeline stages, amount, probability)
- interactions: Activity log (calls, emails, notes)
- support_tickets: Help desk

### C. Dynamic Customization
- dynamic_fields: Definições de campos customizáveis (metadata)
- table_views: User-defined view presets (columns, filters, sorts)
- (Valores armazenados em JSONB nas tabelas parent, não em tabela separada)

### D. Billing & Payments
- billing_invoices: Invoices/NFe
- billing_payments: Payment records (múltiplos por invoice)
- billing_events: Webhook events (partitioned by date)

### E. Audit & Compliance
- audit_log: Immutable append-only (partitioned by month)

---

# 2. ÍNDICES RECOMENDADOS & JUSTIFICATIVA

## 2.1 Índices por Tipo de Query

### Query Pattern 1: "Trazer todos os contatos de um tenant com status X"
```sql
SELECT * FROM contacts 
WHERE tenant_id = $1 AND status = 'active' 
AND deleted_at IS NULL
ORDER BY created_at DESC;
```

**Índices necessários:**
```sql
CREATE INDEX idx_contacts_tenant_email ON contacts(tenant_id, email) 
  WHERE deleted_at IS NULL;  -- Partial index = menos I/O
CREATE INDEX idx_contacts_tenant_created ON contacts(tenant_id, created_at DESC) 
  WHERE deleted_at IS NULL;  -- For ordering
```

**Por quê?**
- Multi-column index (tenant_id, X) evita nested loop joins
- WHERE deleted_at IS NULL reduz tamanho do índice (partial index)
- Ordering by created_at DESC é comum em UIs (paginação)

---

### Query Pattern 2: "Buscar contatos por JSONB custom fields"
```sql
SELECT * FROM contacts 
WHERE tenant_id = $1 
AND custom_fields->>'segment' = 'vip'
AND custom_fields->>'priority' > '2';
```

**Índices necessários:**
```sql
CREATE INDEX idx_contacts_custom_fields_gin ON contacts USING GIN(custom_fields) 
  WHERE deleted_at IS NULL;
```

**Por quê?**
- GIN (Generalized Inverted Index) é otimizado para JSONB operators (->>, @>, etc)
- Permite index-only scan para queries em custom_fields
- Sem este índice: full table scan (MUITO lento para 100k+ registros)

**Alternativa:** B-tree com expressão (menos genérico, mais rápido para campo específico)
```sql
CREATE INDEX idx_contacts_segment ON contacts ((custom_fields->>'segment'))
WHERE deleted_at IS NULL;  -- Se campos de custom são fixed
```

---

### Query Pattern 3: "Full-text search por nome/email/company"
```sql
SELECT * FROM contacts 
WHERE tenant_id = $1
AND to_tsvector('portuguese', name || ' ' || email) @@ plainto_tsquery('portuguese', 'john doe');
```

**Índices necessários:**
```sql
CREATE INDEX idx_contacts_search ON contacts USING GiST(
  to_tsvector('portuguese', COALESCE(first_name, '') || ' ' || 
                             COALESCE(last_name, '') || ' ' ||
                             COALESCE(email, ''))
) WHERE deleted_at IS NULL;
```

**Por quê?**
- GiST (Generalized Search Tree) é melhor que GIN para full-text
- Suporta fuzzy matching (typos)
- Linguagem 'portuguese' para stemming correto

---

### Query Pattern 4: "Filtrar deals por estágio + sorting por valor"
```sql
SELECT * FROM deals 
WHERE tenant_id = $1 
AND status = 'open' 
AND pipeline_stage IN ('negotiation', 'proposal')
ORDER BY amount DESC;
```

**Índices necessários:**
```sql
CREATE INDEX idx_deals_forecast ON deals(tenant_id, pipeline_stage, probability) 
  WHERE status = 'open' AND deleted_at IS NULL;
CREATE INDEX idx_deals_amount ON deals(amount DESC) WHERE status = 'open';
```

**Por quê?**
- Composite index (tenant, stage, probability) evita 3 index scans
- Separate index para amount ordering
- Partial index reduz tamanho

---

### Query Pattern 5: "RBAC Check - permissões cacheadas mas com fallback DB"
```sql
SELECT 1 FROM user_roles ur
JOIN role_permissions rp ON ur.role_id = rp.role_id
JOIN permissions p ON rp.permission_id = p.id
WHERE ur.user_id = $1 
AND ur.tenant_id = $2
AND p.name = 'contact:read'
AND ur.revoked_at IS NULL
LIMIT 1;
```

**Índices necessários:**
```sql
CREATE INDEX idx_user_roles_active ON user_roles(user_id) WHERE revoked_at IS NULL;
CREATE INDEX idx_role_permissions_role ON role_permissions(role_id);
CREATE INDEX idx_permissions_name ON permissions(name);  -- Global index
```

**Por quê?**
- user_roles é queried mais frequentemente que role_permissions
- Partial index WHERE revoked_at IS NULL reduz 90% do tamanho (soft delete)
- Sem estes: 3 sequential scans = latency > 100ms

---

### Query Pattern 6: "Auditoria - trazer histórico de um recurso"
```sql
SELECT * FROM audit_log 
WHERE tenant_id = $1 
AND resource_type = 'contact' 
AND resource_id = $2
ORDER BY created_at DESC
LIMIT 100;
```

**Índices necessários:**
```sql
CREATE INDEX idx_audit_log_resource ON audit_log(resource_type, resource_id, created_at DESC);
CREATE UNIQUE INDEX idx_audit_log_event_id ON audit_log(event_id);  -- Idempotency
CREATE INDEX idx_audit_log_created_brin ON audit_log USING BRIN(created_at) 
  WITH (pages_per_range = 128);
```

**Por quê?**
- Composite index (resource_type, resource_id, created_at DESC) permite sorted scan
- BRIN (Block Range Index) é mais eficiente que B-tree para time-series
- BRIN usa 10x menos RAM que B-tree para 1M+ rows

---

## 2.2 Índices Recomendados - Resumo Completo

```sql
-- USERS
CREATE INDEX idx_users_tenant_email ON users(tenant_id, email);
CREATE INDEX idx_users_tenant_status ON users(tenant_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_email_verified ON users(email) WHERE email_verified = TRUE;

-- ROLES & PERMISSIONS
CREATE INDEX idx_roles_tenant ON roles(tenant_id);
CREATE INDEX idx_role_permissions_role ON role_permissions(role_id);
CREATE INDEX idx_permissions_resource ON permissions(resource);

-- USER ROLES (CRITICAL for RBAC)
CREATE INDEX idx_user_roles_user ON user_roles(user_id, tenant_id);
CREATE INDEX idx_user_roles_active ON user_roles(user_id) WHERE revoked_at IS NULL;

-- COMPANIES
CREATE INDEX idx_companies_tenant ON companies(tenant_id);
CREATE INDEX idx_companies_cnpj ON companies(cnpj) WHERE cnpj IS NOT NULL;
CREATE INDEX idx_companies_name_gin ON companies USING GIN(to_tsvector('portuguese', name));
CREATE INDEX idx_companies_status ON companies(status) WHERE deleted_at IS NULL;

-- CONTACTS (MOST CRITICAL - largest table)
CREATE INDEX idx_contacts_tenant_email ON contacts(tenant_id, email) WHERE deleted_at IS NULL;
CREATE INDEX idx_contacts_tenant_created ON contacts(tenant_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_contacts_lead_status ON contacts(tenant_id, lead_status) WHERE deleted_at IS NULL;
CREATE INDEX idx_contacts_custom_fields_gin ON contacts USING GIN(custom_fields) WHERE deleted_at IS NULL;
CREATE INDEX idx_contacts_search ON contacts USING GiST(
  to_tsvector('portuguese', COALESCE(first_name, '') || ' ' || COALESCE(last_name, ''))
) WHERE deleted_at IS NULL;

-- DEALS (HIGH CARDINALITY)
CREATE INDEX idx_deals_contact ON deals(contact_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_deals_stage ON deals(tenant_id, pipeline_stage) WHERE status = 'open';
CREATE INDEX idx_deals_amount ON deals(amount DESC) WHERE status = 'open';
CREATE INDEX idx_deals_forecast ON deals(tenant_id, pipeline_stage, probability) 
  WHERE status = 'open' AND deleted_at IS NULL;

-- AUDIT LOG (APPEND-ONLY, QUERY HEAVY)
CREATE INDEX idx_audit_log_resource ON audit_log(resource_type, resource_id, created_at DESC);
CREATE INDEX idx_audit_log_user_date ON audit_log(user_id, created_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX idx_audit_log_tenant_date ON audit_log(tenant_id, created_at DESC);
CREATE UNIQUE INDEX idx_audit_log_event_id ON audit_log(event_id);
CREATE INDEX idx_audit_log_created_brin ON audit_log USING BRIN(created_at) WITH (pages_per_range = 128);

-- BILLING (PAYMENT CRITICAL PATH)
CREATE INDEX idx_billing_invoices_status ON billing_invoices(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_billing_payments_invoice ON billing_payments(invoice_id);
CREATE INDEX idx_billing_payments_status ON billing_payments(status);
CREATE INDEX idx_billing_events_processed ON billing_events(processed) WHERE processed = FALSE;
CREATE INDEX idx_billing_events_event_id ON billing_events(event_id);

-- DYNAMIC FIELDS
CREATE INDEX idx_dynamic_fields_tenant_table ON dynamic_fields(tenant_id, table_name);
CREATE INDEX idx_dynamic_fields_active ON dynamic_fields(tenant_id, table_name) 
  WHERE is_active = TRUE AND deleted_at IS NULL;
```

---

# 3. ESTRATÉGIA DE PARTICIONAMENTO

## 3.1 Particionamento de audit_log

**Estratégia: RANGE partitioning by MONTH**

```sql
CREATE TABLE audit_log (
  -- ... columns ...
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- ...
) PARTITION BY RANGE (created_at);

-- Monthly partitions
CREATE TABLE audit_log_2026_01 PARTITION OF audit_log
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
  
CREATE TABLE audit_log_2026_02 PARTITION OF audit_log
  FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
  
-- ... continue for all months
```

**Por quê RANGE by month?**

1. **Retention Policy**: LGPD require 7-year retention
   - Cada partição = 1 mês
   - Após 7 anos, DROP partition (vs DELETE 100M rows = slow)
   - DROP TABLE audit_log_2019_01; -- instant

2. **Query Performance**: 84 partitions (7 years) vs 1 giant table
   - Recent queries: scan 1-3 partitions
   - Historical queries: scan múltiplos (mas ainda < 100% table)
   - Parallel query execution across partitions

3. **Archival**: Archive oldest partition to Glacier
   ```sql
   -- Monthly script
   SELECT pg_dump -t audit_log_2019_01 | gzip | aws s3 cp - s3://crm-archive/audit_2019_01.sql.gz
   DROP TABLE audit_log_2019_01;  -- Instantly frees space
   ```

4. **Index Management**: Índices per partition
   - audit_log_2026_01: 2-5GB
   - audit_log_2025_12: 2-5GB
   - Total = manageable, not 200GB+ monolith

**Alternativa rejeitada: HASH by tenant_id**
- ❌ Necessitaria 1000+ partitions para distribuir tenants
- ❌ Archival complexo (partição contém múltiplos tenants)
- ❌ Drop partition descarta dados de tenants ativos

---

## 3.2 Particionamento de billing_events

**Estratégia: RANGE partitioning by MONTH (similar)**

```sql
CREATE TABLE billing_events (
  id BIGSERIAL,
  -- ...
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- ...
) PARTITION BY RANGE (created_at);

CREATE TABLE billing_events_2026_01 PARTITION OF billing_events
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
```

**Por quê?**

1. **Webhook Volume**: ~1000 events/day per 100 tenants
   - 1 year = 365k events (~500MB/year)
   - Particionamento por mês = 41MB/month (manageable)

2. **Reconciliation**: Reprocessar eventos antigos (rare)
   - Histórico: scan partition específico
   - Sem partição: scan 100M eventos = 30min+ query

3. **GDPR Export**: User requests payment history
   - Partition elimination: scan only relevant months
   - vs: full table scan on monolithic table

---

## 3.3 Sem Particionamento Necessário:

**contacts, deals, companies**: NÃO particionar
- Razão: Soft delete viable (< 1TB típicamente)
- Query pattern: tenant_id + filters, não time-based
- Particionamento por tenant: complexo, não ganho de performance

**interactions**: Considerar particionamento se > 1TB/ano
- Time-based: RANGE by created_at
- Mas: menos crítico que audit_log

---

# 4. ISOLAMENTO DE TENANT (RLS + Enforce)

## 4.1 Row-Level Security (PostgreSQL 10+)

**Implementação:**
```sql
-- Enable RLS
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

-- Policy: Users see only their tenant's data
CREATE POLICY rls_contacts ON contacts
  USING (tenant_id = current_setting('app.current_tenant_id')::UUID)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::UUID);
```

**Como funciona:**
1. App middleware sets context (BEFORE ANY QUERY):
   ```typescript
   // middleware/tenant.middleware.ts
   const tenantId = extract_from_jwt_or_subdomain();
   db.query(`SELECT set_config('app.current_tenant_id', $1, false)`, [tenantId]);
   ```

2. Toda query em contacts é reescrita:
   ```sql
   -- User escreveu:
   SELECT * FROM contacts WHERE email = 'john@ex.com';
   
   -- PostgreSQL reescreve para (RLS policy applied):
   SELECT * FROM contacts 
   WHERE email = 'john@ex.com'
   AND tenant_id = current_setting('app.current_tenant_id')::UUID;
   ```

3. Se tenant context NOT SET:
   ```sql
   SELECT * FROM contacts;  -- Returns 0 rows (RLS blocks all)
   -- Safer default: deny all unless explicitly allowed
   ```

**Vantagens:**
- ✅ Automatic enforcement (não depende de app logic)
- ✅ Seguro contra bugs (mesmo que app esqueça tenant_id check)
- ✅ Performance: RLS filter applied at storage engine level (index-aware)

**Desvantagens:**
- ⚠️ Adiciona overhead (~5% latency per query)
- ⚠️ Não seguro contra SQL injection (ainda precisa parameterized queries!)
- ⚠️ Complex ABAC policies podem ser lentas

---

## 4.2 Enforce via Constraints & Triggers

**Constraint: Força tenant_id in INSERT/UPDATE**
```sql
CREATE TABLE contacts (
  -- ... columns ...
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  -- ...
  CONSTRAINT contacts_tenant_not_null CHECK (tenant_id IS NOT NULL)
);
```

**Trigger: Previne inserção sem tenant_id**
```sql
CREATE OR REPLACE FUNCTION trg_enforce_tenant_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id is required';
  END IF;
  IF NEW.tenant_id != current_setting('app.current_tenant_id')::UUID THEN
    RAISE EXCEPTION 'tenant_id must match current context';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_tenant_id BEFORE INSERT OR UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION trg_enforce_tenant_id();
```

**Workflow completo:**
1. App calls: `SELECT set_config('app.current_tenant_id', tenant_uuid, false);`
2. App inserts: `INSERT INTO contacts (tenant_id, email) VALUES (tenant_uuid, 'john@ex.com');`
3. RLS policy: Verifica tenant_id = context
4. Trigger: Força tenant_id matching context
5. Constraint: Força tenant_id NOT NULL

**3 camadas = Defense in Depth**

---

# 5. MODELAGEM DE DYNAMIC_FIELDS (Sem matar performance)

## 5.1 Abordagem: JSONB no Parent Table (NOT separate table)

**❌ ANTI-PATTERN: Separar em table chamada dynamic_field_values**
```sql
-- BAD DESIGN:
CREATE TABLE dynamic_field_values (
  id UUID PRIMARY KEY,
  contact_id UUID REFERENCES contacts(id),
  field_id UUID REFERENCES dynamic_fields(id),
  value TEXT,
  -- ...
);

SELECT c.*, dfv.value
FROM contacts c
LEFT JOIN dynamic_field_values dfv ON c.id = dfv.contact_id
WHERE c.tenant_id = $1;  -- ❌ LATERAL JOIN = N+1 problem
```

**Problema:**
- Para 10 custom fields: 11 table joins (1 contacts + 10 dfv)
- N+1 queries: 1 query para contacts + N queries para get field values
- Cada UPDATE requer separate transaction per field
- Storage bloat: 10 rows per contact instead of 1

---

## ✅ PADRÃO RECOMENDADO: JSONB Column

```sql
CREATE TABLE contacts (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  email email_domain NOT NULL,
  -- ... regular columns ...
  
  -- Custom fields AQUI (não em tabela separada)
  custom_fields JSONB DEFAULT '{}',
  
  -- Index para queries em custom_fields
  CREATE INDEX idx_contacts_custom_fields_gin ON contacts USING GIN(custom_fields);
);
```

**Uso:**
```sql
-- Insert com custom fields
INSERT INTO contacts (tenant_id, email, custom_fields)
VALUES ($1, 'john@ex.com', '{"segment": "vip", "priority": 2, "company_type": "enterprise"}');

-- Query com custom fields
SELECT id, email, custom_fields
FROM contacts
WHERE tenant_id = $1
AND custom_fields->>'segment' = 'vip'
AND (custom_fields->>'priority')::INT >= 2;

-- Update um campo
UPDATE contacts
SET custom_fields = jsonb_set(custom_fields, '{segment}', '"vip"')
WHERE id = $1;

-- Update múltiplos campos
UPDATE contacts
SET custom_fields = custom_fields || '{"segment": "vip", "priority": 3}'
WHERE id = $1;
```

**Vantagens:**
- ✅ Single row per contact (no joins)
- ✅ Flexible schema (add fields without migration)
- ✅ GIN index enables fast queries
- ✅ Atomic updates (1 transaction, not N)
- ✅ Storage: ~500B overhead per row (vs 100s rows in separate table)

**Performance:**
```
JSONB query vs JOIN:
- JSONB + GIN: ~1-5ms (10k rows)
- Separate table + JOIN: ~50-200ms (overhead + index merge)
Benchmark: JSONB é 20-50x mais rápido para custom fields
```

---

## 5.2 Dynamic Field Metadata (definições)

**Separate table para METADATA (isso SIM precisa de table)**
```sql
CREATE TABLE dynamic_fields (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  table_name VARCHAR(100),  -- 'contacts', 'deals', 'companies'
  name VARCHAR(100),  -- Field key (e.g., 'segment')
  label VARCHAR(255),  -- Display name (e.g., 'Customer Segment')
  field_type field_type,  -- 'text', 'select', 'number', etc.
  options JSONB,  -- For select fields: [{"value": "vip", "label": "VIP"}]
  is_required BOOLEAN,
  is_searchable BOOLEAN,
  is_visible BOOLEAN,
  field_order INT,
  -- ...
);
```

**Uso - Listar dynamic fields para contacts:**
```sql
SELECT df.id, df.label, df.field_type, df.options
FROM dynamic_fields df
WHERE df.tenant_id = $1
AND df.table_name = 'contacts'
AND df.is_active = TRUE
ORDER BY df.field_order;
```

**Uso - Build form/UI:**
```typescript
// Backend returns field metadata
const fields = await db.query(`
  SELECT label, field_type, options, is_required
  FROM dynamic_fields
  WHERE table_name = 'contacts' AND tenant_id = $1
  ORDER BY field_order
`);

// Frontend builds form dynamically
// <input type="text" name="segment" required={false} />
// <select name="priority"> <option value="1">Low</option> ... </select>
```

---

## 5.3 Validation at Insert/Update

**Trigger para validar custom_fields contra dynamic_fields metadata:**
```sql
CREATE OR REPLACE FUNCTION trg_validate_custom_fields()
RETURNS TRIGGER AS $$
DECLARE
  v_field_def RECORD;
  v_field_value TEXT;
BEGIN
  -- Para cada campo em custom_fields
  FOR v_field_def IN 
    SELECT name, field_type, is_required, options
    FROM dynamic_fields
    WHERE table_name = 'contacts'
    AND tenant_id = NEW.tenant_id
    AND is_active = TRUE
  LOOP
    v_field_value := NEW.custom_fields->>v_field_def.name;
    
    -- Validation: required fields
    IF v_field_def.is_required AND v_field_value IS NULL THEN
      RAISE EXCEPTION 'Field % is required', v_field_def.name;
    END IF;
    
    -- Validation: select options
    IF v_field_def.field_type = 'select' AND v_field_value IS NOT NULL THEN
      IF NOT (v_field_def.options::jsonb @> jsonb_build_object('value', v_field_value)) THEN
        RAISE EXCEPTION 'Invalid option for field %: %', v_field_def.name, v_field_value;
      END IF;
    END IF;
    
    -- Add more validations as needed (type checks, ranges, etc)
  END LOOP;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER validate_custom_fields BEFORE INSERT OR UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION trg_validate_custom_fields();
```

---

## 5.4 Performance Analysis: JSONB vs Separate Table

### Scenario: 100k contacts, 8 custom fields per contact

**Design A: JSONB (Recommended)**
```
Storage: 100k * (400 bytes base + 500 bytes JSONB) = 90 GB
Indexes: idx_custom_fields_gin = 3 GB
Total: 93 GB

Query: SELECT * FROM contacts WHERE custom_fields->>'segment' = 'vip'
Plan: Index Scan (GIN) → ~1-5ms for 10k matches
```

**Design B: Separate Table (Anti-pattern)**
```
Storage contacts: 100k * 400 bytes = 40 GB
Storage dynamic_field_values: 100k * 8 * 200 bytes = 160 GB
Indexes: B-tree on (contact_id, field_id) = 5 GB
Total: 205 GB (2.2x larger!)

Query: SELECT c.* FROM contacts c
       JOIN dynamic_field_values dfv ON c.id = dfv.contact_id
       WHERE dfv.field_id = 'segment' AND dfv.value = 'vip'
Plan: Seq Scan on contacts → Nested Loop → Index Scan
      ~100-500ms for 10k matches
```

**Winner: JSONB por 10-50x**

---

## 5.5 Schema Flexibility Examples

**Add new custom field (NO migration required):**
```sql
-- 1. Insert field definition
INSERT INTO dynamic_fields (tenant_id, table_name, name, label, field_type, is_active)
VALUES ($1, 'contacts', 'risk_score', 'Risk Score', 'number', TRUE);

-- 2. Existing contacts already have custom_fields column ready
-- 3. New contacts automatically get this field

-- 4. Insert value:
UPDATE contacts
SET custom_fields = jsonb_set(custom_fields, '{risk_score}', '75')
WHERE id = $1;
```

**Add new standard column (traditional migration):**
```sql
-- Requires ALTER TABLE (migration downtime)
ALTER TABLE contacts ADD COLUMN middle_name VARCHAR(100);
ALTER TABLE contacts ADD INDEX idx_middle_name(middle_name);
-- All nodes must apply before queries can use it
```

**JSONB = schema flexibility** (crucial para SaaS multi-tenant)

---

# 6. CPF/CNPJ HANDLING

## 6.1 Storage: Normalized (digits only)

```sql
-- Domain definitions
CREATE DOMAIN cpf_domain AS TEXT CHECK (VALUE ~ '^\d{11}$');
CREATE DOMAIN cnpj_domain AS TEXT CHECK (VALUE ~ '^\d{14}$');

-- Normalization function
CREATE FUNCTION normalize_cpf(p_cpf TEXT) RETURNS cpf_domain AS $$
BEGIN
  RETURN regexp_replace(p_cpf, '[^0-9]', '', 'g')::cpf_domain;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Usage
INSERT INTO users (cpf) VALUES (normalize_cpf('123.456.789-00'));
-- Stored as: '12345678900'
```

**Por quê normalizar?**
- Usuários input: "123.456.789-00" ou "12345678900" (inconsistent)
- Storage: sempre "12345678900" (consistent)
- Queries: simples (sem regex every time)
- Validation: domain CHECK enforces 11 digits

---

## 6.2 Validation: Luhn Algorithm + check digit

```sql
CREATE OR REPLACE FUNCTION is_valid_cpf(p_cpf cpf_domain)
RETURNS BOOLEAN AS $$
DECLARE
  v_sum INTEGER := 0;
  v_remainder INTEGER;
  v_i INTEGER;
BEGIN
  -- CPF must not be all same digit
  IF p_cpf IN ('00000000000', '11111111111', '22222222222', '33333333333',
               '44444444444', '55555555555', '66666666666', '77777777777',
               '88888888888', '99999999999') THEN
    RETURN FALSE;
  END IF;
  
  -- Validation digit 1
  FOR v_i IN 1..9 LOOP
    v_sum := v_sum + (SUBSTRING(p_cpf, v_i, 1)::INTEGER * (11 - v_i));
  END LOOP;
  
  v_remainder := (v_sum * 10) % 11;
  IF v_remainder = 10 THEN v_remainder := 0; END IF;
  IF v_remainder != SUBSTRING(p_cpf, 10, 1)::INTEGER THEN
    RETURN FALSE;
  END IF;
  
  -- Validation digit 2
  v_sum := 0;
  FOR v_i IN 1..10 LOOP
    v_sum := v_sum + (SUBSTRING(p_cpf, v_i, 1)::INTEGER * (12 - v_i));
  END LOOP;
  
  v_remainder := (v_sum * 10) % 11;
  IF v_remainder = 10 THEN v_remainder := 0; END IF;
  IF v_remainder != SUBSTRING(p_cpf, 11, 1)::INTEGER THEN
    RETURN FALSE;
  END IF;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Trigger
CREATE OR REPLACE FUNCTION trg_validate_cpf()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.cpf IS NOT NULL AND NOT is_valid_cpf(NEW.cpf) THEN
    RAISE EXCEPTION 'Invalid CPF: %', NEW.cpf;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER validate_cpf BEFORE INSERT OR UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION trg_validate_cpf();
```

---

## 6.3 Encryption for PII (Optional but Recommended)

```sql
-- Para campos super-sensíveis (PII), considerar criptografia:

CREATE TABLE customer_pii (
  id UUID PRIMARY KEY,
  contact_id UUID REFERENCES contacts(id),
  cpf_encrypted TEXT,  -- Encrypted with pgcrypto
  -- ...
);

-- Insert (criptografar no app, não no DB)
INSERT INTO customer_pii (cpf_encrypted)
VALUES (pgcrypto_encrypt('12345678900', 'secret_key'));

-- Query (descrever no app layer, não no DB)
-- Razão: performance + key rotation management
```

**Melhor prática:** Criptografar no application layer (Node.js) antes de enviar ao DB
- Permite key rotation sem re-encrypt de terabytes
- Mais flexível que column-level encryption

---

# 7. GOVERNANCE FIELDS (Protected columns)

## 7.1 Problema: Campos críticos de empresa não devem mudar sem aprovação

```sql
CREATE TABLE companies (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  
  -- GOVERNANCE FIELDS (cannot change freely)
  name VARCHAR(255) NOT NULL,
  cnpj cnpj_domain UNIQUE,
  legal_name VARCHAR(255),
  
  -- Who approved last change
  governance_approved_by UUID REFERENCES users(id),
  governance_approved_at TIMESTAMP WITH TIME ZONE,
  governance_notes TEXT,
  
  -- ...
);
```

---

## 7.2 Trigger: Bloqueia UPDATE de campos governados sem aprovação

```sql
CREATE OR REPLACE FUNCTION trg_governance_check()
RETURNS TRIGGER AS $$
DECLARE
  v_approver_id UUID;
BEGIN
  -- Check if governance fields changed
  IF OLD.name != NEW.name 
     OR OLD.cnpj != NEW.cnpj 
     OR OLD.legal_name != NEW.legal_name THEN
    
    -- Only compliance_officer or admin can change
    SELECT id INTO v_approver_id
    FROM users u
    WHERE u.id = current_user_id()  -- Gets from JWT
    AND EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = u.id
      AND r.name IN ('admin', 'compliance_officer')
    );
    
    IF v_approver_id IS NULL THEN
      RAISE EXCEPTION 'Only compliance officers can modify governance fields';
    END IF;
    
    NEW.governance_approved_by = v_approver_id;
    NEW.governance_approved_at = CURRENT_TIMESTAMP;
    
    -- Audit log
    INSERT INTO audit_log (tenant_id, user_id, action, resource_type, resource_id,
                          before_state, after_state, metadata)
    VALUES (NEW.tenant_id, v_approver_id, 'GOVERNANCE_APPROVE', 'company', NEW.id,
            jsonb_build_object('name', OLD.name, 'cnpj', OLD.cnpj),
            jsonb_build_object('name', NEW.name, 'cnpj', NEW.cnpj),
            jsonb_build_object('reason', 'Governance approval'));
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER governance_approval BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION trg_governance_check();
```

---

# 8. OPERATIONAL NOTES

## 8.1 Maintenance Tasks

**Weekly:**
- Check index bloat: `SELECT * FROM pg_stat_user_indexes WHERE idx_blks_read > 1000;`
- Analyze stats: `ANALYZE;`

**Monthly:**
- Create next month's audit_log partition:
  ```sql
  CREATE TABLE audit_log_2026_03 PARTITION OF audit_log
    FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
  ```
- VACUUM FULL on old partitions:
  ```sql
  VACUUM FULL audit_log_2025_01;
  ```

**Quarterly:**
- Archive old audit_log to S3:
  ```sql
  -- Backup
  pg_dump -t audit_log_2022_01 | gzip | aws s3 cp - s3://archive/...
  -- Verify
  -- Drop
  DROP TABLE audit_log_2022_01;
  ```

---

## 8.2 Backup Strategy

```bash
# Daily incremental (WAL archiving)
pg_receivewal -D /var/lib/postgresql/wal_archive

# Weekly full backup
pg_basebackup -D /backups/$(date +%Y%m%d) -Fp

# Monthly to S3
tar -czf backup_$(date +%Y%m).tar.gz /backups/
aws s3 cp backup_$(date +%Y%m).tar.gz s3://crm-backups/
```

---

## 8.3 Monitoring

```sql
-- Check table sizes
SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Check index efficiency
SELECT indexname, idx_scan, idx_tup_read, idx_tup_fetch
FROM pg_stat_user_indexes
ORDER BY idx_scan DESC;

-- Partition sizes
SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE tablename LIKE 'audit_log_%'
ORDER BY tablename DESC;
```

---

END OF DATABASE DESIGN GUIDE
