import {
  Controller,
  Get,
  Put,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { SettingsService } from './settings.service';
import { UpdateAdminSettingsDto } from './dtos';
import { MasterOnlyGuard } from '../../common/guards/master-only.guard';
import { AuthGuard } from '@nestjs/passport';

@ApiTags('Admin - Settings')
@Controller('admin/settings')
@UseGuards(AuthGuard('jwt'), MasterOnlyGuard)
@ApiBearerAuth()
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @ApiOperation({ summary: 'Get admin settings' })
  @ApiResponse({
    status: 200,
    description: 'Admin settings',
  })
  async getSettings(@Request() req: any) {
    return this.settingsService.getSettings(req.user.tenantId);
  }

  @Put()
  @ApiOperation({ summary: 'Update admin settings' })
  @ApiResponse({
    status: 200,
    description: 'Admin settings updated',
  })
  async updateSettings(
    @Request() req: any,
    @Body() dto: UpdateAdminSettingsDto,
  ) {
    return this.settingsService.updateSettings(req.user.tenantId, dto);
  }
}
