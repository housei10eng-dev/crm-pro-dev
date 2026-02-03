# 🏗️ API SPECIFICATION - CRM SaaS Enterprise

**Version:** v1.0  
**Status:** Ready for Implementation  
**Last Updated:** 2026-02-03  
**Author:** API Designer (Enterprise)

---

## 📑 TABLE OF CONTENTS

1. [Overview & Principles](#overview--principles)
2. [Authentication & Multi-Tenant](#authentication--multi-tenant)
3. [API Versioning & Conventions](#api-versioning--conventions)
4. [Error Handling](#error-handling)
5. [Pagination (Cursor-Based)](#pagination-cursor-based)
6. [Advanced Filtering](#advanced-filtering)
7. [Sorting & Ordering](#sorting--ordering)
8. [Rate Limiting & Protection](#rate-limiting--protection)
9. [Idempotency & Retry](#idempotency--retry)
10. [RBAC & Field-Level Authorization](#rbac--field-level-authorization)
11. [Endpoints Specification](#endpoints-specification)
12. [Async Jobs & Webhooks](#async-jobs--webhooks)
13. [Export & Reporting](#export--reporting)

---

## 🎯 OVERVIEW & PRINCIPLES

### Design Principles

| Principle | Implementation |
|-----------|-----------------|
| **REST** | HTTP methods reflect operations (GET read, POST create, PATCH update, DELETE soft-delete) |
| **Idempotent** | POST with idempotency key prevents duplicates on retry |
| **Atomic** | Single transactions for CRUD; async jobs for batch operations |
| **Secure** | Multi-tenant isolation enforced at API & DB level |
| **Performant** | Cursor pagination for large datasets; indexed queries only |
| **Auditable** | Every write logged with user, timestamp, IP, changes |

### API Levels

```
v1 (Current - 2025+)
├─ Stable endpoints (contacts, companies, deals)
└─ GA (General Availability)

v2 (Future - 2026+)
├─ New fields
├─ Deprecated v1 endpoints (60-day sunset)
└─ Breaking changes only in major version
```

### Response Envelope (All Responses)

```json
{
  "success": true,
  "data": { /* ... */ },
  "pagination": { /* cursor-based */ },
  "meta": {
    "request_id": "req_abc123xyz",
    "timestamp": "2026-02-03T14:30:00Z",
    "version": "v1",
    "ratelimit": {
      "limit": 300,
      "remaining": 287,
      "reset": 1707047400
    }
  }
}
```

---

## 🔐 AUTHENTICATION & MULTI-TENANT

### Token-Based Authentication

**Header Required:**
```
Authorization: Bearer <JWT_TOKEN>
X-Tenant-ID: <TENANT_UUID>
```

### JWT Payload Structure

```json
{
  "sub": "user-uuid",
  "tenant_id": "tenant-uuid",
  "email": "user@company.com",
  "roles": ["admin", "contact_manager"],
  "permissions": ["contact:create", "contact:update", "deal:read"],
  "iat": 1707043200,
  "exp": 1707129600,
  "iss": "crm.saas.auth",
  "scope": "write:contacts read:deals"
}
```

### Multi-Tenant Context Enforcement

```sql
-- Applied automatically to every DB query:
SET SESSION app.current_tenant_id = <token.tenant_id>;
SET SESSION app.current_user_id = <token.sub>;

-- RLS policies enforce:
WHERE tenant_id = current_setting('app.current_tenant_id')::UUID
```

**Validation Rules:**
1. X-Tenant-ID must match JWT tenant_id (else 403 Forbidden)
2. User must have explicit role in tenant (else 403)
3. Endpoint permission required (else 403)
4. Field-level restrictions enforced (see RBAC section)

### Example Handshake

```bash
# 1. Login
POST /v1/auth/login
{
  "email": "user@company.com",
  "password": "secret"
}

# Response
{
  "success": true,
  "data": {
    "access_token": "eyJhbGc...",
    "refresh_token": "ref_xyz...",
    "expires_in": 86400,
    "tenant_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479"
  }
}

# 2. Subsequent API calls
GET /v1/companies
Headers:
  Authorization: Bearer eyJhbGc...
  X-Tenant-ID: f47ac10b-58cc-4372-a567-0e02b2c3d479
```

---

## 📦 API VERSIONING & CONVENTIONS

### Header Versioning

```
GET /v1/companies  ← Explicit version in path
Accept-Version: application/vnd.crm.v1+json  ← Optional header
```

### Endpoint Pattern

```
/<version>/<resource>/<action>
/v1/companies/search
/v1/contacts/{id}/timeline
/v1/deals/{id}/forecast
```

### Deprecation Policy

```json
{
  "deprecation": "2026-05-15",
  "sunset": "2026-08-15",
  "alternatives": [
    "Use POST /v2/companies/bulk-update instead"
  ],
  "migration_guide": "https://docs.crm.saas/v2-migration"
}
```

---

## ❌ ERROR HANDLING

### Standardized Error Response

```json
{
  "success": false,
  "error": {
    "code": "COMPANY_NOT_FOUND",
    "message": "Company with ID abc123 not found in tenant context",
    "status": 404,
    "request_id": "req_xyz789abc",
    "timestamp": "2026-02-03T14:30:00Z",
    "details": {
      "company_id": "abc123",
      "tenant_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      "user_id": "user-uuid"
    },
    "suggestions": [
      "Verify company_id is correct",
      "Confirm access to this tenant",
      "Check if company was deleted"
    ]
  },
  "meta": { /* ... */ }
}
```

### HTTP Status Code Mapping

| Code | Scenario | Example |
|------|----------|---------|
| **200** | Success | GET /companies returned results |
| **201** | Created | POST /companies created new record |
| **204** | No Content | DELETE /company/123 succeeded |
| **400** | Bad Request | Invalid filter syntax, malformed JSON |
| **401** | Unauthorized | Missing/invalid token |
| **403** | Forbidden | User lacks permission or field restricted |
| **404** | Not Found | Resource not found in tenant context |
| **409** | Conflict | Duplicate email on create, version mismatch on update |
| **422** | Unprocessable | Validation failed (fields invalid) |
| **429** | Rate Limited | Too many requests |
| **500** | Server Error | Unexpected error (logged) |
| **502** | Bad Gateway | Async job timeout |
| **503** | Unavailable | Maintenance mode |

### Error Codes (Domain-Specific)

```
AUTHENTICATION_*
  INVALID_TOKEN
  TOKEN_EXPIRED
  INVALID_CREDENTIALS
  MFA_REQUIRED

AUTHORIZATION_*
  INSUFFICIENT_PERMISSIONS
  FIELD_RESTRICTED
  TENANT_MISMATCH
  USER_DEACTIVATED

VALIDATION_*
  INVALID_EMAIL
  INVALID_CPF_CNPJ
  REQUIRED_FIELD_MISSING
  VALUE_OUT_OF_RANGE
  DUPLICATE_UNIQUE_FIELD

RESOURCE_*
  NOT_FOUND
  SOFT_DELETED
  ARCHIVED
  VERSION_MISMATCH

GOVERNANCE_*
  GOVERNANCE_APPROVAL_REQUIRED
  APPROVAL_PENDING
  FIELD_LOCKED

BUSINESS_*
  INSUFFICIENT_BALANCE
  PAYMENT_DECLINED
  QUOTA_EXCEEDED
  ALREADY_PROCESSED
```

### Example Error Responses

**Invalid Token (401)**
```json
{
  "success": false,
  "error": {
    "code": "INVALID_TOKEN",
    "message": "JWT signature verification failed",
    "status": 401,
    "suggestions": ["Refresh token using /v1/auth/refresh", "Re-login"]
  }
}
```

**Field Restricted (403)**
```json
{
  "success": false,
  "error": {
    "code": "FIELD_RESTRICTED",
    "message": "Field 'salary' is restricted to admin role",
    "status": 403,
    "details": {
      "field": "salary",
      "required_role": "admin",
      "user_roles": ["employee"]
    }
  }
}
```

**Duplicate Email (409)**
```json
{
  "success": false,
  "error": {
    "code": "DUPLICATE_UNIQUE_FIELD",
    "message": "Email 'john@acme.com' already exists in this tenant",
    "status": 409,
    "details": {
      "field": "email",
      "value": "john@acme.com",
      "existing_contact_id": "contact-uuid"
    }
  }
}
```

**Rate Limited (429)**
```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Rate limit exceeded: 300 requests/hour",
    "status": 429,
    "meta": {
      "ratelimit": {
        "limit": 300,
        "remaining": 0,
        "reset": 1707047400,
        "retry_after": 3600
      }
    }
  }
}
```

---

## 📄 PAGINATION (CURSOR-BASED)

### Why Cursor-Based?

| Aspect | Offset (Bad) | Cursor (Good) |
|--------|-------------|--------------|
| **Performance** | O(offset + limit) - scans all rows | O(1) - direct seek |
| **Stability** | Rows shift during pagination → missed/duplicate | Stable across pages |
| **Concurrency** | New inserts mess up page consistency | Consistent snapshot |
| **Large Datasets** | LIMIT 5000 OFFSET 500000 = slow | Always fast |

### Cursor Encoding

```
# First page (no cursor)
GET /v1/companies?limit=20

# Response includes:
{
  "success": true,
  "data": [ /* 20 companies */ ],
  "pagination": {
    "has_next": true,
    "next_cursor": "Y29tcGFueV91dWlkXzEyMzQ1Njc4OTAx",  // base64 encoded
    "has_previous": false,
    "previous_cursor": null,
    "total_estimated": 1250  // approximate
  }
}

# Next page
GET /v1/companies?limit=20&cursor=Y29tcGFueV91dWlkXzEyMzQ1Njc4OTAx
```

### Cursor Format (Opaque)

```
# DO NOT document structure - clients treat as opaque
next_cursor = base64(
  "company|f47ac10b|timestamp:2026-02-03T14:30:00Z|id:12345"
)

# Implementation (backend):
# Contains: resource_type, tenant_id, timestamp, last_id
# Used for: keyset pagination (seek WHERE (created_at, id) > (last_timestamp, last_id))
```

### Request Parameters

```
GET /v1/companies?
  limit=20
  &cursor=Y29tcGFueV91dWlkXzEyMzQ1Njc4OTAx
  &sort_by=created_at:desc
  &filter=segment:eq:vip&filter=status:in:[active,prospect]
```

**Parameters:**
- `limit` (1-100, default 20): Items per page
- `cursor` (string, optional): Pagination token
- `sort_by` (string, optional): Sort order (see Sorting section)
- `filter` (array, optional): Filter conditions (see Filtering section)

### Response Structure

```json
{
  "success": true,
  "data": [ /* array of resources */ ],
  "pagination": {
    "limit": 20,
    "has_next": true,
    "has_previous": false,
    "next_cursor": "Y29tcGFueV91dWlkXzEyMzQ1Njc4OTAx",
    "previous_cursor": null,
    "total_estimated": 1250,
    "page_info": {
      "started_at": "2026-02-03T14:30:00Z",
      "ended_at": "2026-02-03T14:30:02Z",
      "execution_time_ms": 45
    }
  }
}
```

### Implementation Example (SQL)

```sql
-- Keyset pagination for high performance
SELECT * FROM companies
WHERE tenant_id = $1
  AND deleted_at IS NULL
  AND (created_at, id) > ($last_created_at, $last_id)  -- Keyset predicate
ORDER BY created_at DESC, id DESC
LIMIT $limit + 1;

-- has_next determined by: COUNT(*) > limit
-- next_cursor = base64(last_row.created_at || last_row.id)
```

---

## 🔍 ADVANCED FILTERING

### Filter Syntax

```
GET /v1/companies?
  filter=segment:eq:vip
  &filter=status:in:[active,prospect]
  &filter=monthly_revenue:gte:1000
  &filter=monthly_revenue:lte:50000
  &filter=name:contains:acme
  &filter=created_at:gte:2025-01-01T00:00:00Z
  &filter=tags:contains:strategic
  &filter=(segment:eq:vip|segment:eq:enterprise)  # OR condition
```

### Operator Reference

| Operator | Type | Example | SQL |
|----------|------|---------|-----|
| **eq** | Equality | `status:eq:active` | `= 'active'` |
| **ne** | Not Equal | `status:ne:deleted` | `!= 'deleted'` |
| **in** | Array | `status:in:[active,prospect]` | `IN ('active', 'prospect')` |
| **nin** | Not In | `status:nin:[deleted,archived]` | `NOT IN (...)` |
| **gt** | Greater | `revenue:gt:1000` | `> 1000` |
| **gte** | Greater-Equal | `revenue:gte:1000` | `>= 1000` |
| **lt** | Less | `revenue:lt:50000` | `< 50000` |
| **lte** | Less-Equal | `revenue:lte:50000` | `<= 50000` |
| **contains** | Substring | `name:contains:acme` | `ILIKE '%acme%'` |
| **starts_with** | Prefix | `name:starts_with:ac` | `ILIKE 'ac%'` |
| **ends_with** | Suffix | `name:ends_with:corp` | `ILIKE '%corp'` |
| **is_null** | Null Check | `phone:is_null:true` | `IS NULL` |
| **range** | Between | `revenue:range:[1000,50000]` | `BETWEEN 1000 AND 50000` |

### Complex Filters (Boolean Logic)

```
# AND (implicit)
GET /v1/companies?
  filter=segment:eq:vip
  &filter=status:eq:active
  &filter=monthly_revenue:gte:1000
# WHERE segment = 'vip' AND status = 'active' AND monthly_revenue >= 1000

# OR (parentheses)
GET /v1/companies?
  filter=(segment:eq:vip|segment:eq:enterprise)
  &filter=status:eq:active
# WHERE (segment = 'vip' OR segment = 'enterprise') AND status = 'active'

# Complex combination
GET /v1/companies?
  filter=(segment:eq:vip|segment:eq:enterprise)
  &filter=(status:eq:active|status:eq:prospect)
  &filter=revenue:gte:10000
# WHERE (segment IN ['vip', 'enterprise'])
#   AND (status IN ['active', 'prospect'])
#   AND revenue >= 10000
```

### JSONB Custom Field Filters

```
GET /v1/companies?
  filter=custom_fields.risk_score:gte:7
  &filter=custom_fields.industry:eq:technology
  &filter=custom_fields.has_api_integration:eq:true

# SQL:
# WHERE custom_fields->>'risk_score'::numeric >= 7
#   AND custom_fields->>'industry' = 'technology'
#   AND custom_fields->>'has_api_integration'::boolean = true
```

### Date Range Filters

```
GET /v1/companies?
  filter=created_at:gte:2025-01-01T00:00:00Z
  &filter=created_at:lte:2025-12-31T23:59:59Z
  &filter=updated_at:gte:now-30d  # Relative dates

# Relative date syntax:
# now, now-7d, now-1m, now-1y
# 2025-01-01, 2025-01-01T10:30:00Z (ISO 8601)
```

### Query Parameter Encoding

```
# URL encoded properly:
GET /v1/companies?filter=name%3Acontains%3Aacme%20corp&filter=status%3Aeq%3Aactive

# Decoded:
?filter=name:contains:acme corp&filter=status:eq:active
```

### Searchable Fields per Endpoint

Each endpoint documents which fields are filterable:

```json
{
  "filterable_fields": {
    "companies": [
      "id", "tenant_id", "name", "segment", "status",
      "monthly_revenue", "created_at", "updated_at",
      "tags", "custom_fields"
    ],
    "custom_fields_indexed": ["risk_score", "industry", "has_api_integration"]
  }
}
```

---

## 📊 SORTING & ORDERING

### Sort Syntax

```
GET /v1/companies?
  sort_by=created_at:desc,name:asc,revenue:desc

# Explanation:
# - Primary: created_at (newest first)
# - Secondary: name (A-Z)
# - Tertiary: revenue (highest first)
```

### Sort Direction

| Direction | Meaning |
|-----------|---------|
| **asc** | Ascending (A-Z, 0-9, oldest first) |
| **desc** | Descending (Z-A, 9-0, newest first) |

### Default Sort

```
# If not specified, default is:
sort_by=created_at:desc

# Different defaults per endpoint:
GET /v1/companies → sort_by=created_at:desc
GET /v1/contacts → sort_by=updated_at:desc
GET /v1/deals → sort_by=expected_close_date:asc
```

### Sortable Fields

```json
{
  "sortable_fields": {
    "companies": [
      "id", "name", "segment", "monthly_revenue",
      "created_at", "updated_at", "last_interaction_at"
    ]
  },
  "non_sortable": [
    "custom_fields",  // Too complex, use search instead
    "description"     // Full text, use full-text search
  ]
}
```

### Performance Constraints

```
# Allowed: Single sort key for non-indexed columns
sort_by=name:asc  ✅ (uses idx_companies_name_gin)

# Allowed: Multiple sorts with indexed columns
sort_by=created_at:desc,name:asc  ✅ (uses composite index)

# NOT allowed: Sorts on non-indexed fields
sort_by=description:asc  ❌ (500ms+ query, rejected)

# Error response:
{
  "success": false,
  "error": {
    "code": "UNSORTABLE_FIELD",
    "message": "Field 'description' is not sortable",
    "suggestions": ["Use full-text search instead", "Try filtering"]
  }
}
```

---

## ⚡ RATE LIMITING & PROTECTION

### Rate Limit Tiers

```
Tier 1 (Free)
├─ 100 requests/hour
├─ 10 requests/minute
└─ 3 concurrent requests

Tier 2 (Pro)
├─ 1000 requests/hour
├─ 100 requests/minute
└─ 20 concurrent requests

Tier 3 (Enterprise)
├─ Unlimited
├─ Custom burst allowance
└─ 100+ concurrent requests
```

### Rate Limit Headers

```
HTTP/1.1 200 OK
X-RateLimit-Limit: 300
X-RateLimit-Remaining: 287
X-RateLimit-Reset: 1707047400
X-RateLimit-Retry-After: 60
```

### Rate Limit Error Response

```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Rate limit exceeded: 300 requests/hour",
    "status": 429,
    "meta": {
      "ratelimit": {
        "limit": 300,
        "remaining": 0,
        "reset": 1707047400,
        "retry_after": 3600
      }
    }
  }
}
```

### Enumeration Protection

**Problem:** Attacker tries all company IDs to discover hidden records

```
GET /v1/companies/abc123  → 404 Not Found
GET /v1/companies/abc124  → 404 Not Found
GET /v1/companies/abc125  → 200 OK ← Discovered!
```

**Protection Strategies:**

```
1. Rate Limiting on 404s
   - 5 consecutive 404s = soft block
   - 10 consecutive 404s = 60-second block
   - Log enumeration attempt

2. Use UUIDs (not sequential IDs)
   - f47ac10b-58cc-4372-a567-0e02b2c3d479 (impossible to guess)
   - Instead of: 1, 2, 3, 4, 5...

3. Consistent Error Response
   - Always return same response time (add jitter if <100ms)
   - Never leak "resource exists" vs "not found"
   - Examples:
     - "Resource not found or you lack permission"
     - Same HTTP code for both 404 and 403

4. Monitor Enumeration Patterns
   - Flagged IPs trying 50+ IDs/hour
   - Bot detection (curl, automated tools)
   - Alert on suspicious patterns

5. Field-Level Enumeration
   - Email enumeration via "email already exists"
   - Solution: Never send duplicate message
   - Response: "Email is already registered" (same for new/existing)
```

### Enumeration Protection Implementation

```
# Endpoint: GET /v1/companies/{id}

# Query:
SELECT * FROM companies
WHERE tenant_id = $tenant_id
  AND id = $id
  AND deleted_at IS NULL;

# If not found:
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Resource not found or you lack permission",
    "status": 404,
    "request_id": "req_xyz"
  }
}

# Same response whether record doesn't exist or user lacks permission
```

### DDoS Protection

```
1. Rate Limiting per tenant/user
   - Per-IP limits (prevent single-IP DoS)
   - Per-tenant limits (prevent tenant abuse)
   - Per-endpoint limits (protect expensive operations)

2. Request Size Limits
   - Max body: 10MB
   - Max filter length: 2KB
   - Max number of filters: 10

3. Connection Pooling
   - Max 100 concurrent connections per tenant
   - Force close idle connections after 30 seconds

4. Timeout Enforcement
   - Read timeout: 30 seconds
   - Write timeout: 60 seconds
   - Query timeout: 5 seconds (abort after)

5. WAF Rules
   - SQL injection patterns (block)
   - Path traversal attempts (block)
   - Excessive special characters (block)
```

---

## 🔑 IDEMPOTENCY & RETRY

### Idempotency Key Header

```
POST /v1/companies
Headers:
  Authorization: Bearer ...
  X-Idempotency-Key: compny-acme-2026-02-03-001
Body:
  { "name": "Acme Corp", ... }
```

### Idempotency Guarantee

```
# First request (2026-02-03 14:30:00)
POST /v1/companies
X-Idempotency-Key: key-123
Body: { "name": "Acme Corp" }

Response (201):
{
  "data": {
    "id": "company-uuid-abc",
    "name": "Acme Corp"
  }
}

# Network failure, automatic retry with SAME idempotency key
POST /v1/companies
X-Idempotency-Key: key-123
Body: { "name": "Acme Corp" }

Response (201) [CACHED]:
{
  "data": {
    "id": "company-uuid-abc",  ← SAME ID (not duplicated)
    "name": "Acme Corp"
  }
}

# Verification: Only ONE company created
SELECT COUNT(*) FROM companies WHERE name = 'Acme Corp';  → 1
```

### Implementation Details

```sql
-- Idempotency key storage (write-ahead)
CREATE TABLE idempotency_keys (
  tenant_id UUID NOT NULL,
  user_id UUID NOT NULL,
  key VARCHAR(255) NOT NULL,
  method VARCHAR(10) NOT NULL,
  endpoint VARCHAR(255) NOT NULL,
  request_body JSONB,
  response_status INT,
  response_body JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP DEFAULT NOW() + INTERVAL '24 hours',
  UNIQUE(tenant_id, key)
);

-- Before CREATE:
1. Check IF EXISTS idempotency_keys(key)
   a. IF EXISTS & status = 201: return cached response
   b. IF EXISTS & status = 4xx: return error
   c. IF NOT EXISTS: proceed to INSERT

2. INSERT into idempotency_keys (status=PROCESSING)

3. Perform business logic

4. UPDATE idempotency_keys (status=200, response_body=...)

5. RETURN response

-- Expiration: Auto-delete after 24 hours (via CRON)
```

### Endpoints Requiring Idempotency

```
✅ Required:
POST /v1/companies          (create)
POST /v1/contacts           (create)
POST /v1/deals              (create)
POST /v1/users              (create)
PATCH /v1/companies/{id}    (update, idempotent)
POST /v1/billing/webhooks   (webhook processor)

❌ Not Required:
GET /v1/companies           (read-only, inherently safe)
DELETE /v1/companies/{id}   (soft-delete is idempotent via deleted_at)
```

### Retry Strategy

```
Client-side retry logic:

1. First attempt: send request with Idempotency-Key
2. If timeout or 5xx: wait 1s, retry with SAME key
3. If 4xx: do NOT retry (user error)
4. If 2xx: success, stop

Server-side:
- Check idempotency key cache
- If cached 201: return immediately
- If cached 4xx: return error (don't retry)
- Timeout after 60s (abort in-flight request)
```

---

## 👥 RBAC & FIELD-LEVEL AUTHORIZATION

### Permission Model

```
User
├─ Role(s)
│  ├─ Permission(s)
│  └─ Condition(s) [ABAC]
└─ Explicit Deny(s)

Example:
User: john@acme.com
├─ Role: contact_manager
│  ├─ Permission: contact:read
│  ├─ Permission: contact:create
│  ├─ Permission: contact:update
│  └─ Condition: status IN ['active', 'prospect']
└─ Explicit Deny: contact:delete
```

### Permission Enforcement (Per Endpoint)

```
GET /v1/contacts requires:
- Permission: contact:read
- No additional conditions

POST /v1/contacts requires:
- Permission: contact:create
- Field restrictions (see below)

PATCH /v1/contacts/{id} requires:
- Permission: contact:update
- Field restrictions (see below)

DELETE /v1/contacts/{id} requires:
- Permission: contact:delete
- Soft delete only (hard delete restricted to admin)
```

### Field-Level Authorization

**Access Control Matrix:**

| Field | User Role | Manager Role | Admin Role |
|-------|-----------|--------------|-----------|
| id | ✅ Read | ✅ Read | ✅ Read |
| email | ✅ R/W | ✅ R/W | ✅ R/W |
| phone | ✅ Read | ✅ R/W | ✅ R/W |
| source | ✅ Read | ✅ R/W | ✅ R/W |
| salary | ❌ Blocked | ❌ Blocked | ✅ R/W |
| ssn | ❌ Blocked | ❌ Blocked | ✅ Read |
| credit_score | ❌ Blocked | ❌ Blocked | ✅ R/W |
| custom_fields.risk_score | ✅ Read | ✅ R/W | ✅ R/W |
| custom_fields.legal_notes | ❌ Blocked | ❌ Blocked | ✅ R/W |

### Request: Create Contact (Field-Level Check)

```json
POST /v1/contacts
{
  "email": "john@acme.com",
  "first_name": "John",
  "phone": "+55 11 98765-4321",
  "source": "inbound",
  "salary": 5000  ❌ Not in token scope
}

Response (403):
{
  "success": false,
  "error": {
    "code": "FIELD_RESTRICTED",
    "message": "Field 'salary' is restricted to admin role",
    "status": 403,
    "details": {
      "field": "salary",
      "required_role": "admin",
      "user_roles": ["contact_manager"],
      "operation": "write"
    }
  }
}
```

### Request: Read Contact (Masked Fields)

```json
GET /v1/contacts/{id}

Response (200):
{
  "success": true,
  "data": {
    "id": "contact-uuid",
    "email": "john@acme.com",
    "first_name": "John",
    "phone": "+55 11 98765-4321",
    "source": "inbound",
    "salary": null,          ← Masked (not visible to this role)
    "ssn": "***-**-****",    ← Partially masked
    "credit_score": null,    ← Masked
    "custom_fields": {
      "risk_score": 7,       ← Visible
      "legal_notes": null    ← Masked
    },
    "_field_restrictions": {
      "salary": "admin_only",
      "ssn": "admin_only",
      "credit_score": "admin_only"
    }
  }
}
```

### RBAC Enforcement Pipeline

```python
# Middleware layer
class AuthorizationMiddleware:
    def process(request):
        # 1. Extract token & validate
        user, roles, permissions = extract_jwt(request.headers)
        
        # 2. Validate tenant match
        if request.headers.X_TENANT_ID != user.tenant_id:
            raise Forbidden("Tenant mismatch")
        
        # 3. Check endpoint permission
        required_permission = ENDPOINT_PERMISSIONS[request.method][request.path]
        if required_permission not in permissions:
            raise Forbidden(f"Missing {required_permission}")
        
        # 4. Set context (DB layer)
        set_config('app.current_tenant_id', user.tenant_id)
        set_config('app.current_user_id', user.id)
        set_config('app.user_roles', roles)
        
        # 5. Set field restrictions
        request.user = user
        request.restricted_fields = get_restricted_fields(roles)
        
        return next(request)

# Controller layer
class ContactController:
    @post('/contacts')
    def create(request):
        # 1. Validate RBAC
        if 'contact:create' not in request.user.permissions:
            raise Forbidden()
        
        # 2. Strip restricted fields
        payload = request.body
        for field in request.restricted_fields:
            payload.pop(field, None)
        
        # 3. Create (RLS applies in DB)
        contact = ContactService.create(payload)
        
        # 4. Mask response fields
        response = mask_fields(contact, request.restricted_fields)
        
        return response
```

### Cache Authorization (Redis)

```
# Token-based cache (5-minute TTL)
cache_key = f"auth:{user_id}:{tenant_id}:permissions"
cached = redis.get(cache_key)

if cached:
    return cached  ← Fast path (most requests)
else:
    # DB query (fallback)
    perms = db.query("""
        SELECT p.name FROM permissions p
        WHERE p.id IN (
            SELECT permission_id FROM role_permissions rp
            WHERE rp.role_id IN (
                SELECT role_id FROM user_roles
                WHERE user_id = $1 AND tenant_id = $2
            )
        )
    """)
    redis.setex(cache_key, 300, perms)  # 5 min TTL
    return perms
```

---

## 📡 ENDPOINTS SPECIFICATION

### Endpoint Categories

```
1. Companies & Clients      (12 endpoints)
2. Drawer / Details         (4 endpoints - deep-dive tabs)
3. Employees (Master)       (5 endpoints)
4. Account & Password       (3 endpoints)
5. Audit Log                (2 endpoints - read-only)
6. Billing & Webhooks       (5 endpoints)
```

---

## 1️⃣ COMPANIES & CLIENTS ENDPOINTS

### 1.1 List Companies (with Filters & Pagination)

```
GET /v1/companies

Query Parameters:
  limit=20                              (optional, default 20, max 100)
  cursor=Y29tcGFueV91dWlkXz...         (optional, for next page)
  sort_by=created_at:desc,name:asc     (optional)
  filter=segment:eq:vip                (optional, repeatable)
  filter=status:in:[active,prospect]
  filter=monthly_revenue:gte:1000
  search=acme                           (optional, full-text search)

Request:
GET /v1/companies?limit=20&filter=segment:eq:vip&sort_by=created_at:desc

Response (200):
{
  "success": true,
  "data": [
    {
      "id": "company-uuid-1",
      "tenant_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      "name": "Acme Corp",
      "segment": "vip",
      "status": "active",
      "cnpj": "34028316000172",
      "legal_name": "Acme Corporação Ltda",
      "monthly_revenue": 50000.00,
      "phone": "+55 11 3000-0000",
      "email": "contact@acme.com",
      "website": "https://acme.com",
      "address": {
        "street": "Av. Paulista 1000",
        "city": "São Paulo",
        "state": "SP",
        "country": "BR",
        "zip_code": "01311-100"
      },
      "tags": ["strategic", "high-value", "tech-enabled"],
      "custom_fields": {
        "industry": "Technology",
        "risk_score": 7,
        "employee_count": 500,
        "has_api_integration": true
      },
      "contact_person": {
        "name": "João Silva",
        "email": "joao@acme.com",
        "phone": "+55 11 99999-8888"
      },
      "governance_approved_by": "admin-user-uuid",
      "governance_approved_at": "2026-01-15T10:30:00Z",
      "created_at": "2025-03-10T08:20:00Z",
      "updated_at": "2026-02-03T14:30:00Z",
      "last_interaction_at": "2026-02-02T16:45:00Z",
      "deleted_at": null
    },
    { /* ... more companies */ }
  ],
  "pagination": {
    "limit": 20,
    "has_next": true,
    "next_cursor": "Y29tcGFueV91dWlkXzIwMjYwMjAz",
    "has_previous": false,
    "total_estimated": 127
  },
  "meta": {
    "request_id": "req_abc123xyz",
    "timestamp": "2026-02-03T14:30:00Z",
    "version": "v1",
    "ratelimit": {
      "limit": 300,
      "remaining": 286,
      "reset": 1707047400
    }
  }
}
```

### 1.2 Get Company Details

```
GET /v1/companies/{id}

Request:
GET /v1/companies/company-uuid-1

Response (200):
{
  "success": true,
  "data": {
    "id": "company-uuid-1",
    "tenant_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "name": "Acme Corp",
    "segment": "vip",
    "status": "active",
    "cnpj": "34028316000172",
    "legal_name": "Acme Corporação Ltda",
    "monthly_revenue": 50000.00,
    "phone": "+55 11 3000-0000",
    "email": "contact@acme.com",
    "website": "https://acme.com",
    "address": { /* ... */ },
    "tags": ["strategic", "high-value"],
    "custom_fields": { /* ... */ },
    "contact_person": { /* ... */ },
    "metadata": {
      "total_contacts": 42,
      "total_deals": 15,
      "active_deals_value": 1250000.00,
      "total_interactions": 203,
      "last_interaction_days_ago": 1,
      "churn_risk": "low"
    },
    "governance_approved_by": "admin-user-uuid",
    "governance_approved_at": "2026-01-15T10:30:00Z",
    "created_at": "2025-03-10T08:20:00Z",
    "updated_at": "2026-02-03T14:30:00Z",
    "last_interaction_at": "2026-02-02T16:45:00Z",
    "deleted_at": null
  },
  "meta": { /* ... */ }
}

Error Responses:
404 Not Found:
{
  "success": false,
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "Company not found",
    "status": 404
  }
}
```

### 1.3 Create Company

```
POST /v1/companies

Headers:
  X-Idempotency-Key: company-acme-2026-02-03

Request:
{
  "name": "Acme Corp",
  "segment": "vip",
  "cnpj": "34.028.316/0001-72",        (formatted, auto-normalize)
  "legal_name": "Acme Corporação Ltda",
  "monthly_revenue": 50000.00,
  "phone": "+55 11 3000-0000",
  "email": "contact@acme.com",
  "website": "https://acme.com",
  "address": {
    "street": "Av. Paulista 1000",
    "city": "São Paulo",
    "state": "SP",
    "country": "BR",
    "zip_code": "01311-100"
  },
  "tags": ["strategic", "high-value"],
  "custom_fields": {
    "industry": "Technology",
    "employee_count": 500,
    "has_api_integration": true
  },
  "contact_person": {
    "name": "João Silva",
    "email": "joao@acme.com",
    "phone": "+55 11 99999-8888"
  }
}

Response (201):
{
  "success": true,
  "data": {
    "id": "company-uuid-1",
    "name": "Acme Corp",
    "segment": "vip",
    "cnpj": "34028316000172",       (normalized)
    "status": "active",
    "created_at": "2026-02-03T14:30:00Z",
    "created_by_user_id": "user-uuid",
    /* ... full company object ... */
  },
  "meta": { /* ... */ }
}

Error Responses:
400 Bad Request - Invalid CNPJ:
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "CNPJ validation failed",
    "details": {
      "field": "cnpj",
      "error": "Invalid CNPJ checksum"
    }
  }
}

409 Conflict - Duplicate CNPJ:
{
  "success": false,
  "error": {
    "code": "DUPLICATE_UNIQUE_FIELD",
    "message": "A company with this CNPJ already exists",
    "details": {
      "field": "cnpj",
      "existing_company_id": "company-uuid-existing"
    }
  }
}
```

### 1.4 Update Company (with Governance)

```
PATCH /v1/companies/{id}

Headers:
  X-Idempotency-Key: company-update-acme-2026-02-03

Request:
{
  "name": "Acme Corporation",        (non-critical field)
  "segment": "enterprise",            (non-critical field)
  "monthly_revenue": 75000.00,        (non-critical field)
  "phone": "+55 11 3000-0001",        (non-critical field)
  "custom_fields": {
    "industry": "Software",
    "employee_count": 600
  },
  "cnpj": "34.028.316/0001-72",       (CRITICAL - requires governance)
  "legal_name": "Acme Corp. Ltda"     (CRITICAL - requires governance)
}

Response (200) - Partially Updated:
{
  "success": true,
  "data": {
    "id": "company-uuid-1",
    "name": "Acme Corporation",
    "segment": "enterprise",
    "monthly_revenue": 75000.00,
    "cnpj": "34028316000172",         (unchanged - pending approval)
    "legal_name": "Acme Corporação Ltda",  (unchanged - pending approval)
    "governance_status": {
      "cnpj": {
        "status": "pending",
        "requested_by": "user-uuid",
        "requested_at": "2026-02-03T14:30:00Z",
        "requested_value": "34028316000172",
        "approval_required_from": ["admin"]
      },
      "legal_name": {
        "status": "pending",
        "requested_by": "user-uuid",
        "requested_at": "2026-02-03T14:30:00Z",
        "requested_value": "Acme Corp. Ltda",
        "approval_required_from": ["admin", "compliance"]
      }
    },
    "updated_at": "2026-02-03T14:30:00Z"
  },
  "warnings": [
    {
      "field": "cnpj",
      "code": "GOVERNANCE_PENDING",
      "message": "Change requires admin approval"
    },
    {
      "field": "legal_name",
      "code": "GOVERNANCE_PENDING",
      "message": "Change requires admin approval"
    }
  ],
  "meta": { /* ... */ }
}

Error Response - No Permission to Update Critical Field:
403 Forbidden:
{
  "success": false,
  "error": {
    "code": "FIELD_RESTRICTED",
    "message": "Field 'cnpj' requires admin approval to update",
    "details": {
      "field": "cnpj",
      "restriction_type": "governance",
      "approval_required": true,
      "can_request_approval": true
    }
  }
}
```

### 1.5 Delete Company (Soft Delete)

```
DELETE /v1/companies/{id}

Request:
DELETE /v1/companies/company-uuid-1

Response (204):
(No content, but record marked deleted_at = NOW())

Verification:
GET /v1/companies/company-uuid-1
→ 404 Not Found (soft-deleted records excluded by default)

Admin Override (View Soft-Deleted):
GET /v1/companies?include_deleted=true

Response:
{
  "data": [
    {
      "id": "company-uuid-1",
      "name": "Acme Corp",
      "deleted_at": "2026-02-03T14:30:00Z",
      "deleted_by_user_id": "user-uuid"
    }
  ]
}

Permanent Delete (Admin Only):
DELETE /v1/companies/{id}?permanent=true
→ 403 Forbidden if not admin
→ 204 No Content if admin (truly deleted from DB, WORM audit trail remains)
```

### 1.6 Bulk Update Companies

```
PATCH /v1/companies/bulk

Request:
{
  "filter": {
    "segment": "vip",
    "status": "active"
  },
  "updates": {
    "tags": ["reviewed-feb-2026"],
    "custom_fields": {
      "last_bulk_review": "2026-02-03"
    }
  }
}

Response (202 Accepted):
{
  "success": true,
  "data": {
    "job_id": "job-bulk-update-abc123",
    "status": "processing",
    "estimated_records": 127,
    "estimated_completion_time": "2026-02-03T14:45:00Z",
    "webhook_url": "https://api.crm.saas/v1/webhooks/jobs/job-bulk-update-abc123"
  }
}

Polling:
GET /v1/jobs/job-bulk-update-abc123

Response:
{
  "status": "completed",
  "records_updated": 127,
  "records_failed": 0,
  "completed_at": "2026-02-03T14:32:00Z",
  "results": {
    "success_count": 127,
    "error_count": 0,
    "errors": []
  }
}
```

### 1.7 Search Companies (Full-Text)

```
GET /v1/companies/search

Query Parameters:
  q=acme              (required)
  limit=20
  cursor=...

Request:
GET /v1/companies/search?q=acme%20technology

Response (200):
{
  "success": true,
  "data": [
    {
      "id": "company-uuid-1",
      "name": "Acme Corp",
      "highlight": "Acme Corp Technology division",
      "relevance_score": 0.95,
      "matched_fields": ["name", "custom_fields.industry"]
    },
    {
      "id": "company-uuid-2",
      "name": "Acme Technology Solutions",
      "highlight": "Acme Technology Solutions partners",
      "relevance_score": 0.88,
      "matched_fields": ["name"]
    }
  ],
  "pagination": { /* ... */ }
}

Note:
- Uses Elasticsearch/full-text search index
- Must include "q" parameter
- Fields searched: name, legal_name, website, custom_fields, contact_person
```

### 1.8 Get Company View Presets

```
GET /v1/companies/views

Response (200):
{
  "success": true,
  "data": [
    {
      "id": "view-uuid-1",
      "name": "VIP Clients",
      "description": "High-value VIP accounts",
      "created_by_user_id": "user-uuid",
      "is_default": false,
      "is_shared": true,
      "filters": {
        "segment": "vip",
        "status": "active"
      },
      "columns": [
        "name",
        "segment",
        "monthly_revenue",
        "last_interaction_at",
        "custom_fields.risk_score"
      ],
      "sort_by": "monthly_revenue:desc"
    },
    { /* ... more views ... */ }
  ]
}
```

### 1.9 Create Company View

```
POST /v1/companies/views

Request:
{
  "name": "VIP Clients",
  "description": "High-value VIP accounts",
  "is_shared": true,
  "is_default": false,
  "filters": {
    "segment": "vip",
    "status": "active",
    "monthly_revenue": "gte:50000"
  },
  "columns": [
    "name",
    "segment",
    "monthly_revenue",
    "last_interaction_at"
  ],
  "sort_by": "monthly_revenue:desc"
}

Response (201):
{
  "success": true,
  "data": {
    "id": "view-uuid-1",
    "name": "VIP Clients",
    /* ... full view object ... */
  }
}
```

### 1.10 Get Contacts by Company

```
GET /v1/companies/{company_id}/contacts

Query Parameters:
  limit=20
  cursor=...
  sort_by=created_at:desc
  filter=status:eq:active

Response (200):
{
  "success": true,
  "data": [
    {
      "id": "contact-uuid-1",
      "company_id": "company-uuid-1",
      "first_name": "João",
      "last_name": "Silva",
      "email": "joao@acme.com",
      "phone": "+55 11 99999-8888",
      "status": "active",
      "role_at_company": "CEO",
      "created_at": "2026-01-15T10:30:00Z"
    }
  ],
  "pagination": { /* ... */ }
}
```

### 1.11 Get Deals by Company

```
GET /v1/companies/{company_id}/deals

Query Parameters:
  limit=20
  cursor=...
  sort_by=expected_close_date:asc
  filter=status:in:[open,negotiation]

Response (200):
{
  "success": true,
  "data": [
    {
      "id": "deal-uuid-1",
      "company_id": "company-uuid-1",
      "title": "Enterprise License - 3 Years",
      "stage": "negotiation",
      "amount": 100000.00,
      "probability": 0.75,
      "expected_close_date": "2026-03-15",
      "owner_user_id": "user-uuid",
      "created_at": "2026-01-10T08:00:00Z"
    }
  ],
  "pagination": { /* ... */ }
}
```

### 1.12 Get Company Activity Timeline

```
GET /v1/companies/{company_id}/timeline

Query Parameters:
  limit=20
  cursor=...
  event_types=interaction,deal_update,contact_added
  sort_by=created_at:desc

Response (200):
{
  "success": true,
  "data": [
    {
      "id": "event-uuid-1",
      "timestamp": "2026-02-03T14:30:00Z",
      "event_type": "interaction",
      "actor_user_id": "user-uuid",
      "actor_name": "Maria Santos",
      "action": "logged_call",
      "metadata": {
        "contact_id": "contact-uuid-1",
        "contact_name": "João Silva",
        "duration_minutes": 15,
        "notes": "Discussed renewal pricing"
      }
    },
    {
      "id": "event-uuid-2",
      "timestamp": "2026-02-02T16:45:00Z",
      "event_type": "deal_update",
      "actor_user_id": "user-uuid",
      "actor_name": "Carlos Pereira",
      "action": "stage_changed",
      "metadata": {
        "deal_id": "deal-uuid-1",
        "deal_title": "Enterprise License",
        "from_stage": "proposal",
        "to_stage": "negotiation"
      }
    }
  ],
  "pagination": { /* ... */ }
}
```

---

## 2️⃣ DRAWER / DETAILS ENDPOINTS

### 2.1 Get Company Drawer (All Tabs at Once)

```
GET /v1/companies/{id}/drawer

Response (200):
{
  "success": true,
  "data": {
    "general": {
      "id": "company-uuid-1",
      "name": "Acme Corp",
      "segment": "vip",
      "status": "active",
      "cnpj": "34028316000172",
      "legal_name": "Acme Corporação Ltda",
      "website": "https://acme.com",
      "tags": ["strategic", "tech-enabled"],
      "custom_fields": { /* ... */ },
      "contact_person": { /* ... */ }
    },
    "financial": {
      "monthly_revenue": 50000.00,
      "annual_contract_value": 600000.00,
      "billing_address": { /* ... */ },
      "billing_email": "billing@acme.com",
      "billing_contact": "CFO",
      "payment_method": "credit_card",
      "next_billing_date": "2026-03-03",
      "account_status": "active"
    },
    "spending": {
      "total_invoiced": 600000.00,
      "total_paid": 550000.00,
      "total_outstanding": 50000.00,
      "average_invoice_value": 25000.00,
      "payment_average_days": 15,
      "invoices_30_days_overdue": 1,
      "invoices_60_days_overdue": 0,
      "spending_by_month": [
        {
          "month": "2026-01",
          "amount": 25000.00,
          "status": "paid"
        },
        {
          "month": "2025-12",
          "amount": 25000.00,
          "status": "pending"
        }
      ]
    },
    "support": {
      "total_tickets": 42,
      "open_tickets": 3,
      "average_resolution_time_hours": 24,
      "satisfaction_score": 4.7,
      "recent_tickets": [
        {
          "id": "ticket-uuid-1",
          "subject": "API Integration Issue",
          "status": "open",
          "priority": "high",
          "created_at": "2026-02-03T08:00:00Z",
          "updated_at": "2026-02-03T14:00:00Z"
        }
      ]
    },
    "audit": {
      "created_at": "2025-03-10T08:20:00Z",
      "created_by_user": {
        "id": "user-uuid-1",
        "email": "maria@company.com",
        "name": "Maria Santos"
      },
      "updated_at": "2026-02-03T14:30:00Z",
      "updated_by_user": {
        "id": "user-uuid-2",
        "email": "carlos@company.com",
        "name": "Carlos Pereira"
      },
      "last_accessed_at": "2026-02-03T14:30:00Z",
      "last_accessed_by_user": {
        "id": "user-uuid-2",
        "email": "carlos@company.com",
        "name": "Carlos Pereira"
      },
      "access_count": 1247,
      "changes_count": 34
    }
  },
  "meta": { /* ... */ }
}
```

### 2.2 Get Company - General Tab

```
GET /v1/companies/{id}/drawer/general

Response (200):
{
  "success": true,
  "data": {
    "id": "company-uuid-1",
    "name": "Acme Corp",
    "segment": "vip",
    "status": "active",
    "cnpj": "34028316000172",
    "legal_name": "Acme Corporação Ltda",
    "website": "https://acme.com",
    "phone": "+55 11 3000-0000",
    "email": "contact@acme.com",
    "address": { /* ... */ },
    "tags": ["strategic", "tech-enabled"],
    "custom_fields": { /* ... */ },
    "contact_person": { /* ... */ }
  }
}
```

### 2.3 Get Company - Financial Tab

```
GET /v1/companies/{id}/drawer/financial

Response (200):
{
  "success": true,
  "data": {
    "monthly_revenue": 50000.00,
    "annual_contract_value": 600000.00,
    "billing_address": { /* ... */ },
    "billing_email": "billing@acme.com",
    "billing_contact": "João CFO Silva",
    "payment_method": "credit_card",
    "payment_terms": "net_30",
    "next_billing_date": "2026-03-03",
    "account_status": "active",
    "currency": "BRL"
  }
}
```

### 2.4 Get Company - Audit Tab

```
GET /v1/companies/{id}/drawer/audit

Query Parameters:
  limit=20
  cursor=...
  event_types=change,access,export

Response (200):
{
  "success": true,
  "data": {
    "timeline": [
      {
        "id": "audit-event-uuid-1",
        "timestamp": "2026-02-03T14:30:00Z",
        "event_type": "field_changed",
        "actor": {
          "id": "user-uuid-2",
          "email": "carlos@company.com",
          "ip_address": "192.168.1.100"
        },
        "changes": [
          {
            "field": "monthly_revenue",
            "old_value": 40000.00,
            "new_value": 50000.00,
            "changed_at": "2026-02-03T14:30:00Z"
          }
        ]
      },
      {
        "id": "audit-event-uuid-2",
        "timestamp": "2026-02-02T16:45:00Z",
        "event_type": "record_accessed",
        "actor": {
          "id": "user-uuid-1",
          "email": "maria@company.com",
          "ip_address": "192.168.1.101"
        }
      }
    ],
    "summary": {
      "total_changes": 34,
      "total_accesses": 1247,
      "last_modified_by": "Carlos Pereira",
      "last_modified_at": "2026-02-03T14:30:00Z"
    }
  },
  "pagination": { /* ... */ }
}
```

---

## 3️⃣ EMPLOYEES (MASTER) ENDPOINTS

### 3.1 List Employees (Master Users)

```
GET /v1/employees

Query Parameters:
  limit=20
  cursor=...
  filter=status:eq:active
  filter=department:eq:sales
  sort_by=created_at:desc

Response (200):
{
  "success": true,
  "data": [
    {
      "id": "user-uuid-1",
      "email": "maria@company.com",
      "first_name": "Maria",
      "last_name": "Santos",
      "phone": "+55 11 98765-4321",
      "department": "sales",
      "role": "sales_manager",
      "status": "active",
      "roles": ["sales_manager", "contact_manager"],
      "permissions": [
        "contact:create", "contact:read", "contact:update",
        "deal:create", "deal:read", "deal:update",
        "report:read"
      ],
      "manager_id": "user-uuid-admin",
      "custom_fields": {
        "hire_date": "2023-01-15",
        "salary_currency": "BRL"
      },
      "last_login_at": "2026-02-03T14:30:00Z",
      "created_at": "2023-01-15T10:00:00Z",
      "updated_at": "2026-02-03T14:30:00Z",
      "deleted_at": null
    }
  ],
  "pagination": { /* ... */ }
}
```

### 3.2 Get Employee Details

```
GET /v1/employees/{id}

Response (200):
{
  "success": true,
  "data": {
    "id": "user-uuid-1",
    "email": "maria@company.com",
    "first_name": "Maria",
    "last_name": "Santos",
    "phone": "+55 11 98765-4321",
    "cpf": "12345678901",
    "department": "sales",
    "role": "sales_manager",
    "status": "active",
    "roles": ["sales_manager", "contact_manager"],
    "manager_id": "user-uuid-admin",
    "manager_name": "João Admin",
    "custom_fields": {
      "hire_date": "2023-01-15",
      "salary_currency": "BRL"
    },
    "mfa_enabled": true,
    "last_login_at": "2026-02-03T14:30:00Z",
    "created_at": "2023-01-15T10:00:00Z",
    "updated_at": "2026-02-03T14:30:00Z"
  }
}
```

### 3.3 Create Employee

```
POST /v1/employees

Request:
{
  "email": "maria@company.com",
  "first_name": "Maria",
  "last_name": "Santos",
  "phone": "+55 11 98765-4321",
  "cpf": "123.456.789-01",
  "department": "sales",
  "roles": ["sales_manager", "contact_manager"],
  "manager_id": "user-uuid-admin",
  "custom_fields": {
    "hire_date": "2023-01-15",
    "salary_currency": "BRL"
  }
}

Response (201):
{
  "success": true,
  "data": {
    "id": "user-uuid-1",
    "email": "maria@company.com",
    "first_name": "Maria",
    "last_name": "Santos",
    "status": "active",
    "temporary_password": "TempPass123!@#",  ← Send to email
    "password_expires_at": "2026-02-10T14:30:00Z",
    "mfa_setup_required": true,
    "onboarding_url": "https://crm.saas/onboarding?token=xyz"
  }
}

Note:
- Temporary password sent to email
- MFA setup required on first login
- Onboarding link includes secure token (24h expiry)
```

### 3.4 Update Employee

```
PATCH /v1/employees/{id}

Request:
{
  "phone": "+55 11 98765-4322",
  "department": "sales",
  "roles": ["sales_manager", "sales_director"],
  "status": "active"
}

Response (200):
{
  "success": true,
  "data": { /* updated employee */ }
}
```

### 3.5 Deactivate Employee

```
DELETE /v1/employees/{id}

Response (204):
(Soft delete: status = 'inactive', permissions revoked)

Verification:
GET /v1/employees?filter=status:eq:inactive
→ Shows only deactivated employees

Permanent Delete (Audit Only):
DELETE /v1/employees/{id}?permanent=true
→ 403 Forbidden (data must be preserved for audit)
```

---

## 4️⃣ ACCOUNT & PASSWORD ENDPOINTS

### 4.1 Reset Password - Client Request

```
POST /v1/auth/password-reset/request

Request:
{
  "email": "john@acme.com",
  "client_type": "client"  // or "employee"
}

Response (202 Accepted):
{
  "success": true,
  "data": {
    "message": "Password reset email sent",
    "reset_link_expires_in": 3600
  }
}

Note:
- Does NOT indicate whether email exists (enumeration protection)
- Email sent with secure token + 1-hour expiry
- Same response for existing/non-existing email
```

### 4.2 Reset Password - Confirm

```
POST /v1/auth/password-reset/confirm

Request:
{
  "token": "reset_token_abc123xyz",
  "new_password": "SecurePassword123!@#"
}

Response (200):
{
  "success": true,
  "data": {
    "message": "Password reset successful",
    "login_url": "https://crm.saas/login"
  }
}

Error Response - Invalid/Expired Token:
{
  "success": false,
  "error": {
    "code": "INVALID_RESET_TOKEN",
    "message": "Reset link is invalid or expired",
    "status": 400
  }
}
```

### 4.3 Change Password (Authenticated User)

```
POST /v1/auth/password-change

Request (requires valid JWT):
{
  "current_password": "OldPassword123!@#",
  "new_password": "NewPassword456!@#"
}

Response (200):
{
  "success": true,
  "data": {
    "message": "Password changed successfully",
    "next_login": true
  }
}

Error Response - Wrong Current Password:
{
  "success": false,
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Current password is incorrect",
    "status": 401
  }
}
```

---

## 5️⃣ AUDIT LOG ENDPOINTS

### 5.1 Get Audit Log (Read-Only)

```
GET /v1/audit-log

Query Parameters:
  limit=20
  cursor=...
  filter=resource_type:eq:company
  filter=action:eq:update
  filter=actor_user_id:eq:user-uuid
  filter=created_at:gte:2026-02-01T00:00:00Z
  sort_by=created_at:desc

Response (200):
{
  "success": true,
  "data": [
    {
      "id": "audit-event-uuid-1",
      "tenant_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
      "resource_type": "company",
      "resource_id": "company-uuid-1",
      "action": "update",
      "actor_user_id": "user-uuid-2",
      "actor_email": "carlos@company.com",
      "actor_ip_address": "192.168.1.100",
      "actor_user_agent": "Mozilla/5.0...",
      "timestamp": "2026-02-03T14:30:00Z",
      "changes": [
        {
          "field": "monthly_revenue",
          "old_value": "40000.00",
          "new_value": "50000.00",
          "change_type": "numeric"
        }
      ],
      "metadata": {
        "idempotency_key": "company-update-2026-02-03-001",
        "api_version": "v1",
        "request_id": "req_abc123xyz"
      },
      "hash_value": "sha256_hash_abc123xyz"  ← For integrity verification
    }
  ],
  "pagination": { /* ... */ }
}

Permission:
- Requires: audit:read
- Field restrictions: Sensitive fields (IPs, user emails) may be masked for non-admin
```

### 5.2 Export Audit Log (CSV)

```
POST /v1/audit-log/export

Request:
{
  "format": "csv",
  "filter": {
    "created_at": "gte:2026-01-01T00:00:00Z",
    "created_at": "lte:2026-01-31T23:59:59Z"
  },
  "columns": [
    "timestamp",
    "resource_type",
    "resource_id",
    "action",
    "actor_email",
    "field",
    "old_value",
    "new_value"
  ]
}

Response (202 Accepted):
{
  "success": true,
  "data": {
    "job_id": "job-export-audit-abc123",
    "status": "processing",
    "estimated_completion_time": "2026-02-03T14:45:00Z",
    "download_url": "https://api.crm.saas/v1/exports/job-export-audit-abc123",
    "expires_in": 86400
  }
}

Polling / Download:
GET /v1/exports/job-export-audit-abc123

Response (200):
(Returns CSV file with Content-Type: text/csv)
```

---

## 6️⃣ BILLING & WEBHOOKS ENDPOINTS

### 6.1 Get Billing Invoices

```
GET /v1/billing/invoices

Query Parameters:
  limit=20
  cursor=...
  filter=status:eq:open
  filter=company_id:eq:company-uuid-1
  filter=issue_date:gte:2026-01-01T00:00:00Z
  sort_by=due_date:asc

Response (200):
{
  "success": true,
  "data": [
    {
      "id": "invoice-uuid-1",
      "number": "INV-2026-001",
      "company_id": "company-uuid-1",
      "company_name": "Acme Corp",
      "amount": 25000.00,
      "currency": "BRL",
      "status": "open",
      "issue_date": "2026-02-03",
      "due_date": "2026-03-05",
      "paid_at": null,
      "paid_amount": 0.00,
      "remaining_balance": 25000.00,
      "description": "Monthly subscription - February 2026",
      "items": [
        {
          "description": "CRM Pro Plan - 10 users",
          "quantity": 1,
          "unit_price": 25000.00,
          "total": 25000.00,
          "period_start": "2026-02-01",
          "period_end": "2026-02-28"
        }
      ],
      "created_at": "2026-02-03T00:00:00Z",
      "updated_at": "2026-02-03T14:30:00Z"
    }
  ],
  "pagination": { /* ... */ }
}
```

### 6.2 Get Invoice Details

```
GET /v1/billing/invoices/{id}

Response (200):
{
  "success": true,
  "data": {
    "id": "invoice-uuid-1",
    "number": "INV-2026-001",
    "company_id": "company-uuid-1",
    "company_name": "Acme Corp",
    "billing_address": { /* ... */ },
    "amount": 25000.00,
    "currency": "BRL",
    "status": "open",
    "issue_date": "2026-02-03",
    "due_date": "2026-03-05",
    "notes": "Payment terms: Net 30",
    "items": [
      {
        "description": "CRM Pro Plan",
        "quantity": 1,
        "unit_price": 25000.00,
        "total": 25000.00
      }
    ],
    "payments": [
      {
        "id": "payment-uuid-1",
        "amount": 0.00,
        "paid_at": null,
        "method": "credit_card",
        "reference": "STRIPE-CHG-abc123"
      }
    ],
    "pdf_url": "https://api.crm.saas/v1/billing/invoices/invoice-uuid-1/pdf"
  }
}
```

### 6.3 Get Billing Payments

```
GET /v1/billing/payments

Query Parameters:
  limit=20
  cursor=...
  filter=status:eq:completed
  filter=company_id:eq:company-uuid-1
  sort_by=paid_at:desc

Response (200):
{
  "success": true,
  "data": [
    {
      "id": "payment-uuid-1",
      "invoice_id": "invoice-uuid-1",
      "company_id": "company-uuid-1",
      "company_name": "Acme Corp",
      "amount": 25000.00,
      "currency": "BRL",
      "status": "completed",
      "method": "credit_card",
      "reference": "STRIPE-CHG-abc123",
      "paid_at": "2026-02-15T10:30:00Z",
      "created_at": "2026-02-15T10:30:00Z"
    }
  ],
  "pagination": { /* ... */ }
}
```

### 6.4 Webhook Events (Inbound)

```
POST /v1/billing/webhooks

Headers:
  X-Webhook-Signature: sha256_hmac_signature
  X-Webhook-Timestamp: 1707043200

Request:
{
  "event": "payment.completed",
  "timestamp": "2026-02-03T14:30:00Z",
  "data": {
    "payment_id": "payment-uuid-1",
    "invoice_id": "invoice-uuid-1",
    "company_id": "company-uuid-1",
    "amount": 25000.00,
    "currency": "BRL",
    "method": "credit_card",
    "reference": "STRIPE-CHG-abc123"
  }
}

Response (202 Accepted):
{
  "success": true,
  "data": {
    "webhook_event_id": "wehk_abc123xyz",
    "status": "processing",
    "idempotency_key": "stripe-chg-abc123"
  }
}

Webhook Verification (Signature):
1. Extract X-Webhook-Signature header
2. Reconstruct signed content:
   signed_content = timestamp + "." + body_json
3. Verify HMAC:
   expected_sig = hmac_sha256(WEBHOOK_SECRET, signed_content)
   if (expected_sig != header_signature) return 401
```

### 6.5 Webhook Event Log

```
GET /v1/billing/webhooks/log

Query Parameters:
  limit=20
  cursor=...
  filter=event_type:eq:payment.completed
  filter=status:eq:processed
  sort_by=timestamp:desc

Response (200):
{
  "success": true,
  "data": [
    {
      "id": "wehk_abc123xyz",
      "event_type": "payment.completed",
      "status": "processed",
      "timestamp": "2026-02-03T14:30:00Z",
      "company_id": "company-uuid-1",
      "company_name": "Acme Corp",
      "data": { /* ... */ },
      "retry_count": 0,
      "processed_at": "2026-02-03T14:30:01Z"
    }
  ],
  "pagination": { /* ... */ }
}
```

---

## 📋 ASYNC JOBS & WEBHOOKS

### Job Request Format

```json
{
  "job_type": "export_contacts",
  "parameters": {
    "filter": { /* ... */ },
    "format": "csv"
  },
  "webhook_url": "https://customer.example.com/webhooks/export-completed",
  "idempotency_key": "export-feb-2026-001"
}
```

### Job Response (202 Accepted)

```json
{
  "success": true,
  "data": {
    "job_id": "job-export-contacts-abc123xyz",
    "status": "queued",
    "created_at": "2026-02-03T14:30:00Z",
    "estimated_completion_time": "2026-02-03T14:45:00Z",
    "webhook_url": "https://customer.example.com/webhooks/export-completed"
  }
}
```

### Job Status Polling

```
GET /v1/jobs/{job_id}

Response (200):
{
  "success": true,
  "data": {
    "job_id": "job-export-contacts-abc123xyz",
    "status": "completed",  // queued, processing, completed, failed
    "progress": {
      "total": 1000,
      "processed": 1000,
      "percentage": 100
    },
    "result": {
      "file_url": "https://api.crm.saas/v1/exports/job-export-contacts-abc123xyz/download",
      "file_size_bytes": 2048000,
      "expires_at": "2026-02-04T14:30:00Z",
      "row_count": 1000
    },
    "started_at": "2026-02-03T14:30:05Z",
    "completed_at": "2026-02-03T14:31:15Z"
  }
}
```

### Job Failure Response

```
GET /v1/jobs/{job_id}

Response (200):
{
  "success": true,
  "data": {
    "job_id": "job-export-contacts-abc123xyz",
    "status": "failed",
    "error": {
      "code": "EXPORT_TIMEOUT",
      "message": "Export exceeded 5-minute timeout",
      "timestamp": "2026-02-03T14:35:00Z"
    },
    "retry_information": {
      "can_retry": true,
      "retry_url": "/v1/jobs/{job_id}/retry",
      "retry_limit": 3,
      "retries_used": 1
    }
  }
}
```

### Webhook Callback (On Completion)

```
POST {customer_webhook_url}

Headers:
  X-Webhook-Signature: sha256_hmac
  X-Webhook-Timestamp: 1707043200
  X-Job-ID: job-export-contacts-abc123xyz

Request:
{
  "event": "job.completed",
  "timestamp": "2026-02-03T14:31:15Z",
  "data": {
    "job_id": "job-export-contacts-abc123xyz",
    "job_type": "export_contacts",
    "status": "completed",
    "result": {
      "file_url": "https://api.crm.saas/v1/exports/...",
      "file_size_bytes": 2048000,
      "row_count": 1000
    }
  }
}

Customer Response (must be 2xx to confirm):
{
  "received": true
}
```

### Job Types Supported

```
1. export_contacts
   - Input: filter, columns, format (csv, xlsx, json)
   - Output: File URL
   - Timeout: 5 min
   - Typical time: 30-120 sec

2. export_companies
   - Input: filter, columns, format
   - Output: File URL
   - Timeout: 5 min
   - Typical time: 30-60 sec

3. export_audit_log
   - Input: date_range, columns, format
   - Output: File URL
   - Timeout: 10 min
   - Typical time: 1-5 min

4. bulk_import_contacts
   - Input: file_url, mapping, duplicate_strategy
   - Output: Import summary (created, updated, failed count)
   - Timeout: 30 min
   - Typical time: 1-10 min

5. bulk_update_contacts
   - Input: filter, updates
   - Output: Update summary
   - Timeout: 30 min
   - Typical time: 1-10 min
```

---

## 📤 EXPORT & REPORTING

### 1. Export Contacts (CSV)

```
POST /v1/contacts/export

Request:
{
  "format": "csv",  // csv, xlsx, json
  "filter": {
    "segment": "vip",
    "status": "active"
  },
  "columns": [
    "id",
    "email",
    "first_name",
    "last_name",
    "phone",
    "custom_fields.risk_score"
  ]
}

Response (202 Accepted):
{
  "success": true,
  "data": {
    "job_id": "job-export-contacts-abc123",
    "status": "processing",
    "webhook_url": "https://api.crm.saas/v1/webhooks/jobs/job-export-contacts-abc123"
  }
}
```

### 2. Export Companies (CSV)

```
POST /v1/companies/export

Request:
{
  "format": "csv",
  "columns": [
    "id",
    "name",
    "cnpj",
    "segment",
    "monthly_revenue",
    "custom_fields"
  ]
}

Response (202 Accepted): /* similar to contacts export */
```

### 3. Export Audit Log (Compliance)

```
POST /v1/audit-log/export

Request:
{
  "format": "csv",
  "filter": {
    "created_at": "gte:2026-01-01T00:00:00Z"
  }
}

Response (202 Accepted): /* similar to contacts export */

Note:
- Admin only
- No field masking (full audit trail)
- Includes IP addresses, user agents
```

### File Download

```
GET /v1/exports/{job_id}/download

Response (200):
Content-Type: text/csv; charset=utf-8
Content-Disposition: attachment; filename="contacts-2026-02-03.csv"

id,email,first_name,last_name,phone,risk_score
contact-uuid-1,john@acme.com,John,Doe,+55 11 98765-4321,7
contact-uuid-2,jane@acme.com,Jane,Smith,+55 11 87654-3210,5
...

Note:
- URL expires after 24 hours
- File deleted after expiry
- Download creates audit log entry
```

---

## 📊 SUMMARY

### Total Endpoints

```
Companies & Clients: 12 endpoints
Drawer / Details: 4 endpoints
Employees: 5 endpoints
Account: 3 endpoints
Audit: 2 endpoints
Billing: 5 endpoints
────────────────
Total: 31 endpoints

Methods Distribution:
GET: 18 (read operations)
POST: 9 (create, actions)
PATCH: 3 (update)
DELETE: 1 (soft delete)
```

### Authentication Matrix

| Endpoint | Auth Required | Multi-Tenant Check | RBAC Permission |
|----------|---------------|--------------------|-----------------|
| GET /companies | ✅ JWT | ✅ X-Tenant-ID | ✅ company:read |
| POST /companies | ✅ JWT | ✅ X-Tenant-ID | ✅ company:create |
| PATCH /companies/{id} | ✅ JWT | ✅ X-Tenant-ID | ✅ company:update |
| DELETE /companies/{id} | ✅ JWT | ✅ X-Tenant-ID | ✅ company:delete |
| GET /audit-log | ✅ JWT | ✅ X-Tenant-ID | ✅ audit:read |
| GET /employees | ✅ JWT | ✅ X-Tenant-ID | ✅ employee:read |
| POST /employees | ✅ JWT | ✅ X-Tenant-ID | ✅ employee:create |
| POST /auth/password-reset/request | ❌ None | ❌ Not required | ❌ Not required |

---

## 🚀 IMPLEMENTATION ROADMAP

### Phase 1 (Week 1-2): Core Endpoints
- [x] Auth (login, token refresh, password reset)
- [x] Companies CRUD
- [x] Employees CRUD
- [x] Basic filtering & pagination

### Phase 2 (Week 3-4): Advanced Features
- [x] RBAC enforcement (per endpoint & per field)
- [x] Governance workflow (approval for critical fields)
- [x] Advanced filtering (boolean logic, ranges)
- [x] Cursor-based pagination
- [x] Async jobs (export, bulk update)

### Phase 3 (Week 5-6): Drawer & Details
- [x] Drawer tabs (general, financial, spending, support, audit)
- [x] Activity timeline
- [x] Audit log queries
- [x] Soft delete with recovery

### Phase 4 (Week 7-8): Billing & Webhooks
- [x] Invoice management
- [x] Payment tracking
- [x] Webhook event handling
- [x] Rate limiting & protection

---

**Version:** v1.0  
**Status:** Ready for Development  
**Last Updated:** 2026-02-03

For implementation questions, refer to DATABASE_DESIGN_GUIDE.md and PRACTICAL_EXAMPLES.sql
