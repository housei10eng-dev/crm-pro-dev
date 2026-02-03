-- ═══════════════════════════════════════════════════════════════════════════════
-- CRM SaaS Multi-Tenant Database Schema
-- PostgreSQL 15+
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 1: INITIALIZATION & EXTENSIONS
-- ─────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";           -- trigram for full-text search
CREATE EXTENSION IF NOT EXISTS "btree_gin";         -- GIN indexes for multiple columns
CREATE EXTENSION IF NOT EXISTS "btree_gist";        -- GIST for exclusion constraints

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 2: ENUMS & DOMAINS
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TYPE subscription_tier AS ENUM ('starter', 'pro', 'enterprise', 'custom');
CREATE TYPE user_status AS ENUM ('active', 'inactive', 'pending_verification', 'suspended');
CREATE TYPE user_role_type AS ENUM ('admin', 'manager', 'sales', 'support', 'custom');
CREATE TYPE company_type AS ENUM ('client', 'partner', 'internal', 'prospect');
CREATE TYPE ticket_status AS ENUM ('open', 'in_progress', 'waiting_customer', 'resolved', 'closed');
CREATE TYPE ticket_priority AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE payment_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'refunded', 'cancelled');
CREATE TYPE payment_method AS ENUM ('credit_card', 'bank_transfer', 'pix', 'boleto', 'subscription');
CREATE TYPE invoice_status AS ENUM ('draft', 'issued', 'partially_paid', 'paid', 'overdue', 'cancelled');
CREATE TYPE field_type AS ENUM ('text', 'email', 'phone', 'number', 'decimal', 'boolean', 'date', 'datetime', 'select', 'multiselect', 'json', 'textarea', 'cpf', 'cnpj');
CREATE TYPE governance_field_type AS ENUM ('company_name', 'cnpj', 'cpf', 'legal_document', 'tax_id');

-- Domain for normalized CPF/CNPJ (11-14 digits only)
CREATE DOMAIN cpf_domain AS TEXT
  CHECK (VALUE ~ '^\d{11}$');

CREATE DOMAIN cnpj_domain AS TEXT
  CHECK (VALUE ~ '^\d{14}$');

CREATE DOMAIN email_domain AS TEXT
  CHECK (VALUE ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$');

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 3: TENANT MANAGEMENT (Foundation)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Organization Info
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) NOT NULL UNIQUE,  -- For subdomain/URL
  description TEXT,
  
  -- Subscription & Plan
  subscription_tier subscription_tier DEFAULT 'starter' NOT NULL,
  custom_limit_contacts INT DEFAULT 5000,
  custom_limit_users INT DEFAULT 10,
  
  -- Legal Entity (for invoicing)
  cnpj cnpj_domain UNIQUE,
  legal_name VARCHAR(255),
  legal_email email_domain,
  
  -- Configuration
  logo_url TEXT,
  primary_color VARCHAR(7),
  timezone VARCHAR(50) DEFAULT 'America/Sao_Paulo',
  language VARCHAR(10) DEFAULT 'pt-BR',
  
  -- Governance
  data_classification VARCHAR(50) DEFAULT 'standard',  -- 'standard', 'confidential', 'restricted'
  compliance_flags JSONB DEFAULT '{"gdpr": false, "lgpd": true, "hipaa": false}',
  
  -- Status
  status VARCHAR(50) DEFAULT 'active' NOT NULL,  -- 'active', 'suspended', 'cancelled'
  is_trial BOOLEAN DEFAULT FALSE,
  trial_expires_at TIMESTAMP WITH TIME ZONE,
  
  -- Tracking
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  created_by_user_id UUID,
  deleted_at TIMESTAMP WITH TIME ZONE,
  
  CONSTRAINT tenant_slug_format CHECK (slug ~ '^[a-z0-9\-]{3,50}$')
);

CREATE INDEX idx_tenants_slug ON tenants(slug);
CREATE INDEX idx_tenants_status ON tenants(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_tenants_created ON tenants(created_at DESC);

COMMENT ON TABLE tenants IS 'Core tenant isolation. Every row in other tables must reference tenant_id.';
COMMENT ON COLUMN tenants.data_classification IS 'Used for governance: restricts access to sensitive fields per tenant';

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 4: AUTHENTICATION & IDENTITY (Master Users)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Identity
  email email_domain NOT NULL,
  email_verified BOOLEAN DEFAULT FALSE,
  email_verified_at TIMESTAMP WITH TIME ZONE,
  
  -- Profile
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  avatar_url TEXT,
  phone VARCHAR(20),
  
  -- Authentication
  password_hash VARCHAR(255),  -- bcrypt or argon2
  password_changed_at TIMESTAMP WITH TIME ZONE,
  last_login_at TIMESTAMP WITH TIME ZONE,
  mfa_enabled BOOLEAN DEFAULT FALSE,
  mfa_secret VARCHAR(255),  -- TOTP secret (encrypted at app level)
  
  -- Personal CPF (optional, for internal team)
  cpf cpf_domain UNIQUE,  -- Only if user is employee
  
  -- Status
  status user_status DEFAULT 'pending_verification' NOT NULL,
  is_deleted BOOLEAN DEFAULT FALSE,
  
  -- Tracking
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  deleted_at TIMESTAMP WITH TIME ZONE,
  
  -- Constraints
  CONSTRAINT users_unique_email_per_tenant UNIQUE(tenant_id, email),
  CONSTRAINT users_name_not_empty CHECK (
    TRIM(first_name) != '' AND TRIM(last_name) != ''
  )
);

