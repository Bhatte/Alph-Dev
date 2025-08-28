import { MCPServerConfig } from '../types/config';
import { ConfigGenerator, createConfigGenerator } from './generator';
import { ConfigInstaller, createConfigInstaller, InstallOptions, InstallResult } from './installer';
import { ensureDirectory } from '../utils/directory';
import { Logger } from '../logger';
import { createEnhancedLogger } from '../enhancedLogger';
import { ConfigValidator, createConfigValidator } from './validator';
import { join, dirname } from 'path';
import { promises as fs } from 'fs';
import { homedir as getHomedir } from 'os';

export interface AgentInfo {
  id: string;
  name: string;
  installed: boolean;
  version?: string;
  path?: string;
}

export type AgentType = 'gemini' | 'cursor' | 'claude' | string;

export interface ConfigManagerOptions {
  /**
   * Logger instance for output
   */
  logger?: Logger;
  
  /**
   * Whether to enable verbose logging
   */
  verbose?: boolean;
  
  /**
   * Directory to store configuration files
   */
  configDir?: string;
  
  /**
   * Options for the config generator
   */
  generatorOptions?: Record<string, any>;
}

/**
 * Manages configuration generation and installation
 */
export class ConfigManager {
  private generator: ConfigGenerator;
  private installer: ConfigInstaller;
  private validator: ConfigValidator;
  private logger: Logger;
  private verbose: boolean;

  private configDir: string;

  constructor(options: ConfigManagerOptions = {}) {
    this.logger = options.logger || createEnhancedLogger({
      level: process.env['NODE_ENV'] === 'production' ? 'info' : 'debug',
      colors: process.stdout.isTTY,
      fileLogging: process.env['NODE_ENV'] === 'production',
      logFile: './logs/alph.log',
      jsonLogging: true
    });
    this.verbose = options.verbose || false;
    // Config directory will be set by the factory function
    this.configDir = options.configDir || '';
    
    this.generator = createConfigGenerator();
    this.installer = createConfigInstaller(this.generator);
    this.validator = createConfigValidator();
  }


  /**
   * Configure an agent with MCP server settings
   */
  async configureAgent(
    agentType: AgentType,
    mcpConfig: MCPServerConfig,
    options: InstallOptions & { dryRun?: boolean } = {}
  ): Promise<InstallResult> {
    const { dryRun = false, ...installOptions } = options;
    
    this.logInfo(`Configuring ${agentType} with MCP server at ${mcpConfig.httpUrl}`);
    
    try {
      if (dryRun) {
        this.logInfo('Dry run - no changes will be made');
        
        // Generate config without installing
        const config = await this.generator.generate(agentType, mcpConfig, installOptions.options);
        const configPath = await this.generator.getDefaultConfigPath(agentType);
        
        return {
          success: true,
          message: 'Dry run completed successfully',
          configPath,
          config,
        } as InstallResult & { config: any };
      }
      
      // Run the installation
      return await this.installer.install(agentType, mcpConfig, installOptions);
    } catch (error) {
      this.logError(`Failed to configure agent ${agentType}:`, error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      return {
        success: false,
        error: new Error(errorMessage),
        message: `Failed to configure agent: ${errorMessage}`
      } as InstallResult;
    }
  }

  /**
   * Get the default configuration path for an agent
   */
  getConfigPath(agentType: AgentType): string {
    return join(this.configDir, `${agentType}.json`);
  }

  /**
   * Check if an agent is already configured
   */
  async isAgentConfigured(agentType: AgentType): Promise<boolean> {
    try {
      const configPath = await this.generator.getDefaultConfigPath(agentType);
      try {
        // Use readFile instead of access/stat to work better with memfs
        const content = await fs.readFile(configPath, 'utf-8');
        return content.trim().length > 0;
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
          return false;
        }
        throw e;
      }
    } catch (error) {
      this.logError(`Error checking if ${agentType} is configured:`, error);
      return false;
    }
  }

  /**
   * List all configured agents
   */
  async listConfiguredAgents(agentTypes: AgentType[]): Promise<AgentType[]> {
    const results = await Promise.all(
      agentTypes.map(async (type) => {
        try {
          const isConfigured = await this.isAgentConfigured(type);
          return { type, configured: isConfigured };
        } catch (e) {
          this.logError(`Error checking if ${type} is configured:`, e);
          return { type, configured: false };
        }
      })
    );

    return results.filter((r) => r.configured).map((r) => r.type);
  }

