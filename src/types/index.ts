// Re-export MCPServerConfig from config.ts to maintain compatibility
export type { MCPServerConfig } from './config';

export interface ConfigValidationResult {
  valid: boolean;
  error?: string;
}

export interface InstallResult {
  success: boolean;
  message: string;
  configPath: string;
}
