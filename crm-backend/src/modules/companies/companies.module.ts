import { Module } from "@nestjs/common";
import { CompaniesController } from "./companies.controller";
import { CompaniesService } from "./companies.service";
import { AuditModule } from "../audit/audit.module";
import { CustomFieldsModule } from "../custom-fields/custom-fields.module";

@Module({
  imports: [AuditModule, CustomFieldsModule],
  controllers: [CompaniesController],
  providers: [CompaniesService],
})
export class CompaniesModule {}
