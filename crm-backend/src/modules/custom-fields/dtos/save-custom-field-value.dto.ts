import { IsString, IsObject, IsOptional } from 'class-validator';

export class SaveCustomFieldValueDto {
  @IsString()
  fieldId!: string;

  @IsOptional()
  @IsObject()
  value?: any;
}

export class SaveCustomFieldValuesDto {
  @IsObject({ each: true })
  values!: SaveCustomFieldValueDto[];
}
