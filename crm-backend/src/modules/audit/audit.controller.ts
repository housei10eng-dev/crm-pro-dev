import { Controller, Get, Query, UseGuards, Request } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AuthGuard } from "@nestjs/passport";
import { PrismaService } from "../../prisma/prisma.service";
import { RolesGuard } from "../../common/guards/roles.guard";
import { MasterOnlyGuard } from "../../common/guards/master-only.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { RoleName } from "@prisma/client";

@ApiTags("admin/audit")
@ApiBearerAuth()
@UseGuards(AuthGuard("jwt"), RolesGuard, MasterOnlyGuard)
@Controller("admin/audit")
export class AuditController {
  constructor(private prisma: PrismaService) {}

  @Roles(RoleName.MASTER_ADMIN, RoleName.MASTER_FINANCE, RoleName.MASTER_SUPPORT, RoleName.MASTER_ANALYTICS)
  @Get()
  async list(@Request() req: any, @Query("entity_type") entityType?: string, @Query("entity_id") entityId?: string, @Query("from") from?: string, @Query("to") to?: string) {
    const tenantId = req.user.tenantId;
    const where: any = { tenantId };
    if (entityType) where.entityType = entityType;
    if (entityId) where.entityId = entityId;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }
    return this.prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, take: 200 });
  }
}
