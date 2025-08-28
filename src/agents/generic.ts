import { dirname } from 'path';
import { AgentProvider, AgentConfig, RemovalConfig } from './provider';
import { GenericConfig } from '../types/config';
import { BackupInfo } from '../utils/backup';
import { FileOperations } from '../utils/fileOps';
import { BackupManager } from '../utils/backup';
import { SafeEditManager } from '../utils/safeEdit';

/**
 * Configuration options for the Generic provider
 */
export interface GenericProviderOptions {
  /** Name of the agent (for display purposes) */
  name: string;
  
  /** Path to the configuration file */
  configPath: string;
  
  /** JSON path to the MCP servers section (e.g., "mcpServers" or "config.mcpServers") */
  mcpServersPath?: string;
  
  /** Custom configuration format handler */
  configFormatter?: (config: AgentConfig) => Record<string, unknown>;
  
  /** Custom validation function */
  validator?: (config: GenericConfig, expectedConfig?: AgentConfig) => boolean;
}

/**
 * Generic agent provider for unknown or custom AI development tools
 * 
 * This provider provides a flexible way to configure any agent that stores
 * its MCP server configuration in a JSON file. It allows users to specify:
 * - Custom configuration file paths
 * - Custom JSON structure paths for MCP servers
 * - Custom configuration formats
 * - Custom validation logic
 */
export class GenericProvider implements AgentProvider {
  public readonly name: string;
  
  private configPath: string;
  private mcpServersPath: string;
  private configFormatter: ((config: AgentConfig) => Record<string, unknown>) | undefined;
  private customValidator: ((config: GenericConfig, expectedConfig?: AgentConfig) => boolean) | undefined;
  private lastBackup: BackupInfo | null = null;

  /**
   * Creates a new Generic provider instance
   * @param options - Configuration options for the generic provider
   */
  constructor(options: GenericProviderOptions) {
    this.name = options.name;
    this.configPath = options.configPath;
    this.mcpServersPath = options.mcpServersPath || 'mcpServers';
    this.configFormatter = options.configFormatter;
    this.customValidator = options.validator;
  }

  /**
   * Creates a generic provider with common configuration patterns
   * @param name - Name of the agent
   * @param configPath - Path to the configuration file
   * @param format - Predefined format type
   * @returns Configured GenericProvider instance
   */
  static createWithFormat(
    name: string, 
    configPath: string, 
    format: 'vscode' | 'jetbrains' | 'simple' = 'simple'
  ): GenericProvider {
    const options: GenericProviderOptions = {
      name,
      configPath
    };

    switch (format) {
      case 'vscode':
        // VS Code-style configuration
        options.mcpServersPath = 'mcpServers';
        options.configFormatter = (config: AgentConfig) => ({
          url: config.mcpServerUrl,
          headers: {
            // Include Authorization header if access key provided, then merge custom headers
            ...(config.mcpAccessKey ? { Authorization: `Bearer ${config.mcpAccessKey}` } : {}),
            ...(config.headers || {})
          },
          transport: config.transport || 'http',
          disabled: false
        });
        break;

      case 'jetbrains':
        // JetBrains-style configuration
        options.mcpServersPath = 'plugins.mcp.servers';
        options.configFormatter = (config: AgentConfig) => ({
          endpoint: config.mcpServerUrl,
          // Map access key to JetBrains-style authentication block when provided
          ...(config.mcpAccessKey
            ? { authentication: { type: 'bearer', token: config.mcpAccessKey } }
            : {}),
          transport: config.transport || 'http',
          enabled: true
        });
        break;

      case 'simple':
      default:
        // Simple flat configuration
        options.mcpServersPath = 'mcpServers';
        options.configFormatter = (config: AgentConfig) => ({
          url: config.mcpServerUrl,
          // Expose access key directly for simple formats
          ...(config.mcpAccessKey ? { accessKey: config.mcpAccessKey } : {}),
          transport: config.transport || 'http'
        });
        break;
    }

    return new GenericProvider(options);
  }

