# Quick Reference: Backend Security Features

## 🚀 Getting Started

### Install & Run
```bash
cd crm-backend
npm install
npm run prisma:migrate
npm run db:seed
npm start
```

Server runs on `http://localhost:3001`

---

## 🔐 Security Features at a Glance

### 1. Webhook Integration

**Generate Signature:**
```typescript
import crypto from 'crypto';

const payload = JSON.stringify({ type: 'charge.succeeded' });
const secret = process.env.WEBHOOK_SECRET;
const timestamp = Math.floor(Date.now() / 1000).toString();
const eventId = 'evt_' + crypto.randomUUID();

const signature = crypto
  .createHmac('sha256', secret)
  .update(payload)
  .digest('hex');
```

**Send Webhook:**
```bash
curl -X POST http://localhost:3001/billing/webhook \
  -H "X-Event-ID: evt_123" \
  -H "X-Tenant-ID: 00000000-0000-0000-0000-000000000001" \
  -H "X-Webhook-Timestamp: 1706900000" \
  -H "X-Webhook-Signature: abc123def456..." \
  -H "Content-Type: application/json" \
  -d '{"type": "charge.succeeded"}'
```

**Response (Success):**
```json
{
  "ok": true,
  "deduped": false
}
```

**Response (Idempotent):**
```json
{
  "ok": true,
  "deduped": true
}
```

### 2. Rate Limiting

**Global Limit:** 300 req/min per tenant
- Returns 429 Too Many Requests when exceeded

**Specific Limits:**
- `POST /auth/login` → 10 req/min
- `POST /companies/:id/unlock-critical` → 5 req/min

### 3. Structured Logging

**Every request logs:**
```json
{
  "timestamp": "2026-02-03T08:18:36.123Z",
  "correlationId": "uuid-here",
  "method": "POST",
  "url": "/auth/login",
  "statusCode": 200,
  "duration": "45ms",
  "userId": "user-id",
  "tenantId": "tenant-id",
  "roles": ["MASTER_ADMIN"]
}
```

**Custom Correlation ID:**
```bash
curl http://localhost:3001/companies \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Correlation-ID: my-custom-id"
```

### 4. Critical Field Protection

**Protected Fields:**
- `plan` - Subscription plan
- `cycle` - Billing cycle
- `paymentMethod` - Payment method
- `paymentStatus` - Payment status

**Unlock Process:**
```bash
# 1. Unlock with password
curl -X POST http://localhost:3001/companies/{id}/unlock-critical \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Tenant-ID: tenant-id" \
  -H "Content-Type: application/json" \
  -d '{"password": "user_password"}'

# Response:
# {
#   "sessionId": "session-uuid",
#   "expiresAt": "2026-02-03T08:28:36Z"
# }

# 2. Edit critical fields (within 10 minutes)
curl -X PATCH http://localhost:3001/companies/{id} \
  -H "Authorization: Bearer $TOKEN" \
  -H "X-Tenant-ID: tenant-id" \
  -H "Content-Type: application/json" \
  -d '{"plan": "ENTERPRISE"}'
```

---

## 🧪 Testing

### Run All Tests
```bash
npm run test:e2e
```

### Run Specific Tests
```bash
npm run test:e2e -- critical-security.e2e-spec.ts
npm run test:e2e -- app.e2e-spec.ts
```

### Expected Results
```
✅ Test Suites: 2 passed
✅ Tests: 11 passed
✅ Time: ~4.3s
```

---

## 🔧 Environment Configuration

**Required Variables:**
```env
# Database
DATABASE_URL=postgresql://...

# Security
WEBHOOK_SECRET=your_webhook_secret_here

# Logging
LOG_LEVEL=info  # debug|info|warn|error

# Server
NODE_ENV=production
PORT=3001
```

---

## 📊 Monitoring & Debugging

### Check Logs
```bash
# View real-time logs
npm run dev

# Look for these security events:
# - "Webhook rejected: missing signature, timestamp, or secret"
# - "Webhook signature verified"
# - "Webhook rejected: invalid signature"
# - "Webhook rejected: timestamp too old (> 5 min)"
# - "Webhook deduped (already processed)"
```

### Debug Rate Limiting
```bash
# Send 11 login requests to trigger 429
for i in {1..11}; do
  curl -X POST http://localhost:3001/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@test.com","password":"wrong"}'
done

# 11th request returns HTTP 429
```

### Webhook Signature Verification
```typescript
// Test signature verification
const crypto = require('crypto');
const payload = '{"type":"charge.succeeded"}';
const secret = 'test_webhook_secret';

const sig = crypto
  .createHmac('sha256', secret)
  .update(payload)
  .digest('hex');

console.log('Signature:', sig);
// Use this signature in X-Webhook-Signature header
```

---

## 🐛 Common Issues & Solutions

### Issue: Webhook rejected with 401
**Cause:** Missing or invalid signature
**Solution:**
- Verify WEBHOOK_SECRET matches
- Check timestamp is recent (within 5 min)
- Ensure payload is JSON, not form-encoded

### Issue: Rate limit returns 429 too quickly
**Cause:** Global or endpoint-specific limit exceeded
**Solution:**
- Wait 1 minute for limit to reset
- Check X-Tenant-ID header (per-tenant tracking)

### Issue: Critical field edit blocked
**Cause:** No valid unlock session
**Solution:**
- Call unlock-critical endpoint first
- Verify sessionId is returned
- Edit within 10-minute window

### Issue: Logs not showing correlation ID
**Cause:** Interceptor not running
**Solution:**
- Verify LoggingInterceptor in main.ts
- Check request is going through app.module
- Look for correlation ID in response headers

---

## 📝 API Endpoints

| Method | Endpoint | Rate Limit | Security |
|--------|----------|-----------|----------|
| POST | /auth/login | 10/min | Rate limited |
| GET | /companies | 300/min | JWT required |
| PATCH | /companies/:id | 300/min | JWT + Roles |
| POST | /companies/:id/unlock-critical | 5/min | JWT + Roles |
| POST | /billing/webhook | 300/min | HMAC signature |

---

## 🔐 Security Best Practices

### For Webhook Providers
1. ✅ Always verify signature before processing
2. ✅ Check timestamp is within tolerance
3. ✅ Use event deduplication (eventId)
4. ✅ Rotate webhook secret periodically
5. ✅ Log all webhook interactions

### For API Consumers
1. ✅ Use JWT tokens from /auth/login
2. ✅ Include X-Tenant-ID in multi-tenant requests
3. ✅ Respect rate limits (retry with backoff)
4. ✅ Include X-Correlation-ID for debugging
5. ✅ Handle 401/403 gracefully

### For Operations
1. ✅ Monitor webhook signature failures
2. ✅ Alert on rate limit breaches (429)
3. ✅ Track correlation IDs in logs
4. ✅ Audit critical field changes
5. ✅ Rotate webhook secrets quarterly

---

## 📞 Support

### Test Credentials
```
Email: master@demo.com
Password: Admin123!
```

### Webhook Testing
```bash
# Use test_webhook_secret for development
WEBHOOK_SECRET=test_webhook_secret
```

### Debug Mode
```bash
npm run dev  # Watch mode with detailed logs
```

---

**Session 8 Complete** | 🟢 Ready for Staging
