import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  CompanyPlan,
  CompanyStatus,
  CompanyType,
  PaymentMethod,
  PaymentStatus,
} from "@prisma/client";
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

export class CreateCompanyDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiProperty()
  @IsString()
  cpfCnpj!: string;

  @ApiPropertyOptional({ enum: CompanyType })
  @IsOptional()
  @IsEnum(CompanyType)
  type?: CompanyType;

  @ApiPropertyOptional({ enum: CompanyPlan })
  @IsOptional()
  @IsEnum(CompanyPlan)
  plan?: CompanyPlan;

  @ApiPropertyOptional({ enum: CompanyStatus })
  @IsOptional()
  @IsEnum(CompanyStatus)
  status?: CompanyStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  currentRevenue?: number;

  @ApiPropertyOptional({ enum: PaymentMethod })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional({ enum: PaymentStatus })
  @IsOptional()
  @IsEnum(PaymentStatus)
  paymentStatus?: PaymentStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cycle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  segment?: string;

  @ApiPropertyOptional()
  @IsOptional()
  acquiredAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  internalNotes?: string;
}
