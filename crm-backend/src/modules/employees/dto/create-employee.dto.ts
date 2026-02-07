import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEmail, IsString, MinLength, IsArray, ArrayNotEmpty, IsEnum, IsOptional } from "class-validator";
import { RoleName } from "@prisma/client";

export class CreateEmployeeDto {
  @ApiProperty() @IsString() @MinLength(2) name!: string;
  @ApiProperty() @IsEmail() email!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(6) password?: string;

  @ApiPropertyOptional({ isArray: true, enum: RoleName })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(RoleName, { each: true })
  roles?: RoleName[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;
}
