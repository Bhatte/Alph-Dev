import { renderMcpServer } from '../../../src/renderers/mcp';

describe('STDIO Configuration Validation across all agents', () => {
  const testCommand = 'uvx';
  const testArgs = ['excel-mcp-server', 'stdio'];
  const testEnv = { EXAMPLE_KEY: 'example' };

  describe('Cursor STDIO', () => {
    test('should generate valid STDIO configuration without transport field (per Cursor spec)', () => {
      const result = renderMcpServer({
        agent: 'cursor',
        serverId: 'test-server',
        transport: 'stdio',
        command: testCommand,
        args: testArgs,
        env: testEnv
      });

      const server = result.mcpServers['test-server'];
      expect(server.transport).toBeUndefined(); // Cursor doesn't use transport field for STDIO
      expect(server.command).toBe(testCommand);
      expect(server.args).toEqual(testArgs);
      expect(server.env).toEqual(testEnv);
    });

    test('should handle missing optional fields gracefully', () => {
      const result = renderMcpServer({
        agent: 'cursor',
        serverId: 'test-server',
        transport: 'stdio',
        command: testCommand
      });

      const server = result.mcpServers['test-server'];
      expect(server.transport).toBeUndefined(); // Cursor doesn't use transport field for STDIO
      expect(server.command).toBe(testCommand);
      expect(server.args).toBeUndefined();
      expect(server.env).toBeUndefined();
    });
  });

  describe('Claude STDIO', () => {
    test('should generate valid STDIO configuration with transport field', () => {
      const result = renderMcpServer({
        agent: 'claude',
        serverId: 'test-server',
        transport: 'stdio',
        command: testCommand,
        args: testArgs,
        env: testEnv
      });

      const server = result.mcpServers['test-server'];
      expect(server.transport).toBe('stdio');
      expect(server.command).toBe(testCommand);
      expect(server.args).toEqual(testArgs);
      expect(server.env).toEqual(testEnv);
    });
  });

  describe('Gemini STDIO', () => {
    test('should generate valid STDIO configuration with transport field', () => {
      const result = renderMcpServer({
        agent: 'gemini',
        serverId: 'test-server',
        transport: 'stdio',
        command: testCommand,
        args: testArgs,
        env: testEnv
      });

      const server = result.mcpServers['test-server'];
      expect(server.transport).toBe('stdio');
      expect(server.command).toBe(testCommand);
      expect(server.args).toEqual(testArgs);
      expect(server.env).toEqual(testEnv);
    });
  });

  describe('Windsurf STDIO', () => {
    test('should generate valid STDIO configuration with transport field', () => {
      const result = renderMcpServer({
        agent: 'windsurf',
        serverId: 'test-server',
        transport: 'stdio',
        command: testCommand,
        args: testArgs,
        env: testEnv
      });

      const server = result.mcpServers['test-server'];
      expect(server.transport).toBe('stdio');
      expect(server.command).toBe(testCommand);
      expect(server.args).toEqual(testArgs);
      expect(server.env).toEqual(testEnv);
    });
  });

  describe('Kiro STDIO', () => {
    test('should generate valid STDIO configuration', () => {
      const result = renderMcpServer({
        agent: 'kiro',
        serverId: 'test-server',
        transport: 'stdio',
        command: testCommand,
        args: testArgs,
        env: testEnv
      });

      const server = result.mcpServers['test-server'];
      expect(server.command).toBe(testCommand);
      expect(server.args).toEqual(testArgs);
      expect(server.env).toEqual(testEnv);
      expect(server.disabled).toBe(false);
      expect(server.autoApprove).toEqual([]);
    });
  });

  describe('Transport field consistency', () => {
    test('Claude, Gemini, and Windsurf should include transport field for STDIO', () => {
      const agents = ['claude', 'gemini', 'windsurf'] as const; // Cursor excluded - doesn't use transport field
      
      agents.forEach(agent => {
        const result = renderMcpServer({
          agent,
          serverId: 'test-server',
          transport: 'stdio',
          command: testCommand,
          args: testArgs
        });

        const server = result.mcpServers['test-server'];
        expect(server.transport).toBe('stdio');
      });
    });

    test('Cursor uses different structure without transport field', () => {
      const result = renderMcpServer({
        agent: 'cursor',
        serverId: 'test-server',
        transport: 'stdio',
        command: testCommand,
        args: testArgs
      });

      const server = result.mcpServers['test-server'];
      expect(server.command).toBe(testCommand);
      expect(server.args).toEqual(testArgs);
      // Cursor doesn't use transport field per its specification
      expect(server.transport).toBeUndefined();
    });

    test('Kiro uses different structure but should work correctly', () => {
      const result = renderMcpServer({
        agent: 'kiro',
        serverId: 'test-server',
        transport: 'stdio',
        command: testCommand,
        args: testArgs
      });

      const server = result.mcpServers['test-server'];
      expect(server.command).toBe(testCommand);
      expect(server.args).toEqual(testArgs);
      // Kiro doesn't use transport field, but has its own validation
      expect(server.disabled).toBe(false);
    });
  });
});