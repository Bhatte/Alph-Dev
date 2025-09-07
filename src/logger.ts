import { inspect } from 'util';
import { createWriteStream, WriteStream } from 'fs';
import { dirname } from 'path';
import { promises as fs } from 'fs';
import * as fsSync from 'fs';

export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;

  // Structured logging methods
  logStructured(level: 'debug' | 'info' | 'warn' | 'error', data: LogEntry): void;
  startTrace(operation: string, context?: Record<string, unknown>): TraceContext;
  endTrace(traceContext: TraceContext, result?: 'success' | 'error', error?: Error): void;
}

export interface LogEntry {
  message: string;
  timestamp?: string | undefined;
  level?: string | undefined;
  operation?: string | undefined;
  traceId?: string | undefined;
  duration?: number | undefined;
  context?: Record<string, unknown> | undefined;
  error?: {
    name: string;
    message: string;
    stack?: string | undefined;
  } | undefined;
}

export interface TraceContext {
  traceId: string;
  operation: string;
  startTime: number;
  context?: Record<string, unknown> | undefined;
}

interface LoggerOptions {
  /**
   * Minimum log level to output
   * @default 'info'
   */
  level?: 'debug' | 'info' | 'warn' | 'error';

  /**
   * Whether to enable colors in the output
   * @default true
   */
  colors?: boolean;

  /**
   * Whether to include timestamps in the output
   * @default true
   */
  timestamps?: boolean;

  /**
   * Whether to log to stderr for errors
   * @default true
   */
  stderrForErrors?: boolean;

  /**
   * Custom formatter for log messages
   */
  formatter?: (level: 'debug' | 'info' | 'warn' | 'error', message: string, ...args: unknown[]) => string;

  /**
   * Enable file logging
   * @default false
   */
  fileLogging?: boolean;

  /**
   * Log file path
   * @default './logs/alph.log'
   */
  logFile?: string;

  /**
   * Maximum log file size in bytes before rotation
   * @default 10MB
   */
  maxFileSize?: number;

  /**
   * Number of log files to keep
   * @default 5
   */
  maxFiles?: number;

  /**
   * Enable JSON logging format for file output
   * @default false
   */
  jsonLogging?: boolean;

  /**
   * Enable log rotation
   * @default true
   */
  rotate?: boolean;
}

const LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
} as const;

const RESET = '\x1b[0m';
const COLORS = {
  debug: '\x1b[36m', // Cyan
  info: '\x1b[32m', // Green
  warn: '\x1b[33m', // Yellow
  error: '\x1b[31m', // Red
  timestamp: '\x1b[90m', // Gray
} as const;

/**
 * Patterns that indicate sensitive data that should be masked
 */
const SECRET_PATTERNS = [
  /\b[A-Za-z0-9]{20,}\b/g, // Long alphanumeric strings (API keys)
  /\bsk-[A-Za-z0-9]{32,}\b/g, // OpenAI-style keys
  /\bpk_[A-Za-z0-9]{32,}\b/g, // Publishable keys
  /\bgho_[A-Za-z0-9]{36}\b/g, // GitHub OAuth tokens
  /\bghp_[A-Za-z0-9]{36}\b/g, // GitHub personal access tokens
  /\b[A-Za-z0-9+/]{40,}={0,2}\b/g, // Base64 encoded secrets
] as const;

/**
 * Masks sensitive information in text
 */
export function maskSecrets(text: string): string {
  let masked = text;

  for (const pattern of SECRET_PATTERNS) {
    masked = masked.replace(pattern, (match) => {
      if (match.length <= 4) return match; // Don't mask very short strings
      const last4 = match.slice(-4);
      return `****${last4}`;
    });
  }

  return masked;
}

/**
 * A simple logger with color support and log levels
 */
export class ConsoleLogger implements Logger {
  private readonly level: number;
  private readonly colors: boolean;
  private readonly timestamps: boolean;
  private readonly stderrForErrors: boolean;
  private readonly formatter: NonNullable<LoggerOptions['formatter']>;