CREATE INDEX idx_users_tenant_email ON users(tenant_id, email);
CREATE INDEX idx_users_tenant_status ON users(tenant_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_email_verified ON users(email) WHERE email_verified = TRUE;
CREATE INDEX idx_users_created ON users(created_at DESC);

COMMENT ON TABLE users IS 'Master user table. One user = one login account across all products.';
COMMENT ON COLUMN users.cpf IS 'CPF stored normalized (11 digits). Only for employees, not client users.';

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 5: ROLE-BASED ACCESS CONTROL (RBAC)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Role Definition
  name VARCHAR(100) NOT NULL,
  description TEXT,
  role_type user_role_type NOT NULL,  -- Categorize: admin, manager, sales, etc.
  
  -- Scope
  is_system_role BOOLEAN DEFAULT FALSE,  -- Cannot be deleted
  is_default BOOLEAN DEFAULT FALSE,     -- Default for new users
  
  -- Priority (for role conflict resolution)
  priority INT DEFAULT 0,
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Tracking
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  
  -- Constraints
  CONSTRAINT roles_unique_name_per_tenant UNIQUE(tenant_id, name),
  CONSTRAINT roles_not_system_delete CHECK (NOT is_system_role OR is_active)
);

CREATE INDEX idx_roles_tenant ON roles(tenant_id);
CREATE INDEX idx_roles_type ON roles(role_type);

COMMENT ON TABLE roles IS 'Role definitions per tenant. System roles (admin, manager) provided by default.';

-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Permission Key (global, shared across tenants)
  name VARCHAR(255) NOT NULL UNIQUE,  -- e.g., 'contact:create', 'payment:approve'
  description TEXT,
  
  -- Resource & Action
  resource VARCHAR(100) NOT NULL,  -- 'contact', 'deal', 'payment', 'user', 'audit'
  action VARCHAR(50) NOT NULL,     -- 'create', 'read', 'update', 'delete', 'approve'
  
  -- Scope
  is_system_permission BOOLEAN DEFAULT FALSE,  -- Core permissions, cannot delete
  requires_approval BOOLEAN DEFAULT FALSE,      -- Needs manager sign-off
  
  -- Tracking
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  
  -- Constraints
  CONSTRAINT permissions_name_format CHECK (
    name ~ '^[a-z_]+:[a-z_]+$'  -- e.g., contact:create
  )
);

CREATE INDEX idx_permissions_resource ON permissions(resource);
CREATE INDEX idx_permissions_action ON permissions(action);

COMMENT ON TABLE permissions IS 'Global permission catalog. Shared across all tenants.';

-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  
  -- Conditions (for ABAC - Attribute-Based Access Control)
  condition_type VARCHAR(50),  -- 'none', 'own_record', 'department', 'custom'
  condition_value JSONB,       -- e.g., {"department": "sales"}
  
  -- Tracking
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  
  -- Constraints
  CONSTRAINT role_permissions_unique UNIQUE(role_id, permission_id)
);

CREATE INDEX idx_role_permissions_role ON role_permissions(role_id);
CREATE INDEX idx_role_permissions_permission ON role_permissions(permission_id);

COMMENT ON TABLE role_permissions IS 'Maps permissions to roles. Supports conditions for ABAC.';

-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  
  -- Assignment Metadata
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  assigned_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  revoked_at TIMESTAMP WITH TIME ZONE,
  revoked_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  
  -- Tracking
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  
  -- Constraints
  CONSTRAINT user_roles_active CHECK (revoked_at IS NULL OR revoked_at >= assigned_at),
  CONSTRAINT user_roles_unique UNIQUE(user_id, role_id)
);

CREATE INDEX idx_user_roles_user ON user_roles(user_id, tenant_id);
CREATE INDEX idx_user_roles_role ON user_roles(role_id);
CREATE INDEX idx_user_roles_tenant ON user_roles(tenant_id) WHERE revoked_at IS NULL;
CREATE INDEX idx_user_roles_active ON user_roles(user_id) WHERE revoked_at IS NULL;

COMMENT ON TABLE user_roles IS 'User role assignments. Soft delete via revoked_at.';

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 6: COMPANIES & CLIENTS
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Company Identity (GOVERNANCE FIELDS - PROTECTED)
  name VARCHAR(255) NOT NULL,
  cnpj cnpj_domain,
  legal_name VARCHAR(255),  -- Full legal name
  company_type company_type DEFAULT 'client' NOT NULL,
  
  -- Contact & Legal
  email email_domain,
  phone VARCHAR(20),
  website VARCHAR(255),
  
  -- Address (structured)
  address_street VARCHAR(255),
  address_number VARCHAR(10),
  address_complement VARCHAR(255),
  address_city VARCHAR(100),
  address_state VARCHAR(2),
  address_zipcode VARCHAR(10),
  address_country VARCHAR(2) DEFAULT 'BR',
  
  -- Financial
  industry VARCHAR(100),
  company_size VARCHAR(50),  -- 'startup', 'small', 'medium', 'enterprise'
  annual_revenue DECIMAL(15, 2),
  
  -- Custom Fields (dynamic)
  custom_fields JSONB DEFAULT '{}',
  
  -- Status & Governance
  status VARCHAR(50) DEFAULT 'active' NOT NULL,  -- 'active', 'inactive', 'blocked'
  governance_approved_by UUID REFERENCES users(id) ON DELETE SET NULL,  -- DPO approval
  governance_approved_at TIMESTAMP WITH TIME ZONE,
  governance_notes TEXT,  -- Why fields are locked/approved
  
  -- Tracking
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  deleted_at TIMESTAMP WITH TIME ZONE,
  
  -- Constraints
  CONSTRAINT companies_cnpj_unique UNIQUE(tenant_id, cnpj),
  CONSTRAINT companies_name_not_empty CHECK (TRIM(name) != '')
);

