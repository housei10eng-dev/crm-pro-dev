import { Body, Controller, Post, Headers, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { PrismaService } from "../../prisma/prisma.service";
import { WebhookSignatureGuard } from "../../common/guards/webhook-signature.guard";

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
  @Post("webhook")
  async webhook(
    @Body() body: any,
    @Headers("x-event-id") eventId?: string,
    @Headers("x-tenant-id") tenantId?: string,
    @Headers("x-webhook-timestamp") timestamp?: string,
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

    await this.prisma.billingEvent.create({
      data: { tenantId, eventId, type: String(body?.type ?? "unknown"), payload: body },
    });

    console.info({ eventId, tenantId, type: body?.type, timestamp }, "Webhook processed");
    return { ok: true };
  }
}


