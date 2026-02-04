import { IsString, IsObject, IsOptional, IsBoolean } from 'class-validator';

export class UpdateTableViewDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, any>;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
