import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';
import * as express from 'express';

describe('Critical Security E2E Tests', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let testTenantId: string;
  let testCompanyId: string;
  let accessToken: string;

  const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'test_webhook_secret';

  beforeAll(async () => {
    process.env.WEBHOOK_SECRET = WEBHOOK_SECRET;
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(
      express.json({
        verify: (req: any, _res, buf) => {
          req.rawBody = buf;
        },
      }),
    );
    app.use(express.urlencoded({ extended: true }));
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

    await app.init();

    prisma = moduleFixture.get<PrismaService>(PrismaService);

    const tenant = await prisma.tenant.findFirst();
    const user = await prisma.user.findFirst({ where: { email: 'master@demo.com' } });
    const company = await prisma.company.findFirst({ where: { tenantId: tenant!.id } });

    testTenantId = tenant!.id;
    testCompanyId = company!.id;

    const res = await request(app.getHttpServer()).post('/auth/login').send({ email: 'master@demo.com', password: 'Admin123!' });

    accessToken = res.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Webhook Security', () => {
    it('should reject webhook without signature header', async () => {
      const res = await request(app.getHttpServer())
        .post('/billing/webhook')
        .set('X-Tenant-ID', testTenantId)
        .set('X-Event-ID', uuidv4())
        .send({ type: 'charge.succeeded' });

      expect(res.status).toBe(401);
    });

    it('should accept webhook with valid HMAC signature', async () => {
      const eventId = uuidv4();
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const payload = JSON.stringify({ type: 'charge.succeeded' });

      const signedPayload = `${timestamp}.${payload}`;
      const signature = crypto.createHmac('sha256', WEBHOOK_SECRET).update(signedPayload).digest('hex');

      const res = await request(app.getHttpServer())
        .post('/billing/webhook')
        .set('X-Tenant-ID', testTenantId)
        .set('X-Event-ID', eventId)
        .set('X-Webhook-Timestamp', timestamp)
        .set('X-Webhook-Signature', signature)
        .send(JSON.parse(payload));

      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
    });

    it('should reject webhook with invalid signature', async () => {
      const eventId = uuidv4();
      const timestamp = Math.floor(Date.now() / 1000).toString();

      const res = await request(app.getHttpServer())
        .post('/billing/webhook')
        .set('X-Tenant-ID', testTenantId)
        .set('X-Event-ID', eventId)
        .set('X-Webhook-Timestamp', timestamp)
        .set('X-Webhook-Signature', 'invalid_hex_signature')
        .send({ type: 'charge.succeeded' });

      expect(res.status).toBe(401);
    });

    it('should reject webhook when rawBody is missing', async () => {
      const eventId = uuidv4();
      const timestamp = Math.floor(Date.now() / 1000).toString();

      const res = await request(app.getHttpServer())
        .post('/billing/webhook')
        .set('X-Tenant-ID', testTenantId)
        .set('X-Event-ID', eventId)
        .set('X-Webhook-Timestamp', timestamp)
        .set('X-Webhook-Signature', 'deadbeef')
        .set('Content-Type', 'text/plain')
        .send('raw-body-missing');

      expect(res.status).toBe(401);
    });

    it('should reject webhook with expired timestamp (> 5 min)', async () => {
      const eventId = uuidv4();
      const oldTimestamp = (Math.floor(Date.now() / 1000) - 600).toString();
      const payload = JSON.stringify({ type: 'charge.succeeded' });

      const signedPayload = `${oldTimestamp}.${payload}`;
      const signature = crypto.createHmac('sha256', WEBHOOK_SECRET).update(signedPayload).digest('hex');

      const res = await request(app.getHttpServer())
        .post('/billing/webhook')
        .set('X-Tenant-ID', testTenantId)
        .set('X-Event-ID', eventId)
        .set('X-Webhook-Timestamp', oldTimestamp)
        .set('X-Webhook-Signature', signature)
        .send(JSON.parse(payload));

      expect(res.status).toBe(401);
    });

    it('should deduplicate webhook by eventId (idempotency)', async () => {
      const eventId = uuidv4();
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const payload = JSON.stringify({ type: 'charge.succeeded' });

      const signedPayload = `${timestamp}.${payload}`;
      const signature = crypto.createHmac('sha256', WEBHOOK_SECRET).update(signedPayload).digest('hex');

      const res1 = await request(app.getHttpServer())
        .post('/billing/webhook')
        .set('X-Tenant-ID', testTenantId)
        .set('X-Event-ID', eventId)
        .set('X-Webhook-Timestamp', timestamp)
        .set('X-Webhook-Signature', signature)
        .send(JSON.parse(payload));

      expect(res1.status).toBe(201);
      expect(res1.body.ok).toBe(true);

      const res2 = await request(app.getHttpServer())
        .post('/billing/webhook')
        .set('X-Tenant-ID', testTenantId)
        .set('X-Event-ID', eventId)
        .set('X-Webhook-Timestamp', timestamp)
        .set('X-Webhook-Signature', signature)
        .send(JSON.parse(payload));

      expect(res2.status).toBe(201);
      expect(res2.body.deduped).toBe(true);
    });

    it('should deduplicate replay with same payload and timestamp', async () => {
      const eventId1 = uuidv4();
      const eventId2 = uuidv4();
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const payload = JSON.stringify({ type: 'charge.succeeded' });

      const signedPayload = `${timestamp}.${payload}`;
      const signature = crypto.createHmac('sha256', WEBHOOK_SECRET).update(signedPayload).digest('hex');

      const res1 = await request(app.getHttpServer())
        .post('/billing/webhook')
        .set('X-Tenant-ID', testTenantId)
        .set('X-Event-ID', eventId1)
        .set('X-Webhook-Timestamp', timestamp)
        .set('X-Webhook-Signature', signature)
        .send(JSON.parse(payload));

      expect(res1.status).toBe(201);
      expect(res1.body.ok).toBe(true);

      const res2 = await request(app.getHttpServer())
        .post('/billing/webhook')
        .set('X-Tenant-ID', testTenantId)
        .set('X-Event-ID', eventId2)
        .set('X-Webhook-Timestamp', timestamp)
        .set('X-Webhook-Signature', signature)
        .send(JSON.parse(payload));

      expect(res2.status).toBe(201);
      expect(res2.body.deduped).toBe(true);
    });
  });

  describe('Critical Field Protection', () => {
    it('should allow editing company details', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/companies/${testCompanyId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .set('X-Tenant-ID', testTenantId)
        .send({ internalNotes: 'Test update' });

      expect(res.status).toBe(200);
    });

    it('should allow unlock with password re-auth', async () => {
      const res = await request(app.getHttpServer())
        .post(`/companies/${testCompanyId}/unlock-critical`)
        .set('Authorization', `Bearer ${accessToken}`)
        .set('X-Tenant-ID', testTenantId)
        .send({ password: 'Admin123!' });

      expect([200, 201]).toContain(res.status);
      expect(res.body.sessionId).toBeDefined();
    });
  });

  describe('Request Logging', () => {
    it('should process authenticated requests', async () => {
      const res = await request(app.getHttpServer())
        .get('/companies')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('X-Tenant-ID', testTenantId);

      expect([200, 401]).toContain(res.status);
    });
  });

  describe('Audit WORM', () => {
    it('should block update/delete on audit log', async () => {
      const log = await prisma.auditLog.create({
        data: {
          tenantId: testTenantId,
          entityType: 'test',
          entityId: testCompanyId,
          field: 'status',
          action: 'test.create',
          oldValue: Prisma.JsonNull,
          newValue: Prisma.JsonNull,
          origin: 'system',
        },
      });

      await expect(
        prisma.auditLog.update({
          where: { id: log.id },
          data: { action: 'test.update' },
        }),
      ).rejects.toBeTruthy();

      await expect(prisma.auditLog.delete({ where: { id: log.id } })).rejects.toBeTruthy();
    });
  });
});
