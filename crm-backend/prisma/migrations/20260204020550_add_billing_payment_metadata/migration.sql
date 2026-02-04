-- AlterTable
ALTER TABLE "BillingPayment" ADD COLUMN     "authorizationCode" VARCHAR(100),
ADD COLUMN     "cardBrand" VARCHAR(50),
ADD COLUMN     "cardHolderName" VARCHAR(200),
ADD COLUMN     "cardLast4" VARCHAR(4),
ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "providerChargeId" VARCHAR(255),
ADD COLUMN     "providerPaymentMethodId" VARCHAR(255),
ADD COLUMN     "providerTransactionId" VARCHAR(255);
