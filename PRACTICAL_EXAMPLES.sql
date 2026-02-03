-- ═══════════════════════════════════════════════════════════════════════════════
-- Practical Usage Examples - CRM Database
-- Real-world queries and operations
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- SETUP: Initialize tenant context (ALWAYS first step)
-- ─────────────────────────────────────────────────────────────────────────────

-- Client App Middleware should always execute this:
SELECT set_config('app.current_tenant_id', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', false);

-- From now on, all queries are automatically filtered by this tenant (RLS policy)

-- ─────────────────────────────────────────────────────────────────────────────
-- EXAMPLE 1: Create a Contact with Custom Fields
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO contacts (
  tenant_id,
  email,
  first_name,
  last_name,
  phone,
  lead_source,
  lead_status,
  custom_fields,
  created_by_user_id,
  consent_given_at
) VALUES (
  'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  'john.doe@example.com',
  'John',
  'Doe',
  '+5511999887766',
  'website',
  'new',
  '{"segment": "vip", "priority": 2, "company_type": "enterprise", "deal_size": "100000.00"}'::jsonb,
  'user-uuid-here',
  CURRENT_TIMESTAMP
) RETURNING id, email, custom_fields;

-- ─────────────────────────────────────────────────────────────────────────────
-- EXAMPLE 2: Query Contacts with Composite Filters (Common CRM Pattern)
-- ─────────────────────────────────────────────────────────────────────────────

-- Requirement: "Show me VIP contacts from startup companies who were contacted this month"

SELECT 
  c.id,
  c.email,
  c.first_name,
  c.last_name,
  c.lead_status,
  c.custom_fields->>'segment' AS segment,
  c.custom_fields->>'priority' AS priority,
  c.last_interaction_at,
  co.name AS company_name
FROM contacts c
LEFT JOIN companies co ON c.company_id = co.id
WHERE 
  c.tenant_id = current_setting('app.current_tenant_id')::UUID
  AND c.deleted_at IS NULL
  AND c.custom_fields->>'segment' = 'vip'
  AND c.custom_fields->>'company_type' = 'startup'
  AND c.last_interaction_at >= CURRENT_DATE - INTERVAL '30 days'
  AND c.status = 'active'
ORDER BY c.last_interaction_at DESC
LIMIT 100;

-- Query Plan:
-- Seq Scan on contacts c → FILTER (tenant_id = context)
-- Index Scan using idx_contacts_custom_fields_gin (custom_fields @> ...)
-- → ~5-20ms for 100k rows (GIN index is FAST)

-- ─────────────────────────────────────────────────────────────────────────────
-- EXAMPLE 3: Full-Text Search on Contacts
-- ─────────────────────────────────────────────────────────────────────────────

-- Requirement: "Search for contacts matching 'john silva' or 'j.silva@gmail.com'"

SELECT 
  c.id,
  c.email,
  c.first_name,
  c.last_name,
  c.last_interaction_at,
  ts_rank(
    to_tsvector('portuguese', COALESCE(c.first_name, '') || ' ' || 
                               COALESCE(c.last_name, '') || ' ' ||
                               COALESCE(c.email, '')),
    plainto_tsquery('portuguese', 'john silva')
  ) AS relevance
FROM contacts c
WHERE 
  c.tenant_id = current_setting('app.current_tenant_id')::UUID
  AND c.deleted_at IS NULL
  AND to_tsvector('portuguese', COALESCE(c.first_name, '') || ' ' || 
                                 COALESCE(c.last_name, '') || ' ' ||
                                 COALESCE(c.email, '')) @@ plainto_tsquery('portuguese', 'john silva')
ORDER BY relevance DESC
LIMIT 50;

-- Uses: idx_contacts_search (GiST index)
-- Performance: ~10-30ms (supports typos, fuzzy matching)

-- ─────────────────────────────────────────────────────────────────────────────
-- EXAMPLE 4: RBAC Check - Does user have permission?
-- ─────────────────────────────────────────────────────────────────────────────

-- Requirement: "Check if user 'abc-123' can 'contact:create' in this tenant"

SELECT EXISTS(
  SELECT 1 
  FROM user_roles ur
  JOIN role_permissions rp ON ur.role_id = rp.role_id
  JOIN permissions p ON rp.permission_id = p.id
  WHERE ur.user_id = 'user-uuid'
    AND ur.tenant_id = current_setting('app.current_tenant_id')::UUID
    AND p.name = 'contact:create'
    AND ur.revoked_at IS NULL
  LIMIT 1
) AS has_permission;

-- Returns: true or false
-- Uses: idx_user_roles_active (partial index on active roles)
-- Performance: ~1-5ms (cached in Redis for 5 min)

-- ─────────────────────────────────────────────────────────────────────────────
-- EXAMPLE 5: Update Contact with JSONB Field Modification
-- ─────────────────────────────────────────────────────────────────────────────

-- Scenario 1: Update single field (simple)
UPDATE contacts
SET custom_fields = jsonb_set(custom_fields, '{segment}', '"enterprise"')
WHERE id = 'contact-uuid'
RETURNING custom_fields;

-- Scenario 2: Update multiple fields (bulk)
UPDATE contacts
SET custom_fields = custom_fields || '{"segment": "enterprise", "priority": 3, "next_review": "2026-06-01"}'::jsonb
WHERE tenant_id = current_setting('app.current_tenant_id')::UUID
  AND lead_status = 'qualified'
RETURNING id, custom_fields;

-- Scenario 3: Increment numeric field in JSONB
UPDATE contacts
SET custom_fields = jsonb_set(
  custom_fields,
  '{interaction_score}',
  to_jsonb((COALESCE((custom_fields->>'interaction_score')::INT, 0) + 1))
)
WHERE id = 'contact-uuid'
RETURNING custom_fields;

-- ─────────────────────────────────────────────────────────────────────────────
-- EXAMPLE 6: Pipeline Forecasting (Sales Metrics)
-- ─────────────────────────────────────────────────────────────────────────────

-- Requirement: "Show revenue forecast by pipeline stage"

SELECT 
  d.pipeline_stage,
  COUNT(*) AS deal_count,
  SUM(d.amount) AS total_value,
  AVG(d.probability) AS avg_probability,
  SUM(d.amount * d.probability / 100) AS expected_value,
  MAX(d.expected_close_date) AS latest_close_date
FROM deals d
WHERE 
  d.tenant_id = current_setting('app.current_tenant_id')::UUID
  AND d.status = 'open'
  AND d.deleted_at IS NULL
GROUP BY d.pipeline_stage
ORDER BY expected_value DESC;

-- Result Example:
-- pipeline_stage │ deal_count │ total_value │ avg_probability │ expected_value
-- ───────────────┼────────────┼─────────────┼─────────────────┼─────────────────
-- proposal       │ 12         │ 1,500,000   │ 45              │ 675,000
-- negotiation    │ 8          │ 2,000,000   │ 70              │ 1,400,000
-- contact        │ 25         │ 500,000     │ 20              │ 100,000

-- Uses: idx_deals_forecast (composite index on tenant, stage, probability)
-- Performance: ~50-200ms (aggregation query)

-- ─────────────────────────────────────────────────────────────────────────────
-- EXAMPLE 7: Activity Timeline for a Contact
-- ─────────────────────────────────────────────────────────────────────────────

-- Requirement: "Show all interactions for contact 'xyz' chronologically"

SELECT 
  i.id,
  i.interaction_type,
  i.subject,
  i.description,
  u.first_name || ' ' || u.last_name AS created_by,
  i.interaction_date,
  i.is_completed
FROM interactions i
LEFT JOIN users u ON i.created_by_user_id = u.id
WHERE 
  i.contact_id = 'contact-uuid'
  AND i.deleted_at IS NULL
  AND i.tenant_id = current_setting('app.current_tenant_id')::UUID
ORDER BY i.interaction_date DESC
LIMIT 100;

-- Uses: idx_interactions_contact
-- Performance: ~1-10ms

-- ─────────────────────────────────────────────────────────────────────────────
-- EXAMPLE 8: Audit Trail - Who changed what?
-- ─────────────────────────────────────────────────────────────────────────────

-- Requirement: "Show audit trail for contact 'xyz' - all changes"

SELECT 
  a.id,
  a.action,
  u.first_name || ' ' || u.last_name AS user_name,
  a.before_state,
  a.after_state,
  a.changes,
  a.ip_address,
  a.created_at
FROM audit_log a
LEFT JOIN users u ON a.user_id = u.id
WHERE 
  a.resource_type = 'contact'
  AND a.resource_id = 'contact-uuid'
  AND a.tenant_id = current_setting('app.current_tenant_id')::UUID
ORDER BY a.created_at DESC
LIMIT 100;

-- Interpretation of 'changes' field:
-- changes = '{"email": {"old": "john@old.com", "new": "john@new.com"}, 
--            "lead_status": {"old": "new", "new": "qualified"}}'

