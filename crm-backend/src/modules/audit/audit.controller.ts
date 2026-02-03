import { Controller, Get, Query, UseGuards, Request } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AuthGuard } from "@nestjs/passport";
import { PrismaService } from "../../prisma/prisma.service";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { RoleName } from "@prisma/client";

@ApiTags("audit")
@ApiBearerAuth()
@UseGuards(AuthGuard("jwt"), RolesGuard)
@Controller("audit")
export class AuditController {
  constructor(private prisma: PrismaService) {}

  @Roles(RoleName.MASTER_ADMIN, RoleName.FINANCEIRO, RoleName.SUPORTE, RoleName.ANALYTICS)
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
