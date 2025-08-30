import { MCPServerConfig } from '../types/config';
import * as os from 'os';
import * as path from 'path';

// Define AgentType locally to avoid circular dependencies
export type AgentType = 'gemini' | 'cursor' | 'claude' | string;

/**
 * Base configuration generator interface
 */
export interface ConfigGenerator {
  /**
   * Generate configuration for a specific agent
   * @param agentType The type of agent to generate config for
   * @param mcpConfig The MCP server configuration
   * @param options Additional options for configuration generation
   */
  generate(
    agentType: AgentType,
    mcpConfig: MCPServerConfig,
    options?: Record<string, unknown>
  ): Promise<Record<string, unknown>>;

  /**
   * Get the default configuration path for an agent
   * @param agentType The type of agent
   */
  getDefaultConfigPath(agentType: AgentType): Promise<string>;

  /**
   * Validate configuration for an agent
   * @param agentType The type of agent
   * @param config The configuration to validate
   */
  validate?(
    agentType: AgentType,
    config: unknown
  ): Promise<{ valid: boolean; errors?: string[] }>;
}

/**
 * Default configuration generator implementation
 */
export class DefaultConfigGenerator implements ConfigGenerator {
  async generate(
    agentType: AgentType,
    mcpConfig: MCPServerConfig,
    options: Record<string, unknown> = {}
  ): Promise<Record<string, unknown>> {
    // Validate required fields
    if (!mcpConfig.name) {
      throw new Error('MCP server name is required');
    }
    
    // Validate that at least one of command or httpUrl is provided
    if (!mcpConfig.command && !mcpConfig.httpUrl) {
      throw new Error('Either command or httpUrl must be provided for MCP server');
    }

    // Extract existing config if provided
    const existingConfig = options['existingConfig'] as Record<string, unknown> | undefined || (Object.keys(options).length > 0 && !options['existingConfig'] ? options as Record<string, unknown> : undefined);
    
    const serverConfig = {
      ...(mcpConfig.command ? { command: mcpConfig.command } : {}),
      ...(mcpConfig.args ? { args: mcpConfig.args } : {}),
      ...(mcpConfig.env ? { env: mcpConfig.env } : {}),
      ...(mcpConfig.httpUrl ? { httpUrl: mcpConfig.httpUrl } : {}),
      ...(mcpConfig.transport ? { transport: mcpConfig.transport } : {}),
      ...(mcpConfig.disabled !== undefined ? { disabled: mcpConfig.disabled } : {}),
      ...(mcpConfig.autoApprove ? { autoApprove: mcpConfig.autoApprove } : {}),
    };

    const baseConfig = {
      mcpServers: {
        [mcpConfig.name]: serverConfig,
      },
    };

    // Merge with existing config if provided
    let resultConfig: Record<string, unknown> = { ...baseConfig };
    
    if (existingConfig) {
      // Merge mcpServers with deep merging for env variables
      const existingMcpServers = existingConfig['mcpServers'] as Record<string, any> | undefined;
      if (existingMcpServers) {
        const mergedMcpServers: Record<string, any> = { ...existingMcpServers };
        
        // Deep merge server configurations
        Object.keys(resultConfig['mcpServers'] as Record<string, any>).forEach(serverName => {
          const newServerConfig = (resultConfig['mcpServers'] as Record<string, any>)[serverName];
          if (mergedMcpServers[serverName]) {
            // Merge existing server with new server config
            const existingServerConfig = mergedMcpServers[serverName];
            mergedMcpServers[serverName] = { ...existingServerConfig, ...newServerConfig };
            
            // Deep merge env variables if both have them
            if (existingServerConfig.env && newServerConfig.env) {
              mergedMcpServers[serverName].env = { ...existingServerConfig.env, ...newServerConfig.env };
            }
          } else {
            // Add new server config
            mergedMcpServers[serverName] = newServerConfig;
          }
        });
        
        resultConfig['mcpServers'] = mergedMcpServers;
      }
      
      // Merge other properties from existingConfig
      Object.keys(existingConfig).forEach(key => {
        if (key !== 'mcpServers') {
          resultConfig[key] = existingConfig[key];
        }
      });
    }

    // Add other options (but don't override existing properties)
    Object.keys(options).forEach(key => {
      if (key !== 'existingConfig' && key !== 'mcpServers' && resultConfig[key] === undefined) {
        resultConfig[key] = options[key];
      }
    });

    // Add agent-specific configurations
    switch (agentType) {
      case 'gemini':
        resultConfig = {
          ...resultConfig,
          // Gemini-specific settings
          model: options['model'] || 'gemini-pro',
          temperature: options['temperature'] ?? 0.7,
        };
        break;
      
      case 'cursor':
        resultConfig = {
          ...resultConfig,
          // Cursor-specific settings
          editor: {
            theme: options['theme'] || 'dark',
            ...(typeof options['editor'] === 'object' && options['editor'] !== null ? options['editor'] : {}),
          },
        };
        break;
      
      case 'claude':
        resultConfig = {
          ...resultConfig,
          // Claude-specific settings
          maxTokens: options['maxTokens'] || 4000,
          temperature: options['temperature'] ?? 0.7,
        };
        break;
      
      default:
        // Validate agent type
        if (agentType !== 'gemini' && agentType !== 'cursor' && agentType !== 'claude' && agentType !== 'vscode' && agentType !== 'generic') {
          throw new Error(`Unsupported agent type: ${agentType}`);
        }
        break;
    }

    return resultConfig;
  }

  async getDefaultConfigPath(agentType: AgentType): Promise<string> {
    const homeDir = process.env['HOME'] || os.homedir();

    switch (agentType) {
      case 'gemini':
        return path.join(homeDir, '.gemini', 'settings.json');
      
      case 'cursor':
        // Prefer the official MCP configuration path consistently across platforms
        return path.join(homeDir, '.cursor', 'mcp.json');
      
      case 'claude':
        return path.join(homeDir, '.claude', 'config.json');
      
      default:
        throw new Error(`Unsupported agent type: ${agentType}`);
    }
  }
}

/**
 * Factory function to create a configuration generator
 */
export function createConfigGenerator(): ConfigGenerator {
  return new DefaultConfigGenerator();
}
