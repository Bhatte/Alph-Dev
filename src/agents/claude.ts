import { dirname, resolve } from 'path';
import { AgentProvider, AgentConfig, RemovalConfig } from './provider';
import { ClaudeConfig } from '../types/config';
import { BackupInfo } from '../utils/backup';
import { FileOperations } from '../utils/fileOps';
import { BackupManager } from '../utils/backup';
import { SafeEditManager } from '../utils/safeEdit';
import { AgentDetector } from './detector';
import { resolveConfigPath } from '../catalog/adapter';

/**
 * Claude Code provider for configuring Claude Code's MCP server settings
 *
 * Primary config path: ~/.claude.json
 * Also supports reading legacy/alternative paths (e.g., ~/.claude/claude.json,
 * ~/.claude/settings.json, ~/.claude/settings.local.json, ~/.claude/mcp_servers.json,
 * and project-local .claude/settings.local.json) for detection and status.
 */
export class ClaudeProvider implements AgentProvider {
  public readonly name = 'Claude Code';
  
  private configPath: string | null = null;
  private lastBackup: BackupInfo | null = null;

  /**
   * Creates a new Claude provider instance
   */
  constructor() {
    // Initialize with default config path for current platform
    this.configPath = this.getDefaultConfigPath();
  }

  /**
   * Gets the default configuration path for Claude Code
   * @param configDir - Optional custom configuration directory
   * @returns Default path to Claude configuration file
   */
  protected getDefaultConfigPath(_configDir?: string): string {
    // Prefer catalog-derived user path; fallback to detector default
    return resolveConfigPath('claude', 'user') || AgentDetector.getDefaultConfigPath('claude');
  }

  /**
   * Gets alternative configuration paths to check for Claude Code installation
   * @returns Array of possible configuration paths
   */
  protected getAlternativeConfigPaths(): string[] {
    return AgentDetector.getDetectionCandidates('claude');
  }

