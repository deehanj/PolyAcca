/**
 * Centralized logging utility for Lambda functions
 *
 * Outputs structured JSON for CloudWatch Logs Insights
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  [key: string]: unknown;
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  service: string;
  context?: LogContext;
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

class Logger {
  private service: string;
  private minLevel: LogLevel;
  private defaultContext: LogContext;

  constructor(service: string, minLevel?: LogLevel) {
    this.service = service;
    this.minLevel = minLevel ?? (process.env.LOG_LEVEL as LogLevel) ?? 'info';
    this.defaultContext = {};
  }

  /**
   * Set default context that will be included in all log entries
   */
  setContext(context: LogContext): void {
    this.defaultContext = { ...this.defaultContext, ...context };
  }

  /**
   * Clear default context
   */
  clearContext(): void {
    this.defaultContext = {};
  }

  /**
   * Create a child logger with additional default context
   */
  child(context: LogContext): Logger {
    const child = new Logger(this.service, this.minLevel);
    child.defaultContext = { ...this.defaultContext, ...context };
    return child;
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.minLevel];
  }

  private formatEntry(level: LogLevel, message: string, context?: LogContext): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      service: this.service,
      ...(Object.keys({ ...this.defaultContext, ...context }).length > 0 && {
        context: { ...this.defaultContext, ...context },
      }),
    };
  }

  private log(level: LogLevel, message: string, context?: LogContext): void {
    if (!this.shouldLog(level)) return;

    const entry = this.formatEntry(level, message, context);
    const output = JSON.stringify(entry);

    switch (level) {
      case 'error':
        console.error(output);
        break;
      case 'warn':
        console.warn(output);
        break;
      default:
        console.log(output);
    }
  }

  debug(message: string, context?: LogContext): void {
    this.log('debug', message, context);
  }

  info(message: string, context?: LogContext): void {
    this.log('info', message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.log('warn', message, context);
  }

  error(message: string, context?: LogContext): void {
    this.log('error', message, context);
  }

  /**
   * Log an error with stack trace
   */
  errorWithStack(message: string, error: unknown, context?: LogContext): void {
    const errorContext: LogContext = { ...context };

    if (error instanceof Error) {
      errorContext.errorName = error.name;
      errorContext.errorMessage = error.message;
      errorContext.stack = error.stack;
    } else {
      errorContext.error = String(error);
    }

    this.log('error', message, errorContext);
  }
}

/**
 * Create a logger for a specific service/lambda
 */
export function createLogger(service: string, minLevel?: LogLevel): Logger {
  return new Logger(service, minLevel);
}

// Pre-configured loggers for each domain
export const loggers = {
  auth: createLogger('auth'),
  api: createLogger('api'),
  streams: createLogger('streams'),
  webhooks: createLogger('webhooks'),
};