CREATE INDEX idx_companies_tenant ON companies(tenant_id);
CREATE INDEX idx_companies_cnpj ON companies(cnpj) WHERE cnpj IS NOT NULL;
CREATE INDEX idx_companies_name_gin ON companies USING GIN(to_tsvector('portuguese', name));
CREATE INDEX idx_companies_status ON companies(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_companies_created ON companies(created_at DESC);
CREATE INDEX idx_companies_type ON companies(company_type) WHERE deleted_at IS NULL;

COMMENT ON TABLE companies IS 'Companies/Clients. CNPJ, legal_name, company_name are governance-protected fields.';
COMMENT ON COLUMN companies.governance_approved_by IS 'DPO or compliance officer approval for governance fields.';
COMMENT ON COLUMN companies.custom_fields IS 'Flexible JSONB for tenant-specific data (not governance-protected).';

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 7: DYNAMIC FIELDS (Column Customization)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE dynamic_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Field Definition
  name VARCHAR(100) NOT NULL,         -- 'client_segment', 'priority_level'
  label VARCHAR(255) NOT NULL,        -- Display name
  description TEXT,
  
  -- Technical
  field_type field_type NOT NULL,     -- 'text', 'email', 'select', etc.
  table_name VARCHAR(100) NOT NULL,   -- Which table: 'companies', 'contacts', 'deals'
  
  -- Configuration
  is_required BOOLEAN DEFAULT FALSE,
  is_unique BOOLEAN DEFAULT FALSE,
  is_searchable BOOLEAN DEFAULT TRUE,
  is_sortable BOOLEAN DEFAULT TRUE,
  
  -- Validation
  validation_regex VARCHAR(500),      -- Regex pattern
  min_length INT,
  max_length INT,
  min_value DECIMAL(10, 2),
  max_value DECIMAL(10, 2),
  
  -- Options (for select/multiselect)
  options JSONB,  -- [{"value": "vip", "label": "VIP Cliente"}, ...]
  
  -- Default Value
  default_value TEXT,
  
  -- Governance (cannot be modified after creation if protected)
  is_governance_field BOOLEAN DEFAULT FALSE,
  governance_type governance_field_type,  -- If governance_field = true
  
  -- UI/UX
  field_order INT DEFAULT 0,
  is_visible BOOLEAN DEFAULT TRUE,
  visibility_roles UUID[] DEFAULT '{}',  -- Empty = visible to all
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  is_archived BOOLEAN DEFAULT FALSE,
  
  -- Tracking
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  deleted_at TIMESTAMP WITH TIME ZONE,
  
  -- Constraints
  CONSTRAINT dynamic_fields_unique_name UNIQUE(tenant_id, table_name, name),
  CONSTRAINT dynamic_fields_no_edit_if_governance CHECK (
    NOT is_governance_field OR is_active  -- Governance fields stay active
  )
);

CREATE INDEX idx_dynamic_fields_tenant_table ON dynamic_fields(tenant_id, table_name);
CREATE INDEX idx_dynamic_fields_active ON dynamic_fields(tenant_id, table_name) 
  WHERE is_active = TRUE AND deleted_at IS NULL;
CREATE INDEX idx_dynamic_fields_type ON dynamic_fields(field_type);

COMMENT ON TABLE dynamic_fields IS 'Dynamic field definitions. Stored in JSONB columns, not as physical columns.';
COMMENT ON COLUMN dynamic_fields.options IS 'For select/multiselect: [{"value": "...", "label": "..."}, ...]';
COMMENT ON COLUMN dynamic_fields.governance_type IS 'If governance_field=true, specifies immutable type.';

-- ─────────────────────────────────────────────────────────────────────────────

-- PERFORMANCE: Store dynamic field values in JSONB columns in parent tables
-- (companies.custom_fields, contacts.custom_fields, deals.custom_fields)
-- NOT in separate tables. This avoids N+1 queries and lateral joins.

-- If you need historical tracking of field changes, use audit_log (see below).

