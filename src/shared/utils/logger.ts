import winston from 'winston';
import { env } from '../../config/env.js';

const { combine, timestamp, printf, colorize, errors } = winston.format;

// Custom format for development
const devFormat = printf(({ level, message, timestamp, ...metadata }) => {
  let metaStr = '';
  if (Object.keys(metadata).length > 0 && metadata.stack === undefined) {
    metaStr = ` ${JSON.stringify(metadata)}`;
  }
  if (metadata.stack) {
    metaStr = `\n${metadata.stack}`;
  }
  return `${timestamp} [${level}]: ${message}${metaStr}`;
});

// Custom format for production (JSON)
const prodFormat = printf(({ level, message, timestamp, ...metadata }) => {
  return JSON.stringify({
    timestamp,
    level,
    message,
    ...metadata,
  });
});

// Create logger instance
export const logger = winston.createLogger({
  level: env.NODE_ENV === 'development' ? 'debug' : 'info',
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true })
  ),
  transports: [
    new winston.transports.Console({
      format:
        env.NODE_ENV === 'development'
          ? combine(colorize(), devFormat)
          : prodFormat,
    }),
  ],
  // Prevent Winston from exiting on error
  exitOnError: false,
});

// Add file transport in production
if (env.NODE_ENV === 'production') {
  logger.add(
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      format: prodFormat,
    })
  );
  logger.add(
    new winston.transports.File({
      filename: 'logs/combined.log',
      format: prodFormat,
    })
  );
}

// Stream for Morgan (HTTP request logging)
export const morganStream = {
  write: (message: string) => {
    logger.http(message.trim());
  },
};

// Specialized loggers for different contexts
export const jobLogger = logger.child({ context: 'job' });
export const httpLogger = logger.child({ context: 'http' });
export const dbLogger = logger.child({ context: 'database' });
