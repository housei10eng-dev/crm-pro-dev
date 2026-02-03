import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { PrismaService } from "./prisma/prisma.service";
import * as net from "net";

@Controller("health")
export class HealthController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async status() {
    let prismaOk = true;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      prismaOk = false;
    }

    let redisStatus: "up" | "down" | "skipped" = "skipped";
    const redisUrl = process.env.REDIS_URL;
    if (redisUrl) {
      try {
        await checkRedis(redisUrl);
        redisStatus = "up";
      } catch {
        redisStatus = "down";
      }
    }

    const status = prismaOk && redisStatus !== "down" ? "ok" : "degraded";
    const payload = {
      status,
      uptime: process.uptime(),
      version: process.env.npm_package_version ?? "unknown",
      prisma: prismaOk ? "up" : "down",
      redis: redisStatus,
    };

    if (status !== "ok") {
      throw new ServiceUnavailableException(payload);
    }

    return payload;
  }
}

function checkRedis(urlString: string) {
  return new Promise<void>((resolve, reject) => {
    let url: URL;
    try {
      url = new URL(urlString);
    } catch {
      reject(new Error("Invalid REDIS_URL"));
      return;
    }

    const port = url.port ? parseInt(url.port, 10) : 6379;
    const host = url.hostname;
    const socket = net.createConnection({ host, port });

    const onError = (err: Error) => {
      socket.destroy();
      reject(err);
    };

    socket.setTimeout(1000);
    socket.on("error", onError);
    socket.on("timeout", () => onError(new Error("Redis timeout")));
    socket.on("connect", () => {
      socket.end();
      resolve();
    });
  });
}
