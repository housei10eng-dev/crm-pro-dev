import { ConflictException, Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { RequestUser } from "../../common/types";
import { CreateEmployeeDto } from "./dto/create-employee.dto";
import { UpdateEmployeeDto } from "./dto/update-employee.dto";
import * as bcrypt from "bcrypt";
import { AuditService } from "../audit/audit.service";
import { RoleName } from "@prisma/client";

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

    const roles = dto.roles && dto.roles.length > 0 ? dto.roles : [RoleName.TENANT_USER];
    const rawPassword = dto.password?.trim()
      ? dto.password
      : `Temp${Math.random().toString(36).slice(2, 10)}!`;
    const origin = user.roles.includes("MASTER_ADMIN" as any) ? "master_admin" : "employee";

    const created = await this.prisma.user.create({
      data: {
        tenantId: user.tenantId,
        name: dto.name,
        email: dto.email,
        status: dto.status ?? "ACTIVE",
        passwordHash: await bcrypt.hash(rawPassword, 10),
        roles: {
          create: roles.map((r) => ({ tenantId: user.tenantId, role: r })),
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
      origin,
      requestId: req.headers["x-request-id"],
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });

    const createdFields: Record<string, unknown> = {
      name: created.name,
      email: created.email,
      status: created.status,
      roles: created.roles.map((r) => r.role),
    };

    for (const [field, value] of Object.entries(createdFields)) {
      await this.audit.log({
        tenantId: user.tenantId,
        entityType: "user",
        entityId: created.id,
        action: "employee.create",
        field,
        oldValue: null,
        newValue: value ?? null,
        actor: user,
        origin,
        requestId: req.headers["x-request-id"],
        ip: req.ip,
        userAgent: req.headers["user-agent"],
      });
    }

    return {
      id: created.id,
      email: created.email,
      name: created.name,
      status: created.status,
      roles: created.roles.map((r) => r.role),
    };
  }

  async update(user: RequestUser, employeeId: string, dto: UpdateEmployeeDto, req: any) {
    // Verify employee exists and belongs to same tenant
    const employee = await this.prisma.user.findUnique({
      where: { id: employeeId },
      include: { roles: true },
    });

    if (!employee || employee.tenantId !== user.tenantId) {
      throw new NotFoundException("Employee not found");
    }

    const oldValue = {
      id: employee.id,
      name: employee.name,
      status: employee.status,
      roles: employee.roles.map((r) => r.role),
    };

    const updateData: any = {};
    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.status !== undefined) updateData.status = dto.status;

    const updated = await this.prisma.user.update({
      where: { id: employeeId },
      data: updateData,
      include: { roles: true },
    });

    // Update roles if provided
    if (dto.roles && Array.isArray(dto.roles)) {
      await this.prisma.userRole.deleteMany({
        where: { userId: employeeId },
      });

      await this.prisma.userRole.createMany({
        data: dto.roles.map((r) => ({
          userId: employeeId,
          tenantId: user.tenantId,
          role: r,
        })),
      });
    }

    const newValue = {
      id: updated.id,
      name: updated.name,
      status: updated.status,
      roles: dto.roles || employee.roles.map((r) => r.role),
    };

    const origin = user.roles.includes("MASTER_ADMIN" as any) ? "master_admin" : "employee";
    const updatedFields: Record<string, { oldValue: unknown; newValue: unknown }> = {
      name: { oldValue: oldValue.name, newValue: newValue.name },
      status: { oldValue: oldValue.status, newValue: newValue.status },
    };
    if (dto.roles) {
      updatedFields.roles = { oldValue: oldValue.roles, newValue: newValue.roles };
    }

    for (const [field, values] of Object.entries(updatedFields)) {
      if ((dto as any)[field] === undefined) continue;
      await this.audit.log({
        tenantId: user.tenantId,
        entityType: "user",
        entityId: employeeId,
        action: "employee.update",
        field,
        oldValue: values.oldValue ?? null,
        newValue: values.newValue ?? null,
        actor: user,
        origin,
        requestId: req.headers["x-request-id"],
        ip: req.ip,
        userAgent: req.headers["user-agent"],
      });
    }

    return {
      id: updated.id,
      email: updated.email,
      name: updated.name,
      status: updated.status,
      roles: dto.roles || employee.roles.map((r) => r.role),
    };
  }
}
