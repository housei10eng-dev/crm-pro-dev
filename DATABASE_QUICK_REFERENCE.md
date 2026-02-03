-- ═══════════════════════════════════════════════════════════════════════════════
-- DATABASE SCHEMA SUMMARY & QUICK REFERENCE
-- ═══════════════════════════════════════════════════════════════════════════════

# 📊 SCHEMA OVERVIEW

## File Structure

1. **schema.sql** - Complete DDL (17 sections, 2500+ lines)
   - All tables, indexes, RLS policies, domains, functions
   - Can be imported directly for fresh setup

2. **migrations.sql** - Structured migrations (18 parts)
   - Each migration has Up/Down for reversibility
   - For use with Flyway, Liquibase, or db-migrate

3. **DATABASE_DESIGN_GUIDE.md** - Complete design justification
   - Why each choice was made
   - Index analysis by query pattern
   - Partitioning strategy
   - Performance tradeoffs

4. **PRACTICAL_EXAMPLES.sql** - Real-world queries
   - 17 examples covering common operations
   - Performance tips & query plans
   - GDPR, auditing, bulk operations

---

# 🎯 QUICK START

## 1. Initial Setup

```bash
# Create database
createdb crm_saas

# Load schema
psql -d crm_saas -f schema.sql

# Verify (should return 0)
psql -d crm_saas -c "SELECT COUNT(*) FROM tenants;"
```

## 2. Create First Tenant

```sql
INSERT INTO tenants (name, slug, subscription_tier, legal_email)
VALUES (
  'Acme Corp',
  'acme-corp',
  'pro',
  'billing@acme.com'
) RETURNING id;
-- Returns: f47ac10b-58cc-4372-a567-0e02b2c3d479
```

## 3. Create First User

```sql
SELECT set_config('app.current_tenant_id', 'f47ac10b-58cc-4372-a567-0e02b2c3d479', false);

INSERT INTO users (tenant_id, email, first_name, last_name, password_hash)
VALUES (
  'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  'admin@acme.com',
  'Admin',
  'User',
  'bcrypt_hash_here'
) RETURNING id;
```

## 4. Assign Admin Role

```sql
-- Get default admin role
SELECT id FROM roles WHERE tenant_id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479' 
  AND name = 'admin';

-- Assign to user
INSERT INTO user_roles (tenant_id, user_id, role_id)
VALUES ('f47ac10b-58cc-4372-a567-0e02b2c3d479', 'user-uuid', 'role-uuid');
```

## 5. Create First Contact

```sql
INSERT INTO contacts (
  tenant_id, email, first_name, last_name,
  custom_fields, created_by_user_id
) VALUES (
  'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  'customer@example.com',
  'John',
  'Doe',
  '{"segment": "vip", "priority": 1}'::jsonb,
  'user-uuid'
);
```

---

# 📋 TABLE INVENTORY

## Core Tables (15)

| Table | Rows | Indexed | Notes |
|-------|------|---------|-------|
| tenants | 1k | Yes | Multi-tenant foundation |
| users | 10k | Yes | Master users |
| roles | 100 | Yes | RBAC definitions |
| permissions | 50 | Yes | Global permission catalog |
| role_permissions | 500 | Yes | RBAC mapping |
| user_roles | 100k | Yes | User assignments (soft delete) |
| companies | 10k | Yes | Clients/partners (governance) |
| dynamic_fields | 500 | Yes | Field metadata |
| contacts | 1M+ | Yes | Main CRM entity (JSONB) |
| deals | 100k | Yes | Sales opportunities |
| interactions | 5M+ | Yes | Activity log |
| table_views | 1k | Yes | User view presets |
| support_tickets | 50k | Yes | Help desk |
| billing_invoices | 100k | Yes | Financial records |
| billing_payments | 200k | Yes | Payment records |
| billing_events | 5M+ | Partitioned | Webhook events |
| audit_log | 100M+ | Partitioned | Immutable WORM |

