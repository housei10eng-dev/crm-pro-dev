import { createWriteStream } from 'fs';
import * as path from 'path';
import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';

export const pinoLogger = pino(
  {
    level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label: string) => {
        return { level: label.toUpperCase() };
      },
      bindings: (bindings: any) => {
        return {
          pid: bindings.pid,
          host: bindings.hostname,
        };
      },
    },
  },
  isDev ? process.stdout : pino.transport({ target: 'pino/file', options: { destination: path.join(process.cwd(), 'logs', 'app.log') } }),
);

export const pinoHttpMiddleware = (req: any, res: any, next: Function) => {
  req.log = pinoLogger;
  next();
};