-- Uses: idx_audit_log_resource (efficient for resource-specific queries)
-- Performance: ~10-50ms (may scan 1-3 partition months if data recent)

-- ─────────────────────────────────────────────────────────────────────────────
-- EXAMPLE 9: Dynamic Field Metadata - List available fields
-- ─────────────────────────────────────────────────────────────────────────────

-- Requirement: "What custom fields are available for contacts in my org?"

SELECT 
  df.id,
  df.name,
  df.label,
  df.field_type,
  df.options,
  df.is_required,
  df.field_order,
  df.is_searchable
FROM dynamic_fields df
WHERE 
  df.tenant_id = current_setting('app.current_tenant_id')::UUID
  AND df.table_name = 'contacts'
  AND df.is_active = TRUE
  AND df.deleted_at IS NULL
ORDER BY df.field_order, df.label;

-- Result Example:
-- name     │ label              │ field_type │ is_required │ is_searchable
-- ──────────┼────────────────────┼────────────┼─────────────┼───────────────
-- segment  │ Customer Segment   │ select     │ false       │ true
-- priority │ Lead Priority      │ number     │ false       │ true
-- company_ │ Company Type       │ select     │ true        │ true
-- type     │                    │            │             │

-- Uses dynamic_fields metadata to build UI forms dynamically

