import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import * as request from "supertest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";

describe("E2E", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let masterToken: string;
  let tenantToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    prisma = app.get<PrismaService>(PrismaService);
    await app.init();

    // Get master token
    const masterLogin = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "master@demo.com", password: "Admin123!" });
    masterToken = masterLogin.body.accessToken;

    // Get tenant token
    const tenantLogin = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "admin@tenant.com", password: "Tenant123!" });
    tenantToken = tenantLogin.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it("login works for master", async () => {
    const res = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "master@demo.com", password: "Admin123!" })
      .expect(201);
    expect(res.body.accessToken).toBeTruthy();
  });

  it("login works for tenant", async () => {
    const res = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "admin@tenant.com", password: "Tenant123!" })
      .expect(201);
    expect(res.body.accessToken).toBeTruthy();
  });

  it("me returns scope=admin for master", async () => {
    const res = await request(app.getHttpServer())
      .get("/me")
      .set("Authorization", `Bearer ${masterToken}`)
      .expect(200);
    expect(res.body.scope).toBe("admin");
  });

  it("me returns scope=tenant for tenant user", async () => {
    const res = await request(app.getHttpServer())
      .get("/me")
      .set("Authorization", `Bearer ${tenantToken}`)
      .expect(200);
    expect(res.body.scope).toBe("tenant");
  });

  it("/admin/companies requires auth", async () => {
    await request(app.getHttpServer())
      .get("/admin/companies")
      .expect(401);
  });

  it("tenant user cannot access /admin/companies", async () => {
    await request(app.getHttpServer())
      .get("/admin/companies")
      .set("Authorization", `Bearer ${tenantToken}`)
      .expect(403);
  });

  it("master user can access /admin/companies", async () => {
    const res = await request(app.getHttpServer())
      .get("/admin/companies")
      .set("Authorization", `Bearer ${masterToken}`)
      .expect(200);
    expect(res.body.data).toBeTruthy();
  });

  it("tenant user can access /app/ping", async () => {
    const res = await request(app.getHttpServer())
      .get("/app/ping")
      .set("Authorization", `Bearer ${tenantToken}`)
      .expect(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.scope).toBe("tenant");
  });

  it("master user cannot access /app/ping", async () => {
    await request(app.getHttpServer())
      .get("/app/ping")
      .set("Authorization", `Bearer ${masterToken}`)
      .expect(403);
  });

  it("health endpoint responds", async () => {
    const res = await request(app.getHttpServer()).get("/health");
    expect([200, 503]).toContain(res.status);
    expect(res.body.status).toBeTruthy();
  });

  it("custom fields workflow", async () => {
    // Create custom field
    const createRes = await request(app.getHttpServer())
      .post("/admin/custom-fields")
      .set("Authorization", `Bearer ${masterToken}`)
      .send({
        entityType: "company",
        key: `test_key_${Date.now()}`,
        label: "Test Field",
        type: "text",
        position: 0,
      })
      .expect(201);

    const fieldId = createRes.body.id;
    expect(fieldId).toBeTruthy();

    // List custom fields
    const listRes = await request(app.getHttpServer())
      .get("/admin/custom-fields?entityType=company")
      .set("Authorization", `Bearer ${masterToken}`)
      .expect(200);
    expect(listRes.body.length).toBeGreaterThan(0);

    // Update custom field
    await request(app.getHttpServer())
      .patch(`/admin/custom-fields/${fieldId}`)
      .set("Authorization", `Bearer ${masterToken}`)
      .send({ label: "Updated Test Field", position: 1 })
      .expect(200);

    // Delete custom field (soft delete)
    await request(app.getHttpServer())
      .delete(`/admin/custom-fields/${fieldId}`)
      .set("Authorization", `Bearer ${masterToken}`)
      .expect(200);
  });

  it("custom field values workflow", async () => {
    // Create field definition
    const fieldRes = await request(app.getHttpServer())
      .post("/admin/custom-fields")
      .set("Authorization", `Bearer ${masterToken}`)
      .send({
        entityType: "company",
        key: `test_field_${Date.now()}`,
        label: "Test Field",
        type: "text",
      })
      .expect(201);

    const fieldId = fieldRes.body.id;

    // Get a company
    const companiesRes = await request(app.getHttpServer())
      .get("/admin/companies")
      .set("Authorization", `Bearer ${masterToken}`)
      .expect(200);

    const companyId = companiesRes.body.data[0].id;

    // Save custom field values
    await request(app.getHttpServer())
      .patch(`/admin/companies/${companyId}/custom-fields`)
      .set("Authorization", `Bearer ${masterToken}`)
      .send({
        values: [
          { fieldId, value: "Test Value" },
        ],
      })
      .expect(200);

    // Get custom field values
    const valuesRes = await request(app.getHttpServer())
      .get(`/admin/companies/${companyId}/custom-fields`)
      .set("Authorization", `Bearer ${masterToken}`)
      .expect(200);

    expect(valuesRes.body.fields).toBeTruthy();
    expect(valuesRes.body.values).toBeTruthy();
  });

  it("table views workflow", async () => {
    // Create view
    const createRes = await request(app.getHttpServer())
      .post("/admin/views")
      .set("Authorization", `Bearer ${masterToken}`)
      .send({
        entityType: "company",
        name: `Test View ${Date.now()}`,
        config: {
          columnsOrder: ["name", "status", "plan"],
          hiddenColumns: ["email"],
          filters: {},
          sorting: { field: "name", direction: "asc" },
        },
        isDefault: false,
      })
      .expect(201);

    const viewId = createRes.body.id;

    // List views
    const listRes = await request(app.getHttpServer())
      .get("/admin/views?entityType=company")
      .set("Authorization", `Bearer ${masterToken}`)
      .expect(200);
    expect(listRes.body.length).toBeGreaterThan(0);

    // Update view
    await request(app.getHttpServer())
      .patch(`/admin/views/${viewId}`)
      .set("Authorization", `Bearer ${masterToken}`)
      .send({ name: `Updated View ${Date.now()}` })
      .expect(200);

    // Set as default
    await request(app.getHttpServer())
      .post(`/admin/views/${viewId}/set-default`)
      .set("Authorization", `Bearer ${masterToken}`)
      .expect(200);

    // Delete view
    await request(app.getHttpServer())
      .delete(`/admin/views/${viewId}`)
      .set("Authorization", `Bearer ${masterToken}`)
      .expect(200);
  });

  it("views entityType normalization", async () => {
    const viewName = `Compat View ${Date.now()}`;

    const createRes = await request(app.getHttpServer())
      .post("/admin/views")
      .set("Authorization", `Bearer ${masterToken}`)
      .send({
        entityType: "companies",
        name: viewName,
        config: {
          columnsOrder: ["name"],
          hiddenColumns: [],
          filters: {},
          sorting: { field: "name", direction: "asc" },
        },
        isDefault: false,
      })
      .expect(201);

    expect(createRes.body.entityType).toBe("company");

    const listPluralRes = await request(app.getHttpServer())
      .get("/admin/views?entityType=companies")
      .set("Authorization", `Bearer ${masterToken}`)
      .expect(200);

    const listSingularRes = await request(app.getHttpServer())
      .get("/admin/views?entityType=company")
      .set("Authorization", `Bearer ${masterToken}`)
      .expect(200);

    expect(listPluralRes.body.length).toBeGreaterThan(0);
    expect(listSingularRes.body.length).toBeGreaterThan(0);

    const createdId = createRes.body.id;
    const pluralMatch = listPluralRes.body.find((v: any) => v.id === createdId);
    const singularMatch = listSingularRes.body.find((v: any) => v.id === createdId);

    expect(pluralMatch?.entityType).toBe("company");
    expect(singularMatch?.entityType).toBe("company");

    await request(app.getHttpServer())
      .post("/admin/views")
      .set("Authorization", `Bearer ${masterToken}`)
      .send({
        entityType: "invalid",
        name: `Invalid View ${Date.now()}`,
        config: { columnsOrder: [], hiddenColumns: [], filters: {}, sorting: {} },
        isDefault: false,
      })
      .expect(400);

    await request(app.getHttpServer())
      .delete(`/admin/views/${createdId}`)
      .set("Authorization", `Bearer ${masterToken}`)
      .expect(200);
  });

  it("admin settings workflow", async () => {
    // Get settings
    const getRes = await request(app.getHttpServer())
      .get("/admin/settings")
      .set("Authorization", `Bearer ${masterToken}`)
      .expect(200);

    expect(getRes.body).toBeTruthy();

    // Update settings
    await request(app.getHttpServer())
      .put("/admin/settings")
      .set("Authorization", `Bearer ${masterToken}`)
      .send({
        brandName: "Test CRM",
        theme: {
          primaryColor: "#3b82f6",
          mode: "light",
        },
      })
      .expect(200);

    // Verify update
    const verifyRes = await request(app.getHttpServer())
      .get("/admin/settings")
      .set("Authorization", `Bearer ${masterToken}`)
      .expect(200);

    expect(verifyRes.body.brandName).toBe("Test CRM");
  });

  it("patch employee workflow", async () => {
    // Get employees list
    const listRes = await request(app.getHttpServer())
      .get("/admin/employees")
      .set("Authorization", `Bearer ${masterToken}`)
      .expect(200);

    const employeeId = listRes.body[0].id;

    // Update employee
    await request(app.getHttpServer())
      .patch(`/admin/employees/${employeeId}`)
      .set("Authorization", `Bearer ${masterToken}`)
      .send({
        name: "Updated Employee Name",
        status: "ACTIVE",
      })
      .expect(200);
  });

  it("GET /admin/companies returns email/phone", async () => {
    const res = await request(app.getHttpServer())
      .get("/admin/companies")
      .set("Authorization", `Bearer ${masterToken}`)
      .expect(200);

    expect(res.body.data).toBeTruthy();
    expect(res.body.data.length).toBeGreaterThan(0);
    
    // Check if first company has email/phone (from seed)
    const firstCompany = res.body.data[0];
    expect(firstCompany.email).toBeTruthy();
    expect(firstCompany.phone).toBeTruthy();
  });

  it("PATCH /admin/companies/:id updates email/phone and creates audit log", async () => {
    const listRes = await request(app.getHttpServer())
      .get("/admin/companies")
      .set("Authorization", `Bearer ${masterToken}`)
      .expect(200);

    const companyId = listRes.body.data[0].id;
    const newEmail = "newemail@test.com";
    const newPhone = "+55 11 98888-9999";

    // Update company
    await request(app.getHttpServer())
      .patch(`/admin/companies/${companyId}`)
      .set("Authorization", `Bearer ${masterToken}`)
      .send({
        email: newEmail,
        phone: newPhone,
      })
      .expect(200);

    // Verify audit log was created
    const auditRes = await request(app.getHttpServer())
      .get("/admin/audit")
      .set("Authorization", `Bearer ${masterToken}`)
      .expect(200);

    const companyAudit = auditRes.body.data.find(
      (log: any) => log.entityId === companyId && log.action === "company.update"
    );
    
    expect(companyAudit).toBeTruthy();
    expect(companyAudit.entityType).toBe("company");
  });

  it("critical field blocked without unlock", async () => {
    const list = await request(app.getHttpServer())
      .get("/admin/companies")
      .set("Authorization", `Bearer ${masterToken}`)
      .expect(200);

    const companyId = list.body.data[0].id;

    await request(app.getHttpServer())
      .patch(`/admin/companies/${companyId}`)
      .set("Authorization", `Bearer ${masterToken}`)
      .send({ plan: "ENTERPRISE" })
      .expect(403);
  });
});
