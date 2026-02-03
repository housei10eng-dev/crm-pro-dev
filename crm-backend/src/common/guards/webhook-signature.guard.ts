import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { WebhookValidator } from '../utils/webhook-validator';

@Injectable()
export class WebhookSignatureGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const signatureHeader = request.headers['x-webhook-signature'];
    const timestampHeader = request.headers['x-webhook-timestamp'];
    const webhookSecret = process.env.WEBHOOK_SECRET;

    const signature = typeof signatureHeader === 'string' ? signatureHeader : String(signatureHeader ?? '');
    const timestamp = typeof timestampHeader === 'string' ? timestampHeader : String(timestampHeader ?? '');

    if (!signature || !timestamp || !webhookSecret) {
      console.warn('Webhook rejected: missing signature, timestamp, or secret');
      throw new UnauthorizedException('Missing webhook signature or timestamp');
    }

    if (!/^[0-9a-fA-F]+$/.test(signature)) {
      console.warn({ signature }, 'Webhook rejected: signature not hex');
      throw new UnauthorizedException('Invalid webhook signature');
    }

    if (!WebhookValidator.verifyTimestamp(timestamp)) {
      console.warn({ timestamp }, 'Webhook rejected: timestamp too old (> 5 min)');
      throw new UnauthorizedException('Webhook timestamp expired (> 5 minutes)');
    }

    if (!request.rawBody || !Buffer.isBuffer(request.rawBody)) {
      console.warn('Webhook rejected: missing rawBody');
      throw new UnauthorizedException('Missing webhook raw body');
    }

    const rawBody = request.rawBody.toString('utf8');
    const signedPayload = `${timestamp}.${rawBody}`;
    if (!WebhookValidator.verifySignature(signedPayload, signature, webhookSecret)) {
      console.warn({ signature, timestamp }, 'Webhook rejected: invalid signature');
      throw new UnauthorizedException('Invalid webhook signature');
    }

    console.debug({ timestamp }, 'Webhook signature verified');
    return true;
  }
}
