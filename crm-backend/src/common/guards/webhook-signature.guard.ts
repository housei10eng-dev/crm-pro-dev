import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { WebhookValidator } from '../utils/webhook-validator';

@Injectable()
export class WebhookSignatureGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const signature = request.headers['x-webhook-signature'];
    const timestamp = request.headers['x-webhook-timestamp'];
    const webhookSecret = process.env.WEBHOOK_SECRET;

    if (!signature || !timestamp || !webhookSecret) {
      console.warn('Webhook rejected: missing signature, timestamp, or secret');
      throw new UnauthorizedException('Missing webhook signature or timestamp');
    }

    if (!WebhookValidator.verifyTimestamp(timestamp)) {
      console.warn({ timestamp }, 'Webhook rejected: timestamp too old (> 5 min)');
      throw new UnauthorizedException('Webhook timestamp expired (> 5 minutes)');
    }

    const rawBody = WebhookValidator.getRawBody(request);
    if (!WebhookValidator.verifySignature(rawBody, signature, webhookSecret)) {
      console.warn({ signature, timestamp }, 'Webhook rejected: invalid signature');
      throw new UnauthorizedException('Invalid webhook signature');
    }

    console.debug({ timestamp }, 'Webhook signature verified');
    return true;
  }
}
