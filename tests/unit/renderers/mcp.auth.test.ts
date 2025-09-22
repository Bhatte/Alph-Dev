import { renderMcpServer } from '../../../src/renderers/mcp';

describe('MCP Server Authentication Handling', () => {
  describe('Kiro authentication', () => {
    test('should handle Bearer token with proper formatting', () => {
      const result = renderMcpServer({
        agent: 'kiro',
        serverId: 'test-server',
        transport: 'sse',
        url: 'https://api.example.com/mcp/sse',
        headers: {
          'Authorization': 'Bearer abc123def456'
        }
      });

      const server = result.mcpServers['test-server'];
      expect(server.args).toContain('--header');
      expect(server.args).toContain('Authorization:${AUTH_HEADER}');
      expect(server.env).toEqual({ AUTH_HEADER: 'Bearer abc123def456' });
    });

    test('should handle Bearer token with extra whitespace', () => {
      const result = renderMcpServer({
        agent: 'kiro',
        serverId: 'test-server',
        transport: 'sse',
        url: 'https://api.example.com/mcp/sse',
        headers: {
          'Authorization': 'Bearer   token-with-spaces   '
        }
      });

      const server = result.mcpServers['test-server'];
      expect(server.env).toEqual({ AUTH_HEADER: 'Bearer   token-with-spaces   ' });
    });

    test('should handle case-insensitive Authorization header', () => {
      const result = renderMcpServer({
        agent: 'kiro',
        serverId: 'test-server',
        transport: 'sse',
        url: 'https://api.example.com/mcp/sse',
        headers: {
          'authorization': 'Bearer lowercase-header'
        }
      });

      const server = result.mcpServers['test-server'];
      expect(server.args).toContain('Authorization:${AUTH_HEADER}');
      expect(server.env).toEqual({ AUTH_HEADER: 'Bearer lowercase-header' });
    });

    test('should handle multiple headers including authentication', () => {
      const result = renderMcpServer({
        agent: 'kiro',
        serverId: 'test-server',
        transport: 'sse',
        url: 'https://api.example.com/mcp/sse',
        headers: {
          'Authorization': 'Bearer multi-header-token',
          'X-Custom-Header': 'custom-value',
          'User-Agent': 'TestAgent/1.0'
        }
      });

      const server = result.mcpServers['test-server'];
      const args = server.args as string[];
      
      // Check Authorization header with env var substitution
      expect(args).toContain('--header');
      expect(args).toContain('Authorization:${AUTH_HEADER}');
      expect(server.env).toEqual({ AUTH_HEADER: 'Bearer multi-header-token' });
      
      // Check other headers are included directly
      expect(args).toContain('X-Custom-Header: custom-value');
      expect(args).toContain('User-Agent: TestAgent/1.0');
    });

    test('should handle non-Bearer authentication', () => {
      const result = renderMcpServer({
        agent: 'kiro',
        serverId: 'test-server',
        transport: 'sse',
        url: 'https://api.example.com/mcp/sse',
        headers: {
          'Authorization': 'Basic dXNlcjpwYXNz'
        }
      });

      const server = result.mcpServers['test-server'];
      expect(server.env).toEqual({ AUTH_HEADER: 'Basic dXNlcjpwYXNz' });
    });

    test('should handle HTTP transport correctly', () => {
      const result = renderMcpServer({
        agent: 'kiro',
        serverId: 'test-server',
        transport: 'http',
        url: 'https://api.example.com/mcp',
        headers: {
          'Authorization': 'Bearer http-token'
        }
      });

      const server = result.mcpServers['test-server'];
      const args = server.args as string[];
      expect(args).toContain('--transport');
      expect(args).toContain('http-only');
      expect(args).toContain('Authorization:${AUTH_HEADER}');
      expect(server.env).toEqual({ AUTH_HEADER: 'Bearer http-token' });
    });

    test('should not add authentication for STDIO transport', () => {
      const result = renderMcpServer({
        agent: 'kiro',
        serverId: 'test-server',
        transport: 'stdio',
        command: 'node',
        args: ['server.js']
      });

      const server = result.mcpServers['test-server'];
      expect(server.command).toBe('node');
      expect(server.args).toEqual(['server.js']);
      expect(server.env).toBeUndefined();
    });
  });

  describe('Other agents authentication compatibility', () => {
    test('Cursor SSE should preserve headers as-is', () => {
      const result = renderMcpServer({
        agent: 'cursor',
        serverId: 'test-server',
        transport: 'sse',
        url: 'https://api.example.com/mcp/sse',
        headers: {
          'Authorization': 'Bearer cursor-token'
        }
      });

      const server = result.mcpServers['test-server'];
      expect(server.type).toBe('sse');
      expect(server.headers).toEqual({ 'Authorization': 'Bearer cursor-token' });
    });

    test('Claude SSE should preserve headers as-is', () => {
      const result = renderMcpServer({
        agent: 'claude',
        serverId: 'test-server',
        transport: 'sse',
        url: 'https://api.example.com/mcp/sse',
        headers: {
          'Authorization': 'Bearer claude-token'
        }
      });

      const server = result.mcpServers['test-server'];
      expect(server.type).toBe('sse');
      expect(server.headers).toEqual({ 'Authorization': 'Bearer claude-token' });
    });

    test('Gemini SSE should preserve headers as-is', () => {
      const result = renderMcpServer({
        agent: 'gemini',
        serverId: 'test-server',
        transport: 'sse',
        url: 'https://api.example.com/mcp/sse',
        headers: {
          'Authorization': 'Bearer gemini-token'
        }
      });

      const server = result.mcpServers['test-server'];
      expect(server.transport).toBe('sse');
      expect(server.headers).toEqual({ 'Authorization': 'Bearer gemini-token' });
    });

    test('Windsurf should preserve headers as-is', () => {
      const result = renderMcpServer({
        agent: 'windsurf',
        serverId: 'test-server',
        transport: 'sse',
        url: 'https://api.example.com/mcp/sse',
        headers: {
          'Authorization': 'Bearer windsurf-token'
        }
      });

      const server = result.mcpServers['test-server'];
      expect(server.serverUrl).toBe('https://api.example.com/mcp/sse');
      expect(server.headers).toEqual({ 'Authorization': 'Bearer windsurf-token' });
    });
  });
});