---

# 🔑 KEY INDEXES (48 Total)

## By Performance Impact

### CRITICAL (Query <10ms)
- idx_users_tenant_email - RBAC check fallback
- idx_contacts_tenant_email - Deduplication
- idx_contacts_custom_fields_gin - JSONB queries
- idx_contacts_search - Full-text search
- idx_audit_log_resource - Audit trail queries
- idx_user_roles_active - Permission checks

### HIGH (Query 10-50ms)
- idx_deals_forecast - Sales forecasting
- idx_billing_payments_invoice - Payment reconciliation
- idx_audit_log_created_brin - Time-range queries

### MODERATE (Query 50-500ms)
- idx_companies_name_gin - Search by company name
- idx_interactions_contact - Activity timeline
- Aggregation queries (materialized views recommended)

---

# 🏗️ PARTITIONING STRATEGY

## Partitioned Tables (2)

### audit_log (Monthly by created_at)
```
audit_log_2025_01: ~350M rows, 400GB
audit_log_2025_02: ~350M rows, 400GB
... (7 years = 84 partitions)

Old partitions (2019) archived to S3 Glacier
Recent partitions (hot) kept in SSD
```

**Why?**
- LGPD requires 7-year retention
- DROP partition = instant vs DELETE = slow
- Query recent months = scan 1-3 partitions only
- Archival: dump → gzip → S3 → DROP → instant cleanup

### billing_events (Monthly by created_at)
```
billing_events_2026_01: ~30k rows, 50MB
billing_events_2026_02: ~30k rows, 50MB
```

**Why?**
- Webhook volume = ~1000/day per 100 tenants
- Reconciliation queries by month
- Cleanup: drop old partitions after 2 years

---

# 🔐 SECURITY LAYERS

## 1. Row-Level Security (RLS)

**Enforced at DB level:**
```sql
-- Every query automatically filtered:
SELECT * FROM contacts;
-- Rewritten as:
SELECT * FROM contacts 
WHERE tenant_id = current_setting('app.current_tenant_id')::UUID;

-- If context NOT SET → 0 rows (fail-secure)
```

**All 15 tables protected**

## 2. Multi-Tenant Constraints

```sql
-- Tenant ID required in every row
CONSTRAINT contacts_unique_email_per_tenant UNIQUE(tenant_id, email)

-- No cross-tenant queries possible without explicit tenant_id
```

## 3. Governance Fields (Company)

```sql
-- CNPJ, legal_name locked after DPO approval
-- Trigger: UPDATE blocked unless DPO role assigned
-- Audit: all changes logged in audit_log
```

## 4. Soft Delete Pattern

```sql
-- Sensitive data: never hard-deleted immediately
UPDATE contacts SET deleted_at = NOW() WHERE id = '...';

-- Hard delete only after 30-day retention
DELETE FROM contacts WHERE deleted_at < NOW() - INTERVAL '30 days';

-- Audit trail remains forever
```

---

# ⚡ PERFORMANCE CHARACTERISTICS

## Expected Query Latencies

| Query Type | Rows | Index | Latency |
|-----------|------|-------|---------|
| Single contact by email | 1 | BTREE | ~1ms |
| List contacts (100) | 100 | BTREE | ~5ms |
| Filter by custom_fields | 1000 | GIN | ~10-20ms |
| Full-text search | 5000 | GiST | ~30-100ms |
| Audit trail by resource | 1000 | BTREE | ~20ms |
| Deal forecasting | 50k | BTREE | ~100-200ms |
| Invoice reconciliation (join) | 10k | BTREE | ~50-150ms |

**Without indexes: 1000-10000x slower**

---

# 💰 Storage Estimation

## Capacity for 1M Contacts

