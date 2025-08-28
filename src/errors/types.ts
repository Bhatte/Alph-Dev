/**
 * Base error class for all Alph CLI errors
 */
export class AlphError extends Error {
  public readonly code: string;
  public readonly details: Record<string, unknown> | undefined;
  public readonly cause: Error | undefined;
  public readonly isAlphError = true;

  constructor(
    message: string,
    code: string,
    options: {
      details?: Record<string, unknown>;
      cause?: Error;
    } = {}
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.details = options.details;
    this.cause = options.cause;

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }

    // Ensure the stack includes the cause's stack if available
    if (this.cause && this.cause.stack) {
      this.stack = `${this.stack}\nCaused by: ${this.cause.stack}`;
    }
  }

  /**
   * Convert error to a plain object for serialization
   */
  toJSON() {
    const result: Record<string, unknown> = {
      name: this.name,
      code: this.code,
      message: this.message,
      stack: this.stack,
    };
    
    if (this.details !== undefined) {
      result['details'] = this.details;
    }
    
    if (this.cause !== undefined) {
      result['cause'] = this.cause instanceof AlphError ? this.cause.toJSON() : this.cause;
    }
    
    return result;
  }
}

/**
 * Configuration-related errors
 */
export class ConfigError extends AlphError {
  constructor(
    message: string,
    public readonly configPath?: string,
    options: { cause?: Error; details?: Record<string, unknown> } = {}
  ) {
    const errorOptions = {
      ...options,
      ...(options.details !== undefined || configPath !== undefined ? {
        details: {
          ...options.details,
          ...(configPath !== undefined ? { configPath } : {}),
        }
      } : {}),
    };
    
    super(message, 'CONFIG_ERROR', errorOptions);
  }
}

/**
 * File system related errors
 */
export class FileSystemError extends AlphError {
  constructor(
    message: string,
    public readonly path: string,
    public readonly operation: string,
    options: { cause?: Error; details?: Record<string, unknown> } = {}
  ) {
    const errorOptions = {
      ...options,
      ...(options.details !== undefined ? {
        details: {
          ...options.details,
          path,
          operation,
        }
      } : {}),
    };
    
    super(message, 'FILE_SYSTEM_ERROR', errorOptions);
  }
}

/**
 * Permission related errors
 */
export class PermissionError extends FileSystemError {
  public override code: string;
  
  constructor(
    message: string,
    path: string,
    operation: string,
    public readonly requiredPermission: 'read' | 'write' | 'execute',
    options: { cause?: Error; details?: Record<string, unknown> } = {}
  ) {
    const errorMessage = message || `Insufficient permissions to ${operation} '${path}'`;
    const errorOptions = {
      ...options,
      ...(options.details !== undefined ? {
        details: {
          ...options.details,
          requiredPermission,
        }
      } : {}),
    };
    
    super(errorMessage, path, operation, errorOptions);
    this.code = 'PERMISSION_ERROR';
  }
}

/**
 * Network related errors
 */
export class NetworkError extends AlphError {
  constructor(
    message: string,
    public readonly url?: string,
    public readonly statusCode?: number,
    options: { cause?: Error; details?: Record<string, unknown> } = {}
  ) {
    const errorOptions = {
      ...options,
      ...(options.details !== undefined || url !== undefined || statusCode !== undefined ? {
        details: {
          ...options.details,
          ...(url !== undefined ? { url } : {}),
          ...(statusCode !== undefined ? { statusCode } : {}),
        }
      } : {}),
    };
    
    super(message, 'NETWORK_ERROR', errorOptions);
  }
}

/**
 * Validation errors
 */
export class ValidationError extends AlphError {
  constructor(
    message: string,
    public readonly field?: string,
    public readonly value?: unknown,
    options: { cause?: Error; details?: Record<string, unknown> } = {}
  ) {
    const errorOptions = {
      ...options,
      ...(options.details !== undefined || field !== undefined || value !== undefined ? {
        details: {
          ...options.details,
          ...(field !== undefined ? { field } : {}),
          ...(value !== undefined ? { value } : {}),
        }
      } : {}),
    };
    
    super(message, 'VALIDATION_ERROR', errorOptions);
  }
}

/**
 * Type guard to check if an error is an AlphError
 */
export function isAlphError(error: unknown): error is AlphError {
  return error instanceof AlphError || (error as any)?.isAlphError === true;
}

/**
 * Type guard to check if an error is a specific AlphError type
 */
export function isErrorOfType<T extends AlphError>(
  error: unknown,
  errorType: new (...args: any[]) => T
): error is T {
  return error instanceof errorType || (error as any)?.name === errorType.name;
}
