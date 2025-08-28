import os from 'os';
import path from 'path';
import fs from 'fs';
import { AgentProvider, AgentConfig, RemovalConfig } from './provider';

export class VSCodeProvider implements AgentProvider {
  name = 'VS Code';
  configFile: string;

  constructor(configDir?: string) {
    this.configFile = this.getSettingsPath(configDir);
  }

  private getSettingsPath(configDir?: string): string {
    if (configDir) {
      // Use custom config directory
      return path.join(configDir, 'vscode_settings.json');
    }
    
    const platform = process.platform;
    const homeDir = os.homedir();

    switch (platform) {
      case 'win32':
        // Windows
        return path.join(process.env['APPDATA'] || path.join(homeDir, 'AppData', 'Roaming'), 'Code', 'User', 'settings.json');
      case 'darwin':
        // macOS
        return path.join(homeDir, 'Library', 'Application Support', 'Code', 'User', 'settings.json');
      case 'linux':
        // Linux
        return path.join(homeDir, '.config', 'Code', 'User', 'settings.json');
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
  }

  async detect(configDir?: string): Promise<string | null> {
    try {
      const settingsPath = this.getSettingsPath(configDir);
      return fs.existsSync(settingsPath) ? settingsPath : null;
    } catch (error) {
      // Handle permission errors and other filesystem issues gracefully
      return null;
    }
  }

  async configure(config: AgentConfig, backup: boolean): Promise<string | undefined> {
    // VS Code uses mcp.json files for MCP configuration
    // We'll create an mcp.json file in the .vscode directory of the current workspace
    const workspaceDir = process.cwd();
    const mcpDir = path.join(workspaceDir, '.vscode');
    const mcpFile = path.join(mcpDir, 'mcp.json');
    
    let backupPath: string | undefined;
    
    // Create backup if requested and file exists
    if (backup && fs.existsSync(mcpFile)) {
      backupPath = `${mcpFile}.backup.${Date.now()}`;
      fs.copyFileSync(mcpFile, backupPath);
    }
    
    // Read existing config or create new one
    let vsCodeConfig: any = {};
    if (fs.existsSync(mcpFile)) {
      try {
        const content = fs.readFileSync(mcpFile, 'utf8');
        vsCodeConfig = JSON.parse(content);
      } catch (error) {
        // If parsing fails, start with empty config
        vsCodeConfig = {};
      }
    }
    
    // Ensure servers object exists
    if (!vsCodeConfig.servers) {
      vsCodeConfig.servers = {};
    }
    
    // Add or update alph server configuration
    vsCodeConfig.servers.alph = {
      type: config.transport || 'sse',
      url: config.mcpServerUrl || '',
      headers: {
        Authorization: `Bearer ${config.mcpAccessKey}`
      }
    };
    
    // Create .vscode directory if it doesn't exist
    if (!fs.existsSync(mcpDir)) {
      fs.mkdirSync(mcpDir, { recursive: true });
    }
    
    // Write updated config
    fs.writeFileSync(mcpFile, JSON.stringify(vsCodeConfig, null, 2));
    
    return backupPath;
  }

  /**
   * Removes an MCP server configuration from VS Code
   */
  async remove(config: RemovalConfig, backup: boolean = true): Promise<string | undefined> {
    const workspaceDir = config.configDir || process.cwd();
    const mcpDir = path.join(workspaceDir, '.vscode');
    const mcpFile = path.join(mcpDir, 'mcp.json');
    
    if (!fs.existsSync(mcpFile)) {
      throw new Error('VS Code MCP configuration file not found');
    }
    
    let backupPath: string | undefined;
    
    // Create backup if requested
    if (backup) {
      backupPath = `${mcpFile}.backup.${Date.now()}`;
      fs.copyFileSync(mcpFile, backupPath);
    }
    
    // Read existing config
    let vsCodeConfig: any = {};
    try {
      const content = fs.readFileSync(mcpFile, 'utf8');
      vsCodeConfig = JSON.parse(content);
    } catch (error) {
      throw new Error('Failed to parse VS Code MCP configuration');
    }
    
    // Check if servers section exists
    if (!vsCodeConfig.servers || typeof vsCodeConfig.servers !== 'object') {
      throw new Error(`MCP server '${config.mcpServerId}' not found - no servers configured`);
    }
    
    // Check if the specific server exists
    if (!(config.mcpServerId in vsCodeConfig.servers)) {
      throw new Error(`MCP server '${config.mcpServerId}' not found`);
    }
    
    // Remove the server
    delete vsCodeConfig.servers[config.mcpServerId];
    
    // Write updated config
    fs.writeFileSync(mcpFile, JSON.stringify(vsCodeConfig, null, 2));
    
    return backupPath;
  }

  /**
   * Lists all MCP server configurations in VS Code
   */
  async listMCPServers(configDir?: string): Promise<string[]> {
    try {
      const workspaceDir = configDir || process.cwd();
      const mcpFile = path.join(workspaceDir, '.vscode', 'mcp.json');
      
      if (!fs.existsSync(mcpFile)) {
        return [];
      }
      
      const content = fs.readFileSync(mcpFile, 'utf8');
      const vsCodeConfig = JSON.parse(content);
      
      if (!vsCodeConfig.servers || typeof vsCodeConfig.servers !== 'object') {
        return [];
      }
      
      return Object.keys(vsCodeConfig.servers);
    } catch (error) {
      throw new Error(`Failed to list MCP servers from VS Code: ${error}`);
    }
  }

  /**
   * Checks if a specific MCP server exists in VS Code
   */
  async hasMCPServer(serverId: string, configDir?: string): Promise<boolean> {
    try {
      const servers = await this.listMCPServers(configDir);
      return servers.includes(serverId);
    } catch (error) {
      throw new Error(`Failed to check MCP server in VS Code: ${error}`);
    }
  }
}
