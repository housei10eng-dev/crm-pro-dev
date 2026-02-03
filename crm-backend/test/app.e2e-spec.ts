import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import * as request from "supertest";
import { AppModule } from "../src/app.module";

describe("E2E", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("login works", async () => {
    const res = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "master@demo.com", password: "Admin123!" })
      .expect(201);
    expect(res.body.accessToken).toBeTruthy();
  });

  it("companies requires auth", async () => {
    await request(app.getHttpServer()).get("/companies").expect(401);
  });

  it("health endpoint responds", async () => {
    const res = await request(app.getHttpServer()).get("/health");
    expect([200, 503]).toContain(res.status);
    expect(res.body.status).toBeTruthy();
  });

  it("critical field blocked without unlock", async () => {
    const login = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: "master@demo.com", password: "Admin123!" });
    const token = login.body.accessToken;

    const list = await request(app.getHttpServer())
      .get("/companies")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    const companyId = list.body.data[0].id;

    await request(app.getHttpServer())
      .patch(`/companies/${companyId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ plan: "ENTERPRISE" })
      .expect(403);
  });
});
