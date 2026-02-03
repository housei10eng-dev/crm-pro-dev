import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { CompanyType, CompanyStatus, PaymentMethod, PaymentStatus } from "@prisma/client";
import { IsEnum, IsInt, IsOptional, IsString, MinLength, IsEmail } from "class-validator";

export class CreateCompanyDto {
  @ApiProperty() @IsString() @MinLength(2) name!: string;
  @ApiProperty() @IsString() cpfCnpj!: string;
  @ApiProperty({ enum: CompanyType }) @IsEnum(CompanyType) type!: CompanyType;

  @ApiProperty() @IsString() plan!: string;
  @ApiProperty({ enum: CompanyStatus }) @IsEnum(CompanyStatus) status!: CompanyStatus;

  @ApiProperty() @IsInt() currentRevenue!: number; // cents
  @ApiProperty({ enum: PaymentMethod }) @IsEnum(PaymentMethod) paymentMethod!: PaymentMethod;
  @ApiProperty({ enum: PaymentStatus }) @IsEnum(PaymentStatus) paymentStatus!: PaymentStatus;

  @ApiProperty() @IsString() cycle!: string;

  @ApiPropertyOptional() @IsOptional() @IsString() segment?: string;
  @ApiPropertyOptional() @IsOptional() acquiredAt?: string;

  @ApiPropertyOptional() @IsOptional() @IsEmail() email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() internalNotes?: string;
}