-- ─────────────────────────────────────────────────────────────────────────────
-- EXAMPLE 10: Payment Reconciliation - Invoices vs Payments
-- ─────────────────────────────────────────────────────────────────────────────

-- Requirement: "Show outstanding invoices and payment status"

SELECT 
  i.id,
  i.invoice_number,
  co.name AS company_name,
  i.issue_date,
  i.due_date,
  i.total_amount,
  COALESCE(SUM(p.amount), 0) AS paid_amount,
  (i.total_amount - COALESCE(SUM(p.amount), 0)) AS outstanding,
  i.status,
  CASE 
    WHEN i.due_date < CURRENT_DATE AND i.status != 'paid' THEN 'OVERDUE'
    WHEN (i.total_amount - COALESCE(SUM(p.amount), 0)) > 0 THEN 'PENDING'
    ELSE 'PAID'
  END AS payment_status
FROM billing_invoices i
LEFT JOIN billing_payments p ON i.id = p.invoice_id AND p.status = 'completed'
LEFT JOIN companies co ON i.company_id = co.id
WHERE 
  i.tenant_id = current_setting('app.current_tenant_id')::UUID
  AND i.deleted_at IS NULL
GROUP BY i.id, co.name
HAVING (i.total_amount - COALESCE(SUM(p.amount), 0)) > 0  -- Only unpaid
ORDER BY i.due_date ASC;

-- Uses: idx_billing_invoices_status, idx_billing_payments_invoice
-- Performance: ~50-100ms (join + aggregation)

-- ─────────────────────────────────────────────────────────────────────────────
-- EXAMPLE 11: Bulk Import Contacts (from CSV)
-- ─────────────────────────────────────────────────────────────────────────────

-- Step 1: Create temp table
CREATE TEMP TABLE contacts_import (
  email TEXT,
  first_name TEXT,
  last_name TEXT,
  phone TEXT,
  lead_source TEXT
);

-- Step 2: Load CSV (from application, not SQL)
-- App would: COPY contacts_import FROM '/path/to/file.csv' WITH (FORMAT CSV, HEADER TRUE);

