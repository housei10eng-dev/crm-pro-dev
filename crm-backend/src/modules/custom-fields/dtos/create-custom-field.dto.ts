import {
  IsString,
  IsEnum,
  IsOptional,
  IsInt,
  IsObject,
  Matches,
  MinLength,
  MaxLength,
} from 'class-validator';
import { CustomEntityType, CustomFieldType } from '@prisma/client';

export class CreateCustomFieldDto {
  @IsEnum(CustomEntityType)
  entityType!: CustomEntityType;

  @IsString()
  @Matches(/^[a-z0-9_]+$/, {
    message: 'key must contain only lowercase letters, numbers, and underscores',
  })
  @MinLength(1)
  @MaxLength(50)
  key!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  label!: string;

  @IsEnum(CustomFieldType)
  type!: CustomFieldType;

  @IsOptional()
  @IsObject()
  options?: Record<string, any>;

  @IsOptional()
  @IsInt()
  position?: number;
}
