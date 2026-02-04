import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateCustomFieldDto,
  UpdateCustomFieldDto,
  SaveCustomFieldValueDto,
} from './dtos';
import { CustomEntityType, CustomFieldType } from '@prisma/client';

@Injectable()
export class CustomFieldsService {
  constructor(private readonly prisma: PrismaService) {}

  async createCustomField(
    tenantId: string,
    dto: CreateCustomFieldDto,
  ) {
    // Check if key is already taken for this tenant + entityType
    const existing = await this.prisma.customFieldDefinition.findUnique({
      where: {
        tenantId_entityType_key: {
          tenantId,
          entityType: dto.entityType,
          key: dto.key,
        },
      },
    });

    if (existing) {
      throw new BadRequestException(
        `Custom field with key "${dto.key}" already exists for ${dto.entityType}`,
      );
    }

    return this.prisma.customFieldDefinition.create({
      data: {
        tenantId,
        entityType: dto.entityType,
        key: dto.key,
        label: dto.label,
        type: dto.type,
        options: dto.options ? (dto.options as any) : undefined,
        position: dto.position ?? 0,
      },
    });
  }

  async getCustomFields(
    tenantId: string,
    entityType: CustomEntityType,
  ) {
    return this.prisma.customFieldDefinition.findMany({
      where: {
        tenantId,
        entityType,
        isActive: true,
      },
      orderBy: {
        position: 'asc',
      },
    });
  }

  async updateCustomField(
    tenantId: string,
    fieldId: string,
    dto: UpdateCustomFieldDto,
  ) {
    // Verify field belongs to this tenant
    const field = await this.prisma.customFieldDefinition.findUnique({
      where: { id: fieldId },
    });

    if (!field || field.tenantId !== tenantId) {
      throw new BadRequestException('Custom field not found');
    }

    return this.prisma.customFieldDefinition.update({
      where: { id: fieldId },
      data: {
        label: dto.label ?? field.label,
        type: dto.type ?? field.type,
        options: dto.options !== undefined ? (dto.options as any) : undefined,
        position: dto.position ?? field.position,
        isActive: dto.isActive ?? field.isActive,
      },
    });
  }

  async deleteCustomField(tenantId: string, fieldId: string) {
    // Verify field belongs to this tenant
    const field = await this.prisma.customFieldDefinition.findUnique({
      where: { id: fieldId },
    });

    if (!field || field.tenantId !== tenantId) {
      throw new BadRequestException('Custom field not found');
    }

    return this.prisma.customFieldDefinition.update({
      where: { id: fieldId },
      data: { isActive: false },
    });
  }

  async getCustomFieldValues(
    tenantId: string,
    entityType: CustomEntityType,
    entityId: string,
  ) {
    // Get field definitions with their values
    const definitions = await this.prisma.customFieldDefinition.findMany({
      where: {
        tenantId,
        entityType,
        isActive: true,
      },
      orderBy: {
        position: 'asc',
      },
    });

    const values = await this.prisma.customFieldValue.findMany({
      where: {
        tenantId,
        entityType,
        entityId,
      },
    });

    // Return structured format
    return {
      fields: definitions,
      values: values.map((v) => ({
        fieldId: v.fieldId,
        value: v.value,
      })),
    };
  }

  async saveCustomFieldValues(
    tenantId: string,
    entityType: CustomEntityType,
    entityId: string,
    valuesToSave: SaveCustomFieldValueDto[],
  ) {
    const results = [];

    for (const item of valuesToSave) {
      // Verify field exists and belongs to this tenant
      const field = await this.prisma.customFieldDefinition.findUnique({
        where: { id: item.fieldId },
      });

      if (!field || field.tenantId !== tenantId || field.entityType !== entityType) {
        throw new BadRequestException(
          `Custom field ${item.fieldId} not found or invalid for ${entityType}`,
        );
      }

      // Validate value based on field type
      this.validateFieldValue(field.type, item.value);

      // Upsert the value
      const result = await this.prisma.customFieldValue.upsert({
        where: {
          tenantId_entityType_entityId_fieldId: {
            tenantId,
            entityType,
            entityId,
            fieldId: item.fieldId,
          },
        },
        create: {
          tenantId,
          entityType,
          entityId,
          fieldId: item.fieldId,
          value: item.value ?? null,
        },
        update: {
          value: item.value ?? null,
        },
      });

      results.push(result);
    }

    return results;
  }

  private validateFieldValue(fieldType: CustomFieldType, value: any) {
    if (value === null || value === undefined) {
      return; // Allow null/undefined
    }

    switch (fieldType) {
      case CustomFieldType.text:
        if (typeof value !== 'string') {
          throw new BadRequestException('text field must be a string');
        }
        break;
      case CustomFieldType.date:
        if (typeof value !== 'string' || !this.isValidISODate(value)) {
          throw new BadRequestException('date field must be an ISO date string');
        }
        break;
      case CustomFieldType.select:
        if (typeof value !== 'string') {
          throw new BadRequestException('select field must be a string');
        }
        break;
      case CustomFieldType.money:
        if (typeof value !== 'number') {
          throw new BadRequestException('money field must be a number');
        }
        break;
      case CustomFieldType.number:
        if (typeof value !== 'number') {
          throw new BadRequestException('number field must be a number');
        }
        break;
      case CustomFieldType.boolean:
        if (typeof value !== 'boolean') {
          throw new BadRequestException('boolean field must be a boolean');
        }
        break;
    }
  }

  private isValidISODate(value: string): boolean {
    try {
      const date = new Date(value);
      return date instanceof Date && !isNaN(date.getTime());
    } catch {
      return false;
    }
  }
}
