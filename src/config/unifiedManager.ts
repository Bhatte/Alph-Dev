import { promises as fs } from 'fs';
import { dirname, join, resolve } from 'path';
import { ensureDirectory, getDefaultConfigDir } from '../utils/directory';
import type { UnifiedConfig, UnifiedMCPServer } from '../types/unified';
import { createConfigValidator } from './validator';
import type { Logger } from '../logger';
import { createEnhancedLogger } from '../enhancedLogger';

export interface UnifiedConfigManagerOptions {
  logger?: Logger;
  configDir?: string; // explicit user-level dir override
}

export class UnifiedConfigManager {
  private logger: Logger;
  private userConfigDir: string;

  constructor(opts: UnifiedConfigManagerOptions = {}) {
    this.logger = opts.logger || createEnhancedLogger({
      level: process.env['NODE_ENV'] === 'production' ? 'info' : 'debug',
      colors: process.stdout.isTTY,
      fileLogging: false,
      jsonLogging: false
    });
    this.userConfigDir = opts.configDir || getDefaultConfigDir('alph');
  }

  // Paths
  getProjectConfigPath(cwd: string = process.cwd()): string {
    return join(resolve(cwd), 'alph.json');
  }

  getUserConfigPath(): string {
    return join(this.userConfigDir, 'alph.json');
  }

  // Load with hierarchy: project overrides user; merge by id
  async load(cwd: string = process.cwd()): Promise<{ config: UnifiedConfig; sourcePaths: string[] }> {
    const projectPath = this.getProjectConfigPath(cwd);
    const userPath = this.getUserConfigPath();

    const sources: { path: string; data?: UnifiedConfig }[] = [
      { path: userPath },
      { path: projectPath }
    ];

    for (const s of sources) {
      const data = await this.readIfExists(s.path);
      if (data) s.data = data;
    }

    const present = sources.filter(s => !!s.data) as { path: string; data: UnifiedConfig }[];
    const merged = this.mergeConfigs(present.map(p => p.data));

    return { config: merged, sourcePaths: present.map(p => p.path) };
  }

  // Validate using 'alph' schema
  async validate(config: UnifiedConfig): Promise<{ valid: boolean; errors?: string[] }> {
    const validator = createConfigValidator();
    return validator.validate('alph' as any, config);
  }

  // Save to target (project|user). Creates backup and uses a simple lock file in same directory.
  async save(
    update: (current: UnifiedConfig) => UnifiedConfig | void,
    options: { target?: 'project' | 'user'; cwd?: string; backup?: boolean } = {}
  ): Promise<{ path: string }>
  {
    const target = options.target || 'project';
    const cwd = options.cwd || process.cwd();
    const path = target === 'project' ? this.getProjectConfigPath(cwd) : this.getUserConfigPath();

    await ensureDirectory(dirname(path));

    // Load current content
    const current = (await this.readIfExists(path)) || { mcpServers: [] } as UnifiedConfig;

    // Apply update
    const result = update(current);
    const nextConfig = (result ? result : current) as UnifiedConfig;

    // Validate
    const validation = await this.validate(nextConfig);
    if (!validation.valid) {
      const msg = `Unified config validation failed: ${(validation.errors || []).join('; ')}`;
      throw new Error(msg);
    }

    const lockPath = path + '.lock';
    await this.acquireLock(lockPath);
    try {
      if (options.backup) {
        await this.writeBackup(path);
      }
      await fs.writeFile(path, JSON.stringify(nextConfig, null, 2), 'utf-8');
    } finally {
      await this.releaseLock(lockPath);
    }

    return { path };
  }

  // Helpers
  private async readIfExists(path: string): Promise<UnifiedConfig | undefined> {
    try {
      const raw = await fs.readFile(path, 'utf-8');
      const json = JSON.parse(raw);
      // Normalize shape
      const mcpServers: UnifiedMCPServer[] = Array.isArray(json.mcpServers) ? json.mcpServers : [];
      return { version: json.version, mcpServers };
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') return undefined;
      // If file exists but is invalid, bubble up for explicit handling
      throw e;
    }
  }

  private mergeConfigs(configs: UnifiedConfig[]): UnifiedConfig {
    // Precedence: later items override earlier (project last)
    const byId = new Map<string, UnifiedMCPServer>();
    for (const cfg of configs) {
      if (!cfg || !Array.isArray(cfg.mcpServers)) continue;
      for (const entry of cfg.mcpServers) {
        if (!entry || typeof entry !== 'object' || !entry.id) continue;
        const prev = byId.get(entry.id);
        byId.set(entry.id, { ...(prev || {}), ...entry });
      }
    }
    return { mcpServers: Array.from(byId.values()) };
  }

  private async writeBackup(path: string): Promise<string | undefined> {
    try {
      const raw = await fs.readFile(path, 'utf-8');
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backup = path + `.bak.${stamp}`;
      await fs.writeFile(backup, raw, 'utf-8');
      return backup;
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') return undefined;
      this.logger.warn?.('Failed to create backup for alph.json:', e);
      return undefined;
    }
  }

  private async acquireLock(lockPath: string): Promise<void> {
    // naive lock: create lockfile with O_EXCL-like semantics by using flag 'wx'
    try {
      await fs.writeFile(lockPath, String(process.pid), { encoding: 'utf-8', flag: 'wx' });
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code === 'EEXIST') {
        throw new Error('alph.json is currently locked by another process');
      }
      throw e;
    }
  }

  private async releaseLock(lockPath: string): Promise<void> {
    try {
      await fs.unlink(lockPath);
    } catch {
      // ignore
    }
  }
}

export async function createUnifiedConfigManager(opts: UnifiedConfigManagerOptions = {}) {
  const mgr = new UnifiedConfigManager(opts);
  // Ensure user dir exists so save to user works out of the box
  await ensureDirectory(dirname(mgr.getUserConfigPath()));
  return mgr;
}
