import { join } from 'path';
import { AgentProvider, AgentConfig, RemovalConfig } from './provider';
import { FileOperations } from '../utils/fileOps';
import { BackupManager, BackupInfo } from '../utils/backup';
import { SafeEditManager } from '../utils/safeEdit';
import { AgentDetector } from './detector';
import { resolveConfigPath } from '../catalog/adapter';
import { ui } from '../utils/ui';

/**
 * Kiro configuration structure for MCP servers
 */
export interface KiroConfig {
  mcpServers?: Record<string, KiroMCPServer>;
  [key: string]: unknown; // Allow other configuration keys
}

/**
 * Kiro MCP server configuration
 */
export interface KiroMCPServer {
  command: string;
  args: string[];
  env?: Record<string, string>;
  disabled?: boolean;
  autoApprove?: string[];
}

/**
 * Kiro AI coding assistant provider for configuring Kiro's MCP server settings
 * 
 * This provider handles detection and configuration of Kiro,
 * which stores its configuration in platform-specific locations:
 * - User (global): ~/.kiro/settings/mcp.json
 * - Project (workspace): <project>/.kiro/settings/mcp.json
 * 
 * Kiro uses a workspace-over-user precedence model and only supports
 * STDIO transport natively. Remote endpoints are handled via mcp-remote wrapper.
 */
export class KiroProvider implements AgentProvider {
  public readonly name = 'Kiro';
  
  private configPath: string | null = null;
  private lastBackup: BackupInfo | null = null;
  private lastValidationReason: string | null = null;

  /**
   * Creates a new Kiro provider instance
   */
  constructor() {
    // Initialize with default config path for current platform
    this.configPath = this.getDefaultConfigPath();
  }

  /**
   * Gets the default configuration path for Kiro based on the current platform
   * @param configDir - Optional custom configuration directory (for project scope)
   * @returns Default path to Kiro mcp.json
   */
  protected getDefaultConfigPath(configDir?: string): string {
    // Prefer explicit env override when set
    const envOverride = AgentDetector.getEnvOverridePath('kiro');
    if (envOverride) return envOverride;
    
    // Use catalog-derived path
    if (configDir && configDir.trim()) {
      return resolveConfigPath('kiro', 'project', configDir) || join(configDir, '.kiro', 'settings', 'mcp.json');
    }
    
    return resolveConfigPath('kiro', 'user') || AgentDetector.getDefaultConfigPath('kiro');
  }

  /**
   * Gets alternative configuration paths to check for Kiro installation
   * @returns Array of possible configuration paths
   */
  protected getAlternativeConfigPaths(): string[] {
    return AgentDetector.getDetectionCandidates('kiro');
  }

