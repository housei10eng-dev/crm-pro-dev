-- ═══════════════════════════════════════════════════════════════════════════════
-- Migrations - CRM SaaS Multi-Tenant Database
-- Using plain SQL (for use with any migration tool)
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 001: Initialize Extensions & Core Types
-- ─────────────────────────────────────────────────────────────────────────────
-- Up

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gin";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- Enums
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

-- Domains
CREATE DOMAIN cpf_domain AS TEXT CHECK (VALUE ~ '^\d{11}$');
CREATE DOMAIN cnpj_domain AS TEXT CHECK (VALUE ~ '^\d{14}$');
CREATE DOMAIN email_domain AS TEXT CHECK (VALUE ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$');

-- Down
DROP DOMAIN IF EXISTS email_domain CASCADE;
DROP DOMAIN IF EXISTS cnpj_domain CASCADE;
DROP DOMAIN IF EXISTS cpf_domain CASCADE;
DROP TYPE IF EXISTS governance_field_type CASCADE;
DROP TYPE IF EXISTS field_type CASCADE;
DROP TYPE IF EXISTS invoice_status CASCADE;
DROP TYPE IF EXISTS payment_method CASCADE;
DROP TYPE IF EXISTS payment_status CASCADE;
DROP TYPE IF EXISTS ticket_priority CASCADE;
DROP TYPE IF EXISTS ticket_status CASCADE;
DROP TYPE IF EXISTS company_type CASCADE;
DROP TYPE IF EXISTS user_role_type CASCADE;
DROP TYPE IF EXISTS user_status CASCADE;
DROP TYPE IF EXISTS subscription_tier CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 002: Tenants Table (Foundation)
-- ─────────────────────────────────────────────────────────────────────────────
-- Up

CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  subscription_tier subscription_tier DEFAULT 'starter' NOT NULL,
  custom_limit_contacts INT DEFAULT 5000,
  custom_limit_users INT DEFAULT 10,
  cnpj cnpj_domain UNIQUE,
  legal_name VARCHAR(255),
  legal_email email_domain,
  logo_url TEXT,
  primary_color VARCHAR(7),
  timezone VARCHAR(50) DEFAULT 'America/Sao_Paulo',
  language VARCHAR(10) DEFAULT 'pt-BR',
  data_classification VARCHAR(50) DEFAULT 'standard',
  compliance_flags JSONB DEFAULT '{"gdpr": false, "lgpd": true, "hipaa": false}',
  status VARCHAR(50) DEFAULT 'active' NOT NULL,
  is_trial BOOLEAN DEFAULT FALSE,
  trial_expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  created_by_user_id UUID,
  deleted_at TIMESTAMP WITH TIME ZONE,
  
  CONSTRAINT tenant_slug_format CHECK (slug ~ '^[a-z0-9\-]{3,50}$')
);

CREATE INDEX idx_tenants_slug ON tenants(slug);
CREATE INDEX idx_tenants_status ON tenants(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_tenants_created ON tenants(created_at DESC);

-- Down
DROP TABLE IF EXISTS tenants CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 003: Users Table
-- ─────────────────────────────────────────────────────────────────────────────
-- Up

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email email_domain NOT NULL,
  email_verified BOOLEAN DEFAULT FALSE,
  email_verified_at TIMESTAMP WITH TIME ZONE,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  avatar_url TEXT,
  phone VARCHAR(20),
  cpf cpf_domain UNIQUE,
  password_hash VARCHAR(255),
  password_changed_at TIMESTAMP WITH TIME ZONE,
  last_login_at TIMESTAMP WITH TIME ZONE,
  mfa_enabled BOOLEAN DEFAULT FALSE,
  mfa_secret VARCHAR(255),
  status user_status DEFAULT 'pending_verification' NOT NULL,
  is_deleted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  deleted_at TIMESTAMP WITH TIME ZONE,
  
  CONSTRAINT users_unique_email_per_tenant UNIQUE(tenant_id, email),
  CONSTRAINT users_name_not_empty CHECK (
    TRIM(first_name) != '' AND TRIM(last_name) != ''
  )
);

