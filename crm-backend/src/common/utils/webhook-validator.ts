import { createHmac } from 'crypto';

export class WebhookValidator {
  static verifySignature(payload: string, signature: string, secret: string): boolean {
    const hash = createHmac('sha256', secret).update(payload).digest('hex');
    return hash === signature;
  }

  static verifyTimestamp(timestamp: string, maxAgeSeconds = 300): boolean {
    const requestTime = parseInt(timestamp, 10);
    const now = Math.floor(Date.now() / 1000);
    return Math.abs(now - requestTime) <= maxAgeSeconds;
  }

  static getRawBody(request: any): string {
    return request.rawBody || JSON.stringify(request.body);
  }
}