COMMENT ON SCHEMA public IS 'Dynamic fields are stored as JSONB in parent tables for performance.';

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 8: CONTACTS & LEADS
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  
  -- Identity
  email email_domain NOT NULL,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  phone VARCHAR(20),
  
  -- Personal CPF (optional)
  cpf cpf_domain,
  
  -- Professional
  job_title VARCHAR(100),
  department VARCHAR(100),
  linkedin_url TEXT,
  
  -- Lifecycle
  lead_source VARCHAR(100),  -- 'website', 'email', 'phone', 'import', etc.
  lead_status VARCHAR(50) DEFAULT 'new',  -- 'new', 'contacted', 'qualified', 'converted'
  
  -- Engagement
  last_interaction_at TIMESTAMP WITH TIME ZONE,
  interaction_count INT DEFAULT 0,
  
  -- Custom Fields (JSONB - for dynamic fields)
  custom_fields JSONB DEFAULT '{}',
  
  -- Tags
  tags TEXT[] DEFAULT '{}',
  
  -- Status & Compliance
  status VARCHAR(50) DEFAULT 'active' NOT NULL,
  do_not_contact BOOLEAN DEFAULT FALSE,  -- LGPD: user requested no contact
  consent_given_at TIMESTAMP WITH TIME ZONE,
  
  -- Tracking
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  deleted_at TIMESTAMP WITH TIME ZONE,
  
  -- Constraints
  CONSTRAINT contacts_email_not_empty CHECK (TRIM(email) != ''),
  CONSTRAINT contacts_unique_email_per_tenant UNIQUE(tenant_id, email)
);

-- ❌ CRITICAL: Create HASH index on custom_fields for queries like:
-- SELECT * FROM contacts WHERE custom_fields->>'segment' = 'vip'
-- This avoids sequential scans on large tables.

CREATE INDEX idx_contacts_tenant_email ON contacts(tenant_id, email) 
  WHERE deleted_at IS NULL;
CREATE INDEX idx_contacts_tenant_created ON contacts(tenant_id, created_at DESC) 
  WHERE deleted_at IS NULL;
CREATE INDEX idx_contacts_lead_status ON contacts(tenant_id, lead_status) 
  WHERE deleted_at IS NULL AND lead_status != 'converted';
CREATE INDEX idx_contacts_company ON contacts(company_id) 
  WHERE deleted_at IS NULL;
CREATE INDEX idx_contacts_tags ON contacts USING GIN(tags) 
  WHERE deleted_at IS NULL;

-- PERFORMANCE: GIN index for common JSONB queries
CREATE INDEX idx_contacts_custom_fields_gin ON contacts USING GIN(custom_fields) 
  WHERE deleted_at IS NULL;

-- For full-text search
CREATE INDEX idx_contacts_search ON contacts USING GiST(
  to_tsvector('portuguese', COALESCE(first_name, '') || ' ' || 
                             COALESCE(last_name, '') || ' ' ||
                             COALESCE(email, ''))
) WHERE deleted_at IS NULL;

-- For lead engagement scoring
CREATE INDEX idx_contacts_interaction_recent ON contacts(tenant_id, last_interaction_at DESC) 
  WHERE deleted_at IS NULL AND status = 'active';

COMMENT ON TABLE contacts IS 'Contacts/Leads. Custom fields stored as JSONB. RLS policy: only see own tenant.';
COMMENT ON COLUMN contacts.custom_fields IS 'Dynamic field values: {"segment": "vip", "priority": "high"}';

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 9: DEALS & OPPORTUNITIES
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  assigned_to_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  
  -- Deal Info
  title VARCHAR(255) NOT NULL,
  description TEXT,
  
  -- Pipeline
  pipeline_stage VARCHAR(100) DEFAULT 'new',  -- 'new', 'contact', 'proposal', 'negotiation', 'won', 'lost'
  probability INT DEFAULT 0,  -- 0-100%
  
  -- Financial
  amount DECIMAL(15, 2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'BRL',
  expected_close_date DATE,
  
  -- Custom Fields
  custom_fields JSONB DEFAULT '{}',
  
  -- Status
  status VARCHAR(50) DEFAULT 'open' NOT NULL,  -- 'open', 'won', 'lost'
  win_date TIMESTAMP WITH TIME ZONE,
  loss_reason VARCHAR(255),
  
  -- Tracking
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  deleted_at TIMESTAMP WITH TIME ZONE,
  
  -- Constraints
  CONSTRAINT deals_title_not_empty CHECK (TRIM(title) != ''),
  CONSTRAINT deals_probability_range CHECK (probability >= 0 AND probability <= 100),
  CONSTRAINT deals_amount_positive CHECK (amount > 0),
  CONSTRAINT deals_status_valid CHECK (status IN ('open', 'won', 'lost'))
);

