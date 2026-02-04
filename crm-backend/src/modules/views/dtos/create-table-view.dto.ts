import { IsString, IsObject, IsOptional, IsBoolean } from 'class-validator';

export class CreateTableViewDto {
  @IsString()
  entityType!: string; // "companies" | "employees" | "audit"

  @IsString()
  name!: string;

  @IsObject()
  config!: Record<string, any>; // { columnsOrder, hiddenColumns, filters, sorting, globalSearch, pageSize }

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
