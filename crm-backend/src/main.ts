import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { ValidationPipe } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import * as express from "express";
import helmet from "helmet";
import { pinoLogger } from "./config/logger.config";
import { LoggingInterceptor } from "./common/interceptors/logging.interceptor";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const corsOriginsEnv = process.env.CORS_ORIGINS ?? "";
  const corsOrigins = corsOriginsEnv
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  const corsOrigin = (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    if (!origin) {
      callback(null, true);
      return;
    }
    if (corsOrigins.length === 0) {
      callback(null, true);
      return;
    }
    callback(null, corsOrigins.includes(origin));
  };

  app.enableCors({
    origin: corsOrigin,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Tenant-ID",
      "X-Event-ID",
      "X-Webhook-Signature",
      "X-Webhook-Timestamp",
      "X-Correlation-ID",
    ],
  });
  app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    const origin = req.headers.origin;
    const allowAll = corsOrigins.length === 0;
    const allowOrigin = allowAll ? (origin || "*") : (origin && corsOrigins.includes(origin) ? origin : "");
    if (allowOrigin) {
      res.setHeader("Access-Control-Allow-Origin", allowOrigin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type,Authorization,X-Tenant-ID,X-Event-ID,X-Webhook-Signature,X-Webhook-Timestamp,X-Correlation-ID",
      );
    }
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  });
  app.use(
    express.json({
      verify: (req: any, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );
  app.use(express.urlencoded({ extended: true }));
  app.use(helmet());
  
  // Global logging interceptor
  app.useGlobalInterceptors(new LoggingInterceptor(pinoLogger));

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));

  const config = new DocumentBuilder()
    .setTitle("CRM Backend")
    .setVersion("0.1.0")
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("api", app, document);

  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;
  await app.listen(port);
  pinoLogger.info(`API running on http://localhost:${port}`);
}
bootstrap();
