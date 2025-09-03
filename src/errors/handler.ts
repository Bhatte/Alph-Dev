import { AlphError, isAlphError, isErrorOfType, ConfigError, FileSystemError, PermissionError, NetworkError, ValidationError } from './types';
import { Logger } from '../logger';

export interface ErrorHandlerOptions {
  /**
   * Logger instance for error reporting
   */
  logger?: Logger;
  
  /**
   * Whether to include error stack traces in output
   * @default false in production, true in development
   */
  includeStack?: boolean;
  
  /**
   * Whether to include error details in output
   * @default true
   */
  includeDetails?: boolean;
  
  /**
   * Whether to log errors to the console
   * @default true
   */
  logErrors?: boolean;
}

/**
 * Handles errors in a consistent way across the application
 */
export class ErrorHandler {
  private readonly options: Required<ErrorHandlerOptions>;
  
  constructor(options: ErrorHandlerOptions = {}) {
    const isDev = process.env['NODE_ENV'] !== 'production';
    
    this.options = {
      logger: {
        debug: console.debug.bind(console),
        info: console.info.bind(console),
        warn: console.warn.bind(console),
        error: console.error.bind(console),
        logStructured: () => {},
        startTrace: () => ({ traceId: '', operation: '', startTime: Date.now() }),
        endTrace: () => {}
      },
      includeStack: isDev,
      includeDetails: true,
      logErrors: true,
      ...options,
    };
  }
  
  /**
   * Handle an error and return a user-friendly message
   */
  handle(error: unknown): { message: string; details?: unknown } {
    // Convert to AlphError if it's not already
    const alphError = this.normalizeError(error);
    
    // Log the error if enabled
    if (this.options.logErrors) {
      this.logError(alphError);
    }
    
    // Format the error for display
    return this.formatError(alphError);
  }
  
  /**
   * Convert any error to an AlphError
   */
  private normalizeError(error: unknown): AlphError {
    if (isAlphError(error)) {
      return error;
    }
    
    // Handle common error types
    if (error instanceof Error) {
      // Check for common error patterns
      if ('code' in error) {
        const code = (error as any).code;
        
        // Handle Node.js system errors
        if (code === 'EACCES' || code === 'EPERM') {
          return new PermissionError(
            'Permission denied',
            (error as any).path || 'unknown',
            (error as any).syscall || 'access',
            'read',
            { cause: error }
          );
        }
        
        if (code === 'ENOENT') {
          return new FileSystemError(
            'File or directory not found',
            (error as any).path || 'unknown',
            (error as any).syscall || 'access',
            { cause: error }
          );
        }
      }
      
      // Generic error wrapper
      return new AlphError(error.message, 'UNKNOWN_ERROR', { cause: error });
    }
    
    // Handle non-Error objects
    return new AlphError(
      typeof error === 'string' ? error : 'An unknown error occurred',
      'UNKNOWN_ERROR',
      { details: { original: error } }
    );
  }
  
  /**
   * Format an error for display to the user
   */
  private formatError(error: AlphError): { message: string; details?: unknown } {
    let message: string;
    let details: Record<string, unknown> = {};
    
    // Generate user-friendly message based on error type
    if (isErrorOfType(error, ConfigError)) {
      message = `Configuration Error: ${error.message}`;
      if (error['configPath']) {
        details['configPath'] = error['configPath'];
      }
    } 
    else if (isErrorOfType(error, FileSystemError)) {
      message = `File System Error: ${error.message}`;
      details = {
        path: error.path,
        operation: error.operation,
      };
      
      if (isErrorOfType(error, PermissionError)) {
        message = `Permission Error: Cannot ${error.operation} '${error.path}'. ` +
                 `Required permission: ${error.requiredPermission}`;
      }
    }
    else if (isErrorOfType(error, NetworkError)) {
      message = `Network Error: ${error.message}`;
      if (error['url']) details['url'] = error['url'];
      if (error['statusCode']) details['statusCode'] = error['statusCode'];
    }
    else if (isErrorOfType(error, ValidationError)) {
      message = `Validation Error: ${error.message}`;
      if (error['field']) details['field'] = error['field'];
    }
    else {
      message = `Error: ${error.message}`;
    }
    
    // Include error details if enabled
    if (this.options.includeDetails && error.details) {
      details = { ...details, ...error.details };
    }
    
    // Include stack trace if enabled
    if (this.options.includeStack && error['stack']) {
      details['stack'] = error['stack'];
    }
    
    return {
      message,
      ...(Object.keys(details).length > 0 ? { details } : {}),
    };
  }
  
  /**
   * Log an error using the configured logger
   */
  private logError(error: AlphError): void {
    const { logger } = this.options;
    const { message, details } = this.formatError(error);
    
    logger.error(message);
    
    if (details) {
      logger.error('Error details:', details);
    }
    
    // Log the original error if it's different from the normalized one
    if (error.cause) {
      logger.error('Caused by:', error.cause);
    }
  }
  
  /**
   * Create a function that handles errors and returns a consistent response
   */
  createHandler<T extends any[] = any[], R = any>(
    fn: (...args: T) => Promise<R> | R
  ): (...args: T) => Promise<{ data?: R; error?: { message: string; details?: unknown } }> {
    return async (...args: T) => {
      try {
        const result = await fn(...args);
        return { data: result };
      } catch (error) {
        const { message, details } = this.handle(error);
        return { error: { message, ...(details ? { details } : {}) } };
      }
    };
  }
}

/**
 * Create a default error handler instance
 */
export function createErrorHandler(options: ErrorHandlerOptions = {}): ErrorHandler {
  return new ErrorHandler(options);
}

/**
 * Default error handler instance
 */
export const defaultErrorHandler = createErrorHandler();

/**
 * Helper function to handle errors with the default error handler
 */
export function handleError(error: unknown): { message: string; details?: unknown } {
  return defaultErrorHandler.handle(error);
}

/**
 * Wrap a function with error handling
 */
export function withErrorHandling<T extends any[] = any[], R = any>(
  fn: (...args: T) => Promise<R> | R
): (...args: T) => Promise<{ data?: R; error?: { message: string; details?: unknown } }> {
  return defaultErrorHandler.createHandler(fn);
}