CREATE INDEX idx_deals_tenant ON deals(tenant_id);
CREATE INDEX idx_deals_contact ON deals(contact_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_deals_company ON deals(company_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_deals_assigned_to ON deals(assigned_to_user_id) WHERE status = 'open';
CREATE INDEX idx_deals_stage ON deals(tenant_id, pipeline_stage) WHERE status = 'open';
CREATE INDEX idx_deals_close_date ON deals(expected_close_date) WHERE status = 'open';
CREATE INDEX idx_deals_created ON deals(created_at DESC);
CREATE INDEX idx_deals_amount ON deals(amount DESC) WHERE status = 'open';

-- For forecasting
CREATE INDEX idx_deals_forecast ON deals(tenant_id, pipeline_stage, probability) 
  WHERE status = 'open' AND deleted_at IS NULL;

COMMENT ON TABLE deals IS 'Sales deals/opportunities. Track pipeline stage and probability.';

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 10: INTERACTIONS (Activity Log)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  deal_id UUID REFERENCES deals(id) ON DELETE SET NULL,
  
  -- Interaction Type
  interaction_type VARCHAR(50) NOT NULL,  -- 'call', 'email', 'meeting', 'note', 'task'
  subject VARCHAR(255),
  description TEXT,
  
  -- Metadata
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  interaction_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  
  -- Status
  is_completed BOOLEAN DEFAULT FALSE,
  
  -- Tracking
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_interactions_contact ON interactions(contact_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_interactions_deal ON interactions(deal_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_interactions_tenant_date ON interactions(tenant_id, interaction_date DESC) 
  WHERE deleted_at IS NULL;
CREATE INDEX idx_interactions_created_by ON interactions(created_by_user_id);

COMMENT ON TABLE interactions IS 'Activity timeline. Not directly accessible, use via contacts/deals.';

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 11: TABLE VIEWS (User Presets)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE table_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- View Definition
  name VARCHAR(255) NOT NULL,
  description TEXT,
  table_name VARCHAR(100) NOT NULL,  -- 'contacts', 'deals', 'companies'
  
  -- Configuration (JSON)
  column_layout JSONB,  -- {"columns": ["email", "name", "created_at"], "order": [1, 2, 3]}
  filters JSONB DEFAULT '{}',  -- {"lead_status": "new", "company_id": "..."}
  sort JSONB,  -- {"field": "created_at", "direction": "DESC"}
  
  -- Sharing
  is_public BOOLEAN DEFAULT FALSE,  -- Shared with team
  is_default BOOLEAN DEFAULT FALSE,  -- Default view for table
  
  -- Tracking
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  
  -- Constraints
  CONSTRAINT table_views_unique_default UNIQUE(tenant_id, table_name, is_default) 
    WHERE is_default = TRUE
);

CREATE INDEX idx_table_views_user ON table_views(created_by_user_id);
CREATE INDEX idx_table_views_table ON table_views(tenant_id, table_name);
CREATE INDEX idx_table_views_default ON table_views(tenant_id, table_name) 
  WHERE is_default = TRUE;

COMMENT ON TABLE table_views IS 'User-defined view presets (columns, filters, sorting).';

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 12: SUPPORT TICKETS
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Ticket Info
  ticket_number VARCHAR(50) NOT NULL,  -- e.g., "TICKET-0001"
  title VARCHAR(255) NOT NULL,
  description TEXT,
  
  -- Classification
  category VARCHAR(100),  -- 'technical', 'billing', 'feature_request', 'general'
  priority ticket_priority DEFAULT 'medium' NOT NULL,
  status ticket_status DEFAULT 'open' NOT NULL,
  
  -- Relationships
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  assigned_to_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Resolution
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolution_notes TEXT,
  
  -- Tracking
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  deleted_at TIMESTAMP WITH TIME ZONE,
  
  -- Constraints
  CONSTRAINT support_tickets_number_unique UNIQUE(tenant_id, ticket_number),
  CONSTRAINT support_tickets_title_not_empty CHECK (TRIM(title) != '')
);

CREATE INDEX idx_support_tickets_tenant ON support_tickets(tenant_id);
CREATE INDEX idx_support_tickets_number ON support_tickets(tenant_id, ticket_number);
CREATE INDEX idx_support_tickets_status ON support_tickets(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_support_tickets_assigned ON support_tickets(assigned_to_user_id) 
  WHERE status != 'closed' AND deleted_at IS NULL;
CREATE INDEX idx_support_tickets_created ON support_tickets(created_at DESC);

COMMENT ON TABLE support_tickets IS 'Support/Help desk system.';

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 13: BILLING & PAYMENTS
-- ─────────────────────────────────────────────────────────────────────────────

-- Invoices
CREATE TABLE billing_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Invoice Number
  invoice_number VARCHAR(50) NOT NULL,
  invoice_series VARCHAR(10) DEFAULT 'NF-E',  -- For Brazilian invoicing
  
  -- Dates
  issue_date DATE NOT NULL,
  due_date DATE NOT NULL,
  
  -- Financial
  subtotal DECIMAL(15, 2) NOT NULL,
  tax_amount DECIMAL(15, 2) DEFAULT 0,
  total_amount DECIMAL(15, 2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'BRL',
  
  -- Status
  status invoice_status DEFAULT 'draft' NOT NULL,
  paid_amount DECIMAL(15, 2) DEFAULT 0,
  
  -- Company
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  
  -- Notes
  notes TEXT,
  
  -- Tracking
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  deleted_at TIMESTAMP WITH TIME ZONE,
  
  -- Constraints
  CONSTRAINT billing_invoices_number_unique UNIQUE(tenant_id, invoice_series, invoice_number),
  CONSTRAINT billing_invoices_amounts_positive CHECK (
    subtotal >= 0 AND tax_amount >= 0 AND total_amount > 0 AND paid_amount >= 0
  ),
  CONSTRAINT billing_invoices_paid_not_exceed CHECK (paid_amount <= total_amount)
);

CREATE INDEX idx_billing_invoices_tenant ON billing_invoices(tenant_id);
CREATE INDEX idx_billing_invoices_number ON billing_invoices(tenant_id, invoice_number);
CREATE INDEX idx_billing_invoices_status ON billing_invoices(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_billing_invoices_due_date ON billing_invoices(due_date) 
  WHERE status IN ('issued', 'partially_paid', 'overdue');
CREATE INDEX idx_billing_invoices_company ON billing_invoices(company_id);
CREATE INDEX idx_billing_invoices_created ON billing_invoices(created_at DESC);

COMMENT ON TABLE billing_invoices IS 'Invoices generated from deals or subscriptions.';

-- ─────────────────────────────────────────────────────────────────────────────

-- Payments
CREATE TABLE billing_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES billing_invoices(id) ON DELETE CASCADE,
  
  -- Payment Info
  payment_reference VARCHAR(100),  -- External gateway reference
  amount DECIMAL(15, 2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'BRL',
  
  -- Method
  payment_method payment_method NOT NULL,
  payment_gateway VARCHAR(50),  -- 'stripe', 'paypal', 'pix', 'boleto'
  
  -- Status
  status payment_status DEFAULT 'pending' NOT NULL,
  
  -- Dates
  payment_date TIMESTAMP WITH TIME ZONE,
  
  -- Metadata (for gateway responses)
  gateway_response JSONB,  -- Store full response from Stripe/PayPal
  
  -- Tracking
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  processed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  deleted_at TIMESTAMP WITH TIME ZONE,
  
  -- Constraints
  CONSTRAINT billing_payments_amount_positive CHECK (amount > 0),
  CONSTRAINT billing_payments_unique_reference UNIQUE(tenant_id, payment_reference) 
    WHERE payment_reference IS NOT NULL
);

CREATE INDEX idx_billing_payments_tenant ON billing_payments(tenant_id);
CREATE INDEX idx_billing_payments_invoice ON billing_payments(invoice_id);
CREATE INDEX idx_billing_payments_status ON billing_payments(status);
CREATE INDEX idx_billing_payments_date ON billing_payments(payment_date DESC) 
  WHERE status IN ('completed', 'failed');
CREATE INDEX idx_billing_payments_gateway ON billing_payments(payment_gateway, payment_reference);

COMMENT ON TABLE billing_payments IS 'Payment records (one invoice can have multiple payments).';

-- ─────────────────────────────────────────────────────────────────────────────

-- Payment Events (for webhook processing and reconciliation)
CREATE TABLE billing_events (
  id BIGSERIAL PRIMARY KEY,
  event_id UUID UNIQUE NOT NULL,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  payment_id UUID REFERENCES billing_payments(id) ON DELETE SET NULL,
  
  -- Event Details
  event_type VARCHAR(100) NOT NULL,  -- 'payment.created', 'payment.succeeded', 'payment.failed'
  event_source VARCHAR(50),  -- 'stripe', 'paypal', 'pix'
  
  -- Data
  event_data JSONB,  -- Full webhook payload
  
  -- Processing
  processed BOOLEAN DEFAULT FALSE,
  processed_at TIMESTAMP WITH TIME ZONE,
  processing_error TEXT,
  
  -- Tracking
  received_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  
  -- Constraints
  CONSTRAINT billing_events_type_valid CHECK (
    event_type ~ '^[a-z_]+\.[a-z_]+$'  -- e.g., payment.succeeded
  )
) PARTITION BY RANGE (created_at);

-- Create partitions for rolling window (last 2 years)
-- This allows easy archival and deletion of old events
CREATE TABLE billing_events_2026_01 PARTITION OF billing_events
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
CREATE TABLE billing_events_2026_02 PARTITION OF billing_events
  FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
-- (Add more as needed during runtime with migration scripts)

CREATE INDEX idx_billing_events_tenant ON billing_events(tenant_id, created_at DESC);
CREATE INDEX idx_billing_events_event_id ON billing_events(event_id);
CREATE INDEX idx_billing_events_processed ON billing_events(processed) 
  WHERE processed = FALSE;
CREATE INDEX idx_billing_events_type ON billing_events(event_type);

COMMENT ON TABLE billing_events IS 'Webhook events from payment gateways. Partitioned by date for archival.';

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 14: AUDIT LOG (IMMUTABLE, APPEND-ONLY, WORM)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE audit_log (
  id BIGSERIAL PRIMARY KEY,  -- Sequential ID for ordering
  event_id UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),  -- Idempotency key
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  
  -- Action Details
  action VARCHAR(100) NOT NULL,  -- 'CREATE', 'UPDATE', 'DELETE', 'EXPORT', 'APPROVE'
  resource_type VARCHAR(50) NOT NULL,  -- 'contact', 'company', 'payment', 'user', 'role'
  resource_id UUID NOT NULL,
  
  -- Changes
  before_state JSONB,  -- Previous values
  after_state JSONB,   -- New values
  changes JSONB,       -- Diff: {"email": {"old": "...", "new": "..."}}
  
  -- Context
  ip_address INET,
  user_agent TEXT,
  request_id VARCHAR(100),  -- Correlation ID from API
  
  -- Additional Metadata
  metadata JSONB,  -- Custom data: {"reason": "...", "approval_id": "..."}
  
  -- Governance (for immutability)
  hash_value VARCHAR(64),  -- SHA256(event_id + tenant_id + created_at + action)
  
  -- Tracking (IMMUTABLE)
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  -- Constraints (ENFORCE IMMUTABILITY)
  CONSTRAINT audit_log_created_not_null CHECK (created_at IS NOT NULL),
  CONSTRAINT audit_log_action_not_empty CHECK (TRIM(action) != ''),
  CONSTRAINT audit_log_resource_type_valid CHECK (
    resource_type IN ('contact', 'company', 'payment', 'user', 'role', 'deal', 'invoice', 'ticket', 'interaction')
  )
) PARTITION BY RANGE (created_at);

-- Monthly partitions (rolling window)
-- Partition strategy: 1 month per partition = 12 partitions/year
-- Allows easy archival to Glacier after 7 years

CREATE TABLE audit_log_2026_01 PARTITION OF audit_log
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
CREATE TABLE audit_log_2026_02 PARTITION OF audit_log
  FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
-- (More partitions created via migration scripts as time progresses)

-- Indexes for audit_log (CRITICAL for query performance)
-- Q1: "Give me audit trail for resource X"
CREATE INDEX idx_audit_log_resource ON audit_log(resource_type, resource_id, created_at DESC);

-- Q2: "Give me all actions by user Y in timeframe Z"
CREATE INDEX idx_audit_log_user_date ON audit_log(user_id, created_at DESC) 
  WHERE user_id IS NOT NULL;

-- Q3: "Give me audit events for tenant with filters"
CREATE INDEX idx_audit_log_tenant_date ON audit_log(tenant_id, created_at DESC);

-- Q4: "Find events by action type (for compliance queries)"
CREATE INDEX idx_audit_log_action ON audit_log(action);

-- Q5: "Idempotency check (event_id must be unique)"
CREATE UNIQUE INDEX idx_audit_log_event_id ON audit_log(event_id);

-- Q6: "Range queries by date (for monthly archival)"
CREATE INDEX idx_audit_log_created ON audit_log(created_at DESC);

-- BRIN index for large date ranges (faster than BTREE for time-series)
CREATE INDEX idx_audit_log_created_brin ON audit_log USING BRIN(created_at) 
  WITH (pages_per_range = 128);

COMMENT ON TABLE audit_log IS 'Immutable audit log (WORM). Append-only, no updates/deletes.';
COMMENT ON COLUMN audit_log.hash_value IS 'SHA256 for integrity verification. Part of compliance evidence.';
COMMENT ON COLUMN audit_log.event_id IS 'Idempotency key for deduplication (Kafka consumer).';

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 15: ROW-LEVEL SECURITY (RLS) - TENANT ISOLATION
-- ─────────────────────────────────────────────────────────────────────────────

-- Enable RLS on all tables with tenant isolation
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE dynamic_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE table_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────────────────────

-- RLS Policy: Users can only see their own tenant's data
-- (Assumes app sets context: SELECT set_config('app.current_tenant_id', 'tenant-uuid', false))

CREATE POLICY rls_policy_users ON users
  USING (tenant_id = current_setting('app.current_tenant_id')::UUID)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::UUID);

CREATE POLICY rls_policy_roles ON roles
  USING (tenant_id = current_setting('app.current_tenant_id')::UUID)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::UUID);

CREATE POLICY rls_policy_user_roles ON user_roles
  USING (tenant_id = current_setting('app.current_tenant_id')::UUID)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::UUID);

