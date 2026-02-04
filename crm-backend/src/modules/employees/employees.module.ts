import { Module } from "@nestjs/common";
import { EmployeesController } from "./employees.controller";
import { EmployeesService } from "./employees.service";
import { AuditModule } from "../audit/audit.module";
import { CustomFieldsModule } from "../custom-fields/custom-fields.module";

@Module({
  imports: [AuditModule, CustomFieldsModule],
  controllers: [EmployeesController],
  providers: [EmployeesService],
})
export class EmployeesModule {}
