import { Logger, LogEntry, TraceContext, createLogger } from './logger';
import { createWriteStream } from 'fs';
import { dirname } from 'path';
import { promises as fs } from 'fs';
import * as fsSync from 'fs';

export interface EnhancedLoggerOptions {
  /**
   * Enable file logging
   * @default false
   */
  fileLogging?: boolean | undefined;
  /**
   * Log file path
   * @default './logs/alph.log'
   */
  logFile?: string | undefined;
  /**
   * Maximum log file size in bytes before rotation
   * @default 10MB
   */
  maxFileSize?: number | undefined;
  /**
   * Number of log files to keep
   * @default 5
   */
  maxFiles?: number | undefined;
  /**
   * Enable JSON logging format
   * @default false
   */
  jsonLogging?: boolean | undefined;
  /**
   * Enable log rotation
   * @default true
   */
  rotate?: boolean | undefined;
  /**
   * Minimum log level to output
   * @default 'info'
   */
  level?: 'debug' | 'info' | 'warn' | 'error' | undefined;
  /**
   * Whether to enable colors in the output
   * @default true
   */
  colors?: boolean | undefined;
  /**
   * Whether to include timestamps in the output
   * @default true
   */
  timestamps?: boolean | undefined;
  /**
   * Whether to log to stderr for errors
   * @default true
   */
  stderrForErrors?: boolean | undefined;
}

/**
 * Enhanced logger with file output and JSON logging capabilities
 */
export class EnhancedLogger implements Logger {
  private consoleLogger: Logger;
  private fileStream: any | null = null;
  private options: EnhancedLoggerOptions;
  private currentFileSize: number = 0;

  constructor(options: EnhancedLoggerOptions = {}) {
    this.options = {
      fileLogging: options.fileLogging || false,
      logFile: options.logFile || './logs/alph.log',
      maxFileSize: options.maxFileSize || 10 * 1024 * 1024, // 10MB
      maxFiles: options.maxFiles || 5,
      jsonLogging: options.jsonLogging || false,
      rotate: options.rotate !== false,
      level: options.level,
      colors: options.colors,
      timestamps: options.timestamps,
      stderrForErrors: options.stderrForErrors,
      ...options
    };

    // Create console logger with only defined properties
    const loggerOptions: any = {};
    if (this.options.level !== undefined) loggerOptions.level = this.options.level;
    if (this.options.colors !== undefined) loggerOptions.colors = this.options.colors;
    if (this.options.timestamps !== undefined) loggerOptions.timestamps = this.options.timestamps;
    if (this.options.stderrForErrors !== undefined) loggerOptions.stderrForErrors = this.options.stderrForErrors;
    
    this.consoleLogger = createLogger(loggerOptions);

    // Initialize file logging if enabled
    if (this.options.fileLogging && this.options.logFile) {
      this.initializeFileLogging().catch(error => {
        console.error('Failed to initialize file logging:', error);
      });
    }
  }

  private async initializeFileLogging(): Promise<void> {
    try {
      if (!this.options.logFile) return;

      // Ensure log directory exists
      const logDir = dirname(this.options.logFile);
      await fs.mkdir(logDir, { recursive: true });

      // Create write stream
      this.fileStream = createWriteStream(this.options.logFile, { flags: 'a' });

    } catch (error) {
      console.error('Failed to initialize file logging:', error);
    }
  }

  private async rotateLogFile(): Promise<void> {
    if (!this.options.rotate || !this.options.logFile || !this.fileStream) return;

    try {
      // Close current stream
      this.fileStream.close();

      // Rotate files
      for (let i = this.options.maxFiles! - 1; i > 0; i--) {
        const oldFile = `${this.options.logFile}.${i}`;
        const newFile = `${this.options.logFile}.${i + 1}`;
        try {
          // Rename files
          if (fsSync.existsSync(oldFile)) {
            fsSync.renameSync(oldFile, newFile);
          }
        } catch (error) {
          // Ignore errors during rotation
        }
      }

      // Move current log to .1
      if (fsSync.existsSync(this.options.logFile)) {
        fsSync.renameSync(this.options.logFile, `${this.options.logFile}.1`);
      }

      // Create new log file
      await this.initializeFileLogging();

    } catch (error) {
      console.error('Failed to rotate log file:', error);
    }
  }

