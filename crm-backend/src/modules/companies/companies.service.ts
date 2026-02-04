import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { RequestUser } from "../../common/types";
import { CreateCompanyDto } from "./dto/create-company.dto";
import { UpdateCompanyDto } from "./dto/update-company.dto";
import * as bcrypt from "bcrypt";
import { Company, PaymentMethod, PaymentStatus } from "@prisma/client";

const CRITICAL_FIELDS = new Set(["plan", "cycle", "paymentMethod", "paymentStatus"]);

@Injectable()
export class CompaniesService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  async list(user: RequestUser, opts: { limit: number; cursor?: string; status?: string; segment?: string; order?: string }) {
    const take = Math.min(Math.max(opts.limit || 20, 1), 100);
    const where: any = { tenantId: user.tenantId };
    if (opts.status) where.status = opts.status;
    if (opts.segment) where.segment = opts.segment;

    const orderBy = opts.order === "name" ? { name: "asc" as const } : { createdAt: "desc" as const };

    const data = await this.prisma.company.findMany({
      where,
      take: take + 1,
      ...(opts.cursor ? { skip: 1, cursor: { id: opts.cursor } } : {}),
      orderBy,
      select: {
        id: true,
        name: true,
        cpfCnpj: true,
        type: true,
        plan: true,
        status: true,
        currentRevenue: true,
        paymentMethod: true,
        paymentStatus: true,
        cycle: true,
        segment: true,
        acquiredAt: true,
        email: true,
        phone: true,
        createdAt: true,
      },
    });

    const hasMore = data.length > take;
    const items = hasMore ? data.slice(0, take) : data;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    return { data: items, nextCursor };
  }

  async create(user: RequestUser, dto: CreateCompanyDto, req: any) {
    const company = await this.prisma.company.create({
      data: {
        tenantId: user.tenantId,
        name: dto.name,
        cpfCnpj: dto.cpfCnpj.replace(/\D/g, ""),
        type: dto.type,
        plan: dto.plan,
        status: dto.status,
        currentRevenue: dto.currentRevenue,
        paymentMethod: dto.paymentMethod,
        paymentStatus: dto.paymentStatus,
        cycle: dto.cycle,
        segment: dto.segment,
        acquiredAt: dto.acquiredAt ? new Date(dto.acquiredAt) : null,
        email: dto.email,
        phone: dto.phone,
        internalNotes: dto.internalNotes,
      },
    });

    await this.audit.log({
      tenantId: user.tenantId,
      entityType: "company",
      entityId: company.id,
      action: "company.create",
      field: "*",
      oldValue: null,
      newValue: { id: company.id, name: company.name },
      actor: user,
      origin: user.roles.includes("MASTER_ADMIN" as any) ? "master_admin" : "employee",
      requestId: req.headers["x-request-id"],
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });

    return company;
  }

  async detail(user: RequestUser, id: string) {
    const company = await this.prisma.company.findFirst({
      where: { id, tenantId: user.tenantId },
    });
    if (!company) throw new NotFoundException();

    const finance = await this.finance(user, id);
    const spendings = await this.prisma.billingInvoice.findMany({
      where: { tenantId: user.tenantId, companyId: id },
      orderBy: { dueDate: "desc" },
      take: 50,
      select: { id: true, dueDate: true, amount: true, cycle: true, status: true, gatewayId: true, paidAt: true },
    });

    const support = await this.prisma.supportTicket.findMany({
      where: { tenantId: user.tenantId, companyId: id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    const audit = await this.prisma.auditLog.findMany({
      where: { tenantId: user.tenantId, entityId: id },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    return {
      general: company,
      finance,
      spendings,
      support,
      audit,
    };
  }

  private async hasValidCriticalSession(user: RequestUser, companyId: string) {
    const now = new Date();
    const s = await this.prisma.criticalEditSession.findFirst({
      where: {
        tenantId: user.tenantId,
        companyId,
        userId: user.id,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: "desc" },
    });
    return !!s;
  }

  async update(user: RequestUser, id: string, dto: UpdateCompanyDto, req: any) {
    const company = await this.prisma.company.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!company) throw new NotFoundException();

    const keys = Object.keys(dto).filter((k) => (dto as any)[k] !== undefined);
    const touchingCritical = keys.some((k) => CRITICAL_FIELDS.has(k));

    if (touchingCritical) {
      const ok = await this.hasValidCriticalSession(user, id);
      if (!ok) throw new ForbiddenException("Critical fields locked");
    }

    const updateData: any = {};
    for (const k of keys) updateData[k] = (dto as any)[k];

    // normalize if someone updates payment fields as string
    if (updateData.paymentMethod) updateData.paymentMethod = updateData.paymentMethod as PaymentMethod;
    if (updateData.paymentStatus) updateData.paymentStatus = updateData.paymentStatus as PaymentStatus;

    const updated = await this.prisma.company.update({ where: { id }, data: updateData });

    // per-field audit
    for (const k of keys) {
      await this.audit.log({
        tenantId: user.tenantId,
        entityType: "company",
        entityId: id,
        action: "company.update",
        field: k,
        oldValue: (company as any)[k] ?? null,
        newValue: (updated as any)[k] ?? null,
        actor: user,
        origin: user.roles.includes("MASTER_ADMIN" as any) ? "master_admin" : "employee",
        requestId: req.headers["x-request-id"],
        ip: req.ip,
        userAgent: req.headers["user-agent"],
      });
    }

    return updated;
  }

  async unlockCritical(user: RequestUser, companyId: string, password: string, req: any) {
    const dbUser = await this.prisma.user.findFirst({
      where: { id: user.id, tenantId: user.tenantId },
    });
    if (!dbUser) throw new ForbiddenException();

    const ok = await bcrypt.compare(password, dbUser.passwordHash);
    if (!ok) throw new ForbiddenException("Re-auth failed");

    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    const session = await this.prisma.criticalEditSession.create({
      data: { tenantId: user.tenantId, companyId, userId: user.id, expiresAt },
    });

    await this.audit.log({
      tenantId: user.tenantId,
      entityType: "company",
      entityId: companyId,
      action: "company.unlock_critical",
      field: "*critical*",
      oldValue: null,
      newValue: { sessionId: session.id, expiresAt },
      actor: user,
      origin: "master_admin",
      requestId: req.headers["x-request-id"],
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });

    return { sessionId: session.id, expiresAt };
  }

  async finance(user: RequestUser, companyId: string) {
    const invoices = await this.prisma.billingInvoice.findMany({
      where: { tenantId: user.tenantId, companyId },
      orderBy: { dueDate: "desc" },
      take: 50,
      include: { payments: true },
    });

    const paid = invoices.filter((i) => i.status === "PAID").reduce((s, i) => s + i.amount, 0);
    const open = invoices.filter((i) => i.status === "OPEN").reduce((s, i) => s + i.amount, 0);
    const failed = invoices.filter((i) => i.status === "FAILED").length;

    return {
      summary: {
        paidCents: paid,
        openCents: open,
        failedCount: failed,
      },
      invoices: invoices.map((i) => ({
        id: i.id,
        dueDate: i.dueDate,
        amount: i.amount,
        status: i.status,
        paidAt: i.paidAt,
        gatewayId: i.gatewayId,
        payments: i.payments.map((p) => ({
          id: p.id,
          amount: p.amount,
          method: p.method,
          status: p.status,
          attemptedAt: p.attemptedAt,
          gatewayChargeId: p.gatewayChargeId,
        })),
      })),
    };
  }
}
