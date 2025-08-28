/**
 * Information about an AI agent
 */
export interface AgentInfo {
  /** Unique identifier for the agent */
  id: string;
  
  /** Display name of the agent */
  name: string;
  
  /** Whether the agent is installed on the system */
  installed: boolean;
  
  /** Version of the installed agent, if available */
  version?: string;
  
  /** Path to the agent's executable or installation directory, if known */
  path?: string;
}

/**
 * Supported agent types
 */
export type AgentType = 'gemini' | 'cursor' | 'claude' | string;

/**
 * Agent detection result
 */
export interface AgentDetectionResult {
  /** The detected agent information */
  agent: AgentInfo;
  
  /** Whether the agent is properly configured */
  isConfigured: boolean;
  
  /** Configuration path, if any */
  configPath?: string;
  
  /** Any error that occurred during detection */
  error?: Error;
}