  /**
   * Validate configuration for an agent
   */
  async validateConfig(agentType: string, config: unknown): Promise<{ valid: boolean; error?: string; errors?: string[] }> {
    try {
      // Use the new schema-based validator
      const result = await this.validator.validate(agentType, config);
      
      if (!result.valid) {
        const firstError = result.errors?.[0];
        return {
          valid: false,
          ...(firstError ? { error: firstError } : {}),
          ...(result.errors ? { errors: result.errors } : {})
        };
      }
      
      return { valid: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error during validation';
      return { 
        valid: false,
        error: message,
        errors: [message]
      };
    }
  }

  private async ensureConfigDir(configPath: string): Promise<string> {
    const dir = dirname(configPath);
    
    try {
      await ensureDirectory(dir);
      return dir;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to create config directory: ${message}`);
    }
  }

  /**
   * Ensure the configuration directory exists
   */
  async ensureConfigDirectory(agentType: AgentType): Promise<string> {
    const configPath = this.getConfigPath(agentType);
    return this.ensureConfigDir(configPath);
  }

  private logInfo(message: string): void {
    if (this.verbose) {
      this.logger.info(message);
    }
  }

  /**
   * List all available agents and their installation status
   */
  async listAgents(): Promise<AgentInfo[]> {
    // In a real implementation, this would detect installed agents
    // For now, we'll return a mock list
    return [
      { id: 'gemini', name: 'Gemini CLI', installed: true, version: '1.0.0' },
      { id: 'cursor', name: 'Cursor', installed: true, version: '2.1.3' },
      { id: 'claude', name: 'Claude', installed: false }
    ];
  }

  /**
   * Generate configuration for an agent
   */
  async generateConfig(agentType: string, options: any = {}): Promise<string> {
    const config = await this.generator.generate(agentType as AgentType, options);
    const configPath = join(this.configDir, `${agentType}.json`);
    
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');
    return configPath;
  }

  /**
   * Backup the current configuration for an agent
   */
  async backupConfig(agentType: string): Promise<string> {
    const sourcePath = this.getConfigPath(agentType);
    const backupPath = join(this.configDir, `${agentType}.json.bak`);
    
    try {
      await fs.copyFile(sourcePath, backupPath);
      return backupPath;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to backup config for ${agentType}: ${message}`);
    }
  }

  /**
   * Restore configuration from a backup
   */
  async restoreConfig(agentType: string, backupPath: string): Promise<void> {
    const targetPath = this.getConfigPath(agentType);
    
    try {
      await fs.copyFile(backupPath, targetPath);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to restore config for ${agentType}: ${message}`);
    }
  }

  /**
   * Get the status of a configuration
   */
  async getConfigStatus(agentType: string): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];
    const configPath = this.getConfigPath(agentType);
    
    if (!await this.configExists(agentType)) {
      return { valid: false, errors: ['Configuration does not exist'] };
    }
    
    try {
      const content = await fs.readFile(configPath, 'utf8');
      const config = JSON.parse(content);
      
      // Basic validation
      if (!config.agent) errors.push('Missing required field: agent');
      if (!config.version) errors.push('Missing required field: version');
      
      return {
        valid: errors.length === 0,
        errors
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return { valid: false, errors: ['Invalid JSON: ' + message] };
    }
  }

  

  /**
   * Update a configuration
   */
  async updateConfig(agentType: string, updates: Record<string, any>): Promise<void> {
    const configPath = this.getConfigPath(agentType);
    let config: Record<string, any> = {};
    
    // Load existing config if it exists
    if (await this.configExists(agentType)) {
      const content = await fs.readFile(configPath, 'utf8');
      config = JSON.parse(content);
    }
    
    // Apply updates
    const updatedConfig = { ...config, ...updates };
    
    // Save back to file
    await fs.writeFile(configPath, JSON.stringify(updatedConfig, null, 2), 'utf8');
  }

  /**
   * Check if a configuration exists
   */
  async configExists(agentType: string): Promise<boolean> {
    try {
      await fs.access(this.getConfigPath(agentType));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the path to a config file
   */
  // Duplicate removed; canonical version defined earlier

  private logError(message: string, ...args: any[]) {
    this.logger.error(`[ERROR] ${message}`, ...args);
  }
}

/**
 * Factory function to create a config manager
 */
export async function createConfigManager(options: ConfigManagerOptions = {}): Promise<ConfigManager> {
  const manager = new ConfigManager(options);
  
  // Initialize config directory
  if (!options.configDir) {
    const home = getHomedir();
    const platform = process.platform;
    
    if (platform === 'win32') {
      const appData = process.env['APPDATA'] || join(home, 'AppData', 'Roaming');
      manager['configDir'] = join(appData, 'alph');
    } else if (platform === 'darwin') {
      manager['configDir'] = join(home, 'Library', 'Application Support', 'alph');
    } else {
      // Linux and other Unix-like systems
      manager['configDir'] = join(home, '.config', 'alph');
    }
    // Ensure config directory exists
    ensureDirectory(manager['configDir']);
  } else {
    // Ensure config directory exists
    ensureDirectory(options.configDir);
  }
  
  return manager;
}
