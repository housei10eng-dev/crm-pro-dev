import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import * as request from "supertest";
import { AppModule } from "../src/app.module";

describe("E2E", () => {
  let app: INestApplication;
  let masterToken: string;
  let tenantToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
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
