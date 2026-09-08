import * as path from 'path';
import * as fs from 'fs';
import { app } from 'electron';
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import type { AppConfig } from './types';

let logger: winston.Logger;

export function initLogger(config: AppConfig): void {
  const logDir = path.join(app.getPath('userData'), 'logs'); // safe — called after app.whenReady()
  fs.mkdirSync(logDir, { recursive: true });

  logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.printf(({ timestamp, level, message }) =>
        `[${timestamp}] [${level.toUpperCase()}] ${message}`
      )
    ),
    transports: [
      new DailyRotateFile({
        dirname: logDir,
        filename: 'app-%DATE%.log',
        datePattern: 'YYYY-MM-DD',
        maxFiles: `${config.logRetentionDays}d`,
        zippedArchive: false,
      }) as unknown as winston.transport,
      new winston.transports.Console(),
    ],
  });
}

export function getLogger(): winston.Logger {
  if (!logger) {
    // Fallback if initLogger hasn't been called yet
    logger = winston.createLogger({
      transports: [new winston.transports.Console()],
    });
  }
  return logger;
}

export function getLogDir(): string {
  return path.join(app.getPath('userData'), 'logs'); // safe — called after app.whenReady()
}