  /**
   * Detects if the configured agent is available on the system
   * 
   * @returns Promise resolving to the configuration file path if detected, null if not found
   * @throws Error if detection fails due to permission or system issues
   */
  async detect(): Promise<string | null> {
    try {
      // Check if the configuration file exists
      if (await FileOperations.fileExists(this.configPath)) {
        // Verify the file is readable
        if (await FileOperations.isReadable(this.configPath)) {
          // Try to parse the file to ensure it's valid JSON
          try {
            await FileOperations.readJsonFile<GenericConfig>(this.configPath);
            return this.configPath;
          } catch (parseError) {
            throw new Error(`Configuration file exists but is not valid JSON: ${parseError}`);
          }
        } else {
          throw new Error(`Configuration file exists but is not readable: ${this.configPath}`);
        }
      }
      
      // Configuration file doesn't exist
      return null;
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`Failed to detect ${this.name}: ${error}`);
    }
  }

  /**
   * Configures the detected agent with the provided MCP server settings
   * 
   * This method implements the safe edit lifecycle:
   * 1. Create backup of existing configuration
   * 2. Parse current configuration safely
   * 3. Inject new MCP server settings
   * 4. Write updated configuration atomically
   * 5. Validate the new configuration
   * 
   * @param config - The MCP server configuration to apply
   * @param backup - Whether to create a backup of the existing configuration
   * @returns Promise resolving to the backup file path if backup was created, undefined otherwise
   * @throws Error if configuration fails, backup should be preserved
   */
  async configure(config: AgentConfig, backup: boolean = true): Promise<string | undefined> {
    try {
      // Ensure the directory exists before attempting to write
      await FileOperations.ensureDirectory(dirname(this.configPath));
      
      // Use safe edit manager to perform the configuration update
      const result = await SafeEditManager.safeEdit<GenericConfig>(
        this.configPath,
        (genericConfig) => this.injectMCPServerConfig(genericConfig, config),
        {
          validator: (modifiedConfig) => this.validateGenericConfig(modifiedConfig, config),
          createBackup: backup,
          autoRollback: true
        }
      );

      if (!result.success) {
        throw result.error || new Error('Configuration update failed');
      }

      // Store backup info for potential rollback
      this.lastBackup = result.backupInfo || null;
      
      // Return backup path if backup was created
      return backup && result.backupInfo ? result.backupInfo.backupPath : undefined;

    } catch (error) {
      throw new Error(`Failed to configure ${this.name}: ${error}`);
    }
  }

  /**
   * Validates the current agent configuration
   * 
   * Verifies:
   * - Configuration file exists and is readable
   * - JSON structure is valid
   * - MCP server configuration is present and correctly formatted
   * 
   * @returns Promise resolving to true if configuration is valid, false otherwise
   */
  async validate(): Promise<boolean> {
    try {
      // Check if file exists and is readable
      if (!(await FileOperations.fileExists(this.configPath))) {
        return false;
      }

      if (!(await FileOperations.isReadable(this.configPath))) {
        return false;
      }

      // Try to parse the configuration
      const config = await FileOperations.readJsonFile<GenericConfig>(this.configPath);
      
      // Basic structure validation
      return this.validateGenericConfig(config);

    } catch (error) {
      // Any error during validation means the configuration is invalid
      return false;
    }
  }

  /**
   * Removes an MCP server configuration from the detected agent
   * 
   * This method implements the safe edit lifecycle:
   * 1. Create backup of existing configuration
   * 2. Parse current configuration safely
   * 3. Remove the specified MCP server settings
   * 4. Write updated configuration atomically
   * 5. Validate the new configuration
   * 
   * @param config - The MCP server removal configuration
   * @param backup - Whether to create a backup of the existing configuration
   * @returns Promise resolving to the backup file path if backup was created, undefined otherwise
   * @throws Error if removal fails or server not found, backup should be preserved
   */
  async remove(config: RemovalConfig, backup: boolean = true): Promise<string | undefined> {
    try {
      // Check if configuration file exists
      if (!(await FileOperations.fileExists(this.configPath))) {
        throw new Error(`Configuration file not found: ${this.configPath}`);
      }

      // Use safe edit manager to perform the removal
      const result = await SafeEditManager.safeEdit<GenericConfig>(
        this.configPath,
        (genericConfig) => this.removeMCPServerConfig(genericConfig, config),
        {
          validator: (modifiedConfig) => this.validateGenericConfig(modifiedConfig),
          createBackup: backup,
          autoRollback: true
        }
      );

      if (!result.success) {
        throw result.error || new Error('Configuration removal failed');
      }

      // Store backup info for potential rollback
      this.lastBackup = result.backupInfo || null;
      
      // Return backup path if backup was created
      return backup && result.backupInfo ? result.backupInfo.backupPath : undefined;

    } catch (error) {
      throw new Error(`Failed to remove MCP server from ${this.name}: ${error}`);
    }
  }

  /**
   * Lists all MCP server configurations present in the agent configuration
   * 
   * @param configDir - Optional custom configuration directory (ignored for generic provider)
   * @returns Promise resolving to an array of MCP server IDs, empty array if none found
   * @throws Error if reading configuration fails
   */
  async listMCPServers(_configDir?: string): Promise<string[]> {
    try {
      if (!(await FileOperations.fileExists(this.configPath))) {
        return [];
      }

      // Read and parse the configuration
      const config = await FileOperations.readJsonFile<GenericConfig>(this.configPath);
      
      // Navigate to the MCP servers section using the configured path
      const mcpServers = this.getNestedProperty(config, this.mcpServersPath);
      
      if (!mcpServers || typeof mcpServers !== 'object') {
        return [];
      }

      return Object.keys(mcpServers as Record<string, unknown>);
    } catch (error) {
      throw new Error(`Failed to list MCP servers from ${this.name}: ${error}`);
    }
  }

  /**
   * Checks if a specific MCP server configuration exists in the agent
   * 
   * @param serverId - The MCP server ID to check for
   * @param configDir - Optional custom configuration directory (ignored for generic provider)
   * @returns Promise resolving to true if the server exists, false otherwise
   * @throws Error if reading configuration fails
   */
  async hasMCPServer(serverId: string, _configDir?: string): Promise<boolean> {
    try {
      const servers = await this.listMCPServers();
      return servers.includes(serverId);
    } catch (error) {
      throw new Error(`Failed to check MCP server in ${this.name}: ${error}`);
    }
  }

  /**
   * Rolls back to the most recent backup
   * 
   * This method:
   * - Locates the most recent backup file
   * - Restores the backup to the original location
   * - Verifies the restoration was successful
   * 
   * @returns Promise resolving to the backup file path that was restored, null if no backup found
   * @throws Error if rollback fails
   */
  async rollback(): Promise<string | null> {
    try {
      if (!this.lastBackup) {
        // Try to find the most recent backup
        try {
          const backups = await BackupManager.listBackups(this.configPath);
          if (backups.length === 0) {
            return null;
          }
          this.lastBackup = backups[0] || null; // Most recent backup
        } catch (error) {
          // If we can't list backups (e.g., directory doesn't exist), no backups exist
          return null;
        }
      }

      // Restore the backup
      if (!this.lastBackup) {
        return null;
      }
      
      await BackupManager.restoreBackup(this.lastBackup);
      
      // Verify the restoration was successful
      if (await this.validate()) {
        const restoredBackupPath = this.lastBackup.backupPath;
        this.lastBackup = null; // Clear the backup reference
        return restoredBackupPath;
      } else {
        throw new Error('Backup restoration verification failed');
      }

    } catch (error) {
      throw new Error(`Failed to rollback ${this.name} configuration: ${error}`);
    }
  }

  /**
   * Injects MCP server configuration into the generic configuration
   * @param genericConfig - Current generic configuration
   * @param config - MCP server configuration to inject
   * @returns Modified generic configuration
   */
  private injectMCPServerConfig(genericConfig: GenericConfig, config: AgentConfig): GenericConfig {
    // Create a copy of the configuration to avoid mutations
    const modifiedConfig: GenericConfig = { ...genericConfig };

    // Navigate to the MCP servers section using the configured path
    const pathParts = this.mcpServersPath.split('.');
    let current: any = modifiedConfig;
    
    // Navigate to the parent of the MCP servers section
    for (let i = 0; i < pathParts.length - 1; i++) {
      const part = pathParts[i];
      if (part && !current[part]) {
        current[part] = {};
      }
      if (part) {
        current = current[part];
      }
    }

    // Get the final property name for MCP servers
    const mcpServersProperty = pathParts[pathParts.length - 1];
    
    // Initialize the MCP servers section if it doesn't exist
    if (mcpServersProperty && !current[mcpServersProperty]) {
      current[mcpServersProperty] = {};
    }

    // Create the server configuration using custom formatter or default
    let serverConfig: Record<string, unknown>;
    
    if (this.configFormatter) {
      serverConfig = this.configFormatter(config);
    } else {
      // Default configuration format
      serverConfig = {
        url: config.mcpServerUrl,
        ...(config.mcpAccessKey ? { accessKey: config.mcpAccessKey } : {}),
        transport: config.transport || 'http',
        headers: config.headers || {},
        env: config.env || {},
        disabled: false
      };
    }

    // Inject the server configuration
    if (mcpServersProperty) {
      (current[mcpServersProperty] as Record<string, unknown>)[config.mcpServerId] = serverConfig;
    }

    return modifiedConfig;
  }

  /**
   * Validates a generic configuration structure
   * @param config - Configuration to validate
   * @param expectedMCPConfig - Optional expected MCP configuration for validation
   * @returns True if configuration is valid, false otherwise
   */
  private validateGenericConfig(config: GenericConfig, expectedMCPConfig?: AgentConfig): boolean {
    try {
      // Basic structure validation
      if (typeof config !== 'object' || config === null) {
        return false;
      }

      // Use custom validator if provided
      if (this.customValidator) {
        return this.customValidator(config, expectedMCPConfig);
      }

      // Default validation logic
      // Navigate to the MCP servers section
      const pathParts = this.mcpServersPath.split('.');
      let current: any = config;
      
      for (const part of pathParts) {
        if (!current || typeof current !== 'object') {
          // MCP servers section doesn't exist, which is valid for empty configs
          return true;
        }
        current = current[part];
      }

      // If MCP servers section exists, validate its structure
      if (current) {
        if (typeof current !== 'object' || current === null) {
          return false;
        }

        // Validate each MCP server configuration
        for (const [, serverConfig] of Object.entries(current)) {
          if (typeof serverConfig !== 'object' || serverConfig === null) {
            return false;
          }

          // Basic validation - at least one of url, httpUrl, or command should exist
          const hasUrl = (serverConfig as any).url || (serverConfig as any).httpUrl || (serverConfig as any).endpoint;
          const hasCommand = (serverConfig as any).command;
          
          if (!hasUrl && !hasCommand) {
            return false;
          }
        }

        // If we have expected MCP config, validate it exists
        if (expectedMCPConfig) {
          const serverConfig = current[expectedMCPConfig.mcpServerId];
          if (!serverConfig) {
            return false;
          }

          // Validate that some form of URL or endpoint exists
          const hasExpectedUrl = (serverConfig as any).url === expectedMCPConfig.mcpServerUrl ||
                                (serverConfig as any).httpUrl === expectedMCPConfig.mcpServerUrl ||
                                (serverConfig as any).endpoint === expectedMCPConfig.mcpServerUrl;
          
          if (!hasExpectedUrl) {
            return false;
          }
        }
      }

      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Removes MCP server configuration from the generic configuration
   * @param genericConfig - Current generic configuration
   * @param config - MCP server removal configuration
   * @returns Modified generic configuration
   * @throws Error if server not found
   */
  private removeMCPServerConfig(genericConfig: GenericConfig, config: RemovalConfig): GenericConfig {
    // Create a copy of the configuration to avoid mutations
    const modifiedConfig: GenericConfig = { ...genericConfig };

    // Navigate to the MCP servers section using the configured path
    const pathParts = this.mcpServersPath.split('.');
    let current: any = modifiedConfig;
    
    // Navigate to the parent of the MCP servers section
    for (let i = 0; i < pathParts.length - 1; i++) {
      const part = pathParts[i];
      if (!part || !current[part]) {
        throw new Error(`MCP server '${config.mcpServerId}' not found`);
      }
      current = current[part];
    }

    // Get the final property name for MCP servers
    const mcpServersProperty = pathParts[pathParts.length - 1];
    
    if (!mcpServersProperty || !current[mcpServersProperty]) {
      throw new Error(`MCP server '${config.mcpServerId}' not found`);
    }

    const mcpServers = current[mcpServersProperty] as Record<string, unknown>;
    
    // Check if the server exists
    if (!(config.mcpServerId in mcpServers)) {
      throw new Error(`MCP server '${config.mcpServerId}' not found`);
    }

    // Remove the server configuration
    delete mcpServers[config.mcpServerId];

    return modifiedConfig;
  }

  /**
   * Gets a nested property from an object using a dot-separated path
   * @param obj - Object to search in
   * @param path - Dot-separated path (e.g., "config.mcpServers")
   * @returns The value at the specified path, or undefined if not found
   */
  private getNestedProperty(obj: any, path: string): any {
    const pathParts = path.split('.');
    let current = obj;
    
    for (const part of pathParts) {
      if (!part || !current || typeof current !== 'object') {
        return undefined;
      }
      current = current[part];
    }
    
    return current;
  }

  /**
   * Gets the MCP servers path within the configuration
   * @returns The JSON path to the MCP servers section
   */
  getMCPServersPath(): string {
    return this.mcpServersPath;
  }

  /**
   * Updates the configuration path (useful for dynamic path resolution)
   * @param newPath - New configuration file path
   */
  setConfigPath(newPath: string): void {
    this.configPath = newPath;
  }

  /**
   * Updates the MCP servers path within the configuration
   * @param newPath - New JSON path to the MCP servers section
   */
  setMCPServersPath(newPath: string): void {
    this.mcpServersPath = newPath;
  }
}