import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { RequestUser } from "../../common/types";

type AuditInput = {
  tenantId: string;
  entityType: string;
  entityId: string;
  action: string;
  field: string;
  oldValue?: any;
  newValue?: any;
  actor?: RequestUser | null;
  origin?: string;
  requestId?: string;
  ip?: string;
  userAgent?: string;
};

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async log(input: AuditInput) {
    const actorRole = input.actor?.roles?.[0] ?? null;
    return this.prisma.auditLog.create({
      data: {
        tenantId: input.tenantId,
        entityType: input.entityType,
        entityId: input.entityId,
        action: input.action,
        field: input.field,
        oldValue: input.oldValue ?? null,
        newValue: input.newValue ?? null,
        actorId: input.actor?.id ?? null,
        actorRole: actorRole ? String(actorRole) : null,
        origin: input.origin ?? (input.actor ? "user" : "system"),
        requestId: input.requestId ?? null,
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
      },
    });
  }
}
