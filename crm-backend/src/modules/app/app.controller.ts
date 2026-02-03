import { Controller, Get, Request, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AuthGuard } from "@nestjs/passport";
import { TenantOnlyGuard } from "../../common/guards/tenant-only.guard";

@ApiTags("app")
@ApiBearerAuth()
@UseGuards(AuthGuard("jwt"), TenantOnlyGuard)
@Controller("app")
export class AppController {
  @Get("ping")
  ping(@Request() req: any) {
    return { 
      ok: true, 
      scope: "tenant",
      tenantId: req.user.tenantId,
      userId: req.user.id 
    };
  }
}
