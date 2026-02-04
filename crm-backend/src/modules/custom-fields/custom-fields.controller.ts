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
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { CustomFieldsService } from './custom-fields.service';
import {
  CreateCustomFieldDto,
  UpdateCustomFieldDto,
} from './dtos';
import { MasterOnlyGuard } from '../../common/guards/master-only.guard';
import { CustomEntityType } from '@prisma/client';
import { AuthGuard } from '@nestjs/passport';

@ApiTags('Admin - Custom Fields')
@Controller('admin/custom-fields')
@UseGuards(AuthGuard('jwt'), MasterOnlyGuard)
@ApiBearerAuth()
export class CustomFieldsController {
  constructor(private readonly customFieldsService: CustomFieldsService) {}

  @Get()
  @ApiOperation({ summary: 'List custom field definitions' })
  @ApiResponse({
    status: 200,
    description: 'List of custom field definitions',
  })
  async listCustomFields(
    @Request() req: any,
    @Query('entityType') entityType?: CustomEntityType,
  ) {
    if (!entityType) {
      throw new Error('entityType query parameter is required');
    }
    return this.customFieldsService.getCustomFields(req.user.tenantId, entityType);
  }

  @Post()
  @ApiOperation({ summary: 'Create custom field definition' })
  @ApiResponse({
    status: 201,
    description: 'Custom field created',
  })
  async createCustomField(
    @Request() req: any,
    @Body() dto: CreateCustomFieldDto,
  ) {
    return this.customFieldsService.createCustomField(req.user.tenantId, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update custom field definition' })
  @ApiResponse({
    status: 200,
    description: 'Custom field updated',
  })
  async updateCustomField(
    @Request() req: any,
    @Param('id') fieldId: string,
    @Body() dto: UpdateCustomFieldDto,
  ) {
    return this.customFieldsService.updateCustomField(
      req.user.tenantId,
      fieldId,
      dto,
    );
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete custom field (soft delete)' })
  @ApiResponse({
    status: 200,
    description: 'Custom field deleted',
  })
  async deleteCustomField(
    @Request() req: any,
    @Param('id') fieldId: string,
  ) {
    return this.customFieldsService.deleteCustomField(req.user.tenantId, fieldId);
  }
}