-- Step 3: Insert with validation and conflict handling
INSERT INTO contacts (
  tenant_id,
  email,
  first_name,
  last_name,
  phone,
  lead_source,
  created_by_user_id
)
SELECT 
  current_setting('app.current_tenant_id')::UUID,
  LOWER(TRIM(ci.email)),
  INITCAP(ci.first_name),
  INITCAP(ci.last_name),
  REGEXP_REPLACE(ci.phone, '[^0-9+]', '', 'g'),
  LOWER(ci.lead_source),
  'system-import'::UUID
FROM contacts_import ci
WHERE 
  ci.email IS NOT NULL
  AND ci.email ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$'
ON CONFLICT (tenant_id, email) DO UPDATE SET
  first_name = EXCLUDED.first_name,
  last_name = EXCLUDED.last_name,
  phone = COALESCE(excluded.phone, contacts.phone),
  updated_at = CURRENT_TIMESTAMP
RETURNING id, email, first_name;

-- Performance: ~0.5ms per row (batch insert)
-- 100k rows = ~50 seconds

-- ─────────────────────────────────────────────────────────────────────────────
-- EXAMPLE 12: Governance - Approve Changes to Company (DPO approval)
-- ─────────────────────────────────────────────────────────────────────────────

-- Step 1: DPO reviews change request
SELECT 
  id,
  name,
  cnpj,
  legal_name,
  governance_notes,
  updated_at
FROM companies
WHERE 
  id = 'company-uuid'
  AND tenant_id = current_setting('app.current_tenant_id')::UUID;

-- Step 2: DPO approves and saves approval
UPDATE companies
SET 
  governance_approved_by = 'dpo-user-uuid',
  governance_approved_at = CURRENT_TIMESTAMP,
  governance_notes = 'Approved by DPO after legal review'
WHERE 
  id = 'company-uuid'
  AND tenant_id = current_setting('app.current_tenant_id')::UUID
RETURNING governance_approved_at;

-- Audit log is automatically created by trigger

-- ─────────────────────────────────────────────────────────────────────────────
-- EXAMPLE 13: Soft Delete (GDPR right to be forgotten)
-- ─────────────────────────────────────────────────────────────────────────────

-- Request: User asks for data deletion

-- Step 1: Soft delete (preserves audit trail)
UPDATE contacts
SET deleted_at = CURRENT_TIMESTAMP
WHERE id = 'contact-uuid'
  AND tenant_id = current_setting('app.current_tenant_id')::UUID
RETURNING id, deleted_at;

-- Step 2: Query shows deleted contacts (soft delete only, no hard delete)
SELECT COUNT(*) FROM contacts
WHERE tenant_id = current_setting('app.current_tenant_id')::UUID
AND deleted_at IS NULL;  -- Only active contacts

-- Step 3: DPO/retention cron job (hard delete after 30 days retention)
-- This runs as scheduled job, not on-demand
DELETE FROM contacts
WHERE deleted_at < CURRENT_TIMESTAMP - INTERVAL '30 days'
  AND tenant_id = current_setting('app.current_tenant_id')::UUID;

-- After hard delete, audit_log still has historical record

-- ─────────────────────────────────────────────────────────────────────────────
-- EXAMPLE 14: Data Export for GDPR (user download)
-- ─────────────────────────────────────────────────────────────────────────────

-- Requirement: "Export all my contact data"

-- Step 1: Get contact data
SELECT 
  'contact' AS record_type,
  c.id,
  c.email,
  c.first_name,
  c.last_name,
  c.phone,
  c.created_at,
  c.custom_fields
FROM contacts c
WHERE 
  c.tenant_id = current_setting('app.current_tenant_id')::UUID
  AND c.deleted_at IS NULL
  
UNION ALL

-- Step 2: Get interaction history
SELECT 
  'interaction' AS record_type,
  i.id,
  NULL AS email,
  i.interaction_type,
  i.subject,
  i.description,
  i.interaction_date,
  NULL
FROM interactions i
WHERE 
  i.contact_id IN (
    SELECT c.id FROM contacts c
    WHERE c.tenant_id = current_setting('app.current_tenant_id')::UUID
      AND c.deleted_at IS NULL
  )
  AND i.deleted_at IS NULL;

