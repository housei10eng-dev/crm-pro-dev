-- AlterTable
ALTER TABLE "BillingEvent" ADD COLUMN "signatureHash" TEXT;

-- CreateIndex
CREATE INDEX "BillingEvent_tenantId_signatureHash_receivedAt_idx" ON "BillingEvent"("tenantId", "signatureHash", "receivedAt");

-- WORM enforcement for AuditLog
CREATE OR REPLACE FUNCTION audit_log_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog is immutable';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_log_block_update ON "AuditLog";
DROP TRIGGER IF EXISTS audit_log_block_delete ON "AuditLog";

CREATE TRIGGER audit_log_block_update
BEFORE UPDATE ON "AuditLog"
FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();

CREATE TRIGGER audit_log_block_delete
BEFORE DELETE ON "AuditLog"
FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();
