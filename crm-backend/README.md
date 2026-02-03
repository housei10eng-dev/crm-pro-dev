# CRM Backend (NestJS + Prisma)

## Requisitos
- Node 20+
- Docker + Docker Compose

## Setup

```bash
cp .env.example .env
npm i
docker compose up -d
npm run prisma:migrate
npm run db:seed
npm run dev
```

## Variáveis de Ambiente Críticas

### Obrigatórias
- `JWT_SECRET`: Chave para assinar JWT tokens (MUDE em produção)
- `WEBHOOK_SECRET`: Chave compartilhada para validar webhooks (MUDE em produção)
- `DATABASE_URL`: Connection string PostgreSQL (default: localhost:5433)

### Opcionais
- `PORT`: Porta da API (default: 3001)
- `NODE_ENV`: development|production (default: development)
- `LOG_LEVEL`: debug|info|warn|error (default: debug)

## Segurança - Hardening Aplicado

### 1. Logs Estruturados (Pino + JSON)
- Todos os logs em formato JSON
- correlation_id por request
- Captura: auth, unlock, webhook, errors
- Saída: stdout em dev, arquivo em produção

### 2. Rate Limiting
- Global: 300 req/min por cliente
- `/auth/login`: 10 req/min (brute force protection)
- `/companies/:id/unlock-critical`: 5 req/min (critical ops)
- Response: 429 Too Many Requests

### 3. Webhook Security
- HMAC-SHA256 signature verification
- Timestamp validation (rejeita > 5 min)
- Idempotency via eventId (deduplication)
- Headers obrigatórios:
  - `x-webhook-signature`: HMAC-SHA256 hex digest
  - `x-webhook-timestamp`: Unix timestamp (segundos)
  - `x-event-id`: UUID único por evento

Exemplo assinatura:
```javascript
const crypto = require('crypto');
const payload = JSON.stringify(body);
const signature = crypto
  .createHmac('sha256', process.env.WEBHOOK_SECRET)
  .update(payload)
  .digest('hex');
```

### 4. Critical Fields
- `plan`, `cycle`, `paymentMethod`, `paymentStatus`
- Requerem unlock via re-autenticação
- Session timeout: 10 minutos
- Rate limited: 5 req/min

### 5. Observabilidade
- correlation_id: Rastreie requests ponta-a-ponta
- Headers: `X-Correlation-ID` (request) → `x-correlation-id` (response)
- User context: userId, tenantId, roles em logs
- Performance: latency por request

## Credenciais seed
- email: master@demo.com
- senha: Master123
- email: finance@demo.com
- senha: Finance123
- email: support@demo.com
- senha: Support123

## Swagger
- http://localhost:3001/api

## Testes

### E2E (Critical Security)
```bash
npm run test:e2e
```

Cobre:
- Rate limiting em login (10 req/min)
- Rate limiting em unlock (5 req/min)
- Critical field locking
- Critical field unlock (10 min expiry)
- Webhook signature verification
- Webhook timestamp validation
- Webhook idempotency
- Correlation ID

### Desenvolvimento
```bash
npm test       # Jest (unit tests - pending)
npm run lint   # ESLint
npm run format # Prettier
```

