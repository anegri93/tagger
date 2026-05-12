import pino from 'pino';
import { env } from '../config/env.js';

let usePretty = false;
if (env.NODE_ENV === 'development') {
  try {
    await import('pino-pretty');
    usePretty = true;
  } catch {
    usePretty = false;
  }
}

export const logger = pino({
  level: env.LOG_LEVEL,
  ...(usePretty
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:HH:MM:ss.l' },
        },
      }
    : {}),
});

export type Logger = typeof logger;