```
contacts table:
  - 1M rows × 2KB per row = 2GB
  - GIN indexes = 1-2GB
  - Soft-deleted rows (1M × 20% = 200k) = 400MB
  Subtotal: ~5GB (hot storage)

audit_log (1 year):
  - ~100M events
  - ~500GB total storage
  - 84 partitions × 400GB each = ~33TB (7 years)
  - Old data archived to Glacier (~$5/TB/month)
  Subtotal: ~500GB (year 1) + archival

billing_events:
  - ~400k events/year
  - ~500MB/year
  Subtotal: ~5GB (7 years)

Total: ~10GB hot + 500GB archive + 33TB cold storage
```

---

# 📊 Monitoring & Maintenance

## Weekly Tasks

```sql
-- Check index bloat
SELECT schemaname, tablename, indexname, idx_blks_read
FROM pg_stat_user_indexes
WHERE idx_blks_read > 1000;

-- Update statistics
ANALYZE;

-- Check for missing indexes (slow queries)
SELECT query, mean_time
FROM pg_stat_statements
WHERE mean_time > 100  -- >100ms queries
ORDER BY mean_time DESC;
```

## Monthly Tasks

```sql
-- Create next partition
CREATE TABLE audit_log_2026_03 PARTITION OF audit_log
  FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');

-- Vacuum old partitions
VACUUM FULL audit_log_2025_01;

-- Check table sizes
SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(...))
FROM pg_tables WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(...) DESC;
```

## Quarterly Tasks

```sql
-- Archive 7+ year old partition
pg_dump -t audit_log_2019_01 | gzip | aws s3 cp - s3://archive/...
DROP TABLE audit_log_2019_01;

-- Verify integrity
SELECT verify_audit_hash('event-uuid');

-- Test disaster recovery
-- Restore from backup → run tests
```

---

# 🚀 MIGRATION FROM EXISTING SYSTEM

## Step 1: Export Legacy Data

```bash
# From old system
SELECT * FROM legacy_contacts ORDER BY id;
SELECT * FROM legacy_companies ORDER BY id;
```

## Step 2: Transform & Load

```sql
-- Create temp table for legacy data
CREATE TEMP TABLE legacy_contacts_import (...);

-- Load data
INSERT INTO legacy_contacts_import
SELECT * FROM legacy_system;

-- Transform & insert
INSERT INTO contacts (tenant_id, email, first_name, ...)
SELECT 
  'new-tenant-uuid',
  normalize_email(legacy_email),
  legacy_first_name,
  ...
FROM legacy_contacts_import
ON CONFLICT (tenant_id, email) DO UPDATE SET ...;
```

## Step 3: Verify & Validate

```sql
-- Count check
SELECT COUNT(*) FROM contacts 
WHERE tenant_id = 'new-tenant-uuid';

-- Audit completeness
SELECT COUNT(*) FROM audit_log
WHERE tenant_id = 'new-tenant-uuid';

-- RBAC setup
-- (Assign users to roles manually or script)
```

## Step 4: Cutover

```sql
-- Switch connection string in app config
OLD_DB_URL=postgres://... (read-only)
NEW_DB_URL=postgres://... (active)

-- Monitor
SELECT COUNT(*) FROM contacts WHERE created_at > NOW() - INTERVAL '1 hour';
```

---

# 🎓 SCHEMA DESIGN PRINCIPLES USED

1. **Multi-Tenant by Design** ✅
   - Tenant ID in every table
   - RLS enforces isolation
   - Partitioning enables scaling

2. **Immutable Audit Trail** ✅
   - Append-only audit_log
   - Hash verification
   - 7-year retention

3. **Performance-First** ✅
   - Strategic indexing (48 indexes for 17 tables)
   - JSONB for flexibility (no schema changes)
   - Partitioning for large tables

4. **GDPR/LGPD Compliant** ✅
   - Soft delete pattern
   - Consent tracking
   - Data export capability
   - Retention policies

5. **DDD-inspired** ✅
   - Clear bounded contexts (contacts, deals, payments)
   - Aggregate roots (Contact, Deal, Invoice)
   - Events (audit_log as event stream)

