import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import pino from 'pino';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(private logger: pino.Logger) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    const correlationId = request.headers['x-correlation-id'] || uuidv4();
    request.correlationId = correlationId;
    response.setHeader('x-correlation-id', correlationId);

    const method = request.method;
    const url = request.originalUrl;
    const startTime = Date.now();
    const userContext = request.user ? { userId: request.user.id, tenantId: request.user.tenantId, roles: request.user.roles } : null;

    return next.handle().pipe(
      tap((data) => {
        const duration = Date.now() - startTime;
        this.logger.info(
          {
            method,
            url,
            statusCode: response.statusCode,
            duration,
            correlationId,
            user: userContext,
          },
          `${method} ${url} - ${response.statusCode} (${duration}ms)`,
        );
        return data;
      }),
      catchError((error) => {
        const duration = Date.now() - startTime;
        this.logger.error(
          {
            method,
            url,
            statusCode: error.status || 500,
            duration,
            correlationId,
            user: userContext,
            error: {
              message: error.message,
              stack: error.stack,
              code: error.code,
            },
          },
          `${method} ${url} - ${error.status || 500} (${duration}ms)`,
        );
        throw error;
      }),
    );
  }
}
