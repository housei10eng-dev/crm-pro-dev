import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from "@nestjs/common";
import { RequestUser } from "../types";

@Injectable()
export class TenantOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const user = req.user as RequestUser;

    if (!user) {
      throw new ForbiddenException("User not authenticated");
    }

    const MASTER_TENANT_ID = process.env.MASTER_TENANT_ID || "00000000-0000-0000-0000-000000000001";

    // Check if user has any TENANT_* role AND does NOT belong to master tenant
    const hasTenantRole = user.roles.some((role) => String(role).startsWith("TENANT_"));
    const isNotMasterTenant = user.tenantId !== MASTER_TENANT_ID;

    if (!hasTenantRole || !isNotMasterTenant) {
      throw new ForbiddenException("Access restricted to tenant users only");
    }

    return true;
  }
}
