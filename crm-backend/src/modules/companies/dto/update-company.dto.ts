import { ApiPropertyOptional } from "@nestjs/swagger";
import { CompanyStatus, CompanyPlan } from "@prisma/client";
import { IsOptional, IsString, IsEmail, IsEnum, MaxLength } from "class-validator";

export class UpdateCompanyDto {
  // Non-critical (editable)
  @ApiPropertyOptional() @IsOptional() @IsEmail() email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() segment?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() internalNotes?: string;
  @ApiPropertyOptional({ enum: CompanyStatus }) @IsOptional() @IsEnum(CompanyStatus) status?: CompanyStatus;

  // Critical (blocked unless unlocked)
  @ApiPropertyOptional({ enum: CompanyPlan }) @IsOptional() @IsEnum(CompanyPlan) plan?: CompanyPlan;
  @ApiPropertyOptional() @IsOptional() @IsString() cycle?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() paymentMethod?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() paymentStatus?: string;
}