CREATE INDEX idx_users_tenant_email ON users(tenant_id, email);
CREATE INDEX idx_users_tenant_status ON users(tenant_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_email_verified ON users(email) WHERE email_verified = TRUE;
CREATE INDEX idx_users_created ON users(created_at DESC);

-- Down
DROP TABLE IF EXISTS users CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 004: RBAC Tables (Roles, Permissions, Assignments)
-- ─────────────────────────────────────────────────────────────────────────────
-- Up

CREATE TABLE roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  role_type user_role_type NOT NULL,
  is_system_role BOOLEAN DEFAULT FALSE,
  is_default BOOLEAN DEFAULT FALSE,
  priority INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  
  CONSTRAINT roles_unique_name_per_tenant UNIQUE(tenant_id, name),
  CONSTRAINT roles_not_system_delete CHECK (NOT is_system_role OR is_active)
);

CREATE INDEX idx_roles_tenant ON roles(tenant_id);
CREATE INDEX idx_roles_type ON roles(role_type);

-- Permissions (global)
CREATE TABLE permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  resource VARCHAR(100) NOT NULL,
  action VARCHAR(50) NOT NULL,
  is_system_permission BOOLEAN DEFAULT FALSE,
  requires_approval BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  
  CONSTRAINT permissions_name_format CHECK (
    name ~ '^[a-z_]+:[a-z_]+$'
  )
);

CREATE INDEX idx_permissions_resource ON permissions(resource);
CREATE INDEX idx_permissions_action ON permissions(action);

-- Role-Permission mapping
CREATE TABLE role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  condition_type VARCHAR(50),
  condition_value JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  
  CONSTRAINT role_permissions_unique UNIQUE(role_id, permission_id)
);

CREATE INDEX idx_role_permissions_role ON role_permissions(role_id);
CREATE INDEX idx_role_permissions_permission ON role_permissions(permission_id);

-- User-Role assignment
CREATE TABLE user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  assigned_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  revoked_at TIMESTAMP WITH TIME ZONE,
  revoked_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  
  CONSTRAINT user_roles_active CHECK (revoked_at IS NULL OR revoked_at >= assigned_at),
  CONSTRAINT user_roles_unique UNIQUE(user_id, role_id)
);

CREATE INDEX idx_user_roles_user ON user_roles(user_id, tenant_id);
CREATE INDEX idx_user_roles_role ON user_roles(role_id);
CREATE INDEX idx_user_roles_tenant ON user_roles(tenant_id) WHERE revoked_at IS NULL;
CREATE INDEX idx_user_roles_active ON user_roles(user_id) WHERE revoked_at IS NULL;

-- Down
DROP TABLE IF EXISTS user_roles CASCADE;
DROP TABLE IF EXISTS role_permissions CASCADE;
DROP TABLE IF EXISTS roles CASCADE;
DROP TABLE IF EXISTS permissions CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 005: Companies (Clients & Partners)
-- ─────────────────────────────────────────────────────────────────────────────
-- Up

CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  cnpj cnpj_domain,
  legal_name VARCHAR(255),
  company_type company_type DEFAULT 'client' NOT NULL,
  email email_domain,
  phone VARCHAR(20),
  website VARCHAR(255),
  address_street VARCHAR(255),
  address_number VARCHAR(10),
  address_complement VARCHAR(255),
  address_city VARCHAR(100),
  address_state VARCHAR(2),
  address_zipcode VARCHAR(10),
  address_country VARCHAR(2) DEFAULT 'BR',
  industry VARCHAR(100),
  company_size VARCHAR(50),
  annual_revenue DECIMAL(15, 2),
  custom_fields JSONB DEFAULT '{}',
  status VARCHAR(50) DEFAULT 'active' NOT NULL,
  governance_approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  governance_approved_at TIMESTAMP WITH TIME ZONE,
  governance_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  deleted_at TIMESTAMP WITH TIME ZONE,
  
  CONSTRAINT companies_cnpj_unique UNIQUE(tenant_id, cnpj),
  CONSTRAINT companies_name_not_empty CHECK (TRIM(name) != '')
);

