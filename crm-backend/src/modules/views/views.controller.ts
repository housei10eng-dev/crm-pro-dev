import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { ViewsService } from './views.service';
import {
  CreateTableViewDto,
  UpdateTableViewDto,
} from './dtos';
import { MasterOnlyGuard } from '../../common/guards/master-only.guard';
import { AuthGuard } from '@nestjs/passport';

@ApiTags('Admin - Views')
@Controller('admin/views')
@UseGuards(AuthGuard('jwt'), MasterOnlyGuard)
@ApiBearerAuth()
export class ViewsController {
  constructor(private readonly viewsService: ViewsService) {}

  @Get()
  @ApiOperation({ summary: 'List table views' })
  @ApiResponse({
    status: 200,
    description: 'List of table views',
  })
  async listViews(
    @Request() req: any,
    @Query('entityType') entityType?: string,
  ) {
    if (!entityType) {
      throw new Error('entityType query parameter is required');
    }
    return this.viewsService.getTableViews(req.user.tenantId, req.user.id, entityType);
  }

  @Post()
  @ApiOperation({ summary: 'Create table view' })
  @ApiResponse({
    status: 201,
    description: 'Table view created',
  })
  async createView(
    @Request() req: any,
    @Body() dto: CreateTableViewDto,
  ) {
    return this.viewsService.createTableView(req.user.tenantId, req.user.id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update table view' })
  @ApiResponse({
    status: 200,
    description: 'Table view updated',
  })
  async updateView(
    @Request() req: any,
    @Param('id') viewId: string,
    @Body() dto: UpdateTableViewDto,
  ) {
    return this.viewsService.updateTableView(
      req.user.tenantId,
      req.user.id,
      viewId,
      dto,
    );
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete table view' })
  @ApiResponse({
    status: 200,
    description: 'Table view deleted',
  })
  async deleteView(
    @Request() req: any,
    @Param('id') viewId: string,
  ) {
    return this.viewsService.deleteTableView(req.user.tenantId, req.user.id, viewId);
  }

  @Post(':id/set-default')
  @HttpCode(200)
  @ApiOperation({ summary: 'Set table view as default' })
  @ApiResponse({
    status: 200,
    description: 'Table view set as default',
  })
  async setDefault(
    @Request() req: any,
    @Param('id') viewId: string,
  ) {
    return this.viewsService.setDefaultView(req.user.tenantId, req.user.id, viewId);
  }
}
