/**
 * Configuration type definitions for various agent providers and system components.
 * 
 * This module defines the structure of configuration files for different AI development tools
 * and provides type safety for configuration manipulation operations.
 */

/**
 * Generic MCP server configuration structure.
 * This represents the standard format for MCP server definitions across different agents.
 */
export interface MCPServerConfig {
  /** Unique name/identifier for the MCP server */
  name: string;
  
  /** HTTP URL for the MCP server endpoint */
  httpUrl?: string;
  
  /** Command to execute for command-based MCP servers */
  command?: string;
  
  /** Arguments to pass to the command */
  args?: string[];
  
  /** Environment variables for the MCP server */
  env?: Record<string, string>;
  
  /** HTTP headers for authentication and configuration */
  headers?: Record<string, string>;
  
  /** Transport protocol (http, server-sent events, or stdio) */
  transport?: 'http' | 'sse' | 'stdio';
  
  /** Whether the server is disabled */
  disabled?: boolean;
  
  /** List of tools to auto-approve */
  autoApprove?: string[];
}

/**
 * Backup information structure for tracking configuration file backups.
 * Used by the backup management system to track and restore previous configurations.
 */
export interface BackupInfo {
  /** Path to the original configuration file */
  originalPath: string;
  
  /** Path to the backup file */
  backupPath: string;
  
  /** Timestamp when the backup was created */
  timestamp: Date;
  
  /** Size of the original file in bytes */
  fileSize: number;
  
  /** Optional description of what triggered the backup */
  reason?: string;
}

/**
 * Gemini CLI configuration structure.
 * Based on the ~/.gemini/settings.json format used by Google's Gemini CLI tool.
 */
export interface GeminiConfig {
  /** MCP server configurations */
  mcpServers?: {
    [serverName: string]: {
      /** HTTP URL for the MCP server */
      httpUrl?: string;
      /** SSE URL for the MCP server */
      url?: string;
      
      /** Command to execute for command-based servers */
      command?: string;
      
      /** Arguments for the command */
      args?: string[];
      
      /** Environment variables */
      env?: Record<string, string>;

      /** HTTP headers for HTTP/SSE transports */
      headers?: Record<string, string>;

      /** Working directory for stdio transport */
      cwd?: string;
      
      /** Transport protocol */
      transport?: 'http' | 'sse' | 'stdio';
      
      /** Whether the server is disabled */
      disabled?: boolean;
      
      /** Auto-approve list for tools */
      autoApprove?: string[];

      /** Request timeout in milliseconds */
      timeout?: number;

      /** Trust server: bypass tool confirmations */
      trust?: boolean;

      /** Include only these tools */
      includeTools?: string[];

      /** Exclude these tools */
      excludeTools?: string[];
    };
  };
  
  /** Other Gemini-specific settings (preserved during modification) */
  [key: string]: unknown;
}

/**
 * Cursor IDE configuration structure.
 * Based on Cursor's settings.json format for MCP server configuration.
 */
export interface CursorConfig {
  /** MCP server configurations */
  mcpServers?: {
    [serverName: string]: {
      /** Server URL */
      url?: string;
      
      /** HTTP URL for HTTP-based servers */
      httpUrl?: string;
      
      /** Command for command-based servers */
      command?: string;
      
      /** Command arguments */
      args?: string[];
      
      /** Environment variables */
      env?: Record<string, string>;
      
      /** HTTP headers */
      headers?: Record<string, string>;
      
      /** Transport type */
      transport?: 'http' | 'sse' | 'stdio';
      
      /** Disabled flag */
      disabled?: boolean;
      
      /** Auto-approve tools */
      autoApprove?: string[];
    };
  };
  
  /** Other Cursor-specific settings (preserved during modification) */
  [key: string]: unknown;
}

/**
 * Claude Code configuration structure.
 * Based on Claude Code's mcp.json configuration format for MCP servers.
 */
export interface ClaudeConfig {
  /** MCP server configurations */
  mcpServers?: {
    [serverName: string]: {
      /** Command to execute for stdio transport */
      command?: string;
      
      /** Arguments for the command */
      args?: string[];
      
      /** Environment variables */
      env?: Record<string, string>;
      
      /** Server endpoint URL for HTTP transport */
      url?: string;
      
      /** Authentication headers */
      headers?: Record<string, string>;
      
      /** Transport protocol */
      transport?: 'http' | 'sse' | 'stdio';
      
      /** Disabled state */
      disabled?: boolean;
    };
  };
  
  /** Per-project configuration map keyed by absolute project path */
  projects?: {
    [projectPath: string]: ClaudeProjectConfig;
  };
  
  /** Other Claude-specific settings (preserved during modification) */
  [key: string]: unknown;
}

/**
 * Claude per-project configuration structure.
 * Minimal shape to support MCP server activation within a specific project.
 */
export interface ClaudeProjectConfig {
  /** Project-specific MCP server configurations */
  mcpServers?: {
    [serverName: string]: {
      command?: string;
      args?: string[];
      env?: Record<string, string>;
      url?: string;
      headers?: Record<string, string>;
      transport?: 'http' | 'sse' | 'stdio';
      disabled?: boolean;
    };
  };

  /** Enabled/disabled .mcp.json file references (kept for compatibility) */
  enabledMcpjsonServers?: string[];
  disabledMcpjsonServers?: string[];

  /** Additional fields we don't model explicitly should be preserved */
  [key: string]: unknown;
}

/**
 * Generic configuration structure for unknown or custom agents.
 * Provides a flexible structure for agents that don't have specific type definitions.
 */
export interface GenericConfig {
  /** MCP servers section (flexible structure) */
  mcpServers?: Record<string, unknown>;
  
  /** Any other configuration properties */
  [key: string]: unknown;
}

/**
 * Platform-specific configuration paths for different operating systems.
 * Used by providers to locate configuration files across different platforms.
 */
export interface PlatformPaths {
  /** Windows-specific paths */
  windows?: {
    /** AppData roaming directory path */
    appData?: string;
    
    /** Local AppData directory path */
    localAppData?: string;
    
    /** User profile directory */
    userProfile?: string;
  };
  
  /** macOS-specific paths */
  macos?: {
    /** User Library directory */
    library?: string;
    
    /** Application Support directory */
    applicationSupport?: string;
    
    /** User home directory */
    home?: string;
  };
  
  /** Linux/Unix-specific paths */
  linux?: {
    /** XDG config directory */
    configHome?: string;
    
    /** User home directory */
    home?: string;
    
    /** Local share directory */
    localShare?: string;
  };
}

/**
 * Validation schema structure for configuration validation.
 * Defines rules and constraints for validating configuration data.
 */
export interface ValidationSchema {
  /** Required fields that must be present */
  required?: string[];
  
  /** Optional fields that may be present */
  optional?: string[];
  
  /** Field type definitions */
  types?: Record<string, 'string' | 'number' | 'boolean' | 'object' | 'array'>;
  
  /** Pattern validation for string fields */
  patterns?: Record<string, RegExp>;
  
  /** Custom validation functions */
  validators?: Record<string, (value: unknown) => boolean>;
}

/**
 * Configuration modification context.
 * Provides context information during configuration modification operations.
 */
export interface ConfigModificationContext {
  /** The agent provider performing the modification */
  providerName: string;
  
  /** Path to the configuration file being modified */
  configPath: string;
  
  /** The MCP server configuration being applied */
  mcpConfig: MCPServerConfig;
  
  /** Whether this is a new configuration or an update */
  isUpdate: boolean;
  
  /** Backup information if a backup was created */
  backup?: BackupInfo;
}
