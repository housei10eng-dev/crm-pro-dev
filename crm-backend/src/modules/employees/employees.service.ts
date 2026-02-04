import { ConflictException, Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { RequestUser } from "../../common/types";
import { CreateEmployeeDto } from "./dto/create-employee.dto";
import { UpdateEmployeeDto } from "./dto/update-employee.dto";
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
    if (dto.name) updateData.name = dto.name;
    if (dto.status) updateData.status = dto.status;

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

    await this.audit.log({
      tenantId: user.tenantId,
      entityType: "user",
      entityId: employeeId,
      action: "employee.update",
      field: "*",
      oldValue,
      newValue,
      actor: user,
      origin: "master_admin",
      requestId: req.headers["x-request-id"],
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });

    return {
      id: updated.id,
      email: updated.email,
      name: updated.name,
      status: updated.status,
      roles: dto.roles || employee.roles.map((r) => r.role),
    };
  }
}
