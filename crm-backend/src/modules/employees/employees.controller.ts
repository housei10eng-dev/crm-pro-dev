import { Body, Controller, Get, Post, Request, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AuthGuard } from "@nestjs/passport";
import { RolesGuard } from "../../common/guards/roles.guard";
import { MasterOnlyGuard } from "../../common/guards/master-only.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { RoleName } from "@prisma/client";
import { EmployeesService } from "./employees.service";
import { CreateEmployeeDto } from "./dto/create-employee.dto";

@ApiTags("admin/employees")
@ApiBearerAuth()
@UseGuards(AuthGuard("jwt"), RolesGuard, MasterOnlyGuard)
@Controller("admin/employees")
export class EmployeesController {
  constructor(private svc: EmployeesService) {}

  @Roles(RoleName.MASTER_ADMIN)
  @Get()
  async list(@Request() req: any) {
    return this.svc.list(req.user);
  }

  @Roles(RoleName.MASTER_ADMIN)
  @Post()
  async create(@Request() req: any, @Body() dto: CreateEmployeeDto) {
    return this.svc.create(req.user, dto, req);
  }
}