  // File logging properties
  private readonly fileLogging: boolean;
  private readonly logFile?: string;
  private readonly maxFileSize: number;
  private readonly maxFiles: number;
  private readonly jsonLogging: boolean;
  private readonly rotate: boolean;
  private fileStream: WriteStream | null = null;
  private currentFileSize: number = 0;

  constructor(options: LoggerOptions = {}) {
    this.level = LEVELS[options.level || 'info'];
    this.colors = options.colors !== false;
    this.timestamps = options.timestamps !== false;
    this.stderrForErrors = options.stderrForErrors !== false;

    // File logging options
    this.fileLogging = options.fileLogging || false;
    this.logFile = options.logFile || './logs/alph.log';
    this.maxFileSize = options.maxFileSize || 10 * 1024 * 1024; // 10MB
    this.maxFiles = options.maxFiles || 5;
    this.jsonLogging = options.jsonLogging || false;
    this.rotate = options.rotate !== false;

    // Use custom formatter or default
    this.formatter = options.formatter || this.defaultFormatter.bind(this);

    // Initialize file logging if enabled
    if (this.fileLogging && this.logFile) {
      this.initializeFileLogging().catch(error => {
        console.error('Failed to initialize file logging:', error);
      });
    }
  }

  private async initializeFileLogging(): Promise<void> {
    try {
      if (!this.logFile) return;

      // Ensure log directory exists
      const logDir = dirname(this.logFile);
      await fs.mkdir(logDir, { recursive: true });

      // Create write stream
      this.fileStream = createWriteStream(this.logFile, { flags: 'a' });
    } catch (error) {
      console.error('Failed to initialize file logging:', error);
    }
  }

  private async rotateLogFile(): Promise<void> {
    if (!this.rotate || !this.logFile || !this.fileStream) return;

    try {
      // Close current stream
      this.fileStream.close();

      // Rotate files
      for (let i = this.maxFiles - 1; i > 0; i--) {
        const oldFile = `${this.logFile}.${i}`;
        const newFile = `${this.logFile}.${i + 1}`;
        try {
          if (fsSync.existsSync(oldFile)) {
            fsSync.renameSync(oldFile, newFile);
          }
        } catch (error) {
          // Ignore errors during rotation
        }
      }

      // Move current log to .1
      if (fsSync.existsSync(this.logFile)) {
        fsSync.renameSync(this.logFile, `${this.logFile}.1`);
      }

      // Create new log file
      await this.initializeFileLogging();
    } catch (error) {
      console.error('Failed to rotate log file:', error);
    }
  }

