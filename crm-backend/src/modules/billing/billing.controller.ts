import { Body, Controller, Post, Headers, UseGuards, Request, UnauthorizedException } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { PrismaService } from "../../prisma/prisma.service";
import { WebhookSignatureGuard } from "../../common/guards/webhook-signature.guard";
import { createHash } from "crypto";
import { Throttle } from "@nestjs/throttler";

/**
 * Webhook receiver with HMAC-SHA256 signature verification
 * Uses idempotency via unique eventId
 * Requires: x-webhook-signature, x-webhook-timestamp, x-tenant-id, x-event-id
 */
@ApiTags("billing")
@Controller("billing")
export class BillingController {
  constructor(private prisma: PrismaService) {}

  @UseGuards(WebhookSignatureGuard)
  @Throttle({ default: { limit: 300, ttl: 60000 } })
  @Post("webhook")
  async webhook(
    @Body() body: any,
    @Headers("x-event-id") eventId?: string,
    @Headers("x-tenant-id") tenantId?: string,
    @Headers("x-webhook-timestamp") timestamp?: string,
    @Request() req?: any,
  ) {
    if (!eventId || !tenantId) {
      console.warn({ eventId, tenantId }, "Webhook rejected: missing eventId or tenantId");
      return { ok: false, error: "missing headers x-event-id and x-tenant-id" };
    }

    const existing = await this.prisma.billingEvent.findUnique({ where: { eventId } });
    if (existing) {
      console.debug({ eventId, tenantId }, "Webhook deduped (already processed)");
      return { ok: true, deduped: true };
    }

    const rawBody = req?.rawBody && Buffer.isBuffer(req.rawBody) ? req.rawBody.toString("utf8") : null;
    if (!rawBody) {
      console.warn({ eventId, tenantId }, "Webhook rejected: missing rawBody in controller");
      throw new UnauthorizedException("Missing webhook raw body");
    }

    const signedPayload = `${timestamp}.${rawBody}`;
    const signatureHash = createHash("sha256").update(signedPayload).digest("hex");
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const replay = await this.prisma.billingEvent.findFirst({
      where: {
        tenantId,
        signatureHash,
        receivedAt: { gte: fiveMinutesAgo },
      },
    });
    if (replay) {
      console.warn({ eventId, tenantId }, "Webhook replay detected (signature hash)");
      return { ok: true, deduped: true };
    }

    await this.prisma.billingEvent.create({
      data: { tenantId, eventId, type: String(body?.type ?? "unknown"), payload: body, signatureHash },
    });

    // Process payment metadata if present (LGPD-safe)
    await this.processPaymentMetadata(tenantId, body);

    console.info({ eventId, tenantId, type: body?.type, timestamp }, "Webhook processed");
    return { ok: true };
  }

  private async processPaymentMetadata(tenantId: string, payload: any) {
    // Extract payment metadata from webhook payload
    const paymentData = payload?.data?.payment || payload?.payment;
    if (!paymentData) return;

    const invoiceId = paymentData?.invoiceId || payload?.invoiceId;
    if (!invoiceId) return;

    // Find or create payment record
    const existingPayment = await this.prisma.billingPayment.findFirst({
      where: {
        tenantId,
        invoiceId,
        providerChargeId: paymentData?.chargeId || paymentData?.id,
      },
    });

    if (existingPayment) return; // Already processed

    // Extract LGPD-safe card metadata (never store full PAN/CVV)
    const cardMetadata = paymentData?.card || paymentData?.paymentMethod?.card;
    
    await this.prisma.billingPayment.create({
      data: {
        tenantId,
        invoiceId,
        amount: paymentData?.amount || 0,
        method: this.parsePaymentMethod(paymentData?.method),
        status: this.parsePaymentStatus(paymentData?.status),
        attemptedAt: paymentData?.attemptedAt ? new Date(paymentData.attemptedAt) : new Date(),
        paidAt: paymentData?.paidAt ? new Date(paymentData.paidAt) : null,
        gatewayChargeId: paymentData?.chargeId || paymentData?.id || null,
        cardLast4: cardMetadata?.last4 || null,
        cardBrand: cardMetadata?.brand || null,
        cardHolderName: cardMetadata?.holderName || null,
        providerPaymentMethodId: paymentData?.paymentMethodId || cardMetadata?.id || null,
        providerChargeId: paymentData?.chargeId || paymentData?.id || null,
        providerTransactionId: paymentData?.transactionId || null,
        authorizationCode: paymentData?.authorizationCode || null,
      },
    }).catch(err => {
      console.error({ tenantId, invoiceId, error: err.message }, "Failed to create billing payment");
    });
  }

  private parsePaymentMethod(method: string): any {
    const map: Record<string, string> = {
      'card': 'CARD',
      'credit_card': 'CARD',
      'pix': 'PIX',
      'boleto': 'BOLETO',
      'bank_transfer': 'TRANSFER',
    };
    return map[method?.toLowerCase()] || 'OTHER';
  }

  private parsePaymentStatus(status: string): any {
    const map: Record<string, string> = {
      'paid': 'PAID',
      'succeeded': 'PAID',
      'open': 'OPEN',
      'pending': 'OPEN',
      'failed': 'FAILED',
      'canceled': 'CANCELED',
      'cancelled': 'CANCELED',
      'refunded': 'REFUNDED',
      'chargeback': 'CHARGEBACK',
    };
    return map[status?.toLowerCase()] || 'OPEN';
  }
}


