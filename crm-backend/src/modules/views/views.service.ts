import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateTableViewDto,
  UpdateTableViewDto,
} from './dtos';

@Injectable()
export class ViewsService {
  constructor(private readonly prisma: PrismaService) {}

  async createTableView(
    tenantId: string,
    userId: string,
    dto: CreateTableViewDto,
  ) {
    // Check if view name already exists for this user + entityType
    const existing = await this.prisma.tableView.findUnique({
      where: {
        tenantId_userId_entityType_name: {
          tenantId,
          userId,
          entityType: dto.entityType,
          name: dto.name,
        },
      },
    });

    if (existing) {
      throw new BadRequestException(
        `View "${dto.name}" already exists for ${dto.entityType}`,
      );
    }

    // If isDefault = true, unset other defaults for this user + entityType
    if (dto.isDefault) {
      await this.prisma.tableView.updateMany({
        where: {
          tenantId,
          userId,
          entityType: dto.entityType,
          isDefault: true,
        },
        data: { isDefault: false },
      });
    }

    return this.prisma.tableView.create({
      data: {
        tenantId,
        userId,
        entityType: dto.entityType,
        name: dto.name,
        config: dto.config,
        isDefault: dto.isDefault ?? false,
      },
    });
  }

  async getTableViews(
    tenantId: string,
    userId: string,
    entityType: string,
  ) {
    return this.prisma.tableView.findMany({
      where: {
        tenantId,
        userId,
        entityType,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });
  }

  async updateTableView(
    tenantId: string,
    userId: string,
    viewId: string,
    dto: UpdateTableViewDto,
  ) {
    // Verify view belongs to this user
    const view = await this.prisma.tableView.findUnique({
      where: { id: viewId },
    });

    if (!view || view.tenantId !== tenantId || view.userId !== userId) {
      throw new BadRequestException('Table view not found');
    }

    // If setting isDefault = true, unset other defaults for this entityType
    if (dto.isDefault === true && !view.isDefault) {
      await this.prisma.tableView.updateMany({
        where: {
          tenantId,
          userId,
          entityType: view.entityType,
          isDefault: true,
          id: { not: viewId },
        },
        data: { isDefault: false },
      });
    }

    return this.prisma.tableView.update({
      where: { id: viewId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.config !== undefined && { config: dto.config as any }),
        ...(dto.isDefault !== undefined && { isDefault: dto.isDefault }),
      },
    });
  }

  async deleteTableView(
    tenantId: string,
    userId: string,
    viewId: string,
  ) {
    // Verify view belongs to this user
    const view = await this.prisma.tableView.findUnique({
      where: { id: viewId },
    });

    if (!view || view.tenantId !== tenantId || view.userId !== userId) {
      throw new BadRequestException('Table view not found');
    }

    return this.prisma.tableView.delete({
      where: { id: viewId },
    });
  }

  async setDefaultView(
    tenantId: string,
    userId: string,
    viewId: string,
  ) {
    // Verify view belongs to this user
    const view = await this.prisma.tableView.findUnique({
      where: { id: viewId },
    });

    if (!view || view.tenantId !== tenantId || view.userId !== userId) {
      throw new BadRequestException('Table view not found');
    }

    // Unset other defaults
    await this.prisma.tableView.updateMany({
      where: {
        tenantId,
        userId,
        entityType: view.entityType,
        isDefault: true,
        id: { not: viewId },
      },
      data: { isDefault: false },
    });

    return this.prisma.tableView.update({
      where: { id: viewId },
      data: { isDefault: true },
    });
  }
}
