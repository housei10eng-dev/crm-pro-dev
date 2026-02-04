import {
  IsString,
  IsOptional,
  IsObject,
  MaxLength,
} from 'class-validator';

export class UpdateAdminSettingsDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  brandName?: string;

  @IsOptional()
  @IsString()
  logo?: string; // Base64 or URL

  @IsOptional()
  @IsString()
  loginBackground?: string; // Base64 or URL

  @IsOptional()
  @IsObject()
  theme?: {
    primaryColor?: string;
    sidebarColor?: string;
    mode?: 'light' | 'dark';
  };
}