---

# 🔗 RELATIONSHIPS MAP

```
tenants
  ├─ users (FK)
  │  ├─ roles (via user_roles)
  │  │  ├─ permissions (via role_permissions)
  │  │  └─ ABAC conditions (jsonb)
  │  └─ created/assigned records
  │
  ├─ companies (FK)
  │  ├─ custom_fields (jsonb)
  │  ├─ contacts (FK)
  │  └─ deals (FK)
  │
  ├─ contacts (FK)
  │  ├─ company (FK)
  │  ├─ custom_fields (jsonb)
  │  ├─ interactions (FK)
  │  └─ deals (FK)
  │
  ├─ deals (FK)
  │  ├─ contact (FK)
  │  ├─ company (FK)
  │  ├─ custom_fields (jsonb)
  │  └─ invoices (FK)
  │
  ├─ dynamic_fields (FK)
  │  └─ metadata for custom_fields
  │
  ├─ billing_invoices (FK)
  │  └─ billing_payments (FK)
  │     └─ billing_events (FK)
  │
  ├─ support_tickets (FK)
  │  └─ contacts/users (FK)
  │
  ├─ table_views (FK)
  │  └─ user presets
  │
  └─ audit_log (FK)
     └─ all changes to all tables
```

---

# ✅ IMPLEMENTATION CHECKLIST

- [x] Schema designed for 1M+ contacts
- [x] RLS policies for multi-tenant isolation
- [x] JSONB for dynamic customization
- [x] Partitioning for audit_log (7-year retention)
- [x] RBAC with ABAC support
- [x] Soft delete everywhere (GDPR-compliant)
- [x] Audit trail (immutable, WORM)
- [x] Governance fields (DPO approval)
- [x] CPF/CNPJ normalization & validation
- [x] Indexes optimized for query patterns
- [x] RLS fallback triggers
- [x] Timestamp auto-update triggers
- [x] Migrations structured (18 parts)
- [x] Practical examples provided (17 queries)

---

# 📞 SUPPORT & NEXT STEPS

## If you need to...

**Add a custom field to contacts:**
```sql
INSERT INTO dynamic_fields (
  tenant_id, table_name, name, label, field_type, options
) VALUES (
  'tenant-uuid', 'contacts', 'risk_score', 'Risk Score', 'number', NULL
);
-- No schema migration needed! Values stored in JSONB.
```

**Create a new view preset:**
```sql
INSERT INTO table_views (
  tenant_id, created_by_user_id, table_name, name,
  column_layout, filters
) VALUES (
  'tenant-uuid', 'user-uuid', 'contacts', 'VIP Contacts',
  '{"columns": ["email", "name", "priority"]}',
  '{"segment": "vip"}'::jsonb
);
```

**Archive old audit data:**
```bash
pg_dump -t audit_log_2019_01 | gzip | aws s3 cp - s3://archive/
DROP TABLE audit_log_2019_01;
```

**Monitor slow queries:**
```sql
SELECT query, mean_time FROM pg_stat_statements
WHERE query LIKE '%contacts%' AND mean_time > 100
ORDER BY mean_time DESC;
```

---

# 📚 DOCUMENTATION FILES

| File | Purpose | Audience |
|------|---------|----------|
| schema.sql | Complete DDL | DBA, DevOps |
| migrations.sql | Structured migrations | DBA, DevOps |
| DATABASE_DESIGN_GUIDE.md | Design justification & strategy | Architects, Engineers |
| PRACTICAL_EXAMPLES.sql | Real-world queries | Engineers, QA |
| This file | Quick reference | Everyone |

---

**Created:** 2026-02-03
**Version:** 1.0
**Status:** Ready for Production

For detailed design decisions, see DATABASE_DESIGN_GUIDE.md
For implementation examples, see PRACTICAL_EXAMPLES.sql
For migrations, see migrations.sql or schema.sql for direct import
