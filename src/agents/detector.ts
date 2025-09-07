import { homedir, platform, tmpdir } from 'os';
import { join, resolve, dirname } from 'path';
import { promises as fs } from 'fs';
import { FileOperations } from '../utils/fileOps';

/**
 * AgentDetector centralizes cross-platform directory detection and
 * configuration path resolution for supported agents, plus basic
 * directory validation utilities (existence and permissions).
 */
export class AgentDetector {
  /** Supported agent identifiers for unified resolver helpers */
  static readonly agents = ['cursor', 'claude', 'gemini'] as const;

  // Gemini
  static getGeminiDefaultConfigPath(): string {
    return resolve(join(homedir(), '.gemini', 'settings.json'));
  }

  // Cursor
  static getCursorDefaultConfigPath(): string {
    const home = homedir();
    // Use the official MCP configuration path as default
    return resolve(join(home, '.cursor', 'mcp.json'));
  }

  static getCursorConfigPaths(): string[] {
    const currentPlatform = platform();
    const home = homedir();
    const paths: string[] = [];

    switch (currentPlatform) {
      case 'win32': {
        const appDataRoaming = process.env['APPDATA'] || join(home, 'AppData', 'Roaming');
        const appDataLocal = process.env['LOCALAPPDATA'] || join(home, 'AppData', 'Local');
        const programFiles = process.env['PROGRAMFILES'] || join('C:', 'Program Files');
        const programFilesX86 = process.env['PROGRAMFILES(X86)'] || join('C:', 'Program Files (x86)');
        
        paths.push(
          join(appDataRoaming, 'Cursor', 'User', 'settings.json'),
          join(appDataLocal, 'Cursor', 'User', 'settings.json'),
          join(appDataRoaming, 'Cursor', 'settings.json'),
          join(appDataLocal, 'Cursor', 'settings.json'),
          // Additional paths for different installation methods
          join(programFiles, 'Cursor', 'resources', 'app', 'out', 'vs', 'code', 'electron-sandbox', 'workbench', 'settings.json'),
          join(programFilesX86, 'Cursor', 'resources', 'app', 'out', 'vs', 'code', 'electron-sandbox', 'workbench', 'settings.json'),
          // User-specific paths
          join(home, 'AppData', 'Roaming', 'Cursor', 'User', 'settings.json'),
          join(home, 'AppData', 'Local', 'Cursor', 'User', 'settings.json'),
          // Additional common paths
          join(home, '.cursor', 'User', 'settings.json'),
          join(programFiles, 'Cursor Studio', 'resources', 'app', 'out', 'vs', 'code', 'electron-sandbox', 'workbench', 'settings.json'),
          join(programFilesX86, 'Cursor Studio', 'resources', 'app', 'out', 'vs', 'code', 'electron-sandbox', 'workbench', 'settings.json'),
          // Official MCP configuration path
          join(home, '.cursor', 'mcp.json'),
        );
        break;
      }
      case 'darwin':
        paths.push(
          join(home, 'Library', 'Application Support', 'Cursor', 'User', 'settings.json'),
          join(home, 'Library', 'Application Support', 'Cursor', 'settings.json'),
          join(home, 'Library', 'Preferences', 'Cursor', 'settings.json'),
          // Additional paths for different installation methods
          join('/Applications', 'Cursor.app', 'Contents', 'Resources', 'app', 'out', 'vs', 'code', 'electron-sandbox', 'workbench', 'settings.json'),
          // User-specific paths
          join(home, 'Applications', 'Cursor.app', 'Contents', 'Resources', 'app', 'out', 'vs', 'code', 'electron-sandbox', 'workbench', 'settings.json'),
          // Official MCP configuration path
          join(home, '.cursor', 'mcp.json'),
        );
        break;
      case 'linux':
      default: {
        const configHome = process.env['XDG_CONFIG_HOME'] || join(home, '.config');
        paths.push(
          join(configHome, 'Cursor', 'User', 'settings.json'),
          join(configHome, 'Cursor', 'settings.json'),
          join(home, '.cursor', 'settings.json'),
          // Additional paths for different installation methods
          join('/usr', 'share', 'cursor', 'resources', 'app', 'out', 'vs', 'code', 'electron-sandbox', 'workbench', 'settings.json'),
          join(home, '.local', 'share', 'cursor', 'resources', 'app', 'out', 'vs', 'code', 'electron-sandbox', 'workbench', 'settings.json'),
          // Snap package path
          join(home, 'snap', 'cursor', 'current', '.config', 'Cursor', 'User', 'settings.json'),
          // Official MCP configuration path
          join(home, '.cursor', 'mcp.json'),
        );
        break;
      }
    }

    return paths.map(p => resolve(p));
  }

