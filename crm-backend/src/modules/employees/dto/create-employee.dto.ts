import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsString, MinLength, IsArray, ArrayNotEmpty, IsEnum } from "class-validator";
import { RoleName } from "@prisma/client";

export class CreateEmployeeDto {
  @ApiProperty() @IsString() @MinLength(2) name!: string;
  @ApiProperty() @IsEmail() email!: string;
  @ApiProperty() @IsString() @MinLength(6) password!: string;

  @ApiProperty({ isArray: true, enum: RoleName })
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(RoleName, { each: true })
  roles!: RoleName[];
}
