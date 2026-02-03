import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "../../prisma/prisma.service";
import * as bcrypt from "bcrypt";
import { RoleName } from "@prisma/client";
import { JwtPayload, RequestUser } from "../../common/types";

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { roles: true },
    });
    if (!user) throw new UnauthorizedException("Invalid credentials");
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException("Invalid credentials");

    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    const roles = user.roles.map((r) => r.role) as RoleName[];
    const payload: JwtPayload = { sub: user.id, tenantId: user.tenantId, roles, email: user.email };
    const accessToken = await this.jwt.signAsync(payload);
    return { accessToken };
  }

  async me(user: RequestUser) {
    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.id },
      include: { roles: true, tenant: true },
    });
    if (!dbUser) throw new UnauthorizedException();

    const MASTER_TENANT_ID = process.env.MASTER_TENANT_ID || "00000000-0000-0000-0000-000000000001";
    const hasMasterRole = dbUser.roles.some((r) => String(r.role).startsWith("MASTER_"));
    const scope = hasMasterRole && dbUser.tenantId === MASTER_TENANT_ID ? "admin" : "tenant";

    return {
      id: dbUser.id,
      email: dbUser.email,
      name: dbUser.name,
      tenantId: dbUser.tenantId,
      tenantName: dbUser.tenant.name,
      roles: dbUser.roles.map((r) => r.role),
      scope,
    };
  }
}