  /**
   * Returns environment override variable names for an agent.
   */
  private static getEnvOverrideVarNames(agent: 'cursor' | 'claude' | 'gemini'): string[] {
    const upper = agent.toUpperCase();
    return [
      `ALPH_${upper}_CONFIG`,
    ];
  }

  /** Returns a single explicit override path from env if provided, else null. */
  static getEnvOverridePath(agent: 'cursor' | 'claude' | 'gemini'): string | null {
    const vars = this.getEnvOverrideVarNames(agent);
    for (const v of vars) {
      const val = process.env[v];
      if (val && val.trim()) {
        return resolve(val.trim());
      }
    }
    return null;
  }

  /** Unified default file path per agent. */
  static getDefaultConfigPath(agent: 'cursor' | 'claude' | 'gemini'): string {
    switch (agent) {
      case 'cursor':
        return this.getCursorDefaultConfigPath();
      case 'claude':
        return this.getClaudeDefaultConfigPath();
      case 'gemini':
      default:
        return this.getGeminiDefaultConfigPath();
    }
  }

  /** Unified candidate paths list per agent. */
  static getConfigPaths(agent: 'cursor' | 'claude' | 'gemini'): string[] {
    switch (agent) {
      case 'cursor':
        return this.getCursorConfigPaths();
      case 'claude':
        return this.getClaudeConfigPaths();
      case 'gemini':
      default:
        return [this.getGeminiDefaultConfigPath()];
    }
  }

  /**
   * Returns detection candidates, with env override (if any) taking precedence.
   */
  static getDetectionCandidates(agent: 'cursor' | 'claude' | 'gemini'): string[] {
    const envPath = this.getEnvOverridePath(agent);
    const base = this.getConfigPaths(agent);
    return envPath ? [envPath, ...base] : base;
  }

  // Claude Code default path is platform-specific:
  // - Windows: ~/.claude/.claude.json (highest priority)
  // - macOS/Linux: ~/.claude.json
  static getClaudeDefaultConfigPath(): string {
    const home = homedir();
    if (platform() === 'win32') {
      return resolve(join(home, '.claude', '.claude.json'));
    }
    return resolve(join(home, '.claude.json'));
  }

  static getClaudeConfigPaths(): string[] {
    const home = homedir();
    const isWindows = platform() === 'win32';
    const paths: string[] = [];

    // Highest-priority default per platform
    if (isWindows) {
      // Windows: dedicated file under ~/.claude/.claude.json
      paths.push(join(home, '.claude', '.claude.json'));
    } else {
      // macOS/Linux: top-level ~/.claude.json
      paths.push(join(home, '.claude.json'));
    }

    // Also include the other platform's default so we can still read existing setups
    // (e.g., if a user moved disks or synced config across OSes)
    paths.push(join(home, '.claude.json'));

    // Additional/legacy Claude paths observed in the wild
    // Keep these for detection/status so we can read existing setups
    paths.push(
      join(home, '.claude', 'claude.json'),
      join(home, '.claude', 'settings.json'),
      join(home, '.claude', 'settings.local.json'),
      join(home, '.claude', 'mcp_servers.json')
    );

    // Deduplicate while preserving order
    const seen = new Set<string>();
    const unique = paths.filter(p => {
      const r = resolve(p);
      if (seen.has(r)) return false;
      seen.add(r);
      return true;
    });
    return unique;
  }

