import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from "@nestjs/common";
import { RequestUser } from "../types";

@Injectable()
export class MasterOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const user = req.user as RequestUser;
    const isDev = process.env.NODE_ENV !== "production";

    if (!user) {
      if (isDev) {
        console.log("MasterOnlyGuard denied", {
          reason: "missing_user",
          tenantId: null,
          roles: null,
        });
      }
      throw new ForbiddenException("User not authenticated");
    }

    const MASTER_TENANT_ID = process.env.MASTER_TENANT_ID || "00000000-0000-0000-0000-000000000001";
    const allowedRoles = new Set(["MASTER_ADMIN", "MASTER_SUPPORT", "MASTER_FINANCE", "MASTER_ANALYTICS"]);
    const hasMasterRole = user.roles.some((role) => allowedRoles.has(String(role)));
    const isMasterTenant = user.tenantId === MASTER_TENANT_ID;

    if (!hasMasterRole || !isMasterTenant) {
      if (isDev) {
        console.log("MasterOnlyGuard denied", {
          reason: !hasMasterRole ? "missing_master_role" : "not_master_tenant",
          tenantId: user.tenantId,
          roles: user.roles,
        });
      }
      throw new ForbiddenException("Access restricted to master users only");
    }

    return true;
  }
}