  private async writeToFile(message: string): Promise<void> {
    if (!this.fileStream || !this.options.logFile) return;

    try {
      // Check if rotation is needed
      this.currentFileSize += message.length;
      if (this.currentFileSize > this.options.maxFileSize!) {
        await this.rotateLogFile();
        this.currentFileSize = message.length;
      }

      // Write to file - use callback to ensure proper error handling
      this.fileStream.write(message + '\n', (error: Error | null) => {
        if (error) {
          console.error('Failed to write to log file:', error);
        }
      });

    } catch (error) {
      // Don't let file logging errors break the application
      console.error('Failed to write to log file:', error);
    }
  }

  debug(message: string, ...args: unknown[]): void {
    this.consoleLogger.debug(message, ...args);

    if (this.options.fileLogging && this.options.logFile) {
      const timestamp = new Date().toISOString();
      const logMessage = this.options.jsonLogging
        ? JSON.stringify({ timestamp, level: 'DEBUG', message, args })
        : `[${timestamp}] DEBUG ${message}${args.length > 0 ? ' ' + JSON.stringify(args) : ''}`;

      this.writeToFile(logMessage);
    }
  }

  info(message: string, ...args: unknown[]): void {
    this.consoleLogger.info(message, ...args);

    if (this.options.fileLogging && this.options.logFile) {
      const timestamp = new Date().toISOString();
      const logMessage = this.options.jsonLogging
        ? JSON.stringify({ timestamp, level: 'INFO', message, args })
        : `[${timestamp}] INFO ${message}${args.length > 0 ? ' ' + JSON.stringify(args) : ''}`;

      this.writeToFile(logMessage);
    }
  }

  warn(message: string, ...args: unknown[]): void {
    this.consoleLogger.warn(message, ...args);

    if (this.options.fileLogging && this.options.logFile) {
      const timestamp = new Date().toISOString();
      const logMessage = this.options.jsonLogging
        ? JSON.stringify({ timestamp, level: 'WARN', message, args })
        : `[${timestamp}] WARN ${message}${args.length > 0 ? ' ' + JSON.stringify(args) : ''}`;

      this.writeToFile(logMessage);
    }
  }

  error(message: string, ...args: unknown[]): void {
    this.consoleLogger.error(message, ...args);

    if (this.options.fileLogging && this.options.logFile) {
      const timestamp = new Date().toISOString();
      const logMessage = this.options.jsonLogging
        ? JSON.stringify({ timestamp, level: 'ERROR', message, args })
        : `[${timestamp}] ERROR ${message}${args.length > 0 ? ' ' + JSON.stringify(args) : ''}`;

      this.writeToFile(logMessage);
    }
  }

  logStructured(level: 'debug' | 'info' | 'warn' | 'error', data: LogEntry): void {
    this.consoleLogger.logStructured(level, data);

    if (this.options.fileLogging && this.options.logFile) {
      const logMessage = this.options.jsonLogging
        ? JSON.stringify(data)
        : `[${data.timestamp || new Date().toISOString()}] ${level.toUpperCase()} ${data.message}`;

      this.writeToFile(logMessage);
    }
  }
  
  startTrace(operation: string, context?: Record<string, unknown>): TraceContext {
    return this.consoleLogger.startTrace(operation, context);
  }
  
  endTrace(traceContext: TraceContext, result: 'success' | 'error' = 'success', error?: Error): void {
    this.consoleLogger.endTrace(traceContext, result, error);
  }
}

/**
 * Create an enhanced logger instance
 */
export function createEnhancedLogger(options: EnhancedLoggerOptions = {}): Logger {
  return new EnhancedLogger(options);
}

/**
 * Default enhanced logger instance
 */
export const enhancedLogger = createEnhancedLogger({
  level: process.env['NODE_ENV'] === 'production' ? 'info' : 'debug',
  colors: process.stdout.isTTY,
  fileLogging: process.env['NODE_ENV'] === 'production',
  logFile: './logs/alph.log',
  jsonLogging: true
});
