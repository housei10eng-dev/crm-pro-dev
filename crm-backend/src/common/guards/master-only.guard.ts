import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from "@nestjs/common";
import { RequestUser } from "../types";

@Injectable()
export class MasterOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const user = req.user as RequestUser;

    if (!user) {
      throw new ForbiddenException("User not authenticated");
    }

    const MASTER_TENANT_ID = process.env.MASTER_TENANT_ID || "00000000-0000-0000-0000-000000000001";

    // Check if user has any MASTER_* role AND belongs to master tenant
    const hasMasterRole = user.roles.some((role) => String(role).startsWith("MASTER_"));
    const isMasterTenant = user.tenantId === MASTER_TENANT_ID;

    if (!hasMasterRole || !isMasterTenant) {
      throw new ForbiddenException("Access restricted to master users only");
    }

    return true;
  }
}