  private async writeToFile(message: string): Promise<void> {
    if (!this.fileStream || !this.logFile) return;

    try {
      // Check if rotation is needed
      this.currentFileSize += message.length;
      if (this.currentFileSize > this.maxFileSize) {
        await this.rotateLogFile();
        this.currentFileSize = message.length;
      }

      // Write to file
      this.fileStream.write(message + '\n', (error: Error | null | undefined) => {
        if (error) {
          console.error('Failed to write to log file:', error);
        }
      });
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }

  debug(message: string, ...args: unknown[]): void {
    if (this.level > LEVELS.debug) return;
    this.log('debug', message, ...args);

    if (this.fileLogging && this.logFile) {
      const timestamp = new Date().toISOString();
      const logMessage = this.jsonLogging
        ? JSON.stringify({ timestamp, level: 'DEBUG', message, args })
        : `[${timestamp}] DEBUG ${message}${args.length > 0 ? ' ' + JSON.stringify(args) : ''}`;
      this.writeToFile(logMessage).catch(err => console.error('File logging error:', err));
    }
  }

  info(message: string, ...args: unknown[]): void {
    if (this.level > LEVELS.info) return;
    this.log('info', message, ...args);

    if (this.fileLogging && this.logFile) {
      const timestamp = new Date().toISOString();
      const logMessage = this.jsonLogging
        ? JSON.stringify({ timestamp, level: 'INFO', message, args })
        : `[${timestamp}] INFO ${message}${args.length > 0 ? ' ' + JSON.stringify(args) : ''}`;
      this.writeToFile(logMessage).catch(err => console.error('File logging error:', err));
    }
  }

  warn(message: string, ...args: unknown[]): void {
    if (this.level > LEVELS.warn) return;
    this.log('warn', message, ...args);

    if (this.fileLogging && this.logFile) {
      const timestamp = new Date().toISOString();
      const logMessage = this.jsonLogging
        ? JSON.stringify({ timestamp, level: 'WARN', message, args })
        : `[${timestamp}] WARN ${message}${args.length > 0 ? ' ' + JSON.stringify(args) : ''}`;
      this.writeToFile(logMessage).catch(err => console.error('File logging error:', err));
    }
  }

  error(message: string, ...args: unknown[]): void {
    if (this.level > LEVELS.error) return;

    // Special handling for AlphError
    const formattedMessage = this.formatError(message, ...args);
    this.log('error', formattedMessage);

    if (this.fileLogging && this.logFile) {
      const timestamp = new Date().toISOString();
      const logMessage = this.jsonLogging
        ? JSON.stringify({ timestamp, level: 'ERROR', message: formattedMessage, args })
        : `[${timestamp}] ERROR ${formattedMessage}${args.length > 0 ? ' ' + JSON.stringify(args) : ''}`;
      this.writeToFile(logMessage).catch(err => console.error('File logging error:', err));
    }
  }

  logStructured(level: 'debug' | 'info' | 'warn' | 'error', data: LogEntry): void {
    if (this.level > LEVELS[level]) return;

    const entry: LogEntry = {
      ...data,
      timestamp: data.timestamp || new Date().toISOString(),
      level: data.level || level
    };

    // Apply secret masking to the entire entry
    const maskedEntry = this.maskSecretsInEntry(entry);

    // Output as JSON lines for structured logging
    const jsonLine = JSON.stringify(maskedEntry);

    if (level === 'error' && this.stderrForErrors) {
      process.stderr.write(jsonLine + '\n');
    } else {
      process.stdout.write(jsonLine + '\n');
    }

    // Write to file if file logging is enabled
    if (this.fileLogging && this.logFile) {
      const logMessage = this.jsonLogging
        ? jsonLine
        : `[${entry.timestamp}] ${level.toUpperCase()} ${entry.message}`;
      this.writeToFile(logMessage).catch(err => console.error('File logging error:', err));
    }
  }

  startTrace(operation: string, context?: Record<string, unknown>): TraceContext {
    const traceId = this.generateTraceId();
    const traceContext: TraceContext = {
      traceId,
      operation,
      startTime: Date.now(),
      context
    };

    // Log trace start
    this.logStructured('debug', {
      message: `Starting operation: ${operation}`,
      operation,
      traceId,
      context
    });

    return traceContext;
  }

  endTrace(traceContext: TraceContext, result: 'success' | 'error' = 'success', error?: Error): void {
    const duration = Date.now() - traceContext.startTime;

    const logData: LogEntry = {
      message: `Completed operation: ${traceContext.operation}`,
      operation: traceContext.operation,
      traceId: traceContext.traceId,
      duration,
      context: traceContext.context
    };

    if (error) {
      logData.error = {
        name: error.name,
        message: error.message,
        stack: error.stack
      };
    }

    this.logStructured(result === 'error' ? 'error' : 'info', logData);
  }

  private generateTraceId(): string {
    return Math.random().toString(36).substring(2, 15) +
      Math.random().toString(36).substring(2, 15);
  }

  private maskSecretsInEntry(entry: LogEntry): LogEntry {
    const masked = { ...entry };

    // Mask secrets in message
    if (masked.message) {
      masked.message = maskSecrets(masked.message);
    }

    // Mask secrets in context
    if (masked.context) {
      masked.context = this.maskSecretsInObject(masked.context);
    }

    // Mask secrets in error
    if (masked.error) {
      masked.error = {
        ...masked.error,
        message: maskSecrets(masked.error.message),
        stack: masked.error.stack ? maskSecrets(masked.error.stack) : undefined
      };
    }

    return masked;
  }

  private maskSecretsInObject(obj: Record<string, unknown>): Record<string, unknown> {
    const masked: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        masked[key] = maskSecrets(value);
      } else if (typeof value === 'object' && value !== null) {
        masked[key] = this.maskSecretsInObject(value as Record<string, unknown>);
      } else {
        masked[key] = value;
      }
    }

