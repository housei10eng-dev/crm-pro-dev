import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateAdminSettingsDto } from './dtos';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSettings(tenantId: string) {
    let settings = await this.prisma.adminSettings.findUnique({
      where: { tenantId },
    });

    // If settings don't exist, create empty ones
    if (!settings) {
      settings = await this.prisma.adminSettings.create({
        data: {
          tenantId,
        },
      });
    }

    return settings;
  }

  async updateSettings(
    tenantId: string,
    dto: UpdateAdminSettingsDto,
  ) {
    return this.prisma.adminSettings.upsert({
      where: { tenantId },
      create: {
        tenantId,
        brandName: dto.brandName,
        logo: dto.logo,
        loginBackground: dto.loginBackground,
        theme: dto.theme,
      },
      update: {
        brandName: dto.brandName ?? undefined,
        logo: dto.logo ?? undefined,
        loginBackground: dto.loginBackground ?? undefined,
        theme: dto.theme ?? undefined,
      },
    });
  }
}