CREATE POLICY rls_policy_companies ON companies
  USING (tenant_id = current_setting('app.current_tenant_id')::UUID)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::UUID);

CREATE POLICY rls_policy_dynamic_fields ON dynamic_fields
  USING (tenant_id = current_setting('app.current_tenant_id')::UUID)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::UUID);

CREATE POLICY rls_policy_contacts ON contacts
  USING (tenant_id = current_setting('app.current_tenant_id')::UUID)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::UUID);

CREATE POLICY rls_policy_deals ON deals
  USING (tenant_id = current_setting('app.current_tenant_id')::UUID)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::UUID);

CREATE POLICY rls_policy_interactions ON interactions
  USING (tenant_id = current_setting('app.current_tenant_id')::UUID)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::UUID);

CREATE POLICY rls_policy_table_views ON table_views
  USING (tenant_id = current_setting('app.current_tenant_id')::UUID)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::UUID);

CREATE POLICY rls_policy_support_tickets ON support_tickets
  USING (tenant_id = current_setting('app.current_tenant_id')::UUID)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::UUID);

CREATE POLICY rls_policy_billing_invoices ON billing_invoices
  USING (tenant_id = current_setting('app.current_tenant_id')::UUID)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::UUID);

CREATE POLICY rls_policy_billing_payments ON billing_payments
  USING (tenant_id = current_setting('app.current_tenant_id')::UUID)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::UUID);

