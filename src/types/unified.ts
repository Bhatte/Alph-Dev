/**
 * Unified Alph configuration types (alph.json)
 */

export type UnifiedTransport = 'http' | 'sse' | 'stdio';

export interface UnifiedAuthentication {
  strategy: 'bearer' | 'basic' | 'none' | string;
  token?: string;
  username?: string;
  password?: string;
}

export interface UnifiedMCPServer {
  /** Stable identifier (required) */
  id: string;
  /** Optional user-friendly label */
  displayName?: string;
  /** Enabled state, defaults true */
  enabled?: boolean;
  /** Transport type */
  transport: UnifiedTransport;
  /** Endpoint URL for http/sse */
  endpoint?: string;
  /** Command for stdio servers */
  command?: string;
  /** Optional working directory */
  cwd?: string;
  /** Command args */
  args?: string[];
  /** Environment vars */
  env?: Record<string, string>;
  /** HTTP headers */
  headers?: Record<string, string>;
  /** Optional authentication */
  authentication?: UnifiedAuthentication;
  /** Request/operation timeout (ms) */
  timeout?: number;
}

export interface UnifiedConfig {
  version?: string;
  mcpServers: UnifiedMCPServer[];
}