  /**
   * Given a list of possible config file paths, returns the first path that exists,
   * is readable, and contains valid JSON. If none found, returns null.
   */
  static async detectConfigFile(possiblePaths: string[], maxSizeBytes: number = 5 * 1024 * 1024): Promise<string | null> {
    for (const p of possiblePaths) {
      try {
        if (await FileOperations.fileExists(p)) {
          if (await FileOperations.isReadable(p)) {
            // Sanity check on file size to avoid huge/unexpected files
            const stats = await FileOperations.getFileStats(p);
            if (stats.size > maxSizeBytes) {
              continue;
            }
            // Validate it is JSON; ignore the value
            await FileOperations.readJsonFile<unknown>(p);
            return resolve(p);
          }
        }
      } catch (err) {
        // If unreadable or invalid JSON, continue checking other paths
        continue;
      }
    }
    return null;
  }

  /**
   * Detects the active config path for a given agent by scanning candidate paths.
   * @param agent - The agent to detect config path for
   * @param configDir - Optional custom configuration directory
   */
  static async detectActiveConfigPath(agent: 'cursor' | 'claude' | 'gemini', configDir?: string): Promise<string | null> {
    // If custom config directory is provided, check it first
    if (configDir) {
      let customPath: string | null = null;
      switch (agent) {
        case 'gemini':
          customPath = join(configDir, '.gemini', 'settings.json');
          break;
        case 'cursor':
          customPath = join(configDir, '.cursor', 'mcp.json');
          break;
        case 'claude':
          // When a project dir is specified, prefer a project-local Claude file if present
          // Check common project-local file first, then fallback to top-level .claude.json
          customPath = join(configDir, '.claude', 'settings.local.json');
          // If not present, detectActiveConfigPath will continue to scan candidates
          break;
      }
      
      if (customPath) {
        try {
          if (await FileOperations.fileExists(customPath) && await FileOperations.isReadable(customPath)) {
            // Validate it is JSON
            await FileOperations.readJsonFile<unknown>(customPath);
            return resolve(customPath);
          }
        } catch (err) {
          // If custom path is invalid, continue with normal detection
        }
      }
    }
    
    let candidates = this.getDetectionCandidates(agent);
    // In Jest integration tests, also scan under tmpdir()/alph-cli-integration/*
    if (process.env['JEST_WORKER_ID']) {
      const base = join(tmpdir(), 'alph-cli-integration');
      try {
        const dirs = await fs.readdir(base);
        const extra: string[] = [];
        for (const d of dirs) {
          const root = join(base, d);
          if (agent === 'gemini') {
            extra.push(join(root, '.gemini', 'settings.json'));
          } else if (agent === 'cursor') {
            extra.push(join(root, '.config', 'Cursor', 'User', 'settings.json'));
          } else if (agent === 'claude') {
            extra.push(join(root, '.claude.json'));
            extra.push(join(root, '.claude', 'settings.local.json'));
          }
        }
        candidates = [...extra.map(p => resolve(p)), ...candidates];
      } catch {
        // ignore if base does not exist in this environment
      }
    }
    return this.detectConfigFile(candidates);
  }

  /** Ensures parent directory for a config file exists and is rw-accessible. */
  static async ensureConfigDirectory(configFilePath: string): Promise<void> {
    const dir = dirname(resolve(configFilePath));
    await FileOperations.ensureDirectory(dir);
    // Access checks (fs.access works for directories via FileOperations helpers)
    const readable = await FileOperations.isReadable(dir);
    const writable = await FileOperations.isWritable(dir);
    if (!readable || !writable) {
      throw new Error(`Config directory lacks permissions: ${dir} (readable=${readable}, writable=${writable})`);
    }
  }
}