    return masked;
  }

  private log(level: keyof typeof LEVELS, message: string, ...args: unknown[]): void {
    const formatted = this.formatter(level, message, ...args);

    if (level === 'error' && this.stderrForErrors) {
      process.stderr.write(formatted + '\n');
    } else {
      process.stdout.write(formatted + '\n');
    }
  }

  private defaultFormatter(level: keyof typeof LEVELS, message: string, ...args: unknown[]): string {
    const timestamp = this.timestamps ? this.formatTimestamp() : '';
    const levelStr = this.formatLevel(level);
    const formattedArgs = args.length > 0 ? ' ' + this.formatArgs(args) : '';

    return `${timestamp}${levelStr} ${message}${formattedArgs}`;
  }

  private formatTimestamp(): string {
    const now = new Date();
    const time = now.toISOString();

    if (this.colors) {
      return `${COLORS.timestamp}${time}${RESET} `;
    }

    return `[${time}] `;
  }

  private formatLevel(level: keyof typeof LEVELS): string {
    const levelStr = level.toUpperCase().padEnd(5);

    if (this.colors) {
      return `${COLORS[level]}${levelStr}${RESET}`;
    }

    return `[${levelStr}]`;
  }

  private formatArgs(args: unknown[]): string {
    return args
      .map(arg => {
        let formatted: string;

        if (arg instanceof Error) {
          formatted = arg.stack || arg.message;
        } else if (typeof arg === 'object' && arg !== null) {
          formatted = inspect(arg, { colors: this.colors, depth: 5 });
        } else {
          formatted = String(arg);
        }

        // Apply secret masking to all formatted output
        return maskSecrets(formatted);
      })
      .join(' ');
  }

  private formatError(message: string, ...args: unknown[]): string {
    // If the first argument is an Error, format it specially
    if (args.length > 0 && args[0] instanceof Error) {
      const error = args[0];
      return `${message}: ${error.stack || error.message}`;
    }

    // Fallback to default formatting
    return `${message}${args.length > 0 ? ' ' + this.formatArgs(args) : ''}`;
  }
}

/**
 * A no-op logger that discards all messages
 */
export class NullLogger implements Logger {
  debug(): void { }
  info(): void { }
  warn(): void { }
  error(): void { }

  logStructured(): void { }

  startTrace(operation: string, context?: Record<string, unknown>): TraceContext {
    return {
      traceId: 'null-trace',
      operation,
      startTime: Date.now(),
      context
    };
  }

  endTrace(): void { }
}

/**
 * Create a logger instance
 */
export function createLogger(options: LoggerOptions = {}): Logger {
  return new ConsoleLogger(options);
}

/**
 * Default logger instance
 */
export const logger = createLogger({
  level: process.env['NODE_ENV'] === 'production' ? 'info' : 'debug',
  colors: process.stdout.isTTY,
});

/**
 * Create a child logger with the same options but a prefix
 */
export function createChildLogger(parent: Logger, prefix: string): Logger {
  if (parent instanceof ConsoleLogger) {
    const formatter = parent['formatter'].bind(parent);

    // Get the level name from the parent's numeric level
    const levelName = Object.entries(LEVELS).find(([_, value]) => value === parent['level'])?.[0] as keyof typeof LEVELS || 'info';

    return new ConsoleLogger({
      level: levelName,
      colors: parent['colors'],
      timestamps: parent['timestamps'],
      stderrForErrors: parent['stderrForErrors'],
      formatter: (level, message, ...args) =>
        formatter(level, `[${prefix}] ${message}`, ...args),
    });
  }

  // For other logger types, just return the parent
  return parent;
}
