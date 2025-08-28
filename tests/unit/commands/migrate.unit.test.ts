import type { ProviderDetectionResult } from '../../../src/agents/provider';

// Mocks that tests will control
const mockDetectAvailableAgents = jest.fn();
let currentMgr: any;
const mockCreateUnifiedConfigManager = jest.fn(async () => currentMgr);
const mockReadJsonFile = jest.fn();
const mockToUnifiedFromCursor = jest.fn();
const mockToUnifiedFromClaude = jest.fn();
const mockToUnifiedFromGemini = jest.fn();

jest.mock('../../../src/agents/registry', () => ({
  defaultRegistry: {
    detectAvailableAgents: (...args: any[]) => (mockDetectAvailableAgents as any).apply(null, args as any),
  },
}));

jest.mock('../../../src/config/unifiedManager', () => ({
  createUnifiedConfigManager: (...args: any[]) => (mockCreateUnifiedConfigManager as any).apply(null, args as any),
}));

jest.mock('../../../src/utils/fileOps', () => ({
  FileOperations: {
    readJsonFile: (...args: any[]) => (mockReadJsonFile as any).apply(null, args as any),
  },
}));

jest.mock('../../../src/config/mapping', () => ({
  toUnifiedFromCursor: (...args: any[]) => (mockToUnifiedFromCursor as any).apply(null, args as any),
  toUnifiedFromClaude: (...args: any[]) => (mockToUnifiedFromClaude as any).apply(null, args as any),
  toUnifiedFromGemini: (...args: any[]) => (mockToUnifiedFromGemini as any).apply(null, args as any),
}));

// Import after mocks
const { executeMigrateCommand } = require('../../../src/commands/migrate');

function detection(providerName: string, configPath: string): ProviderDetectionResult {
  return {
    provider: { name: providerName } as any,
    detected: true,
    configPath,
  };
}

describe.skip('migrate command (removed)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    currentMgr = {
      getProjectConfigPath: () => 'C:/proj/alph.json',
      getUserConfigPath: () => 'C:/user/alph.json',
      async load() {
        return { config: { mcpServers: [] } };
      },
      async save(updater: (cfg: any) => void, opts: { target: 'project'|'user'; backup: boolean }) {
        const cfg = { mcpServers: [] as any[] };
        updater(cfg);
        return { path: opts.target === 'user' ? 'C:/user/alph.json' : 'C:/proj/alph.json' };
      },
    };
  });

  test('dry-run preview does not save and prints summary', async () => {
    mockDetectAvailableAgents.mockResolvedValue([
      detection('Cursor', 'C:/configs/cursor.json'),
    ]);

    mockReadJsonFile.mockResolvedValueOnce({} as any);
    mockToUnifiedFromCursor.mockReturnValue([
      { id: 'srv1', transport: 'http', endpoint: 'https://x', enabled: true },
    ]);

    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    await executeMigrateCommand({ dryRun: true, yes: true });

    // Should not attempt to save
    expect(mockCreateUnifiedConfigManager).toHaveBeenCalledTimes(1);
    // load called to build preview
    // save is not observable directly; rely on absence of text "Updated:" and presence of preview note
    const combined = logSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(combined).toContain('Migration preview');
    expect(combined).toContain('Note: this is a preview only');
    expect(combined).not.toContain('Updated:');

    logSpy.mockRestore();
  });

  test('passes provider filter when agents specified', async () => {
    mockDetectAvailableAgents.mockResolvedValue([
      detection('Cursor', 'C:/configs/cursor.json'),
      detection('Claude Code', 'C:/configs/claude.json'),
    ]);

    mockReadJsonFile.mockResolvedValue({} as any);
    mockToUnifiedFromCursor.mockReturnValue([]);
    mockToUnifiedFromClaude.mockReturnValue([]);

    await executeMigrateCommand({ agents: 'cursor', dryRun: true, yes: true });

    // First arg should be the filter list (from utils/agents mapping)
    expect(mockDetectAvailableAgents).toHaveBeenCalled();
    const [filterArg] = mockDetectAvailableAgents.mock.calls[0];
    expect(Array.isArray(filterArg)).toBe(true);
    expect(filterArg).toContain('cursor');
  });

  test('saves to user target when specified with backup', async () => {
    mockDetectAvailableAgents.mockResolvedValue([
      detection('Gemini CLI', 'C:/configs/gemini.json'),
    ]);

    mockReadJsonFile.mockResolvedValueOnce({} as any);
    mockToUnifiedFromGemini.mockReturnValue([
      { id: 'srv2', transport: 'sse', endpoint: 'https://y' },
    ]);

    // Spy on console to assert update message
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    // Patch mgr.save to capture opts
    const saveSpy = jest.fn(async (updater: (cfg:any)=>void, _opts: { target: 'project'|'user'; backup: boolean }) => {
      const cfg = { mcpServers: [] as any[] };
      updater(cfg);
      return { path: 'C:/user/alph.json' };
    });
    currentMgr.save = saveSpy;

    await executeMigrateCommand({ target: 'user', yes: true });

    expect(saveSpy).toHaveBeenCalled();
    const firstCall = saveSpy.mock.calls[0] || [] as any[];
    const opts = (firstCall as any[])[1];
    expect(opts).toMatchObject({ target: 'user', backup: true });

    const combined = logSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(combined).toContain('Migration complete');
    expect(combined).toContain('Updated:');

    logSpy.mockRestore();
  });
});
