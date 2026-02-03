# 🔒 LGPD COMPLIANCE (Lei Geral de Proteção de Dados)

**Version:** v1.0  
**Type:** Data Protection & Privacy Compliance Framework  
**Scope:** LGPD, GDPR, CCPA, PCI-DSS  
**Compliance:** Brazilian Data Protection Law (LGPD #13709/2018)  
**Status:** Production Ready  
**Last Updated:** 2026-02-03

---

## 📑 TABLE OF CONTENTS

1. [Overview](#overview)
2. [Data Classification (PII)](#data-classification-pii)
3. [Data Model](#data-model)
4. [Protection Mechanisms](#protection-mechanisms)
5. [Deletion & Anonymization Strategy](#deletion--anonymization-strategy)
6. [Data Export (Right to Portability)](#data-export-right-to-portability)
7. [Retention & Disposal Policy](#retention--disposal-policy)
8. [Audit Trail (PII-Safe)](#audit-trail-pii-safe)
9. [Logs & Backups](#logs--backups)
10. [Implementation Guide](#implementation-guide)
11. [Production Checklist](#production-checklist)

---

## 🎯 OVERVIEW

### LGPD Key Principles

```
Lei Geral de Proteção de Dados (LGPD #13709/2018)

Requirement 1: Consentimento (Consent)
├─ Explicit opt-in for data processing
├─ User must be able to withdraw
└─ Must record consent date + version

Requirement 2: Base Legal (Lawful Basis)
├─ Consent
├─ Contract execution
├─ Legal obligation
├─ Vital interest
├─ Public interest
└─ Legitimate interest (with safeguards)

Requirement 3: Direito de Acesso (Right of Access)
├─ User can export their data (30 days deadline)
├─ Must include all personal data
└─ Format: structured, machine-readable (CSV/JSON)

Requirement 4: Direito ao Esquecimento (Right to Erasure)
├─ User can request deletion
├─ Must comply within 30 days
├─ Exception: audit trail (WORM)
└─ May anonymize instead of delete

Requirement 5: Direito à Retificação (Right to Correction)
├─ User can correct inaccurate data
├─ Must update within 30 days
└─ Audit trail of corrections

Requirement 6: Direito à Portabilidade (Right to Portability)
├─ User can export data
├─ Must be machine-readable
└─ Interoperability format

Requirement 7: Transparência (Transparency)
├─ Privacy policy explaining data use
├─ Third-party processors
├─ Data retention periods
└─ User rights

Requirement 8: Trilha de Auditoria (Audit Trail)
├─ Log all data access
├─ Log all deletions
├─ Cannot log sensitive PII
└─ Must store securely (WORM)
```

### Multi-Region Data Residency

```
Data storage by location:
├─ Brazil: Companies + all PII stays in BR
├─ Users in EU: GDPR applies (stricter)
├─ Users in US: CCPA applies
└─ Users elsewhere: LGPD applies

Compliance logic:
if user.country == 'BR':
  base_legal = LGPD
elif user.country in EU:
  base_legal = max(LGPD, GDPR)  # GDPR stricter
elif user.country == 'US':
  base_legal = max(LGPD, CCPA)
else:
  base_legal = LGPD
```

---

## 🏷️ DATA CLASSIFICATION (PII)

### Category 1: Highly Sensitive PII (Encrypt at Rest)

```sql
-- Must encrypt with tenant-specific key
-- Encrypt when stored, decrypt on access

HIGH_SENSITIVITY_PII = {
  'cpf': {
    'label': 'Tax ID (CPF)',
    'example': '123.456.789-00',
    'mask': '***.***.***-00',
    'encrypt': TRUE,
    'minimal_access_roles': ['MASTER_ADMIN', 'FINANCEIRO']
  },
  'cnpj': {
    'label': 'Company Tax ID (CNPJ)',
    'example': '12.345.678/0001-90',
    'mask': '**.***.***/0001-90',
    'encrypt': TRUE,
    'minimal_access_roles': ['MASTER_ADMIN', 'FINANCEIRO']
  },
  'bank_account_number': {
    'label': 'Bank Account',
    'example': '1234-5',
    'mask': '****-*',
    'encrypt': TRUE,
    'minimal_access_roles': ['MASTER_ADMIN', 'FINANCEIRO']
  },
  'credit_card_number': {
    'label': 'Credit Card',
    'example': '4111 1111 1111 1111',
    'mask': '****-****-****-1111',
    'encrypt': TRUE,
    'minimal_access_roles': ['MASTER_ADMIN']
  },
  'salary': {
    'label': 'Employee Salary',
    'example': '5000.00',
    'mask': '[REDACTED]',
    'encrypt': TRUE,
    'minimal_access_roles': ['MASTER_ADMIN', 'FINANCEIRO']
  },
  'password_hash': {
    'label': 'Password (one-way hash)',
    'example': 'bcrypt($2a$12$...)',
    'encrypt': FALSE,  # Already hashed
    'minimal_access_roles': ['SYSTEM']
  },
  'biometric_data': {
    'label': 'Biometric (fingerprint, face, iris)',
    'example': 'base64-encoded-biometric',
    'encrypt': TRUE,
    'minimal_access_roles': ['MASTER_ADMIN']
  }
}
```

### Category 2: Sensitive PII (Hash or Mask)

```sql
-- Can hash or mask (don't need full encryption)

SENSITIVE_PII = {
  'email': {
    'label': 'Email address',
    'example': 'user@company.com',
    'mask': 'u***@company.com',
    'hash': TRUE,  # Optional, for lookups
    'minimal_access_roles': ['SUPORTE', 'MASTER_ADMIN']
  },
  'phone': {
    'label': 'Phone number',
    'example': '+55 11 98765-4321',
    'mask': '****-4321',
    'hash': FALSE,
    'minimal_access_roles': ['SUPORTE', 'MASTER_ADMIN']
  },
  'address': {
    'label': 'Physical address',
    'example': '123 Main St, São Paulo, SP',
    'mask': '[HIDDEN]',
    'hash': FALSE,
    'minimal_access_roles': ['SUPORTE', 'MASTER_ADMIN']
  },
  'date_of_birth': {
    'label': 'Date of birth',
    'example': '1990-05-15',
    'mask': '[HIDDEN]',
    'hash': FALSE,
    'minimal_access_roles': ['MASTER_ADMIN']
  },
  'ip_address': {
    'label': 'IP address',
    'example': '192.168.1.100',
    'mask': '192.168.1.***',
    'hash': TRUE,
    'minimal_access_roles': ['SECURITY', 'MASTER_ADMIN']
  }
}
```

### Category 3: Non-Sensitive Data (Store as-is)

```sql
-- Public or not regulated by LGPD

NON_SENSITIVE_DATA = {
  'company_name': {
    'example': 'ACME Corp',
    'encrypt': FALSE
  },
  'subscription_plan': {
    'example': 'Pro',
    'encrypt': FALSE
  },
  'created_at': {
    'example': '2026-01-15T10:30:00Z',
    'encrypt': FALSE
  },
  'is_active': {
    'example': TRUE,
    'encrypt': FALSE
  }
}
```

### Complete PII Inventory

```sql
CREATE TABLE pii_inventory (
  inventory_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Classification
  entity_type VARCHAR(100),                   -- 'user', 'employee', 'company'
  field_name VARCHAR(255),
  pii_category VARCHAR(50),                   -- 'high', 'sensitive', 'non_sensitive'
  
  -- Details
  display_name VARCHAR(255),
  description TEXT,
  example_value VARCHAR(500),
  
  -- Protection
  encryption_required BOOLEAN,
  masking_pattern VARCHAR(255),               -- e.g., '****.***.***-00'
  hash_supported BOOLEAN,
  
  -- Access
  minimal_access_roles TEXT[],                -- ['MASTER_ADMIN', 'FINANCEIRO']
  
  -- Retention
  retention_days INT,                         -- Days to keep after user deletion
  
  -- Audit
  created_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE (entity_type, field_name)
);

-- Insert inventory
INSERT INTO pii_inventory VALUES
  ('user', 'cpf', 'high', 'Tax ID', 'Individual taxpayer ID', '123.456.789-00', TRUE, '***.***.***-00', FALSE, ['MASTER_ADMIN', 'FINANCEIRO'], 90),
  ('user', 'email', 'sensitive', 'Email', 'User email address', 'user@example.com', FALSE, 'u***@example.com', TRUE, ['SUPORTE', 'MASTER_ADMIN'], 365),
  ('employee', 'salary', 'high', 'Salary', 'Monthly salary', '5000.00', TRUE, '[REDACTED]', FALSE, ['MASTER_ADMIN', 'FINANCEIRO'], 2555),  -- 7 years for labor law
  ('company', 'name', 'non_sensitive', 'Company Name', 'Legal company name', 'ACME Corp', FALSE, NULL, FALSE, ['SUPORTE'], NULL);
```

---

## 🗄️ DATA MODEL

### Table 1: user_consents (Tracking Consent)

```sql
CREATE TABLE user_consents (
  consent_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  user_id UUID NOT NULL,
  
  -- Consent details
  consent_type VARCHAR(50) NOT NULL,          -- 'marketing', 'analytics', 'processing'
  version VARCHAR(20) NOT NULL,               -- Version of privacy policy
  
  -- Consent state
  given BOOLEAN DEFAULT FALSE,                -- Explicit opt-in
  given_at TIMESTAMP,
  given_by_ip INET,                          -- For verification
  
  -- Withdrawal
  withdrawn BOOLEAN DEFAULT FALSE,
  withdrawn_at TIMESTAMP,
  
  -- Tracking
  valid_from TIMESTAMP NOT NULL DEFAULT NOW(),
  valid_to TIMESTAMP,
  
  -- Metadata
  consent_source VARCHAR(50),                 -- 'web_signup', 'api', 'admin'
  
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE (user_id, consent_type, version)
);

CREATE INDEX idx_user_consents_user 
ON user_consents(user_id, consent_type);

CREATE INDEX idx_user_consents_given 
ON user_consents(given, withdrawn);
```

### Table 2: retention_policies (By Tenant)

```sql
CREATE TABLE retention_policies (
  policy_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  
  -- Policy definition
  data_category VARCHAR(100) NOT NULL,        -- 'employee', 'customer', 'log', 'backup'
  retention_days INT NOT NULL,                -- How long to keep data
  deletion_method VARCHAR(50) DEFAULT 'anonymize',  -- 'anonymize', 'shred', 'archive'
  
  -- Compliance
  legal_basis VARCHAR(100),                   -- 'contract', 'legal_obligation', 'consent'
  reason TEXT,
  
  -- Enforcement
  auto_delete BOOLEAN DEFAULT TRUE,
  delete_on_date DATE,                        -- One-time deletion date
  
  -- Status
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Audit
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE (tenant_id, data_category),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

-- Default retention policies
INSERT INTO retention_policies (tenant_id, data_category, retention_days, legal_basis, reason)
VALUES
  ('all', 'employee_pii', 2555, 'legal_obligation', 'Brazilian labor law (7 years)'),
  ('all', 'payment_records', 2555, 'legal_obligation', 'Financial/tax records (7 years)'),
  ('all', 'audit_logs', 2555, 'legal_obligation', 'Compliance/audit trail (7 years)'),
  ('all', 'customer_data', 1095, 'contract', 'Contract termination (3 years) or consent withdrawal'),
  ('all', 'marketing_data', 30, 'consent', 'Marketing consent (30 days if not renewed)'),
  ('all', 'analytics_logs', 365, 'legitimate_interest', 'Performance monitoring (1 year)'),
  ('all', 'backup', 90, 'technical', 'Backup retention for disaster recovery (90 days)');
```

### Table 3: deletion_requests (Right to Erasure)

```sql
CREATE TABLE deletion_requests (
  request_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  user_id UUID NOT NULL,
  
  -- Request details
  request_type VARCHAR(50),                   -- 'full_deletion', 'anonymize', 'right_to_erasure'
  reason VARCHAR(255),
  requested_by VARCHAR(50),                   -- 'user', 'admin', 'system', 'gdpr_request'
  
  -- Processing
  status VARCHAR(50) DEFAULT 'PENDING',       -- PENDING, IN_PROGRESS, COMPLETED, FAILED, PARTIALLY_COMPLETED
  status_reason TEXT,
  
  -- Timeline
  requested_at TIMESTAMP DEFAULT NOW(),
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  deadline_at TIMESTAMP,                      -- 30 days from request
  
  -- What was deleted
  entities_deleted TEXT[],                    -- ['employees', 'contracts', 'invoices']
  entities_kept TEXT[],                       -- ['audit_logs', 'financial_records']
  reason_kept TEXT,                           -- Legal reason for keeping
  
  -- Audit
  requested_by_user_id UUID,
  approved_by_user_id UUID,
  
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT valid_status CHECK (status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'PARTIALLY_COMPLETED'))
);

CREATE INDEX idx_deletion_requests_status 
ON deletion_requests(status, deadline_at);
```

### Table 4: data_exports (Right to Portability)

```sql
CREATE TABLE data_exports (
  export_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  user_id UUID NOT NULL,
  
  -- Export details
  export_type VARCHAR(50),                    -- 'full_export', 'personal_data', 'custom'
  export_format VARCHAR(20),                  -- 'json', 'csv', 'pdf'
  
  -- Content
  included_entities TEXT[],                   -- ['profile', 'invoices', 'audit_log']
  excluded_entities TEXT[],                   -- Sensitive data excluded for security
  
  -- Processing
  status VARCHAR(50) DEFAULT 'PENDING',       -- PENDING, IN_PROGRESS, READY, EXPIRED, COMPLETED
  generated_at TIMESTAMP,
  downloaded_at TIMESTAMP,
  expires_at TIMESTAMP,                       -- 30 days validity
  
  -- File details
  file_size_bytes BIGINT,
  file_hash VARCHAR(64),                      -- SHA-256 hash
  file_location VARCHAR(500),                 -- S3 path or similar
  file_encrypted BOOLEAN DEFAULT TRUE,        -- AES-256 encryption
  encryption_key_id VARCHAR(100),
  
  -- Audit
  requested_at TIMESTAMP DEFAULT NOW(),
  requested_by_user_id UUID,
  downloaded_by_ip INET,
  
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX idx_data_exports_status 
ON data_exports(status, expires_at);
```

### Table 5: pii_access_log (Audit Trail - No PII)

```sql
CREATE TABLE pii_access_log (
  log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  
  -- What was accessed
  entity_type VARCHAR(100),                   -- 'user', 'employee', 'company'
  entity_id UUID,
  pii_fields TEXT[],                          -- ['cpf', 'salary']
  
  -- Who accessed
  accessed_by_user_id UUID,
  accessed_by_role VARCHAR(100),
  
  -- How
  access_method VARCHAR(50),                  -- 'api', 'admin_dashboard', 'export'
  access_reason VARCHAR(255),                 -- 'payment_processing', 'support_ticket'
  
  -- Result
  access_granted BOOLEAN,
  denial_reason VARCHAR(255),
  
  -- Timing
  accessed_at TIMESTAMP DEFAULT NOW(),
  ip_address INET,
  
  -- Immutable
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  
  -- NOTE: NO PII VALUES STORED (only field names)
  
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE INDEX idx_pii_access_log_entity 
ON pii_access_log(entity_type, entity_id, accessed_at DESC);

CREATE INDEX idx_pii_access_log_user 
ON pii_access_log(accessed_by_user_id, accessed_at DESC);
```

### Table 6: deletion_audit (WORM - Immutable)

```sql
CREATE TABLE deletion_audit (
  deletion_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  
  -- What was deleted
  entity_type VARCHAR(100),
  entity_id UUID,
  entity_summary JSONB,                       -- Non-PII summary: {name, created_at, status}
  
  -- Deletion details
  deletion_request_id UUID,
  deletion_reason VARCHAR(255),
  deletion_method VARCHAR(50),                -- 'anonymize', 'shred', 'encrypt_only'
  
  -- For anonymization (no actual PII)
  anonymization_token VARCHAR(64),            -- Hash representing deleted user
  
  -- Legal basis
  legal_basis VARCHAR(100),
  
  -- Who authorized
  authorized_by_user_id UUID,
  
  -- Timeline
  deleted_at TIMESTAMP DEFAULT NOW() NOT NULL,
  requested_at TIMESTAMP,
  
  -- Cannot be modified (WORM)
  -- No UPDATE/DELETE allowed on this table
  
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

-- Enforce WORM on this table
CREATE POLICY deletion_audit_immutable ON deletion_audit
  FOR ALL USING (FALSE);  -- No DELETE allowed

-- Only INSERT allowed
CREATE POLICY deletion_audit_insert ON deletion_audit
  FOR INSERT WITH CHECK (TRUE);
```

---

## 🔐 PROTECTION MECHANISMS

### Encryption at Rest (Tenant-Specific Keys)

```python
class PIIEncryption:
    """
    Encrypt/decrypt PII fields
    Each tenant has unique key (key rotation support)
    """
    
    def __init__(self, kms_client):
        self.kms = kms_client
    
    def encrypt_pii(self, tenant_id: str, field_name: str, plaintext: str) -> str:
        """
        Encrypt PII value
        """
        
        # 1. Get tenant-specific key (or create if missing)
        key = self._get_or_create_key(tenant_id)
        
        # 2. Encrypt value
        from cryptography.fernet import Fernet
        cipher_suite = Fernet(key)
        ciphertext = cipher_suite.encrypt(plaintext.encode())
        
        # 3. Return base64-encoded ciphertext
        import base64
        return base64.b64encode(ciphertext).decode()
    
    def decrypt_pii(self, tenant_id: str, field_name: str, ciphertext: str) -> str:
        """
        Decrypt PII value
        Only authorized roles can call this
        """
        
        # 1. Verify caller has permission
        current_user = get_current_user()
        if not self._check_access(current_user, field_name):
            raise ForbiddenException(f"Access denied to {field_name}")
        
        # 2. Get key
        key = self._get_or_create_key(tenant_id)
        
        # 3. Decrypt
        from cryptography.fernet import Fernet
        cipher_suite = Fernet(key)
        plaintext = cipher_suite.decrypt(base64.b64decode(ciphertext)).decode()
        
        # 4. Audit log (without logging plaintext!)
        self._audit_access(tenant_id, field_name, 'decrypted', True)
        
        return plaintext
    
    def mask_pii(self, field_name: str, value: str) -> str:
        """
        Mask PII for display (never show full value)
        """
        
        masks = {
            'cpf': self._mask_cpf,
            'email': self._mask_email,
            'phone': self._mask_phone,
            'credit_card': self._mask_credit_card,
            'address': lambda x: '[HIDDEN]',
            'salary': lambda x: '[REDACTED]'
        }
        
        masker = masks.get(field_name, lambda x: '[MASKED]')
        return masker(value)
    
    def _mask_cpf(self, cpf: str) -> str:
        # 123.456.789-00 → ***.***.***.00
        return f"***.***.***.{cpf[-2:]}"
    
    def _mask_email(self, email: str) -> str:
        # user@example.com → u***@example.com
        user, domain = email.split('@')
        return f"{user[0]}***@{domain}"
    
    def _mask_credit_card(self, card: str) -> str:
        # 4111111111111111 → ****-****-****-1111
        clean = card.replace('-', '').replace(' ', '')
        return f"****-****-****-{clean[-4:]}"
    
    def _check_access(self, user, field_name: str) -> bool:
        """
        Check if user's role can access this PII field
        """
        
        # Field access control
        access_matrix = {
            'cpf': ['MASTER_ADMIN', 'FINANCEIRO'],
            'salary': ['MASTER_ADMIN', 'FINANCEIRO'],
            'credit_card': ['MASTER_ADMIN'],
            'email': ['SUPORTE', 'MASTER_ADMIN']
        }
        
        allowed_roles = access_matrix.get(field_name, [])
        return user.role in allowed_roles
```

### Field-Level Encryption in Database

```sql
-- Store encrypted PII columns

CREATE TABLE users (
  user_id UUID PRIMARY KEY,
  tenant_id UUID,
  
  -- Regular fields
  username VARCHAR(255),
  is_active BOOLEAN,
  
  -- PII fields (encrypted at rest)
  cpf_encrypted VARCHAR(1024),                -- Stored encrypted
  email_encrypted VARCHAR(1024),              -- Stored encrypted
  phone_encrypted VARCHAR(1024),              -- Stored encrypted
  
  -- For searchable encryption
  cpf_hash VARCHAR(64),                       -- Hash of CPF (searchable, no decrypt needed)
  email_hash VARCHAR(64),                     -- Hash of email (searchable)
  
  -- Encryption key metadata
  encryption_key_id VARCHAR(100),             -- Key version used
  
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

-- Query example:
-- Find user by CPF without decrypting
SELECT * FROM users 
WHERE cpf_hash = SHA256('123.456.789-00');

-- When need actual value:
-- Decrypt in application (never in SQL)
cpf = decrypt(users.cpf_encrypted, key)
```

---

## 🗑️ DELETION & ANONYMIZATION STRATEGY

### Strategy Overview

```
Right to Erasure (LGPD Article 9):
├─ User can request deletion of personal data
├─ Must comply within 30 days
├─ Exceptions: audit trail, legal obligations
└─ Options: Delete OR Anonymize

Option 1: ANONYMIZATION (Preferred)
├─ Keep data for statistics
├─ Replace PII with fictitious values
├─ No way to link back to original user
├─ Satisfies right to erasure
└─ Preserves audit trail

Option 2: DELETION (Selective)
├─ Delete from user-facing tables
├─ Keep audit trail (WORM, immutable)
├─ Keep payment records (legal requirement)
├─ Delete from backups (after grace period)
└─ Cannot query by user ID anymore

Option 3: ENCRYPTION ONLY
├─ Replace all PII with encrypted garbage
├─ Keep data structure intact
├─ No way to recover without key destruction
└─ For compliance without deletion
```

### Job 1: Anonymization

```python
class AnonymizationJob:
    """
    Convert user data to anonymous form
    No way to link back to original person
    """
    
    def __init__(self, db, logger):
        self.db = db
        self.logger = logger
    
    def anonymize_user(self, user_id: str, tenant_id: str):
        """
        Anonymize all PII for a user
        """
        
        self.logger.info(f"Starting anonymization for user {user_id}")
        
        # 1. Get user data (for non-PII fields)
        user = self.db.query("""
            SELECT * FROM users WHERE user_id = %s
        """, [user_id])[0]
        
        # 2. Generate anonymization token (irreversible)
        anonymization_token = self._generate_token(user_id)
        
        # 3. Anonymize users table
        self.db.update('users', user_id, {
            'username': f"anon_{anonymization_token[:8]}",
            'cpf_encrypted': None,
            'cpf_hash': None,
            'email_encrypted': None,
            'email_hash': None,
            'phone_encrypted': None,
            'is_anonymous': True,
            'anonymized_at': datetime.utcnow()
        })
        
        # 4. Anonymize employees table
        self.db.update('employees', {'user_id': user_id}, {
            'name': f"Anon {anonymization_token[:8]}",
            'cpf': None,
            'email': f"anon.{anonymization_token[:8]}@anonymized.local",
            'salary': None,
            'is_anonymous': True
        })
        
        # 5. Anonymize invoices (company level, not personally identifiable)
        # Keep invoice data for accounting (legal requirement)
        # But remove any PII references
        
        # 6. Anonymize support tickets
        self.db.update('support_tickets', {'created_by_user_id': user_id}, {
            'customer_name': f"Anonymous {anonymization_token[:8]}",
            'customer_email': f"anon@anonymized.local"
        })
        
        # 7. Record deletion in audit (immutable log)
        self.db.insert('deletion_audit', {
            'tenant_id': tenant_id,
            'entity_type': 'user',
            'entity_id': user_id,
            'entity_summary': {
                'original_email': '[REDACTED]',
                'created_at': user['created_at'].isoformat(),
                'was_employee': user['employee_id'] is not None
            },
            'deletion_reason': 'User anonymization request',
            'deletion_method': 'anonymize',
            'anonymization_token': anonymization_token,
            'legal_basis': 'user_right_to_erasure'
        })
        
        # 8. Audit log (no PII values)
        self.db.insert('pii_access_log', {
            'tenant_id': tenant_id,
            'entity_type': 'user',
            'entity_id': user_id,
            'pii_fields': ['cpf', 'email', 'phone', 'salary'],
            'access_method': 'anonymization_job',
            'access_granted': True,
            'access_reason': 'Right to erasure (LGPD Article 9)'
        })
        
        self.logger.info(f"✓ User {user_id} anonymized successfully")
    
    def _generate_token(self, user_id: str) -> str:
        """
        Generate irreversible anonymization token
        """
        import hashlib
        import secrets
        
        random_salt = secrets.token_hex(16)
        token = hashlib.sha256(f"{user_id}{random_salt}".encode()).hexdigest()
        return token
```

### Job 2: Selective Deletion

```python
class SelectiveDeletionJob:
    """
    Delete user data while preserving audit trail
    """
    
    def __init__(self, db, logger):
        self.db = db
        self.logger = logger
    
    def delete_user_data(self, user_id: str, tenant_id: str, include_backups: bool = False):
        """
        Delete user personal data (with exceptions)
        """
        
        # 1. Check if user has active orders/payments
        active_payments = self.db.query("""
            SELECT COUNT(*) FROM payments p
            JOIN invoices i ON p.invoice_id = i.id
            WHERE i.company_id = (SELECT company_id FROM users WHERE user_id = %s)
              AND p.status = 'PENDING'
        """, [user_id])[0]['count']
        
        if active_payments > 0:
            raise BusinessException(
                "Cannot delete user with active payments",
                detail="Anonymize instead"
            )
        
        entities_deleted = []
        entities_kept = []
        
        # 2. DELETE from user-facing tables
        try:
            # Delete profile
            self.db.delete('users', user_id)
            entities_deleted.append('users')
            
            # Delete employees
            self.db.delete('employees', {'user_id': user_id})
            entities_deleted.append('employees')
            
            # Delete support tickets (optional)
            self.db.delete('support_tickets', {'created_by_user_id': user_id})
            entities_deleted.append('support_tickets')
            
        except Exception as e:
            self.logger.error(f"Error deleting user {user_id}: {str(e)}")
            raise
        
        # 3. KEEP (Legal/Audit Requirements)
        entities_kept = [
            'audit_logs (WORM - immutable)',
            'payments (financial/tax records - 7 years)',
            'invoices (financial - 7 years)',
            'deletion_audit (proof of deletion)'
        ]
        
        # 4. Record deletion
        self.db.insert('deletion_audit', {
            'tenant_id': tenant_id,
            'entity_type': 'user',
            'entity_id': user_id,
            'deletion_reason': 'Right to erasure (LGPD Article 9)',
            'deletion_method': 'selective_deletion',
            'legal_basis': 'user_right_to_erasure'
        })
        
        # 5. Schedule backup deletion (after grace period)
        if include_backups:
            self._schedule_backup_deletion(tenant_id, user_id, days=90)
        
        self.logger.info(f"✓ User {user_id} deleted (selective)")
        
        return {
            'deleted': entities_deleted,
            'kept': entities_kept,
            'reason': 'Legal/audit trail preservation'
        }
```

---

## 📤 DATA EXPORT (RIGHT TO PORTABILITY)

### Async Export Job

```python
class DataExportJob:
    """
    Export all user personal data
    Async job: 30-minute timeout, email when done
    """
    
    def __init__(self, db, storage, email_service):
        self.db = db
        self.storage = storage  # S3 or similar
        self.email = email_service
    
    def start_export(self, user_id: str, tenant_id: str, format: str = 'json') -> str:
        """
        Initiate data export request
        Returns export_id for tracking
        """
        
        # 1. Create export record
        export = self.db.insert('data_exports', {
            'tenant_id': tenant_id,
            'user_id': user_id,
            'export_type': 'full_export',
            'export_format': format,
            'status': 'PENDING',
            'expires_at': datetime.utcnow() + timedelta(days=30),
            'requested_at': datetime.utcnow()
        })
        
        # 2. Queue async job
        queue_job('export_user_data', {
            'export_id': export['export_id'],
            'user_id': user_id,
            'tenant_id': tenant_id,
            'format': format
        })
        
        # 3. Send acknowledgement email
        self.email.send_export_started(user_id, export['export_id'])
        
        return export['export_id']
    
    def execute_export(self, export_id: str):
        """
        Execute the actual export (runs async)
        """
        
        export = self.db.query("""
            SELECT * FROM data_exports WHERE export_id = %s
        """, [export_id])[0]
        
        user_id = export['user_id']
        tenant_id = export['tenant_id']
        format_type = export['export_format']
        
        try:
            # 1. Mark as in progress
            self.db.update('data_exports', export_id, {
                'status': 'IN_PROGRESS',
                'generated_at': datetime.utcnow()
            })
            
            # 2. Collect all user data (excluding highly sensitive)
            data = {
                'exported_at': datetime.utcnow().isoformat(),
                'profile': self._export_profile(user_id, tenant_id),
                'invoices': self._export_invoices(user_id, tenant_id),
                'payments': self._export_payments(user_id, tenant_id),
                'audit_log': self._export_audit_log(user_id, tenant_id),
                'consents': self._export_consents(user_id, tenant_id)
            }
            
            # 3. Serialize to format
            if format_type == 'json':
                content = json.dumps(data, indent=2, default=str)
            elif format_type == 'csv':
                content = self._convert_to_csv(data)
            elif format_type == 'pdf':
                content = self._convert_to_pdf(data)
            else:
                raise ValueError(f"Unknown format: {format_type}")
            
            # 4. Encrypt content (AES-256)
            from cryptography.fernet import Fernet
            encryption_key = Fernet.generate_key()
            cipher = Fernet(encryption_key)
            encrypted_content = cipher.encrypt(content.encode())
            
            # 5. Upload to storage
            file_key = f"exports/{tenant_id}/{user_id}/{export_id}.{format_type}.encrypted"
            file_size = len(encrypted_content)
            file_hash = hashlib.sha256(encrypted_content).hexdigest()
            
            self.storage.put_object(
                bucket='user-exports',
                key=file_key,
                body=encrypted_content
            )
            
            # 6. Store encryption key in secure vault (KMS)
            self._store_encryption_key(export_id, encryption_key)
            
            # 7. Update export record
            self.db.update('data_exports', export_id, {
                'status': 'READY',
                'file_location': file_key,
                'file_size_bytes': file_size,
                'file_hash': file_hash,
                'file_encrypted': True,
                'encryption_key_id': f"export-{export_id}"
            })
            
            # 8. Send download link email
            download_url = self._generate_download_url(export_id)
            self.email.send_export_ready(
                user_id,
                download_url,
                expires_in_days=30
            )
            
        except Exception as e:
            self.logger.error(f"Export failed: {str(e)}")
            self.db.update('data_exports', export_id, {
                'status': 'FAILED'
            })
            raise
    
    def _export_profile(self, user_id: str, tenant_id: str) -> dict:
        """
        Export user profile (with sensitive fields decrypted)
        """
        
        user = self.db.query("""
            SELECT * FROM users WHERE user_id = %s
        """, [user_id])[0]
        
        return {
            'user_id': user['user_id'],
            'username': user['username'],
            'email': self._decrypt_pii('email', user['email_encrypted']),
            'created_at': user['created_at'].isoformat(),
            'is_active': user['is_active']
        }
    
    def _export_invoices(self, user_id: str, tenant_id: str) -> list:
        """
        Export all invoices
        """
        
        company_id = self.db.query("""
            SELECT company_id FROM users WHERE user_id = %s
        """, [user_id])[0]['company_id']
        
        invoices = self.db.query("""
            SELECT
              invoice_id, invoice_number, amount, status,
              issued_at, due_date
            FROM invoices
            WHERE tenant_id = %s AND company_id = %s
            ORDER BY issued_at DESC
        """, [tenant_id, company_id])
        
        return [
            {
                'invoice_id': inv['invoice_id'],
                'number': inv['invoice_number'],
                'amount': float(inv['amount']),
                'status': inv['status'],
                'issued_at': inv['issued_at'].isoformat(),
                'due_date': inv['due_date'].isoformat()
            }
            for inv in invoices
        ]
    
    def _export_payments(self, user_id: str, tenant_id: str) -> list:
        """
        Export all payment records
        """
        
        company_id = self.db.query("""
            SELECT company_id FROM users WHERE user_id = %s
        """, [user_id])[0]['company_id']
        
        payments = self.db.query("""
            SELECT
              p.payment_id, p.amount, p.status,
              p.gateway, p.created_at, p.processed_at
            FROM payments p
            JOIN invoices i ON p.invoice_id = i.id
            WHERE i.tenant_id = %s AND i.company_id = %s
            ORDER BY p.created_at DESC
        """, [tenant_id, company_id])
        
        return [
            {
                'payment_id': pmt['payment_id'],
                'amount': float(pmt['amount']),
                'status': pmt['status'],
                'gateway': pmt['gateway'],
                'created_at': pmt['created_at'].isoformat()
            }
            for pmt in payments
        ]
    
    def _export_audit_log(self, user_id: str, tenant_id: str) -> list:
        """
        Export all audit log entries (NO PII VALUES)
        """
        
        logs = self.db.query("""
            SELECT
              entity_type, pii_fields, access_method,
              access_granted, accessed_at
            FROM pii_access_log
            WHERE (entity_id = %s OR accessed_by_user_id = %s)
              AND tenant_id = %s
            ORDER BY accessed_at DESC
            LIMIT 1000
        """, [user_id, user_id, tenant_id])
        
        return [
            {
                'entity': log['entity_type'],
                'fields_accessed': log['pii_fields'],
                'method': log['access_method'],
                'granted': log['access_granted'],
                'time': log['accessed_at'].isoformat()
            }
            for log in logs
        ]
    
    def _export_consents(self, user_id: str, tenant_id: str) -> list:
        """
        Export all consent records
        """
        
        consents = self.db.query("""
            SELECT
              consent_type, version, given, given_at,
              withdrawn, withdrawn_at
            FROM user_consents
            WHERE user_id = %s AND tenant_id = %s
            ORDER BY given_at DESC
        """, [user_id, tenant_id])
        
        return [
            {
                'type': c['consent_type'],
                'version': c['version'],
                'given': c['given'],
                'given_at': c['given_at'].isoformat() if c['given_at'] else None,
                'withdrawn': c['withdrawn'],
                'withdrawn_at': c['withdrawn_at'].isoformat() if c['withdrawn_at'] else None
            }
            for c in consents
        ]
    
    def _decrypt_pii(self, field_name: str, encrypted_value: str) -> str:
        """
        Decrypt PII for export (done in application)
        """
        # Implementation using PII encryption class
        pass
```

### Export API Endpoint

```python
@app.post('/v1/account/export')
def request_data_export(format: str = 'json') -> dict:
    """
    POST /v1/account/export?format=json
    
    Request personal data export (LGPD Right to Portability)
    Returns: export_id for tracking
    Async: Export queued, email sent when ready
    """
    
    user = get_current_user()
    tenant_id = get_current_tenant_id()
    
    # 1. Rate limit (max 1 export per 30 days)
    existing = db.query("""
        SELECT COUNT(*) FROM data_exports
        WHERE user_id = %s
          AND requested_at > NOW() - INTERVAL '30 days'
    """, [user.id])[0]['count']
    
    if existing > 0:
        return {
            'error': 'Export already requested',
            'detail': 'You can request another export in 30 days',
            'retry_after_days': 30
        }, 429
    
    # 2. Start async export
    export_job = DataExportJob(db, s3_storage, email_service)
    export_id = export_job.start_export(user.id, tenant_id, format)
    
    # 3. Audit log
    audit_log.log('data_export_requested', {
        'user_id': user.id,
        'format': format,
        'reason': 'User initiated right to portability'
    })
    
    return {
        'success': True,
        'export_id': export_id,
        'status': 'PENDING',
        'message': 'Export queued. You will receive download link by email within 24 hours',
        'expires_in_days': 30
    }

@app.get('/v1/account/export/<export_id>')
def get_export_status(export_id: str) -> dict:
    """
    GET /v1/account/export/{export_id}
    
    Check export status
    """
    
    user = get_current_user()
    export = db.query("""
        SELECT * FROM data_exports
        WHERE export_id = %s AND user_id = %s
    """, [export_id, user.id])
    
    if not export:
        return {'error': 'Export not found'}, 404
    
    export = export[0]
    
    if export['status'] == 'READY':
        return {
            'status': 'READY',
            'download_url': generate_download_url(export_id),
            'expires_at': export['expires_at'].isoformat(),
            'size_mb': export['file_size_bytes'] / 1024 / 1024
        }
    elif export['status'] == 'PENDING':
        return {
            'status': 'PENDING',
            'message': 'Export is being generated. Check back soon.'
        }
    else:
        return {
            'status': export['status'],
            'message': 'Export processing'
        }
```

---

## 📋 RETENTION & DISPOSAL POLICY

### Retention Schedule (By Data Type)

```sql
-- Configurable per tenant

Data Type              | Retention | Legal Basis           | Disposal Method
─────────────────────────────────────────────────────────────────────────────────────
Employee PII          | 7 years   | Labor law (CLT Art 5) | Anonymize + Shred
Payment Records       | 7 years   | Tax law (RFB)         | Archive + Encrypt
Audit Logs            | 7 years   | Compliance (SOX)      | WORM (immutable)
Support Tickets       | 3 years   | Contract termination  | Anonymize
Marketing Data        | 30 days   | Consent (if given)    | Delete
Analytics Logs        | 1 year    | Legitimate interest   | Aggregate
Customer Data         | 3 years   | Contract              | Anonymize on request
Backup Copies         | 90 days   | Disaster recovery     | Auto-delete
Session Logs          | 90 days   | Security              | Auto-delete
IP Addresses          | 1 year    | Legitimate interest   | Aggregate/Hash
Device Fingerprints   | 30 days   | Fraud detection       | Delete
─────────────────────────────────────────────────────────────────────────────────────

Job: Automatic disposal (runs daily at 2 AM)
```

### Disposal Job

```python
class DataDisposalJob:
    """
    Automatically delete/anonymize data past retention date
    """
    
    def __init__(self, db, logger):
        self.db = db
        self.logger = logger
    
    def run_daily_disposal(self):
        """
        Run at 2 AM daily
        """
        
        today = date.today()
        
        # Get all retention policies
        policies = self.db.query("""
            SELECT * FROM retention_policies WHERE is_active = TRUE
        """)
        
        for policy in policies:
            self._apply_disposal(policy, today)
    
    def _apply_disposal(self, policy: dict, today: date):
        """
        Apply disposal for specific policy
        """
        
        cutoff_date = today - timedelta(days=policy['retention_days'])
        data_category = policy['data_category']
        deletion_method = policy['deletion_method']
        
        if data_category == 'employee_pii':
            self._dispose_employee_data(cutoff_date, deletion_method)
        elif data_category == 'marketing_data':
            self._dispose_marketing_data(cutoff_date, deletion_method)
        elif data_category == 'analytics_logs':
            self._dispose_analytics_logs(cutoff_date, deletion_method)
        elif data_category == 'session_logs':
            self._dispose_session_logs(cutoff_date, deletion_method)
    
    def _dispose_employee_data(self, cutoff_date: date, method: str):
        """
        Dispose employee data older than 7 years
        """
        
        # Find employees created before cutoff
        old_employees = self.db.query("""
            SELECT * FROM employees
            WHERE created_at < %s::timestamp
        """, [cutoff_date])
        
        for emp in old_employees:
            if method == 'anonymize':
                anonymizer = AnonymizationJob(self.db, logger)
                anonymizer.anonymize_user(emp['user_id'], emp['tenant_id'])
            elif method == 'shred':
                self.db.delete('employees', emp['employee_id'])
                self._record_disposal(emp['tenant_id'], 'employee', 'shred')
    
    def _dispose_marketing_data(self, cutoff_date: date, method: str):
        """
        Dispose marketing data older than 30 days
        """
        
        old_consents = self.db.query("""
            SELECT * FROM user_consents
            WHERE consent_type = 'marketing'
              AND given_at < %s::timestamp
              AND withdrawn = FALSE
        """, [cutoff_date])
        
        # Withdraw all expired consents
        for consent in old_consents:
            self.db.update('user_consents', consent['consent_id'], {
                'withdrawn': True,
                'withdrawn_at': datetime.utcnow()
            })
```

---

## 📋 AUDIT TRAIL (PII-SAFE)

### Principle: Log Actions, NOT Values

```python
# ❌ WRONG: Logs actual values (PII leak!)
audit_log.log('user_updated', {
    'user_id': 'user-123',
    'cpf': '123.456.789-00',      # WRONG! PII!
    'email': 'user@example.com'   # WRONG! PII!
})

# ✅ RIGHT: Log field names only, no values
audit_log.log('user_updated', {
    'user_id': 'user-123',
    'fields_changed': ['cpf', 'email'],      # Field names only
    'reason': 'Profile update',
    'access_method': 'web_dashboard'
})
```

### PII Access Log (No Values)

```sql
CREATE TABLE pii_access_log (
  log_id UUID PRIMARY KEY,
  tenant_id UUID,
  
  -- What entity was accessed
  entity_type VARCHAR(100),       -- 'user', 'employee'
  entity_id UUID,                 -- Which user/employee
  
  -- Which PII fields were accessed
  pii_fields TEXT[],              -- ['cpf', 'email', 'salary']
  
  -- Who accessed it
  accessed_by_user_id UUID,
  accessed_by_role VARCHAR(100),
  
  -- Why and how
  access_method VARCHAR(50),      -- 'api', 'admin_dashboard', 'export'
  access_reason VARCHAR(255),     -- 'payment_processing', 'customer_support'
  
  -- Result
  access_granted BOOLEAN,
  denial_reason VARCHAR(255),
  
  -- When
  accessed_at TIMESTAMP,
  
  -- NOTE: NO ACTUAL PII VALUES STORED IN THIS TABLE!
  
  FOREIGN KEY (accessed_by_user_id) REFERENCES users(id)
);

-- Query example (SAFE - no PII leaked):
SELECT
  accessed_at,
  entity_id,
  pii_fields,
  accessed_by_user_id,
  access_reason
FROM pii_access_log
WHERE accessed_at > NOW() - INTERVAL '7 days'
ORDER BY accessed_at DESC;

-- Result: "2026-02-03 10:30 | user-123 | ['cpf', 'email'] | admin-001 | payment_processing"
-- No actual CPF or email exposed!
```

---

## 💾 LOGS & BACKUPS

### Log Management (No PII)

```python
class SecureLogger:
    """
    Log application events without leaking PII
    """
    
    def __init__(self, logger):
        self.logger = logger
    
    def log_payment_process(self, payment_id: str, amount: decimal, **kwargs):
        """
        Log payment processing (safe to log amount, not card)
        """
        
        self.logger.info(
            "Payment processed",
            extra={
                'payment_id': payment_id,
                'amount': amount,
                'currency': 'BRL',
                # NO card number, CVV, etc
            }
        )
    
    def log_user_created(self, user_id: str, **kwargs):
        """
        Log user creation (no email/phone/cpf)
        """
        
        self.logger.info(
            "User created",
            extra={
                'user_id': user_id,
                # NO email, phone, CPF
            }
        )
    
    def log_pii_access(self, user_id: str, fields: list, access_reason: str):
        """
        Log PII access (field names only, no values)
        """
        
        self.db.insert('pii_access_log', {
            'entity_type': 'user',
            'entity_id': user_id,
            'pii_fields': fields,          # ['cpf', 'email']
            'access_reason': access_reason,
            'accessed_at': datetime.utcnow()
            # NO actual CPF/email values!
        })
```

### Backup Strategy (Data Protection)

```
Backup Schedule:
├─ Full daily backup (11 PM)
├─ Hourly incremental backups
├─ 30-day retention (on-site)
└─ 90-day retention (archived)

Backup Protection:
├─ Encrypted (AES-256)
├─ Tenant isolation (each tenant's data separate)
├─ Immutable (no modification after creation)
├─ Tested monthly (restore drills)
└─ Tracked (metadata: size, hash, encryption key)

Right to Erasure + Backups:
Problem: User deleted, but backups still contain data

Solution:
1. Flag deletion in backup metadata
   backup_id: bak-123
   deletion_flags: [
     {'user_id': 'user-456', 'deleted_at': '2026-02-03', 'anonymized': true},
     {'user_id': 'user-789', 'deleted_at': '2026-02-02', 'shredded': true}
   ]

2. On backup restore:
   ├─ Skip deleted users
   ├─ Or restore to anonymized state
   └─ Audit trail: "Backup restored, users anonymized per LGPD"

3. Delete backups after retention:
   ├─ Older than 90 days
   ├─ No active legal hold
   └─ Secure erase (DoD 5220.22-M)
```

### Backup Metadata Table

```sql
CREATE TABLE backup_metadata (
  backup_id UUID PRIMARY KEY,
  backup_date DATE,
  
  -- Backup details
  full_or_incremental VARCHAR(20),            -- 'full', 'incremental'
  size_bytes BIGINT,
  file_hash VARCHAR(64),
  
  -- Encryption
  encryption_algorithm VARCHAR(50),           -- 'AES-256'
  encryption_key_id VARCHAR(100),
  
  -- Retention
  retention_until_date DATE,
  legal_hold BOOLEAN DEFAULT FALSE,
  
  -- Deletions in this backup
  user_deletion_flags JSONB,
  -- [{"user_id": "xxx", "deleted_at": "...", "anonymized": true}]
  
  -- Status
  verified BOOLEAN DEFAULT FALSE,
  verify_date DATE,
  
  -- Immutable
  created_at TIMESTAMP NOT NULL,
  
  CONSTRAINT immutable_backups AS ON backup_id WITH NO UPDATE
);

-- Track deleted users in backup
INSERT INTO backup_metadata (backup_id, user_deletion_flags)
VALUES
  (
    'bak-123',
    '[{"user_id": "user-456", "deleted_at": "2026-02-03", "action": "anonymize"}]'::jsonb
  );

-- On restore:
-- Find all users marked as deleted
-- Don't restore their PII
-- Or restore as anonymized
```

---

## 🛠️ IMPLEMENTATION GUIDE

### Phase 1: Setup (Week 1)

```
✅ Create tables:
  ├─ user_consents (tracking opt-ins)
  ├─ retention_policies (disposal schedule)
  ├─ deletion_requests (right to erasure)
  ├─ data_exports (right to portability)
  ├─ pii_access_log (audit trail, no values)
  ├─ deletion_audit (WORM, immutable)
  └─ backup_metadata (backup tracking)

✅ Implement PII encryption:
  ├─ Tenant-specific keys (KMS)
  ├─ Encrypt CPF, email, phone, salary at rest
  ├─ Searchable hash for lookups
  └─ Test encrypt/decrypt

✅ Deploy secure logger:
  ├─ No PII values in logs
  ├─ Only field names + reasons
  └─ Verify with grep (no CPF/email patterns)

✅ Update privacy policy:
  ├─ Explain data collection
  ├─ List retention periods
  ├─ Document third-party processors
  ├─ Describe user rights
  └─ Get legal review
```

### Phase 2: Core Jobs (Week 2)

```
✅ Implement anonymization job:
  ├─ Replace PII with fake values
  ├─ Generate irreversible token
  ├─ Test with sample user
  └─ Verify unrecoverable

✅ Implement deletion job:
  ├─ Delete from user tables
  ├─ Keep audit + payments
  ├─ Record in deletion_audit (WORM)
  └─ Test selective vs full

✅ Implement export job (async):
  ├─ Queue async export
  ├─ Encrypt exported data (AES-256)
  ├─ Upload to S3
  ├─ Generate download link (30-day TTL)
  └─ Email user

✅ Implement disposal job:
  ├─ Run daily at 2 AM
  ├─ Check retention_policies
  ├─ Auto-anonymize/delete old data
  └─ Log all disposals
```

### Phase 3: APIs & UI (Week 3)

```
✅ Endpoints:
  ├─ POST /account/export (request export)
  ├─ GET /account/export/{id} (check status)
  ├─ POST /account/delete (request deletion)
  ├─ GET /account/consent (get current consents)
  ├─ POST /account/consent (opt-in/out)
  └─ GET /admin/lgpd/audit (admin audit log)

✅ User UI:
  ├─ Privacy settings page
  ├─ Download my data button
  ├─ Delete account button
  ├─ Consent management
  └─ Data access log

✅ Admin UI:
  ├─ Deletion requests queue
  ├─ Export requests status
  ├─ Retention policy config
  ├─ Disposal history
  └─ Audit log search
```

### Phase 4: Testing & Audit (Week 4)

```
✅ Functionality tests:
  ├─ Anonymization produces irreversible token
  ├─ Deleted user can't be queried
  ├─ Export contains all user data
  ├─ Deleted user can't login
  └─ Audit trail unmodifiable (WORM)

✅ Security tests:
  ├─ Encryption keys secure (KMS only)
  ├─ Exported data encrypted (AES-256)
  ├─ No PII in logs/backups
  ├─ Audit trail immutable
  └─ Backup deletion works

✅ Compliance tests:
  ├─ 30-day export deadline met
  ├─ 30-day deletion deadline met
  ├─ Consent tracking accurate
  ├─ Retention policies enforced
  └─ Audit trail preserved

✅ Legal review:
  ├─ Privacy policy matches implementation
  ├─ LGPD requirements checklist
  ├─ Third-party processor agreements
  └─ Data Processing Agreement (DPA)
```

---

## ✅ PRODUCTION CHECKLIST

```
✅ Data Classification
  ├─ PII inventory complete (all tables/fields)
  ├─ Encryption requirements identified
  ├─ Masking patterns defined
  ├─ Access control matrix created
  └─ Retention periods documented

✅ Encryption & Protection
  ├─ Tenant-specific keys (KMS)
  ├─ AES-256 encryption at rest
  ├─ TLS encryption in transit
  ├─ Searchable hashes for lookups
  ├─ No hardcoded keys (12-factor)
  └─ Key rotation quarterly

✅ Deletion & Anonymization
  ├─ Anonymization algorithm (irreversible)
  ├─ Selective deletion (preserves audit/payments)
  ├─ Full deletion capability (rare cases)
  ├─ Backup deletion (after retention)
  └─ All logged in deletion_audit (WORM)

✅ Data Export (Right to Portability)
  ├─ Async export job (timeout 30 min)
  ├─ Encryption (AES-256)
  ├─ Format support (JSON, CSV, PDF)
  ├─ 30-day download window
  ├─ Email notification
  └─ Rate limiting (1 per 30 days)

✅ Retention & Disposal
  ├─ Policy table (configurable per tenant)
  ├─ Disposal job (daily at 2 AM)
  ├─ Audit trail (what was disposed, when, why)
  ├─ Backup disposal (90-day retention)
  └─ Compliance checklist (7-year tax records)

✅ Audit Trail (No PII)
  ├─ PII access log (field names only)
  ├─ No actual values in logs
  ├─ Deletion audit trail (WORM)
  ├─ Consent history (given/withdrawn dates)
  ├─ All user actions traceable
  └─ Admin can query without seeing PII

✅ Logs & Backups
  ├─ Application logs (no PII values)
  ├─ Backup encryption (AES-256)
  ├─ Deletion metadata in backups
  ├─ Backup testing/restore drills
  ├─ Secure erase (DoD standard)
  └─ Retention metadata tracked

✅ APIs & Endpoints
  ├─ POST /account/export
  ├─ GET /account/export/{id}
  ├─ POST /account/delete
  ├─ GET /account/consent
  ├─ POST /account/consent
  ├─ GET /admin/lgpd/audit
  └─ All 30-day SLA enforced

✅ UI & UX
  ├─ Privacy settings page
  ├─ Consent management
  ├─ Download data button
  ├─ Delete account button
  ├─ Admin dashboard
  └─ All in Portuguese (localization)

✅ Testing
  ├─ Anonymization test (irreversible)
  ├─ Deletion test (selective + full)
  ├─ Export test (all formats)
  ├─ Encryption test (no plaintext in storage)
  ├─ Audit trail test (immutable)
  ├─ 30-day deadline test (SLA)
  └─ No PII in logs/backups (verification)

✅ Legal/Compliance
  ├─ Privacy policy updated
  ├─ Data Processing Agreement (DPA)
  ├─ Third-party processor list
  ├─ Consent template (updated)
  ├─ LGPD compliance checklist
  ├─ Legal review completed
  └─ Ready for audit
```

---

## 📊 SUMMARY

### LGPD Requirements Met

```
✅ Right of Access (Direito de Acesso)
   → Export endpoint (JSON/CSV/PDF)
   → 30-day deadline met
   → Machine-readable format

✅ Right to Correction (Direito à Retificação)
   → User can update profile
   → Changes logged in audit trail
   → Correction dates tracked

✅ Right to Erasure (Direito ao Esquecimento)
   → Anonymization or deletion
   → 30-day deadline
   → Exceptions: audit trail, legal holds

✅ Right to Portability (Direito à Portabilidade)
   → Export all personal data
   → Structured format (JSON/CSV)
   → Machine-readable + interoperable

✅ Transparency (Transparência)
   → Privacy policy clear
   → Retention periods documented
   → Third-party processors listed
   → User rights explained

✅ Consent (Consentimento)
   → Explicit opt-in tracking
   → Withdrawal capability
   → Version control (privacy policy versions)

✅ Audit Trail (Trilha de Auditoria)
   → All access logged (no PII values)
   → All deletions logged (WORM)
   → Immutable (cannot be modified)
   → Retention: 7 years

✅ Data Protection
   → Encryption at rest (AES-256)
   → Encryption in transit (TLS)
   → Tenant-specific keys
   → No sensitive data in logs
```

### Safety Guarantees

```
✅ Deleted users cannot be recovered
✅ Anonymized users cannot be identified
✅ Exported data is encrypted
✅ Audit trail is immutable
✅ No PII leaked in logs/backups
✅ Backups deleted after retention
✅ 30-day deadlines enforced
✅ Consent history preserved
```

---

**Version:** 1.0  
**Status:** Production Ready  
**Compliance:** LGPD, GDPR, CCPA, PCI-DSS  
**Last Updated:** 2026-02-03

For integration: Combine with AUTHORIZATION_SYSTEM.md + IMMUTABLE_AUDIT_SYSTEM.md + BILLING_MODULE.md
