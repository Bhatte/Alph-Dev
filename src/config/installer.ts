import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { MCPServerConfig } from '../types/config';
import { ConfigGenerator, AgentType } from './generator';

export interface InstallResult {
  success: boolean;
  message: string;
  backupPath?: string;
  configPath?: string;
  error?: Error;
}

export interface InstallOptions {
  /**
   * Whether to create a backup before making changes
   * @default true
   */
  backup?: boolean;
  
  /**
   * Whether to overwrite existing configuration
   * @default false
   */
  force?: boolean;
  
  /**
   * Custom backup directory
   */
  backupDir?: string;
  
  /**
   * Additional options for configuration generation
   */
  options?: Record<string, unknown>;
}

/**
 * Handles installation of configurations with backup and rollback support
 */
export class ConfigInstaller {
  constructor(private generator: ConfigGenerator) {}

  /**
   * Install configuration for an agent
   */
  async install(
    agentType: AgentType,
    mcpConfig: MCPServerConfig,
    options: InstallOptions = {}
  ): Promise<InstallResult> {
    const {
      backup = true,
      force = false,
      backupDir = await this.getDefaultBackupDir(),
      options: genOptions = {},
    } = options;

    const result: InstallResult = {
      success: false,
      message: '',
    };

    try {
      // Get the target config path
      const configPath = await this.generator.getDefaultConfigPath(agentType);
      result.configPath = configPath;

      // Create backup if requested
      let backupPath: string | undefined;
      if (backup) {
        backupPath = await this.createBackup(configPath, backupDir);
        result.backupPath = backupPath;
      }

      try {
        // Generate the new configuration
        const config = await this.generator.generate(agentType, mcpConfig, genOptions);
        
        // Ensure the directory exists
        await fs.mkdir(path.dirname(configPath), { recursive: true });
        
        // Check if file exists and handle accordingly
        try {
          const exists = await this.fileExists(configPath);
          if (exists && !force) {
            throw new Error(
              `Configuration file already exists at ${configPath}. Use --force to overwrite.`
            );
          }
          
          // Write the new configuration
          await fs.writeFile(
            configPath,
            JSON.stringify(config, null, 2),
            'utf8'
          );
          
          result.success = true;
          result.message = `Successfully installed configuration for ${agentType} at ${configPath}`;
          
        } catch (error) {
          // Rollback if backup exists
          if (backupPath && await this.fileExists(backupPath)) {
            await this.restoreBackup(backupPath, configPath);
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(
              `Failed to install configuration. Restored from backup. Original error: ${errorMessage}`
            );
          }
          throw error;
        }
        
      } catch (error) {
        // Clean up backup if installation failed and we couldn't restore
        if (backupPath) {
          try {
            await fs.unlink(backupPath);
          } catch (e) {
            // Ignore cleanup errors
          }
        }
        throw error;
      }
      
      return result;
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        ...result,
        message: `Failed to install configuration: ${errorMessage}`,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  /**
   * Create a backup of the configuration file
   */
  private async createBackup(
    configPath: string,
    backupDir: string
  ): Promise<string> {
    try {
      // Skip if config file doesn't exist yet
      if (!await this.fileExists(configPath)) {
        return '';
      }

      // Create backup directory if it doesn't exist
      await fs.mkdir(backupDir, { recursive: true });
      
      // Generate backup filename with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupName = `${path.basename(configPath)}.${timestamp}.bak`;
      const backupPath = path.join(backupDir, backupName);
      
      // Copy the file
      await fs.copyFile(configPath, backupPath);
      
      return backupPath;
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to create backup: ${errorMessage}`);
    }
  }

  /**
   * Restore configuration from a backup
   */
  private async restoreBackup(backupPath: string, targetPath: string): Promise<void> {
    try {
      await fs.copyFile(backupPath, targetPath);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to restore from backup: ${errorMessage}`);
    }
  }

  /**
   * Get the default backup directory
   */
  private async getDefaultBackupDir(): Promise<string> {
    return path.join(os.homedir(), '.alph', 'backups');
  }

  /**
   * Check if a file exists
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Factory function to create a config installer
 */
export function createConfigInstaller(generator: ConfigGenerator): ConfigInstaller {
  return new ConfigInstaller(generator);
}
