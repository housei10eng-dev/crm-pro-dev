import { createHmac, timingSafeEqual } from 'crypto';

export class WebhookValidator {
  static verifySignature(payload: string, signature: string, secret: string): boolean {
    const hash = createHmac('sha256', secret).update(payload).digest('hex');

    const hashBuffer = Buffer.from(hash, 'hex');
    const sigBuffer = Buffer.from(signature, 'hex');
    if (hashBuffer.length !== sigBuffer.length) return false;

    return timingSafeEqual(hashBuffer, sigBuffer);
  }

  static verifyTimestamp(timestamp: string, maxAgeSeconds = 300): boolean {
    const requestTime = Number(timestamp);
    if (!Number.isFinite(requestTime)) return false;

    const now = Math.floor(Date.now() / 1000);
    return Math.abs(now - requestTime) <= maxAgeSeconds;
  }

  static getRawBody(request: any): string {
    const raw = request.rawBody ?? request.body;
    if (Buffer.isBuffer(raw)) return raw.toString('utf8');
    if (typeof raw === 'string') return raw;
    return JSON.stringify(raw ?? {});
  }
}
