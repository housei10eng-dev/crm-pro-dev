import { Body, Controller, Get, Post, Patch, Param, Request, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AuthGuard } from "@nestjs/passport";
import { RolesGuard } from "../../common/guards/roles.guard";
import { MasterOnlyGuard } from "../../common/guards/master-only.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { RoleName, CustomEntityType } from "@prisma/client";
import { EmployeesService } from "./employees.service";
import { CreateEmployeeDto } from "./dto/create-employee.dto";
import { UpdateEmployeeDto } from "./dto/update-employee.dto";
import { CustomFieldsService } from "../custom-fields/custom-fields.service";
import { SaveCustomFieldValuesDto } from "../custom-fields/dtos";

@ApiTags("admin/employees")
@ApiBearerAuth()
@UseGuards(AuthGuard("jwt"), RolesGuard, MasterOnlyGuard)
@Controller("admin/employees")
export class EmployeesController {
  constructor(
    private svc: EmployeesService,
    private customFieldsService: CustomFieldsService,
  ) {}

  @Roles(RoleName.MASTER_ADMIN)
  @Get()
  async list(@Request() req: any) {
    const employees = await this.svc.list(req.user);
    return employees;
  }

  @Roles(RoleName.MASTER_ADMIN)
  @Post()
  async create(@Request() req: any, @Body() dto: CreateEmployeeDto) {
    return this.svc.create(req.user, dto, req);
  }

  @Roles(RoleName.MASTER_ADMIN)
  @Patch(':id')
  async update(@Request() req: any, @Param('id') employeeId: string, @Body() dto: UpdateEmployeeDto) {
    return this.svc.update(req.user, employeeId, dto, req);
  }

  @Roles(RoleName.MASTER_ADMIN)
  @Get(':id/custom-fields')
  async getCustomFields(
    @Request() req: any,
    @Param('id') employeeId: string,
  ) {
    return this.customFieldsService.getCustomFieldValues(
      req.user.tenantId,
      CustomEntityType.employee,
      employeeId,
    );
  }

  @Roles(RoleName.MASTER_ADMIN)
  @Patch(':id/custom-fields')
  async saveCustomFields(
    @Request() req: any,
    @Param('id') employeeId: string,
    @Body() dto: SaveCustomFieldValuesDto,
  ) {
    return this.customFieldsService.saveCustomFieldValues(
      req.user.tenantId,
      CustomEntityType.employee,
      employeeId,
      dto.values,
    );
  }
}
