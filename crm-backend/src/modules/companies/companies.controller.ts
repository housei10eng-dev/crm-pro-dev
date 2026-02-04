import { Body, Controller, Get, Param, Patch, Post, Query, Request, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AuthGuard } from "@nestjs/passport";
import { Throttle } from "@nestjs/throttler";
import { CompaniesService } from "./companies.service";
import { CreateCompanyDto } from "./dto/create-company.dto";
import { UpdateCompanyDto } from "./dto/update-company.dto";
import { UnlockCriticalDto } from "./dto/unlock-critical.dto";
import { RolesGuard } from "../../common/guards/roles.guard";
import { MasterOnlyGuard } from "../../common/guards/master-only.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { RoleName, CustomEntityType } from "@prisma/client";
import { CustomFieldsService } from "../custom-fields/custom-fields.service";
import { SaveCustomFieldValuesDto } from "../custom-fields/dtos";

@ApiTags("admin/companies")
@ApiBearerAuth()
@UseGuards(AuthGuard("jwt"), RolesGuard, MasterOnlyGuard)
@Controller("admin/companies")
export class CompaniesController {
  constructor(
    private svc: CompaniesService,
    private customFieldsService: CustomFieldsService,
  ) {}

  @Get()
  async list(
    @Request() req: any,
    @Query("limit") limit?: string,
    @Query("cursor") cursor?: string,
    @Query("status") status?: string,
    @Query("segment") segment?: string,
    @Query("order") order?: string
  ) {
    return this.svc.list(req.user, { limit: limit ? parseInt(limit, 10) : 20, cursor, status, segment, order });
  }

  @Roles(RoleName.MASTER_ADMIN, RoleName.MASTER_SUPPORT, RoleName.MASTER_FINANCE)
  @Post()
  async create(@Request() req: any, @Body() dto: CreateCompanyDto) {
    return this.svc.create(req.user, dto, req);
  }

  @Get(":id")
  async detail(@Request() req: any, @Param("id") id: string) {
    return this.svc.detail(req.user, id);
  }

  @Roles(RoleName.MASTER_ADMIN, RoleName.MASTER_SUPPORT)
  @Patch(":id")
  async update(@Request() req: any, @Param("id") id: string, @Body() dto: UpdateCompanyDto) {
    return this.svc.update(req.user, id, dto, req);
  }

  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 req/min - critical operation
  @Roles(RoleName.MASTER_ADMIN)
  @Post(":id/unlock-critical")
  async unlock(@Request() req: any, @Param("id") id: string, @Body() dto: UnlockCriticalDto) {
    return this.svc.unlockCritical(req.user, id, dto.password, req);
  }

  @Get(":id/finance")
  async finance(@Request() req: any, @Param("id") id: string) {
    return this.svc.finance(req.user, id);
  }

  @Get(":id/custom-fields")
  async getCustomFields(
    @Request() req: any,
    @Param("id") companyId: string,
  ) {
    return this.customFieldsService.getCustomFieldValues(
      req.user.tenantId,
      CustomEntityType.company,
      companyId,
    );
  }

  @Patch(":id/custom-fields")
  async saveCustomFields(
    @Request() req: any,
    @Param("id") companyId: string,
    @Body() dto: SaveCustomFieldValuesDto,
  ) {
    return this.customFieldsService.saveCustomFieldValues(
      req.user.tenantId,
      CustomEntityType.company,
      companyId,
      dto.values,
    );
  }
}
