export interface MCPServerConfig {
  name: string;
  type: string;
  config: {
    [key: string]: any;
    apiKey?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    serverUrl?: string;
    authToken?: string;
    autoUpdate?: boolean;
  };
}

export interface ConfigValidationResult {
  valid: boolean;
  error?: string;
}

export interface InstallResult {
  success: boolean;
  message: string;
  configPath: string;
}
