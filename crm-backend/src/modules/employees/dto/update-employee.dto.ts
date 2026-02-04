import {
  IsString,
  IsOptional,
  IsEnum,
  IsArray,
} from 'class-validator';
import { RoleName } from '@prisma/client';

export class UpdateEmployeeDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(RoleName, { each: true })
  @IsArray()
  roles?: RoleName[];

  @IsOptional()
  @IsString()
  status?: string; // ACTIVE, INACTIVE, SUSPENDED
}
