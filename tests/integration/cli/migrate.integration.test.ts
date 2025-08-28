import { createTestSandbox, Sandbox } from '../../_utils/fsSandbox';
import { createEnvManager, PlatformEnvStubs } from '../../_utils/env';
import * as path from 'path';
import * as fs from 'fs/promises';

// Helper to capture console output
function captureConsole() {
  const logs: string[] = [];
  const errors: string[] = [];
  const origLog = console.log;
  const origError = console.error;
  console.log = (...args: any[]) => {
    logs.push(args.join(' '));
    // Also call through to avoid suppressing output during debug
    origLog.apply(console, args);
  };
  console.error = (...args: any[]) => {
    errors.push(args.join(' '));
    origError.apply(console, args);
  };
  return {
    logs,
    errors,
    restore: () => {
      console.log = origLog;
      console.error = origError;
    }
  };
}

describe.skip('Migrate Command Integration (removed)', () => {
  let sandbox: Sandbox;
  let envManager: ReturnType<typeof createEnvManager>;
  let originalCwd: string;

  beforeEach(async () => {
    sandbox = await createTestSandbox();
    envManager = createEnvManager();
    originalCwd = process.cwd();
    process.chdir(sandbox.root);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await sandbox.cleanup();
    envManager.restoreAll();
    jest.resetModules();
    jest.clearAllMocks();
  });

  async function writeProviderConfigs(root: string) {
    // Cursor: ~/.cursor/mcp.json under configDir override
    await sandbox.createFile(path.relative(root, path.join(root, '.cursor', 'mcp.json')), JSON.stringify({
      mcpServers: {
        'cursor-srv': {
          transport: 'http',
          httpUrl: 'https://cursor.example/api',
          headers: { Authorization: 'Bearer CURSOR_TOKEN_123', 'X-Extra': '1' },
          env: { FOO: 'bar' }
        }
      }
    }, null, 2));

    // Claude: ~/.claude/settings.json under configDir override
    await sandbox.createFile(path.relative(root, path.join(root, '.claude', 'settings.json')), JSON.stringify({
      mcpServers: {
        'claude-srv': {
          transport: 'http',
          httpUrl: 'https://claude.example/api',
          headers: { Authorization: 'Bearer CLAUDE_TOKEN_ABC' }
        }
      }
    }, null, 2));

    // Gemini: ~/.gemini/settings.json under configDir override
    await sandbox.createFile(path.relative(root, path.join(root, '.gemini', 'settings.json')), JSON.stringify({
      mcpServers: {
        'gemini-srv': {
          httpUrl: 'https://gemini.example/api',
          env: { AUTHORIZATION: 'Bearer GEMINI_TOKEN_XYZ', DEBUG: '1' }
        }
      }
    }, null, 2));
  }

  it('migrates from all detected providers into project alph.json (no tokens)', async () => {
    // Use Linux-like env for deterministic user config path if needed
    envManager.stubMultiple(PlatformEnvStubs.linux(sandbox.resolve('home')));

    await writeProviderConfigs(sandbox.root);

    const { executeMigrateCommand } = await import('../../../src/commands/migrate.js');
    await executeMigrateCommand({
      configDir: sandbox.root,
      includeTokens: false,
      target: 'project',
      yes: true,
    });

    const alphPath = path.join(sandbox.root, 'alph.json');
    const alphContent = await sandbox.readFile(path.relative(sandbox.root, alphPath));
    const unified = JSON.parse(alphContent);

    // Expect 3 servers merged
    expect(Array.isArray(unified.mcpServers)).toBe(true);
    const byId = Object.fromEntries(unified.mcpServers.map((e: any) => [e.id, e]));
    expect(byId['cursor-srv']).toBeDefined();
    expect(byId['claude-srv']).toBeDefined();
    expect(byId['gemini-srv']).toBeDefined();

    // No tokens when includeTokens=false
    expect(byId['cursor-srv']?.authentication?.token).toBeUndefined();
    expect(byId['claude-srv']?.authentication?.token).toBeUndefined();
    expect(byId['gemini-srv']?.authentication?.token).toBeUndefined();
  });

  it('includes tokens when includeTokens=true', async () => {
    envManager.stubMultiple(PlatformEnvStubs.windows(sandbox.resolve('home')));
    await writeProviderConfigs(sandbox.root);

    const { executeMigrateCommand } = await import('../../../src/commands/migrate.js');
    await executeMigrateCommand({
      configDir: sandbox.root,
      includeTokens: true,
      target: 'project',
      yes: true,
    });

    const alphContent = await sandbox.readFile('alph.json');
    const unified = JSON.parse(alphContent);
    const byId = Object.fromEntries(unified.mcpServers.map((e: any) => [e.id, e]));
    expect(byId['cursor-srv']?.authentication?.token).toBe('CURSOR_TOKEN_123');
    expect(byId['claude-srv']?.authentication?.token).toBe('CLAUDE_TOKEN_ABC');
    expect(byId['gemini-srv']?.authentication?.token).toBe('GEMINI_TOKEN_XYZ');
  });

  it('respects target=user and writes to user config directory', async () => {
    // Stub env so getDefaultConfigDir('alph') resolves within sandbox on any platform
    const home = sandbox.resolve('home');
    envManager.stubMultiple({
      ...PlatformEnvStubs.linux(home),
      'USERPROFILE': home,
      'APPDATA': path.join(home, 'AppData', 'Roaming'),
    });
    await writeProviderConfigs(sandbox.root);

    const { executeMigrateCommand } = await import('../../../src/commands/migrate.js');
    await executeMigrateCommand({
      configDir: sandbox.root,
      includeTokens: false,
      target: 'user',
      yes: true,
    });

    // Compute expected user config path according to getDefaultConfigDir('alph')
    const { getDefaultConfigDir } = await import('../../../src/utils/directory.js');
    const userAlphPath = path.join(getDefaultConfigDir('alph'), 'alph.json');
    const userContent = await fs.readFile(userAlphPath, 'utf8');
    const unified = JSON.parse(userContent);
    expect(unified.mcpServers.length).toBeGreaterThan(0);
  });

  it('supports dry-run preview and does not write files', async () => {
    envManager.stubMultiple(PlatformEnvStubs.linux(sandbox.resolve('home')));
    await writeProviderConfigs(sandbox.root);

    const cap = captureConsole();
    try {
      const { executeMigrateCommand } = await import('../../../src/commands/migrate.js');
      await executeMigrateCommand({
        configDir: sandbox.root,
        includeTokens: false,
        dryRun: true,
        target: 'project',
      });
    } finally {
      cap.restore();
    }

    const alphExists = await sandbox.exists('alph.json');
    expect(alphExists).toBe(false);

    // Preview output should be printed
    const joined = cap.logs.join('\n');
    expect(joined).toContain('Migration preview');
    expect(joined).toContain('Target file:');
    expect(joined).toContain('cursor-srv');
    expect(joined).toContain('claude-srv');
    expect(joined).toContain('gemini-srv');
    expect(joined).toContain('preview only');
  });

  it('filters by agents option (only cursor)', async () => {
    envManager.stubMultiple(PlatformEnvStubs.linux(sandbox.resolve('home')));
    await writeProviderConfigs(sandbox.root);

    const { executeMigrateCommand } = await import('../../../src/commands/migrate.js');
    await executeMigrateCommand({
      configDir: sandbox.root,
      includeTokens: false,
      target: 'project',
      yes: true,
      agents: 'cursor',
    });

    const alphContent = await sandbox.readFile('alph.json');
    const unified = JSON.parse(alphContent);
    const ids = new Set(unified.mcpServers.map((e: any) => e.id));
    expect(ids.has('cursor-srv')).toBe(true);
    expect(ids.has('claude-srv')).toBe(false);
    expect(ids.has('gemini-srv')).toBe(false);
  });

  it('creates backup when alph.json exists and removes lock file after save', async () => {
    envManager.stubMultiple(PlatformEnvStubs.linux(sandbox.resolve('home')));
    // Pre-create project alph.json with one entry
    await sandbox.createFile('alph.json', JSON.stringify({ mcpServers: [{ id: 'existing', endpoint: 'http://localhost', transport: 'http' }] }, null, 2));

    await writeProviderConfigs(sandbox.root);

    const { executeMigrateCommand } = await import('../../../src/commands/migrate.js');
    await executeMigrateCommand({
      configDir: sandbox.root,
      includeTokens: false,
      target: 'project',
      yes: true,
    });

    // Lock file should not exist
    const lockExists = await sandbox.exists('alph.json.lock');
    expect(lockExists).toBe(false);

    // A backup file should exist with prefix 'alph.json.bak.'
    const files = await fs.readdir(sandbox.root);
    const hasBackup = files.some(f => f.startsWith('alph.json.bak.'));
    expect(hasBackup).toBe(true);
  });

  it('honors confirmation prompt when not using --yes', async () => {
    envManager.stubMultiple(PlatformEnvStubs.linux(sandbox.resolve('home')));
    await writeProviderConfigs(sandbox.root);

    // Mock inquirer to decline confirmation
    jest.resetModules();
    jest.doMock('inquirer', () => ({
      __esModule: true,
      default: {
        prompt: jest.fn().mockResolvedValue({ confirmed: false })
      }
    }));

    const cap = captureConsole();
    try {
      // Re-require the command module so it picks up the mock
      const { executeMigrateCommand: run } = await import('../../../src/commands/migrate.js');
      await run({
        configDir: sandbox.root,
        includeTokens: false,
        target: 'project',
        // no yes
      });
    } finally {
      cap.restore();
    }

    const alphExists = await sandbox.exists('alph.json');
    expect(alphExists).toBe(false);

    const joined = cap.logs.join('\n');
    expect(joined).toContain('Migration cancelled');
  });
});