CREATE INDEX idx_companies_tenant ON companies(tenant_id);
CREATE INDEX idx_companies_cnpj ON companies(cnpj) WHERE cnpj IS NOT NULL;
CREATE INDEX idx_companies_name_gin ON companies USING GIN(to_tsvector('portuguese', name));
CREATE INDEX idx_companies_status ON companies(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_companies_created ON companies(created_at DESC);

-- Down
DROP TABLE IF EXISTS companies CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 006: Dynamic Fields (Customization)
-- ─────────────────────────────────────────────────────────────────────────────
-- Up

CREATE TABLE dynamic_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  label VARCHAR(255) NOT NULL,
  description TEXT,
  field_type field_type NOT NULL,
  table_name VARCHAR(100) NOT NULL,
  is_required BOOLEAN DEFAULT FALSE,
  is_unique BOOLEAN DEFAULT FALSE,
  is_searchable BOOLEAN DEFAULT TRUE,
  is_sortable BOOLEAN DEFAULT TRUE,
  validation_regex VARCHAR(500),
  min_length INT,
  max_length INT,
  min_value DECIMAL(10, 2),
  max_value DECIMAL(10, 2),
  options JSONB,
  default_value TEXT,
  is_governance_field BOOLEAN DEFAULT FALSE,
  governance_type governance_field_type,
  field_order INT DEFAULT 0,
  is_visible BOOLEAN DEFAULT TRUE,
  visibility_roles UUID[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT TRUE,
  is_archived BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  deleted_at TIMESTAMP WITH TIME ZONE,
  
  CONSTRAINT dynamic_fields_unique_name UNIQUE(tenant_id, table_name, name),
  CONSTRAINT dynamic_fields_no_edit_if_governance CHECK (
    NOT is_governance_field OR is_active
  )
);

CREATE INDEX idx_dynamic_fields_tenant_table ON dynamic_fields(tenant_id, table_name);
CREATE INDEX idx_dynamic_fields_active ON dynamic_fields(tenant_id, table_name) 
  WHERE is_active = TRUE AND deleted_at IS NULL;
CREATE INDEX idx_dynamic_fields_type ON dynamic_fields(field_type);

-- Down
DROP TABLE IF EXISTS dynamic_fields CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 007: Contacts (Leads & Contacts)
-- ─────────────────────────────────────────────────────────────────────────────
-- Up

CREATE TABLE contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  email email_domain NOT NULL,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  phone VARCHAR(20),
  cpf cpf_domain,
  job_title VARCHAR(100),
  department VARCHAR(100),
  linkedin_url TEXT,
  lead_source VARCHAR(100),
  lead_status VARCHAR(50) DEFAULT 'new',
  last_interaction_at TIMESTAMP WITH TIME ZONE,
  interaction_count INT DEFAULT 0,
  custom_fields JSONB DEFAULT '{}',
  tags TEXT[] DEFAULT '{}',
  status VARCHAR(50) DEFAULT 'active' NOT NULL,
  do_not_contact BOOLEAN DEFAULT FALSE,
  consent_given_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  deleted_at TIMESTAMP WITH TIME ZONE,
  
  CONSTRAINT contacts_email_not_empty CHECK (TRIM(email) != ''),
  CONSTRAINT contacts_unique_email_per_tenant UNIQUE(tenant_id, email)
);

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
CREATE INDEX idx_contacts_custom_fields_gin ON contacts USING GIN(custom_fields) 
  WHERE deleted_at IS NULL;
