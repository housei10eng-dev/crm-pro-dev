import { ConflictException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { RequestUser } from "../../common/types";
import { CreateEmployeeDto } from "./dto/create-employee.dto";
import * as bcrypt from "bcrypt";
import { AuditService } from "../audit/audit.service";

@Injectable()
export class EmployeesService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  async list(user: RequestUser) {
    return this.prisma.user.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, email: true, status: true, lastLoginAt: true, createdAt: true, roles: true },
      take: 200,
    });
  }

  async create(user: RequestUser, dto: CreateEmployeeDto, req: any) {
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (exists) throw new ConflictException("Email already exists");

    const created = await this.prisma.user.create({
      data: {
        tenantId: user.tenantId,
        name: dto.name,
        email: dto.email,
        passwordHash: await bcrypt.hash(dto.password, 10),
        roles: {
          create: dto.roles.map((r) => ({ tenantId: user.tenantId, role: r })),
        },
      },
      include: { roles: true },
    });

    await this.audit.log({
      tenantId: user.tenantId,
      entityType: "user",
      entityId: created.id,
      action: "employee.create",
      field: "*",
      oldValue: null,
      newValue: { id: created.id, email: created.email, roles: created.roles.map((r) => r.role) },
      actor: user,
      origin: "master_admin",
      requestId: req.headers["x-request-id"],
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });

    return { id: created.id, email: created.email, name: created.name, roles: created.roles.map((r) => r.role) };
  }
}
