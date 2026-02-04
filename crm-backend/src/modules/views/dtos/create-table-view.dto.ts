import { IsString, IsObject, IsOptional, IsBoolean } from 'class-validator';

export class CreateTableViewDto {
  @IsString()
  entityType!: string; // "company" | "employee" | "audit" (plural accepted and normalized)

  @IsString()
  name!: string;

  @IsObject()
  config!: Record<string, any>; // { columnsOrder, hiddenColumns, filters, sorting, globalSearch, pageSize }

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