-- Step 3: Export to JSON via application
-- App converts result set to JSON → Gzip → S3 signed URL (30-day expiry)

-- Audit log entry:
INSERT INTO audit_log (
  tenant_id, user_id, action, resource_type, resource_id,
  metadata, created_at
) VALUES (
  current_setting('app.current_tenant_id')::UUID,
  'user-uuid',
  'DATA_EXPORT_GDPR',
  'user',
  'user-uuid',
  jsonb_build_object('export_size_records', 150, 'export_type', 'gdpr'),
  CURRENT_TIMESTAMP
);

-- ─────────────────────────────────────────────────────────────────────────────
-- EXAMPLE 15: Monitor Index Usage & Optimize
-- ─────────────────────────────────────────────────────────────────────────────

-- Which indexes are NOT being used? (candidates for deletion)
SELECT 
  schemaname,
  tablename,
  indexname,
  idx_scan,
  idx_tup_read,
  pg_size_pretty(pg_relation_size(indexrelid)) AS size
FROM pg_stat_user_indexes
WHERE idx_scan = 0  -- Never used
ORDER BY pg_relation_size(indexrelid) DESC;

-- Example output:
-- idx_contacts_tags has 500MB but only used 2 times in a month
-- → Candidate for deletion

-- Which queries are slow?
SELECT 
  query,
  calls,
  total_time,
  mean_time,
  max_time
FROM pg_stat_statements
WHERE query LIKE '%contacts%'
ORDER BY max_time DESC
LIMIT 10;

-- ─────────────────────────────────────────────────────────────────────────────
-- EXAMPLE 16: Monthly Partition Maintenance
-- ─────────────────────────────────────────────────────────────────────────────

-- Create next month's partition (run on first day of month)
CREATE TABLE audit_log_2026_02 PARTITION OF audit_log
  FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');

-- Archive old partition to S3 (run quarterly for 7+ year old data)
-- Step 1: Export to SQL dump
-- pg_dump -t audit_log_2019_01 | gzip > audit_log_2019_01.sql.gz
-- aws s3 cp audit_log_2019_01.sql.gz s3://crm-archive/postgresql/

-- Step 2: Verify backup exists
-- aws s3 ls s3://crm-archive/postgresql/audit_log_2019_01.sql.gz

-- Step 3: Drop partition (frees ~2-5GB per month)
DROP TABLE IF EXISTS audit_log_2019_01;

-- Verify partition is gone
SELECT 
  tablename 
FROM pg_tables 
WHERE tablename LIKE 'audit_log_%'
ORDER BY tablename DESC
LIMIT 5;

-- ─────────────────────────────────────────────────────────────────────────────
-- EXAMPLE 17: Performance Tuning - Analyze slow query
-- ─────────────────────────────────────────────────────────────────────────────

-- Problem: "SELECT * FROM contacts WHERE custom_fields->>'segment' = 'vip'" is SLOW

-- Step 1: Explain plan (without GIN index)
EXPLAIN ANALYZE
SELECT c.id, c.email
FROM contacts c
WHERE custom_fields->>'segment' = 'vip'
LIMIT 100;

-- Output (without index):
-- Seq Scan on contacts c (cost=0.00..100000.00 rows=50000)
--   Filter: (custom_fields->>'segment' = 'vip')
-- Total time: 5000ms ← SLOW!

-- Step 2: Add GIN index
CREATE INDEX idx_contacts_custom_fields_gin ON contacts USING GIN(custom_fields);
ANALYZE contacts;

-- Step 3: Explain again
EXPLAIN ANALYZE
SELECT c.id, c.email
FROM contacts c
WHERE custom_fields->>'segment' = 'vip'
LIMIT 100;

-- Output (with GIN index):
-- Bitmap Index Scan on idx_contacts_custom_fields_gin (cost=0.00..100.00)
--   Index Cond: (custom_fields @> '{"segment": "vip"}'::jsonb)
-- Total time: 50ms ← 100x FASTER!

-- ═══════════════════════════════════════════════════════════════════════════════
-- END OF EXAMPLES
-- ═══════════════════════════════════════════════════════════════════════════════