  /**
   * Detects if Kiro is installed and configured on the system
   * 
   * @param configDir - Optional custom configuration directory
   * @returns Promise resolving to the configuration file path if detected, null if not found
   * @throws Error if detection fails due to permission or system issues
   */
  async detect(configDir?: string): Promise<string | null> {
    try {
      // If custom config directory is provided, check it first
      if (configDir) {
        const customPath = this.getDefaultConfigPath(configDir);
        try {
          if (await FileOperations.fileExists(customPath) && await FileOperations.isReadable(customPath)) {
            // Validate it is JSON
            await FileOperations.readJsonFile<unknown>(customPath);
            this.configPath = customPath;
            return customPath;
          }
        } catch (err) {
          // If custom path is invalid, continue with normal detection
        }
      }
      
      const possiblePaths = this.getAlternativeConfigPaths();
      
      // If any candidate exists but is not readable, throw (tests expect this behavior)
      for (const p of possiblePaths) {
        try {
          if (await FileOperations.fileExists(p)) {
            const readable = await FileOperations.isReadable(p);
            if (!readable) {
              throw new Error(`Configuration file exists but is not readable: ${p}`);
            }
          }
        } catch (innerErr) {
          if (innerErr instanceof Error) throw innerErr;
          throw new Error(String(innerErr));
        }
      }
      
      // Only treat as detected when an existing valid config file is found
      const detectedPath = await AgentDetector.detectConfigFile(possiblePaths);
      this.configPath = detectedPath;
      return detectedPath;
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`Failed to detect Kiro: ${error}`);
    }
  }

  /**
   * Returns the active config path by scanning candidates and env overrides.
   * @param configDir - Optional custom configuration directory
   */
  async getActiveConfigPath(configDir?: string): Promise<string | null> {
    const p = await AgentDetector.detectActiveConfigPath('kiro', configDir);
    this.configPath = p;
    return p;
  }

  /**
   * Configures the detected Kiro with the provided MCP server settings
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
    // Determine target config path. If a project-specific configDir is provided,
    // always use it to honor the user's choice, regardless of existing global configs.
    if (config.configDir && config.configDir.trim()) {
      this.configPath = this.getDefaultConfigPath(config.configDir);
    } else if (!this.configPath) {
      const detectedPath = await this.detect();
      this.configPath = detectedPath || this.getDefaultConfigPath();
    }

    if (!this.configPath) {
      throw new Error('Unable to determine Kiro configuration path');
    }

    try {
      // Ensure the directory exists and is accessible before attempting to write
      await AgentDetector.ensureConfigDirectory(this.configPath);
      
      // Use safe edit manager to perform the configuration update
      const result = await SafeEditManager.safeEdit<KiroConfig>(
        this.configPath,
        (kiroConfig) => this.injectMCPServerConfig(kiroConfig, config),
        {
          validator: (modifiedConfig) => this.validateKiroConfig(modifiedConfig, config),
          createBackup: backup,
          autoRollback: true
        }
      );

      if (!result.success) {
        const reason = this.lastValidationReason ? `: ${this.lastValidationReason}` : '';
        if (result.error) {
          throw new Error((result.error.message || String(result.error)) + reason);
        }
        throw new Error('Configuration update failed' + reason);
      }

      // Store backup info for potential rollback
      this.lastBackup = result.backupInfo || null;
      
      // Return backup path if backup was created
      return backup && result.backupInfo ? result.backupInfo.backupPath : undefined;

    } catch (error) {
      throw new Error(`Failed to configure Kiro: ${error}`);
    }
  }

  /**
   * Validates the current Kiro configuration
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
      if (!this.configPath) {
        return false;
      }

      // Check if file exists and is readable
      if (!(await FileOperations.fileExists(this.configPath))) {
        return false;
      }

      if (!(await FileOperations.isReadable(this.configPath))) {
        return false;
      }

      // Try to parse the configuration
      const config = await FileOperations.readJsonFile<KiroConfig>(this.configPath);
      
      // Basic structure validation
      return this.validateKiroConfig(config);

    } catch (error) {
      // Any error during validation means the configuration is invalid
      return false;
    }
  }

  /**
   * Removes an MCP server configuration from the detected Kiro
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
    // Ensure we have a valid configuration path
    if (!this.configPath) {
      const detectedPath = await this.detect(config.configDir);
      if (!detectedPath) {
        throw new Error('Kiro configuration not found');
      }
    }

    if (!this.configPath) {
      throw new Error('Unable to determine Kiro configuration path');
    }

    try {
      // Check if configuration file exists
      if (!(await FileOperations.fileExists(this.configPath))) {
        throw new Error(`Configuration file not found: ${this.configPath}`);
      }

      // Use safe edit manager to perform the removal
      const result = await SafeEditManager.safeEdit<KiroConfig>(
        this.configPath,
        (kiroConfig) => this.removeMCPServerConfig(kiroConfig, config),
        {
          validator: (modifiedConfig) => this.validateKiroConfig(modifiedConfig),
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
      throw new Error(`Failed to remove MCP server from Kiro: ${error}`);
    }
  }

  /**
   * Lists all MCP server configurations present in the Kiro configuration
   * 
   * @param configDir - Optional custom configuration directory
   * @returns Promise resolving to an array of MCP server IDs, empty array if none found
   * @throws Error if reading configuration fails
   */
  async listMCPServers(configDir?: string): Promise<string[]> {
    try {
      // Get the active config path
      const configPath = configDir ? this.getDefaultConfigPath(configDir) : this.configPath;
      
      if (!configPath || !(await FileOperations.fileExists(configPath))) {
        return [];
      }

      // Read and parse the configuration
      const config = await FileOperations.readJsonFile<KiroConfig>(configPath);
      
      // Return the list of MCP server IDs
      if (!config.mcpServers || typeof config.mcpServers !== 'object') {
        return [];
      }

      return Object.keys(config.mcpServers);
    } catch (error) {
      throw new Error(`Failed to list MCP servers from Kiro: ${error}`);
    }
  }

  /**
   * Checks if a specific MCP server configuration exists in Kiro
   * 
   * @param serverId - The MCP server ID to check for
   * @param configDir - Optional custom configuration directory
   * @returns Promise resolving to true if the server exists, false otherwise
   * @throws Error if reading configuration fails
   */
  async hasMCPServer(serverId: string, configDir?: string): Promise<boolean> {
    try {
      const servers = await this.listMCPServers(configDir);
      return servers.includes(serverId);
    } catch (error) {
      throw new Error(`Failed to check MCP server in Kiro: ${error}`);
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
        if (!this.configPath) {
          return null;
        }

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
      throw new Error(`Failed to rollback Kiro configuration: ${error}`);
    }
  }

  /**
   * Injects MCP server configuration into the Kiro configuration
   * @param kiroConfig - Current Kiro configuration
   * @param config - MCP server configuration to inject
   * @returns Modified Kiro configuration
   */
  private async injectMCPServerConfig(kiroConfig: KiroConfig, config: AgentConfig): Promise<KiroConfig> {
    // Create a copy of the configuration to avoid mutations
    const modifiedConfig: KiroConfig = { ...kiroConfig };

    // Initialize mcpServers section if it doesn't exist
    if (!modifiedConfig.mcpServers) {
      modifiedConfig.mcpServers = {};
    }

    // Render protocol-aware shape and inject
    const { renderMcpServer } = await import('../renderers/mcp.js');
    const input: any = {
      agent: 'kiro',
      serverId: config.mcpServerId,
      transport: (config.transport as any) || 'stdio', // Kiro defaults to STDIO
      headers: config.headers,
      command: config.command,
      args: config.args,
      cwd: config.cwd,
      env: config.env,
      timeout: config.timeout
    };
    
    // Only set URL for remote transports (will be converted to mcp-remote)
    if (config.mcpServerUrl && config.transport !== 'stdio') {
      input.url = config.mcpServerUrl;
    }
    
    const rendered = renderMcpServer(input);
    const serverEntry = (rendered as any)['mcpServers'][config.mcpServerId];
    modifiedConfig.mcpServers[config.mcpServerId] = serverEntry as KiroMCPServer;

    return modifiedConfig;
  }

  /**
   * Removes MCP server configuration from the Kiro configuration
   * @param kiroConfig - Current Kiro configuration
   * @param config - MCP server removal configuration
   * @returns Modified Kiro configuration
   * @throws Error if the server is not found
   */
  private removeMCPServerConfig(kiroConfig: KiroConfig, config: RemovalConfig): KiroConfig {
    // Create a copy of the configuration to avoid mutations
    const modifiedConfig: KiroConfig = { ...kiroConfig };

    // Check if mcpServers section exists
    if (!modifiedConfig.mcpServers || typeof modifiedConfig.mcpServers !== 'object') {
      throw new Error(`MCP server '${config.mcpServerId}' not found - no MCP servers configured`);
    }

    // Check if the specific server exists
    if (!(config.mcpServerId in modifiedConfig.mcpServers)) {
      throw new Error(`MCP server '${config.mcpServerId}' not found`);
    }

    // Create a new mcpServers object without the specified server
    const { [config.mcpServerId]: removedServer, ...remainingServers } = modifiedConfig.mcpServers;
    modifiedConfig.mcpServers = remainingServers;

    return modifiedConfig;
  }

  /**
   * Validates a Kiro configuration structure
   * @param config - Configuration to validate
   * @param expectedMCPConfig - Optional expected MCP configuration for validation
   * @returns True if configuration is valid, false otherwise
   */
  private validateKiroConfig(config: KiroConfig, expectedMCPConfig?: AgentConfig): boolean {
    try {
      const DBG = process?.env?.['ALPH_DEBUG_KIRO'] === '1';
      const log = (reason: string, extra?: unknown) => {
        if (DBG) {
          try {
            ui.debug(`[Kiro.validate] ${reason}` + (extra !== undefined ? ` :: ${JSON.stringify(extra)}` : ''));
          } catch {
            // noop
          }
        }
      };
      const fail = (reason: string, extra?: unknown) => {
        try {
          this.lastValidationReason = extra !== undefined ? `${reason} ${JSON.stringify(extra)}` : reason;
        } catch {
          this.lastValidationReason = reason;
        }
        log(reason, extra);
        return false as const;
      };

      // Basic structure validation
      if (typeof config !== 'object' || config === null) {
        return fail('config is not an object or is null');
      }

      // If mcpServers exists, validate its structure
      if (config.mcpServers) {
        if (typeof config.mcpServers !== 'object' || config.mcpServers === null) {
          return fail('mcpServers is not an object');
        }

        // Validate each MCP server configuration
        for (const [serverId, serverConfig] of Object.entries(config.mcpServers)) {
          if (typeof serverConfig !== 'object' || serverConfig === null) {
            return fail('serverConfig is not an object', { serverId });
          }

          // Validate required fields for Kiro
          if (!serverConfig.command || typeof serverConfig.command !== 'string') {
            return fail('command is required and must be a string', { serverId });
          }

          if (!Array.isArray(serverConfig.args)) {
            return fail('args must be an array', { serverId });
          }

          // Validate optional fields
          if (serverConfig.env && typeof serverConfig.env !== 'object') {
            return fail('env present but not an object', { serverId });
          }

          if (serverConfig.disabled !== undefined && typeof serverConfig.disabled !== 'boolean') {
            return fail('disabled present but not boolean', { serverId, disabled: serverConfig.disabled });
          }

          if (serverConfig.autoApprove && !Array.isArray(serverConfig.autoApprove)) {
            return fail('autoApprove present but not an array', { serverId });
          }
        }

        // If we have expected MCP config, validate it exists and is correct
        if (expectedMCPConfig) {
          const serverConfig = config.mcpServers[expectedMCPConfig.mcpServerId];
          if (!serverConfig) {
            return fail('expected serverId not found', { serverId: expectedMCPConfig.mcpServerId });
          }

          // For STDIO transport, validate command matches if provided
          if (expectedMCPConfig.transport === 'stdio' && expectedMCPConfig.command) {
            if (serverConfig.command !== expectedMCPConfig.command) {
              return fail('expected command mismatch', { expected: expectedMCPConfig.command, actual: serverConfig.command });
            }
          }

          // For remote transports, validate mcp-remote wrapper is used
          if (expectedMCPConfig.transport !== 'stdio' && expectedMCPConfig.mcpServerUrl) {
            // Check if mcp-remote is used either in command or as first arg
            const usesMcpRemote = serverConfig.command.includes('mcp-remote') || 
              (Array.isArray(serverConfig.args) && serverConfig.args.length > 0 && 
               serverConfig.args[0] === 'mcp-remote');
            if (!usesMcpRemote) {
              return fail('remote transport should use mcp-remote wrapper', { serverId: expectedMCPConfig.mcpServerId, command: serverConfig.command, args: serverConfig.args });
            }
          }
        }
      }

      log('validation passed');
      return true;
    } catch (error) {
      const DBG = process?.env?.['ALPH_DEBUG_KIRO'] === '1';
      if (DBG) {
        ui.debug('[Kiro.validate] exception during validation ' + (error instanceof Error ? error.message : String(error)));
      }
      return false;
    }
  }
}