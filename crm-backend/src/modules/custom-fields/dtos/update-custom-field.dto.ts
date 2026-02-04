import {
  IsString,
  IsEnum,
  IsOptional,
  IsInt,
  IsObject,
  IsBoolean,
} from 'class-validator';
import { CustomFieldType } from '@prisma/client';

export class UpdateCustomFieldDto {
  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsEnum(CustomFieldType)
  type?: CustomFieldType;

  @IsOptional()
  @IsObject()
  options?: Record<string, any>;

  @IsOptional()
  @IsInt()
  position?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
