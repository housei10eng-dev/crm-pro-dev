/*
  Warnings:

  - The `plan` column on the `Company` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "CompanyPlan" AS ENUM ('FREE', 'PRO', 'ENTERPRISE');

-- AlterTable
ALTER TABLE "Company" DROP COLUMN "plan",
ADD COLUMN     "plan" "CompanyPlan" NOT NULL DEFAULT 'FREE';
