-- Update RoleName enum
-- Drop dependent views/functions first (if any)
ALTER TYPE "RoleName" RENAME TO "RoleName_old";

CREATE TYPE "RoleName" AS ENUM (
  'MASTER_ADMIN',
  'MASTER_SUPPORT',
  'MASTER_FINANCE',
  'MASTER_ANALYTICS',
  'TENANT_ADMIN',
  'TENANT_USER'
);

-- Update UserRole table
ALTER TABLE "UserRole" ALTER COLUMN "role" TYPE "RoleName" USING
  CASE
    WHEN "role"::text = 'MASTER_ADMIN' THEN 'MASTER_ADMIN'::"RoleName"
    WHEN "role"::text = 'SUPORTE' THEN 'MASTER_SUPPORT'::"RoleName"
    WHEN "role"::text = 'FINANCEIRO' THEN 'MASTER_FINANCE'::"RoleName"
    WHEN "role"::text = 'ANALYTICS' THEN 'MASTER_ANALYTICS'::"RoleName"
    ELSE 'TENANT_USER'::"RoleName"
  END;

DROP TYPE "RoleName_old";
