import { RoleName } from "@prisma/client";

export type JwtPayload = {
  sub: string;
  tenantId: string;
  roles: RoleName[];
  email: string;
};

export type RequestUser = {
  id: string;
  tenantId: string;
  roles: RoleName[];
  email: string;
};
