import { isAbsolute, normalize } from 'path';
import { platform } from 'os';

/**
 * Validation result with detailed error information
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * MCP server configuration validation schema
 */
export interface MCPServerValidationSchema {
  name: string;
  url?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  headers?: Record<string, string>;
  transport?: 'http' | 'sse';
}

/**
 * Configuration validation utilities for MCP servers and file paths
 * Provides JSON schema validation, URL validation, and security checks
 */
export class ValidationUtils {
  /**
   * Validates an MCP server configuration object
   * @param config - MCP server configuration to validate
   * @returns ValidationResult with detailed feedback
   */
  static validateMCPServerConfig(config: any): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: []
    };

    // Check if config is an object
    if (!config || typeof config !== 'object') {
      result.errors.push('MCP server configuration must be an object');
      result.isValid = false;
      return result;
    }

    // Validate server name
    if (!config.name || typeof config.name !== 'string') {
      result.errors.push('MCP server must have a valid name (string)');
      result.isValid = false;
    } else if (!this.isValidServerName(config.name)) {
      result.errors.push('MCP server name must contain only alphanumeric characters, hyphens, and underscores');
      result.isValid = false;
    }

    // Validate connection method (either URL or command, not both)
    const hasUrl = config.url && typeof config.url === 'string';
    const hasCommand = config.command && typeof config.command === 'string';

    if (!hasUrl && !hasCommand) {
      result.errors.push('MCP server must have either a URL or command specified');
      result.isValid = false;
    } else if (hasUrl && hasCommand) {
      result.warnings.push('MCP server has both URL and command specified, URL will take precedence');
    }

    // Validate URL if present
    if (hasUrl) {
      const urlValidation = this.validateMCPServerUrl(config.url);
      if (!urlValidation.isValid) {
        result.errors.push(...urlValidation.errors);
        result.isValid = false;
      }
      result.warnings.push(...urlValidation.warnings);
    }

    // Validate command if present
    if (hasCommand) {
      const commandValidation = this.validateCommand(config.command, config.args);
      if (!commandValidation.isValid) {
        result.errors.push(...commandValidation.errors);
        result.isValid = false;
      }
      result.warnings.push(...commandValidation.warnings);
    }

    // Validate transport type
    if (config.transport && !['http', 'sse'].includes(config.transport)) {
      result.errors.push('Transport must be either "http" or "sse"');
      result.isValid = false;
    }

    // Validate headers if present
    if (config.headers) {
      const headersValidation = this.validateHeaders(config.headers);
      if (!headersValidation.isValid) {
        result.errors.push(...headersValidation.errors);
        result.isValid = false;
      }
      result.warnings.push(...headersValidation.warnings);
    }

    // Validate environment variables if present
    if (config.env) {
      const envValidation = this.validateEnvironmentVariables(config.env);
      if (!envValidation.isValid) {
        result.errors.push(...envValidation.errors);
        result.isValid = false;
      }
      result.warnings.push(...envValidation.warnings);
    }

    return result;
  }

  /**
   * Validates an MCP server URL format and security
   * @param url - URL to validate
   * @returns ValidationResult with detailed feedback
   */
  static validateMCPServerUrl(url: string): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: []
    };

    if (!url || typeof url !== 'string') {
      result.errors.push('URL must be a non-empty string');
      result.isValid = false;
      return result;
    }

    try {
      const parsedUrl = new URL(url);

      // Check protocol
      if (!['http:', 'https:', 'ws:', 'wss:'].includes(parsedUrl.protocol)) {
        result.errors.push('URL must use http, https, ws, or wss protocol');
        result.isValid = false;
      }

      // Security warnings
      if (parsedUrl.protocol === 'http:' && parsedUrl.hostname !== 'localhost' && parsedUrl.hostname !== '127.0.0.1') {
        result.warnings.push('Using HTTP for non-localhost connections is not secure');
      }

      // Check for valid hostname
      if (!parsedUrl.hostname) {
        result.errors.push('URL must have a valid hostname');
        result.isValid = false;
      }

      // Check for suspicious patterns
      if (parsedUrl.hostname.includes('..') || parsedUrl.pathname.includes('..')) {
        result.errors.push('URL contains suspicious path traversal patterns');
        result.isValid = false;
      }

      // Port validation
      if (parsedUrl.port) {
        const port = parseInt(parsedUrl.port, 10);
        if (isNaN(port) || port < 1 || port > 65535) {
          result.errors.push('URL port must be between 1 and 65535');
          result.isValid = false;
        }
      }

    } catch (error) {
      result.errors.push(`Invalid URL format: ${error instanceof Error ? error.message : 'Unknown error'}`);
      result.isValid = false;
    }

    return result;
  }

  /**
   * Validates MCP access key format
   * @param accessKey - Access key to validate
   * @returns ValidationResult with detailed feedback
   */
  static validateMCPAccessKey(accessKey: string): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: []
    };

    if (!accessKey || typeof accessKey !== 'string') {
      result.errors.push('Access key must be a non-empty string');
      result.isValid = false;
      return result;
    }

    // Check minimum length
    if (accessKey.length < 8) {
      result.errors.push('Access key must be at least 8 characters long');
      result.isValid = false;
    }

    // Check for common patterns
    if (this.isBase64(accessKey)) {
      result.warnings.push('Access key appears to be base64 encoded');
    } else if (this.isJWT(accessKey)) {
      result.warnings.push('Access key appears to be a JWT token');
    } else if (this.isUUID(accessKey)) {
      result.warnings.push('Access key appears to be a UUID');
    }

    // Security warnings
    if (accessKey.toLowerCase().includes('test') || accessKey.toLowerCase().includes('demo')) {
      result.warnings.push('Access key appears to be a test/demo key');
    }

    return result;
  }

  /**
   * Validates and sanitizes file paths for security
   * @param filePath - File path to validate
   * @param allowRelative - Whether to allow relative paths (default: false)
   * @returns ValidationResult with detailed feedback
   */
  static validateFilePath(filePath: string, allowRelative: boolean = false): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: []
    };

    if (!filePath || typeof filePath !== 'string') {
      result.errors.push('File path must be a non-empty string');
      result.isValid = false;
      return result;
    }

    // Check for path traversal attempts
    if (filePath.includes('..')) {
      result.errors.push('File path contains path traversal patterns (..)');
      result.isValid = false;
    }

    // Check for null bytes
    if (filePath.includes('\0')) {
      result.errors.push('File path contains null bytes');
      result.isValid = false;
    }

    // Platform-specific validation
    if (platform() === 'win32') {
      // Windows path validation
      if (/[<>:"|?*]/.test(filePath)) {
        result.errors.push('File path contains invalid Windows characters');
        result.isValid = false;
      }

      // Check for reserved names
      const reservedNames = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9', 'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'];
      const fileName = filePath.split(/[/\\]/).pop()?.split('.')[0]?.toUpperCase();
      if (fileName && reservedNames.includes(fileName)) {
        result.errors.push('File path uses a reserved Windows name');
        result.isValid = false;
      }
    }

    // Check if path is absolute when required
    if (!allowRelative && !isAbsolute(filePath)) {
      result.errors.push('File path must be absolute');
      result.isValid = false;
    }

    // Normalize and check for changes (indicates suspicious path)
    const normalized = normalize(filePath);
    if (normalized !== filePath) {
      result.warnings.push('File path was normalized, original may contain redundant elements');
    }

    return result;
  }

  /**
   * Validates JSON structure and content
   * @param jsonString - JSON string to validate
   * @returns ValidationResult with detailed feedback
   */
  static validateJSON(jsonString: string): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: []
    };

    if (!jsonString || typeof jsonString !== 'string') {
      result.errors.push('JSON must be a non-empty string');
      result.isValid = false;
      return result;
    }

    try {
      const parsed = JSON.parse(jsonString);

      // Check for common issues
      if (parsed === null) {
        result.warnings.push('JSON parses to null');
      } else if (typeof parsed !== 'object') {
        result.warnings.push('JSON does not parse to an object');
      } else if (Array.isArray(parsed)) {
        result.warnings.push('JSON parses to an array rather than an object');
      }

      // Check for potentially problematic content
      const stringified = JSON.stringify(parsed);
      if (stringified.length > 1024 * 1024) { // 1MB
        result.warnings.push('JSON is very large (>1MB)');
      }

    } catch (error) {
      result.errors.push(`Invalid JSON: ${error instanceof Error ? error.message : 'Unknown parsing error'}`);
      result.isValid = false;
    }

    return result;
  }

  /**
   * Validates HTTP headers object
   * @param headers - Headers object to validate
   * @returns ValidationResult with detailed feedback
   */
  private static validateHeaders(headers: any): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: []
    };

    if (typeof headers !== 'object' || headers === null) {
      result.errors.push('Headers must be an object');
      result.isValid = false;
      return result;
    }

    for (const [key, value] of Object.entries(headers)) {
      if (typeof key !== 'string' || typeof value !== 'string') {
        result.errors.push('Header keys and values must be strings');
        result.isValid = false;
      }

      // Check for suspicious headers
      if (key.toLowerCase().includes('cookie') || key.toLowerCase().includes('session')) {
        result.warnings.push(`Header "${key}" may contain sensitive information`);
      }
    }

    return result;
  }

  /**
   * Validates environment variables object
   * @param env - Environment variables object to validate
   * @returns ValidationResult with detailed feedback
   */
  private static validateEnvironmentVariables(env: any): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: []
    };

    if (typeof env !== 'object' || env === null) {
      result.errors.push('Environment variables must be an object');
      result.isValid = false;
      return result;
    }

    for (const [key, value] of Object.entries(env)) {
      if (typeof key !== 'string' || typeof value !== 'string') {
        result.errors.push('Environment variable keys and values must be strings');
        result.isValid = false;
      }

      // Check for suspicious environment variables
      if (key.toLowerCase().includes('password') || key.toLowerCase().includes('secret') || key.toLowerCase().includes('key')) {
        result.warnings.push(`Environment variable "${key}" may contain sensitive information`);
      }
    }

    return result;
  }

  /**
   * Validates a command and its arguments
   * @param command - Command to validate
   * @param args - Command arguments to validate
   * @returns ValidationResult with detailed feedback
   */
  private static validateCommand(command: string, args?: string[]): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: []
    };

    if (!command || typeof command !== 'string') {
      result.errors.push('Command must be a non-empty string');
      result.isValid = false;
      return result;
    }

    // Check for path traversal in command
    if (command.includes('..')) {
      result.errors.push('Command contains path traversal patterns');
      result.isValid = false;
    }

    // Validate arguments if present
    if (args !== undefined) {
      if (!Array.isArray(args)) {
        result.errors.push('Command arguments must be an array');
        result.isValid = false;
      } else {
        for (const arg of args) {
          if (typeof arg !== 'string') {
            result.errors.push('All command arguments must be strings');
            result.isValid = false;
          }
        }
      }
    }

    return result;
  }

  /**
   * Checks if a server name is valid (alphanumeric, hyphens, underscores)
   * @param name - Server name to check
   * @returns True if valid, false otherwise
   */
  private static isValidServerName(name: string): boolean {
    return /^[a-zA-Z0-9_-]+$/.test(name);
  }

  /**
   * Checks if a string appears to be base64 encoded
   * @param str - String to check
   * @returns True if appears to be base64, false otherwise
   */
  private static isBase64(str: string): boolean {
    return /^[A-Za-z0-9+/]*={0,2}$/.test(str) && str.length % 4 === 0;
  }

  /**
   * Checks if a string appears to be a JWT token
   * @param str - String to check
   * @returns True if appears to be JWT, false otherwise
   */
  private static isJWT(str: string): boolean {
    const parts = str.split('.');
    return parts.length === 3 && parts.every(part => this.isBase64(part.replace(/-/g, '+').replace(/_/g, '/')));
  }

  /**
   * Checks if a string appears to be a UUID
   * @param str - String to check
   * @returns True if appears to be UUID, false otherwise
   */
  private static isUUID(str: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);
  }
}