CREATE INDEX idx_contacts_search ON contacts USING GiST(
  to_tsvector('portuguese', COALESCE(first_name, '') || ' ' || 
                             COALESCE(last_name, '') || ' ' ||
                             COALESCE(email, ''))
) WHERE deleted_at IS NULL;
CREATE INDEX idx_contacts_interaction_recent ON contacts(tenant_id, last_interaction_at DESC) 
  WHERE deleted_at IS NULL AND status = 'active';

-- Down
DROP TABLE IF EXISTS contacts CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 008: Deals (Opportunities & Pipeline)
-- ─────────────────────────────────────────────────────────────────────────────
-- Up

CREATE TABLE deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  assigned_to_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  pipeline_stage VARCHAR(100) DEFAULT 'new',
  probability INT DEFAULT 0,
  amount DECIMAL(15, 2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'BRL',
  expected_close_date DATE,
  custom_fields JSONB DEFAULT '{}',
  status VARCHAR(50) DEFAULT 'open' NOT NULL,
  win_date TIMESTAMP WITH TIME ZONE,
  loss_reason VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  deleted_at TIMESTAMP WITH TIME ZONE,
  
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
CREATE INDEX idx_deals_forecast ON deals(tenant_id, pipeline_stage, probability) 
  WHERE status = 'open' AND deleted_at IS NULL;

-- Down
DROP TABLE IF EXISTS deals CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 009: Interactions (Activity Log)
-- ─────────────────────────────────────────────────────────────────────────────
-- Up

CREATE TABLE interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  deal_id UUID REFERENCES deals(id) ON DELETE SET NULL,
  interaction_type VARCHAR(50) NOT NULL,
  subject VARCHAR(255),
  description TEXT,
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  interaction_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  is_completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_interactions_contact ON interactions(contact_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_interactions_deal ON interactions(deal_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_interactions_tenant_date ON interactions(tenant_id, interaction_date DESC) 
  WHERE deleted_at IS NULL;
CREATE INDEX idx_interactions_created_by ON interactions(created_by_user_id);

-- Down
DROP TABLE IF EXISTS interactions CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 010: Table Views (User Presets)
-- ─────────────────────────────────────────────────────────────────────────────
-- Up

CREATE TABLE table_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  table_name VARCHAR(100) NOT NULL,
  column_layout JSONB,
  filters JSONB DEFAULT '{}',
  sort JSONB,
  is_public BOOLEAN DEFAULT FALSE,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  
  CONSTRAINT table_views_unique_default UNIQUE(tenant_id, table_name, is_default) 
    WHERE is_default = TRUE
);

CREATE INDEX idx_table_views_user ON table_views(created_by_user_id);
CREATE INDEX idx_table_views_table ON table_views(tenant_id, table_name);
CREATE INDEX idx_table_views_default ON table_views(tenant_id, table_name) 
  WHERE is_default = TRUE;

-- Down
DROP TABLE IF EXISTS table_views CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 011: Support Tickets
-- ─────────────────────────────────────────────────────────────────────────────
-- Up

CREATE TABLE support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  ticket_number VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100),
  priority ticket_priority DEFAULT 'medium' NOT NULL,
  status ticket_status DEFAULT 'open' NOT NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  assigned_to_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolution_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  deleted_at TIMESTAMP WITH TIME ZONE,
  
  CONSTRAINT support_tickets_number_unique UNIQUE(tenant_id, ticket_number),
  CONSTRAINT support_tickets_title_not_empty CHECK (TRIM(title) != '')
);