CREATE POLICY rls_policy_billing_events ON billing_events
  USING (tenant_id = current_setting('app.current_tenant_id')::UUID)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::UUID);

CREATE POLICY rls_policy_audit_log ON audit_log
  USING (tenant_id = current_setting('app.current_tenant_id')::UUID)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- Permissions table (no tenant RLS, global catalog)
-- Intentionally NOT applying RLS to 'permissions' table since it's global

COMMENT ON SCHEMA public IS 'RLS policies enforce tenant isolation. Always call set_config(app.current_tenant_id, ...) before queries.';

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 16: HELPER FUNCTIONS
-- ─────────────────────────────────────────────────────────────────────────────

-- Function to set tenant context (call from app middleware)
CREATE OR REPLACE FUNCTION set_tenant_context(p_tenant_id UUID)
RETURNS void AS $$
BEGIN
  PERFORM set_config('app.current_tenant_id', p_tenant_id::text, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION set_tenant_context IS 'Call from middleware to set current tenant. Enables RLS policies.';

-- ─────────────────────────────────────────────────────────────────────────────

-- Function to normalize CPF (remove non-digits)
CREATE OR REPLACE FUNCTION normalize_cpf(p_cpf TEXT)
RETURNS cpf_domain AS $$
DECLARE
  v_normalized TEXT;
BEGIN
  v_normalized := regexp_replace(p_cpf, '[^0-9]', '', 'g');
  IF LENGTH(v_normalized) != 11 THEN
    RAISE EXCEPTION 'Invalid CPF length. Expected 11 digits, got %', LENGTH(v_normalized);
  END IF;
  RETURN v_normalized::cpf_domain;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ─────────────────────────────────────────────────────────────────────────────

-- Function to normalize CNPJ (remove non-digits)
CREATE OR REPLACE FUNCTION normalize_cnpj(p_cnpj TEXT)
RETURNS cnpj_domain AS $$
DECLARE
  v_normalized TEXT;
BEGIN
  v_normalized := regexp_replace(p_cnpj, '[^0-9]', '', 'g');
  IF LENGTH(v_normalized) != 14 THEN
    RAISE EXCEPTION 'Invalid CNPJ length. Expected 14 digits, got %', LENGTH(v_normalized);
  END IF;
  RETURN v_normalized::cnpj_domain;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ─────────────────────────────────────────────────────────────────────────────

-- Function to compute hash for audit_log integrity (SHA256)
CREATE OR REPLACE FUNCTION compute_audit_hash(
  p_event_id UUID,
  p_tenant_id UUID,
  p_created_at TIMESTAMP WITH TIME ZONE,
  p_action VARCHAR
)
RETURNS VARCHAR(64) AS $$
BEGIN
  RETURN encode(
    digest(
      CONCAT(p_event_id, p_tenant_id, p_created_at, p_action),
      'sha256'
    ),
    'hex'
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ─────────────────────────────────────────────────────────────────────────────

-- Trigger: Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to tables with updated_at
DO $$
DECLARE
  v_table VARCHAR;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'tenants', 'users', 'roles', 'role_permissions', 'user_roles',
    'companies', 'dynamic_fields', 'contacts', 'deals', 'interactions',
    'table_views', 'support_tickets', 'billing_invoices', 'billing_payments'
  ]
  LOOP
    EXECUTE FORMAT(
      'CREATE TRIGGER trg_update_timestamp BEFORE UPDATE ON %I
       FOR EACH ROW EXECUTE FUNCTION update_timestamp()',
      v_table
    );
  END LOOP;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 17: INITIAL DATA (Bootstrap)
-- ─────────────────────────────────────────────────────────────────────────────

-- Insert core permissions (global catalog)
INSERT INTO permissions (name, resource, action, is_system_permission, description)
VALUES
  -- User Management
  ('user:create', 'user', 'create', true, 'Create new user'),
  ('user:read', 'user', 'read', true, 'Read user profile'),
  ('user:update', 'user', 'update', true, 'Update user'),
  ('user:delete', 'user', 'delete', true, 'Delete user'),
  
  -- Contact Management
  ('contact:create', 'contact', 'create', true, 'Create contact'),
  ('contact:read', 'contact', 'read', true, 'Read contact'),
  ('contact:update', 'contact', 'update', true, 'Update contact'),
  ('contact:delete', 'contact', 'delete', true, 'Delete contact'),
  
  -- Deal Management
  ('deal:create', 'deal', 'create', true, 'Create deal'),
  ('deal:read', 'deal', 'read', true, 'Read deal'),
  ('deal:update', 'deal', 'update', true, 'Update deal'),
  ('deal:delete', 'deal', 'delete', true, 'Delete deal'),
  
  -- Payment & Billing
  ('payment:create', 'payment', 'create', true, 'Create payment'),
  ('payment:read', 'payment', 'read', true, 'Read payment'),
  ('payment:approve', 'payment', 'approve', true, 'Approve payment', true),
  
  -- Audit
  ('audit:read', 'audit', 'read', true, 'Read audit log'),
  
  -- Role Management
  ('role:create', 'role', 'create', true, 'Create role'),
  ('role:read', 'role', 'read', true, 'Read role'),
  ('role:update', 'role', 'update', true, 'Update role'),
  ('role:delete', 'role', 'delete', true, 'Delete role')
ON CONFLICT (name) DO NOTHING;

COMMENT ON SECTION '17: INITIAL DATA' IS 'Permissions are global, system-provided.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- END OF SCHEMA
-- ═══════════════════════════════════════════════════════════════════════════════

/*
USAGE GUIDE:

1. Initialize tenant context before every query:
   SELECT set_tenant_context('xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx');
   SELECT * FROM contacts;  -- RLS policy applied automatically

2. Inserting custom fields:
   UPDATE contacts SET custom_fields = custom_fields || '{"segment": "vip", "priority": 2}'
   WHERE id = '...';

3. Querying custom fields:
   SELECT * FROM contacts 
   WHERE custom_fields->>'segment' = 'vip'
   AND (custom_fields->>'priority')::INT > 1;

4. Audit trail for a resource:
   SELECT * FROM audit_log 
   WHERE resource_type = 'contact' 
   AND resource_id = 'contact-uuid'
   ORDER BY created_at DESC;

5. Payment reconciliation (webhook handling):
   INSERT INTO billing_payments (tenant_id, invoice_id, amount, payment_method, status)
   VALUES (tenant_id, invoice_id, amount, 'stripe', 'pending')
   RETURNING id;

6. Dynamic fields query (example):
   SELECT df.* FROM dynamic_fields df
   WHERE df.tenant_id = current_setting('app.current_tenant_id')::UUID
   AND df.table_name = 'contacts'
   AND df.is_active = true
   ORDER BY df.field_order;
*/