  /**
   * Detects if Claude Code is installed and configured on the system
   * 
   * @param configDir - Optional custom configuration directory
   * @returns Promise resolving to the configuration file path if detected, null if not found
   * @throws Error if detection fails due to permission or system issues
   */
  async detect(_configDir?: string): Promise<string | null> {
    try {
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
      const detectedPath = await AgentDetector.detectConfigFile(possiblePaths);
      this.configPath = detectedPath;
      return detectedPath;
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`Failed to detect Claude Code: ${error}`);
    }
  }

  /**
   * Returns the active config path by scanning candidates and env overrides.
   * @param configDir - Optional custom configuration directory
   */
  async getActiveConfigPath(configDir?: string): Promise<string | null> {
    const p = await AgentDetector.detectActiveConfigPath('claude', configDir);
    this.configPath = p;
    return p;
  }

  /**
   * Configures the detected Claude Code with the provided MCP server settings
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
    // Ensure we have a valid configuration path
    if (!this.configPath) {
      const detectedPath = await this.detect(undefined);
      if (!detectedPath) {
        // Create new configuration file if it doesn't exist
        this.configPath = this.getDefaultConfigPath(undefined);
      }
    }

    if (!this.configPath) {
      throw new Error('Unable to determine Claude Code configuration path');
    }

    try {
      // Ensure the directory exists before attempting to write
      await FileOperations.ensureDirectory(dirname(this.configPath));
      
      // Default project to current working directory when none is provided,
      // so the MCP server becomes active for this project in Claude Code.
      const configForProject = {
        ...config,
        configDir: (config.configDir && config.configDir.trim()) ? config.configDir : process.cwd()
      };

      // Use safe edit manager to perform the configuration update
      const result = await SafeEditManager.safeEdit<ClaudeConfig>(
        this.configPath,
        (claudeConfig) => this.injectMCPServerConfig(claudeConfig, configForProject),
        {
          validator: (modifiedConfig) => this.validateClaudeConfig(modifiedConfig, configForProject),
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
      throw new Error(`Failed to configure Claude Code: ${error}`);
    }
  }

  /**
   * Validates the current Claude Code configuration
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
        // Attempt to resolve an active path before giving up
        this.configPath = await this.getActiveConfigPath(undefined);
        if (!this.configPath) return false;
      }

      // Check if file exists and is readable
      if (!(await FileOperations.fileExists(this.configPath))) {
        return false;
      }

      if (!(await FileOperations.isReadable(this.configPath))) {
        return false;
      }

      // Try to parse the configuration
      const config = await FileOperations.readJsonFile<ClaudeConfig>(this.configPath);
      
      // Basic structure validation
      return this.validateClaudeConfig(config);

    } catch (error) {
      // Any error during validation means the configuration is invalid
      return false;
    }
  }

  /**
   * Removes an MCP server configuration from the detected Claude Code
   */
  async remove(config: RemovalConfig, backup: boolean = true): Promise<string | undefined> {
    if (!this.configPath) {
      const detectedPath = await this.detect(config.configDir);
      if (!detectedPath) {
        throw new Error('Claude Code configuration not found');
      }
    }

    if (!this.configPath) {
      throw new Error('Unable to determine Claude Code configuration path');
    }

    try {
      if (!(await FileOperations.fileExists(this.configPath))) {
        throw new Error(`Configuration file not found: ${this.configPath}`);
      }

      const scope = (config.scope || 'auto');
      const serverId = config.mcpServerId;
      const projectCandidates = await this.__candidateProjectDirs(config.configDir);

      const result = await SafeEditManager.safeEdit<ClaudeConfig>(
        this.configPath,
        async (claudeConfig) => {
          // Work on a copy
          const modified: ClaudeConfig = { ...claudeConfig } as any;

          const removeGlobal = () => {
            if (modified.mcpServers && serverId in modified.mcpServers) {
              const { [serverId]: _r, ...rest } = modified.mcpServers;
              modified.mcpServers = rest as any;
              return true;
            }
            return false;
          };

          const removeInProjectPath = (absPath: string): boolean => {
            if (!modified.projects || typeof modified.projects !== 'object') return false;
            const proj: any = (modified.projects as any)[absPath];
            if (!proj || !proj.mcpServers || typeof proj.mcpServers !== 'object') return false;
            const { [serverId]: _p, ...pRest } = proj.mcpServers as any;
            const existed = serverId in (proj.mcpServers as any);
            proj.mcpServers = pRest;
            (modified.projects as any)[absPath] = proj;
            return existed;
          };

          let removedAny = false;

          switch (scope) {
            case 'global': {
              const ok = removeGlobal();
              if (!ok) throw new Error(`MCP server '${serverId}' not found in global scope`);
              removedAny = ok;
              break;
            }
            case 'project': {
              let removed = false;
              for (const p of projectCandidates) {
                removed = removeInProjectPath(p) || removed;
              }
              if (!removed) throw new Error(`MCP server '${serverId}' not found in project scope`);
              removedAny = removed;
              break;
            }
            case 'all': {
              const g = removeGlobal();
              let pr = false;
              // If projects exist, remove across all projects
              if (modified.projects && typeof modified.projects === 'object') {
                for (const key of Object.keys(modified.projects as any)) {
                  pr = removeInProjectPath(key) || pr;
                }
              }
              if (!g && !pr) throw new Error(`MCP server '${serverId}' not found in any scope`);
              removedAny = g || pr;
              break;
            }
            case 'auto':
            default: {
              // Remove from global if present
              const g = removeGlobal();
              // Remove from provided or likely project roots
              let pr = false;
              for (const p of projectCandidates) {
                pr = removeInProjectPath(p) || pr;
              }
              if (!g && !pr) throw new Error(`MCP server '${serverId}' not found`);
              removedAny = g || pr;
              break;
            }
          }

          if (!removedAny) {
            // Should not reach here due to throws above, but keep guard
            throw new Error(`MCP server '${serverId}' not found`);
          }

          return modified;
        },
        {
          validator: (modifiedConfig) => this.validateClaudeConfig(modifiedConfig),
          createBackup: backup,
          autoRollback: true
        }
      );

      if (!result.success) {
        throw result.error || new Error('Configuration removal failed');
      }

      this.lastBackup = result.backupInfo || null;
      return backup && result.backupInfo ? result.backupInfo.backupPath : undefined;

    } catch (error) {
      throw new Error(`Failed to remove MCP server from Claude Code: ${error}`);
    }
  }

  /**
   * Lists all MCP server configurations present in Claude Code
   */
  async listMCPServers(configDir?: string): Promise<string[]> {
    try {
      let configPath = this.configPath;
      if (!configPath) {
        configPath = await this.getActiveConfigPath(undefined) || undefined as any;
      }
      
      if (!configPath || !(await FileOperations.fileExists(configPath))) {
        return [];
      }

      const config = await FileOperations.readJsonFile<ClaudeConfig>(configPath);
      // If a configDir (project path) was specified, prefer project-level servers
      if (configDir && configDir.trim()) {
        const projectPath = resolve(configDir.trim());
        const proj = (config.projects && (config.projects as any)[projectPath]) as any;
        if (proj && proj.mcpServers && typeof proj.mcpServers === 'object') {
          return Object.keys(proj.mcpServers);
        }
      }
      // Fallback to global servers
      if (config.mcpServers && typeof config.mcpServers === 'object') {
        return Object.keys(config.mcpServers);
      }
      return [];
    } catch (error) {
      throw new Error(`Failed to list MCP servers from Claude Code: ${error}`);
    }
  }

  /**
   * Checks if a specific MCP server configuration exists in Claude Code
   */
  async hasMCPServer(serverId: string, configDir?: string): Promise<boolean> {
    try {
      // First check global or specified project
      const servers = await this.listMCPServers(configDir);
      if (servers.includes(serverId)) return true;

      // If no configDir provided, also check common project roots (cwd, git root)
      if (!configDir || !configDir.trim()) {
        const cfgPath = this.configPath || await this.getActiveConfigPath(undefined);
        if (!cfgPath || !(await FileOperations.fileExists(cfgPath))) return false;
        const cfg = await FileOperations.readJsonFile<ClaudeConfig>(cfgPath);
        const candidates = await this.__candidateProjectDirs(undefined);
        for (const p of candidates) {
          const proj: any = (cfg.projects as any)?.[p];
          if (proj && proj.mcpServers && typeof proj.mcpServers === 'object') {
            if (serverId in proj.mcpServers) return true;
          }
        }
      }
      return false;
    } catch (error) {
      throw new Error(`Failed to check MCP server in Claude Code: ${error}`);
    }
  }

  /** Compute candidate project directories for scope=auto when a dir isn't explicitly provided */
  private async __candidateProjectDirs(explicitDir?: string): Promise<string[]> {
    const set = new Set<string>();
    const add = (p?: string) => { if (p && p.trim()) set.add(resolve(p.trim())); };
    add(explicitDir);
    try { add(process.cwd()); } catch { /* ignore */ }
    // Try to get git root
    try {
      const { execSync } = await import('child_process');
      const root = execSync('git rev-parse --show-toplevel', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
      add(root);
    } catch { /* not a git repo */ }
    return Array.from(set.values());
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
      throw new Error(`Failed to rollback Claude Code configuration: ${error}`);
    }
  }

  /**
   * Injects MCP server configuration into the Claude Code configuration
   * @param claudeConfig - Current Claude Code configuration
   * @param config - MCP server configuration to inject
   * @returns Modified Claude Code configuration
   */
  private async injectMCPServerConfig(claudeConfig: ClaudeConfig, config: AgentConfig): Promise<ClaudeConfig> {
    // Create a copy of the configuration to avoid mutations
    const modifiedConfig: ClaudeConfig = { ...claudeConfig };

    // Initialize mcpServers section if it doesn't exist
    if (!modifiedConfig.mcpServers) {
      modifiedConfig.mcpServers = {};
    }

    // Render protocol-aware shape
    const { renderMcpServer } = await import('../renderers/mcp.js');
    const input: any = {
      agent: 'claude',
      serverId: config.mcpServerId,
      transport: (config.transport as any) || 'http',
      headers: config.headers,
      command: config.command,
      args: config.args,
      env: config.env
    };
    if (config.mcpServerUrl) input.url = config.mcpServerUrl;
    const rendered = renderMcpServer(input);
    const serverConfig = (rendered as any)['mcpServers'][config.mcpServerId] as any;

    // Inject the server configuration (global)
    modifiedConfig.mcpServers[config.mcpServerId] = serverConfig;

    // Also inject into project-specific scope when a project directory is provided
    // Claude Code expects per-project servers under projects[absolutePath].mcpServers
    if (config.configDir && config.configDir.trim()) {
      const projectPath = resolve(config.configDir.trim());
      if (!modifiedConfig.projects || typeof modifiedConfig.projects !== 'object') {
        modifiedConfig.projects = {} as any;
      }
      const existingProject = (modifiedConfig.projects as any)[projectPath] as any || {};
      const projectConfig: any = { ...existingProject };
      if (!projectConfig.mcpServers || typeof projectConfig.mcpServers !== 'object') {
        projectConfig.mcpServers = {};
      }
      projectConfig.mcpServers[config.mcpServerId] = { ...serverConfig };
      (modifiedConfig.projects as any)[projectPath] = projectConfig;
    }

    return modifiedConfig;
  }

  /**
   * (removeMCPServerConfig removed; removal logic is implemented inline in remove())
   */

  /**
   * Validates a Claude Code configuration structure
   * @param config - Configuration to validate
   * @param expectedMCPConfig - Optional expected MCP configuration for validation
   * @returns True if configuration is valid, false otherwise
   */
  private validateClaudeConfig(config: ClaudeConfig, expectedMCPConfig?: AgentConfig): boolean {
    try {
      // Basic structure validation
      if (typeof config !== 'object' || config === null) {
        return false;
      }

      // If projects exists, perform light validation of project-level structures
      if (config.projects) {
        if (typeof config.projects !== 'object') return false;
        for (const [, projRaw] of Object.entries(config.projects as Record<string, any>)) {
          const proj = projRaw as any;
          if (proj && typeof proj === 'object' && 'mcpServers' in proj) {
            const ps = proj.mcpServers as any;
            if (ps && typeof ps !== 'object') return false;
            if (ps) {
              for (const [, pServerRaw] of Object.entries(ps as Record<string, any>)) {
                const pServer = pServerRaw as any;
                if (typeof pServer !== 'object' || pServer === null) return false;
                if (pServer.command && typeof pServer.command !== 'string') return false;
                if (pServer.args && !Array.isArray(pServer.args)) return false;
                if (pServer.env && typeof pServer.env !== 'object') return false;
                if (pServer.url && typeof pServer.url !== 'string') return false;
                if (pServer.headers && typeof pServer.headers !== 'object') return false;
                if (pServer.transport && !['http', 'sse', 'stdio'].includes(pServer.transport)) return false;
                if (pServer.disabled !== undefined && typeof pServer.disabled !== 'boolean') return false;
              }
            }
          }
        }
      }

      // If mcpServers exists, validate its structure
      if (config.mcpServers) {
        if (typeof config.mcpServers !== 'object' || config.mcpServers === null) {
          return false;
        }

        // Validate each MCP server configuration
        for (const [, serverConfig] of Object.entries(config.mcpServers)) {
          if (typeof serverConfig !== 'object' || serverConfig === null) {
            return false;
          }

          // Validate command fields for stdio transport
          if (serverConfig.command && typeof serverConfig.command !== 'string') {
            return false;
          }

          if (serverConfig.args && !Array.isArray(serverConfig.args)) {
            return false;
          }

          if (serverConfig.env && typeof serverConfig.env !== 'object') {
            return false;
          }

          // Validate URL field for HTTP transport
          if (serverConfig.url && typeof serverConfig.url !== 'string') {
            return false;
          }

          // Validate optional fields
          if (serverConfig.headers && typeof serverConfig.headers !== 'object') {
            return false;
          }

          if (serverConfig.transport && !['http', 'sse', 'stdio'].includes(serverConfig.transport)) {
            return false;
          }

          if (serverConfig.disabled !== undefined && typeof serverConfig.disabled !== 'boolean') {
            return false;
          }
        }

        // If we have expected MCP config, validate it exists and is correct
        if (expectedMCPConfig) {
          const serverConfig = config.mcpServers[expectedMCPConfig.mcpServerId];
          if (!serverConfig) {
            return false;
          }

          // Validate based on transport type
          if (expectedMCPConfig.transport === 'stdio' || expectedMCPConfig.command) {
            // For stdio transport, validate command
            if (expectedMCPConfig.command && serverConfig.command !== expectedMCPConfig.command) {
              return false;
            }
          } else {
            // For HTTP transport, validate URL
            if (expectedMCPConfig.mcpServerUrl && serverConfig.url !== expectedMCPConfig.mcpServerUrl) {
              return false;
            }
          }

          // Validate transport if specified (accept either 'transport' or 'type')
          const effectiveTransport = (serverConfig.transport as any)
            || ((serverConfig as any).type as any)
            || (serverConfig.command ? 'stdio' : (serverConfig.url ? 'http' : undefined));
          if (expectedMCPConfig.transport && effectiveTransport !== expectedMCPConfig.transport) {
            return false;
          }
        }
      }

      return true;
    } catch (error) {
      return false;
    }
  }
}