CREATE INDEX idx_support_tickets_tenant ON support_tickets(tenant_id);
CREATE INDEX idx_support_tickets_number ON support_tickets(tenant_id, ticket_number);
CREATE INDEX idx_support_tickets_status ON support_tickets(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_support_tickets_assigned ON support_tickets(assigned_to_user_id) 
  WHERE status != 'closed' AND deleted_at IS NULL;
CREATE INDEX idx_support_tickets_created ON support_tickets(created_at DESC);

-- Down
DROP TABLE IF EXISTS support_tickets CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 012: Billing - Invoices
-- ─────────────────────────────────────────────────────────────────────────────
-- Up

CREATE TABLE billing_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invoice_number VARCHAR(50) NOT NULL,
  invoice_series VARCHAR(10) DEFAULT 'NF-E',
  issue_date DATE NOT NULL,
  due_date DATE NOT NULL,
  subtotal DECIMAL(15, 2) NOT NULL,
  tax_amount DECIMAL(15, 2) DEFAULT 0,
  total_amount DECIMAL(15, 2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'BRL',
  status invoice_status DEFAULT 'draft' NOT NULL,
  paid_amount DECIMAL(15, 2) DEFAULT 0,
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  deleted_at TIMESTAMP WITH TIME ZONE,
  
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

-- Down
DROP TABLE IF EXISTS billing_invoices CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 013: Billing - Payments
-- ─────────────────────────────────────────────────────────────────────────────
-- Up

CREATE TABLE billing_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES billing_invoices(id) ON DELETE CASCADE,
  payment_reference VARCHAR(100),
  amount DECIMAL(15, 2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'BRL',
  payment_method payment_method NOT NULL,
  payment_gateway VARCHAR(50),
  status payment_status DEFAULT 'pending' NOT NULL,
  payment_date TIMESTAMP WITH TIME ZONE,
  gateway_response JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  processed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  deleted_at TIMESTAMP WITH TIME ZONE,
  
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

-- Down
DROP TABLE IF EXISTS billing_payments CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 014: Billing Events (Webhook Processing)
-- ─────────────────────────────────────────────────────────────────────────────
-- Up

CREATE TABLE billing_events (
  id BIGSERIAL PRIMARY KEY,
  event_id UUID UNIQUE NOT NULL,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  payment_id UUID REFERENCES billing_payments(id) ON DELETE SET NULL,
  event_type VARCHAR(100) NOT NULL,
  event_source VARCHAR(50),
  event_data JSONB,
  processed BOOLEAN DEFAULT FALSE,
  processed_at TIMESTAMP WITH TIME ZONE,
  processing_error TEXT,
  received_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
  
  CONSTRAINT billing_events_type_valid CHECK (
    event_type ~ '^[a-z_]+\.[a-z_]+$'
  )
) PARTITION BY RANGE (created_at);

-- Create first partition
CREATE TABLE billing_events_2026_01 PARTITION OF billing_events
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');

CREATE INDEX idx_billing_events_tenant ON billing_events(tenant_id, created_at DESC);
CREATE INDEX idx_billing_events_event_id ON billing_events(event_id);
CREATE INDEX idx_billing_events_processed ON billing_events(processed) 
  WHERE processed = FALSE;
CREATE INDEX idx_billing_events_type ON billing_events(event_type);

-- Down
DROP TABLE IF EXISTS billing_events CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 015: Audit Log (Immutable, WORM)
-- ─────────────────────────────────────────────────────────────────────────────
-- Up

CREATE TABLE audit_log (
  id BIGSERIAL PRIMARY KEY,
  event_id UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(50) NOT NULL,
  resource_id UUID NOT NULL,
  before_state JSONB,
  after_state JSONB,
  changes JSONB,
  ip_address INET,
  user_agent TEXT,
  request_id VARCHAR(100),
  metadata JSONB,
  hash_value VARCHAR(64),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT audit_log_created_not_null CHECK (created_at IS NOT NULL),
  CONSTRAINT audit_log_action_not_empty CHECK (TRIM(action) != ''),
  CONSTRAINT audit_log_resource_type_valid CHECK (
    resource_type IN ('contact', 'company', 'payment', 'user', 'role', 'deal', 'invoice', 'ticket', 'interaction')
  )
) PARTITION BY RANGE (created_at);

-- Create first partition
CREATE TABLE audit_log_2026_01 PARTITION OF audit_log
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');

CREATE INDEX idx_audit_log_resource ON audit_log(resource_type, resource_id, created_at DESC);
CREATE INDEX idx_audit_log_user_date ON audit_log(user_id, created_at DESC) 
  WHERE user_id IS NOT NULL;
CREATE INDEX idx_audit_log_tenant_date ON audit_log(tenant_id, created_at DESC);
CREATE INDEX idx_audit_log_action ON audit_log(action);
CREATE UNIQUE INDEX idx_audit_log_event_id ON audit_log(event_id);
CREATE INDEX idx_audit_log_created ON audit_log(created_at DESC);
CREATE INDEX idx_audit_log_created_brin ON audit_log USING BRIN(created_at) 
  WITH (pages_per_range = 128);

-- Down
DROP TABLE IF EXISTS audit_log CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 016: Enable RLS (Row-Level Security)
-- ─────────────────────────────────────────────────────────────────────────────
-- Up

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
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

CREATE POLICY rls_users ON users USING (tenant_id = current_setting('app.current_tenant_id')::UUID);
CREATE POLICY rls_roles ON roles USING (tenant_id = current_setting('app.current_tenant_id')::UUID);
CREATE POLICY rls_role_permissions ON role_permissions USING (
  role_id IN (SELECT id FROM roles WHERE tenant_id = current_setting('app.current_tenant_id')::UUID)
);
CREATE POLICY rls_user_roles ON user_roles USING (tenant_id = current_setting('app.current_tenant_id')::UUID);
CREATE POLICY rls_companies ON companies USING (tenant_id = current_setting('app.current_tenant_id')::UUID);
CREATE POLICY rls_dynamic_fields ON dynamic_fields USING (tenant_id = current_setting('app.current_tenant_id')::UUID);
CREATE POLICY rls_contacts ON contacts USING (tenant_id = current_setting('app.current_tenant_id')::UUID);
CREATE POLICY rls_deals ON deals USING (tenant_id = current_setting('app.current_tenant_id')::UUID);
CREATE POLICY rls_interactions ON interactions USING (tenant_id = current_setting('app.current_tenant_id')::UUID);
CREATE POLICY rls_table_views ON table_views USING (tenant_id = current_setting('app.current_tenant_id')::UUID);
CREATE POLICY rls_support_tickets ON support_tickets USING (tenant_id = current_setting('app.current_tenant_id')::UUID);
CREATE POLICY rls_billing_invoices ON billing_invoices USING (tenant_id = current_setting('app.current_tenant_id')::UUID);
CREATE POLICY rls_billing_payments ON billing_payments USING (tenant_id = current_setting('app.current_tenant_id')::UUID);
CREATE POLICY rls_billing_events ON billing_events USING (tenant_id = current_setting('app.current_tenant_id')::UUID);
CREATE POLICY rls_audit_log ON audit_log USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- Down
DROP POLICY IF EXISTS rls_audit_log ON audit_log;
DROP POLICY IF EXISTS rls_billing_events ON billing_events;
DROP POLICY IF EXISTS rls_billing_payments ON billing_payments;
DROP POLICY IF EXISTS rls_billing_invoices ON billing_invoices;
DROP POLICY IF EXISTS rls_support_tickets ON support_tickets;
DROP POLICY IF EXISTS rls_table_views ON table_views;
DROP POLICY IF EXISTS rls_interactions ON interactions;
DROP POLICY IF EXISTS rls_deals ON deals;
DROP POLICY IF EXISTS rls_contacts ON contacts;
DROP POLICY IF EXISTS rls_dynamic_fields ON dynamic_fields;
DROP POLICY IF EXISTS rls_companies ON companies;
DROP POLICY IF EXISTS rls_user_roles ON user_roles;
DROP POLICY IF EXISTS rls_role_permissions ON role_permissions;
DROP POLICY IF EXISTS rls_roles ON roles;
DROP POLICY IF EXISTS rls_users ON users;

-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 017: Helper Functions & Triggers
-- ─────────────────────────────────────────────────────────────────────────────
-- Up

-- Set tenant context
CREATE OR REPLACE FUNCTION set_tenant_context(p_tenant_id UUID)
RETURNS void AS $$
BEGIN
  PERFORM set_config('app.current_tenant_id', p_tenant_id::text, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Normalize CPF
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

-- Normalize CNPJ
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

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply timestamp triggers
CREATE TRIGGER trg_update_timestamp_tenants BEFORE UPDATE ON tenants FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER trg_update_timestamp_users BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER trg_update_timestamp_roles BEFORE UPDATE ON roles FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER trg_update_timestamp_role_permissions BEFORE UPDATE ON role_permissions FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER trg_update_timestamp_user_roles BEFORE UPDATE ON user_roles FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER trg_update_timestamp_companies BEFORE UPDATE ON companies FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER trg_update_timestamp_dynamic_fields BEFORE UPDATE ON dynamic_fields FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER trg_update_timestamp_contacts BEFORE UPDATE ON contacts FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER trg_update_timestamp_deals BEFORE UPDATE ON deals FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER trg_update_timestamp_table_views BEFORE UPDATE ON table_views FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER trg_update_timestamp_support_tickets BEFORE UPDATE ON support_tickets FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER trg_update_timestamp_billing_invoices BEFORE UPDATE ON billing_invoices FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER trg_update_timestamp_billing_payments BEFORE UPDATE ON billing_payments FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- Down
DROP FUNCTION IF EXISTS update_timestamp() CASCADE;
DROP FUNCTION IF EXISTS normalize_cnpj(TEXT) CASCADE;
DROP FUNCTION IF EXISTS normalize_cpf(TEXT) CASCADE;
DROP FUNCTION IF EXISTS set_tenant_context(UUID) CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 018: Initial Data - Permissions Catalog
-- ─────────────────────────────────────────────────────────────────────────────
-- Up

INSERT INTO permissions (name, resource, action, is_system_permission, description)
VALUES
  ('user:create', 'user', 'create', true, 'Create new user'),
  ('user:read', 'user', 'read', true, 'Read user profile'),
  ('user:update', 'user', 'update', true, 'Update user'),
  ('user:delete', 'user', 'delete', true, 'Delete user'),
  ('contact:create', 'contact', 'create', true, 'Create contact'),
  ('contact:read', 'contact', 'read', true, 'Read contact'),
  ('contact:update', 'contact', 'update', true, 'Update contact'),
  ('contact:delete', 'contact', 'delete', true, 'Delete contact'),
  ('deal:create', 'deal', 'create', true, 'Create deal'),
  ('deal:read', 'deal', 'read', true, 'Read deal'),
  ('deal:update', 'deal', 'update', true, 'Update deal'),
  ('deal:delete', 'deal', 'delete', true, 'Delete deal'),
  ('payment:create', 'payment', 'create', true, 'Create payment'),
  ('payment:read', 'payment', 'read', true, 'Read payment'),
  ('payment:approve', 'payment', 'approve', true, 'Approve payment'),
  ('audit:read', 'audit', 'read', true, 'Read audit log'),
  ('role:create', 'role', 'create', true, 'Create role'),
  ('role:read', 'role', 'read', true, 'Read role'),
  ('role:update', 'role', 'update', true, 'Update role'),
  ('role:delete', 'role', 'delete', true, 'Delete role')
ON CONFLICT (name) DO NOTHING;

-- Down
DELETE FROM permissions WHERE is_system_permission = TRUE;

-- ═══════════════════════════════════════════════════════════════════════════════
-- END OF MIGRATIONS
-- ═══════════════════════════════════════════════════════════════════════════════

/*
USAGE:

Run with any migration tool (e.g., Flyway, db-migrate, Liquibase):

  flyway migrate

Or manually in order:
  psql -d crm_db -f schema.sql  (All at once)
  psql -d crm_db -f 001-init.sql
  psql -d crm_db -f 002-tenants.sql
  ... etc

Each migration has Up/Down sections for rollback support.
*/
