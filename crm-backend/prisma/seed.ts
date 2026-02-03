import { PrismaClient, RoleName, CompanyType, CompanyStatus, PaymentMethod, PaymentStatus, Prisma } from "@prisma/client";
import * as bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  // Create tenant
  const tenant = await prisma.tenant.upsert({
    where: { id: "00000000-0000-0000-0000-000000000001" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000001",
      name: "Demo Tenant"
    }
  });

  const passwordHash = await bcrypt.hash("Admin123!", 10);

  const master = await prisma.user.upsert({
    where: { email: "master@demo.com" },
    update: {},
    create: {
      tenantId: tenant.id,
      email: "master@demo.com",
      name: "Master Admin",
      passwordHash,
      roles: {
        create: [{ tenantId: tenant.id, role: RoleName.MASTER_ADMIN }]
      }
    }
  });

  const sup = await prisma.user.upsert({
    where: { email: "support@demo.com" },
    update: {},
    create: {
      tenantId: tenant.id,
      email: "support@demo.com",
      name: "Support User",
      passwordHash: await bcrypt.hash("Support123!", 10),
      roles: { create: [{ tenantId: tenant.id, role: RoleName.SUPORTE }] }
    }
  });

  const fin = await prisma.user.upsert({
    where: { email: "finance@demo.com" },
    update: {},
    create: {
      tenantId: tenant.id,
      email: "finance@demo.com",
      name: "Finance User",
      passwordHash: await bcrypt.hash("Finance123!", 10),
      roles: { create: [{ tenantId: tenant.id, role: RoleName.FINANCEIRO }] }
    }
  });

  // Companies
  const segments = ["SaaS", "Ecommerce", "Agency", "Healthcare"];
  const statuses = [CompanyStatus.ACTIVE, CompanyStatus.INACTIVE, CompanyStatus.SUSPENDED];

  const companies = [];
  for (let i = 1; i <= 10; i++) {
    const company = await prisma.company.create({
      data: {
        tenantId: tenant.id,
        name: `Empresa ${i}`,
        cpfCnpj: i % 2 === 0 ? `1234567800010${i}` : `1234567890${i}`.slice(0,11),
        type: i % 2 === 0 ? CompanyType.PJ : CompanyType.PF,
        plan: i % 3 === 0 ? "PRO" : "STARTER",
        status: statuses[i % statuses.length],
        currentRevenue: (i * 10000),
        paymentMethod: [PaymentMethod.CARD, PaymentMethod.PIX, PaymentMethod.BOLETO][i % 3],
        paymentStatus: [PaymentStatus.PAID, PaymentStatus.OPEN, PaymentStatus.FAILED][i % 3],
        cycle: i % 2 === 0 ? "MONTHLY" : "YEARLY",
        segment: segments[i % segments.length],
        acquiredAt: new Date(Date.now() - i * 86400000 * 10),
        email: `contato${i}@empresa.com`,
        phone: `+55 11 90000-00${i}`.slice(0,16),
        internalNotes: "Seed data"
      }
    });

    await prisma.auditLog.create({
      data: {
        tenantId: tenant.id,
        entityType: "company",
        entityId: company.id,
        field: "*",
        action: "company.create",
        oldValue: Prisma.JsonNull,
        newValue: { id: company.id, name: company.name },
        actorId: master.id,
        actorRole: "MASTER_ADMIN",
        origin: "master_admin"
      }
    });

    companies.push(company);
  }

  // Billing for first company
  const target = companies[0];
  const now = new Date();
  for (let m = 1; m <= 4; m++) {
    const due = new Date(now.getFullYear(), now.getMonth() - (4 - m), 10);
    const status = m === 4 ? PaymentStatus.FAILED : PaymentStatus.PAID;
    const invoice = await prisma.billingInvoice.create({
      data: {
        tenantId: tenant.id,
        companyId: target.id,
        amount: 8000,
        cycle: "MONTHLY",
        status,
        dueDate: due,
        paidAt: status === PaymentStatus.PAID ? new Date(due.getTime() + 2 * 3600 * 1000) : null,
        gatewayId: `gw_inv_${m}`
      }
    });

    await prisma.billingPayment.create({
      data: {
        tenantId: tenant.id,
        invoiceId: invoice.id,
        amount: 8000,
        method: PaymentMethod.CARD,
        status,
        gatewayChargeId: `gw_charge_${m}`
      }
    });

    await prisma.auditLog.create({
      data: {
        tenantId: tenant.id,
        entityType: "billing_invoice",
        entityId: invoice.id,
        field: "status",
        action: "billing.invoice.create",
        oldValue: Prisma.JsonNull,
        newValue: { status },
        actorId: null,
        actorRole: "system",
        origin: "system"
      }
    });
  }

  // Support ticket
  await prisma.supportTicket.create({
    data: {
      tenantId: tenant.id,
      companyId: target.id,
      subject: "Problema com pagamento",
      status: "OPEN",
      slaDueAt: new Date(Date.now() + 86400000),
      lastInteractionAt: new Date()
    }
  });

  console.log("Seed complete:", { tenant: tenant.id, master: master.email, support: sup.email, finance: fin.email });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
