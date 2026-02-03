import { Module } from "@nestjs/common";
import { BillingController } from "./billing.controller";
import { WebhookSignatureGuard } from "../../common/guards/webhook-signature.guard";

@Module({
  controllers: [BillingController],
  providers: [WebhookSignatureGuard],
})
export class BillingModule {}
