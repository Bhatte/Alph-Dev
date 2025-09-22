export type Transport = 'http' | 'sse' | 'stdio';

export interface RenderInput {
  agent: 'cursor' | 'gemini' | 'claude' | 'windsurf' | 'kiro';
  serverId: string;
  transport: Transport;
  url?: string;
  headers?: Record<string, string>;
  command?: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number;
}

export interface RenderOutput {
  [containerKey: string]: Record<string, Record<string, unknown>>;
}

function nonEmpty(obj?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!obj) return undefined;
  const keys = Object.keys(obj);
  return keys.length > 0 ? obj : undefined;
}

export function renderMcpServer(input: RenderInput): RenderOutput {
  const { agent, serverId, transport } = input;

  let server: Record<string, unknown> = {};

  if (agent === 'cursor') {
    if (transport === 'stdio') {
      server = {
        ...(input.command ? { command: input.command } : {}),
        ...(input.args ? { args: input.args } : {}),
        ...(nonEmpty(input.env) ? { env: input.env } : {})
      };
    } else if (transport === 'sse') {
      server = {
        type: 'sse',
        ...(input.url ? { url: input.url } : {}),
        ...(nonEmpty(input.headers) ? { headers: input.headers } : {})
      };
    } else {
      // Minimal, documented Cursor HTTP shape: infer transport by URL
      server = {
        ...(input.url ? { url: input.url } : {}),
        ...(nonEmpty(input.headers) ? { headers: input.headers } : {})
      };
    }
  } else if (agent === 'gemini') {
    if (transport === 'stdio') {
      server = {
        transport: 'stdio',
        ...(input.command ? { command: input.command } : {}),
        ...(input.args ? { args: input.args } : {}),
        ...(input.cwd ? { cwd: input.cwd } : {}),
        ...(nonEmpty(input.env) ? { env: input.env } : {}),
        ...(typeof input.timeout === 'number' && input.timeout > 0 ? { timeout: input.timeout } : {})
      };
    } else if (transport === 'sse') {
      server = {
        transport: 'sse',
        ...(input.url ? { url: input.url } : {}),
        // Gemini SSE uses 'url' and standard 'headers'
        ...(nonEmpty(input.headers) ? { headers: input.headers } : {}),
        ...(nonEmpty(input.env) ? { env: input.env } : {}),
        ...(typeof input.timeout === 'number' && input.timeout > 0 ? { timeout: input.timeout } : {})
      };
    } else {
      // HTTP transport
      server = {
        // Gemini HTTP uses 'httpUrl' and standard 'headers' (no 'transport' key required)
        ...(input.url ? { httpUrl: input.url } : {}),
        ...(nonEmpty(input.headers) ? { headers: input.headers } : {}),
        ...(nonEmpty(input.env) ? { env: input.env } : {}),
        ...(typeof input.timeout === 'number' && input.timeout > 0 ? { timeout: input.timeout } : {})
      };
    }
  } else if (agent === 'claude') {
    if (transport === 'stdio') {
      server = {
        transport: 'stdio',
        ...(input.command ? { command: input.command } : {}),
        ...(input.args ? { args: input.args } : {}),
        ...(nonEmpty(input.env) ? { env: input.env } : {})
      };
    } else if (transport === 'sse') {
      server = {
        type: 'sse',
        ...(input.url ? { url: input.url } : {}),
        ...(nonEmpty(input.headers) ? { headers: input.headers } : {})
      };
    } else {
      server = {
        type: 'http',
        ...(input.url ? { url: input.url } : {}),
        ...(nonEmpty(input.headers) ? { headers: input.headers } : {})
      };
    }
  } else if (agent === 'kiro') {
    // Kiro has a unique approach: always uses command/args (STDIO-style)
    // but for remote endpoints, uses mcp-remote wrapper
    if (transport === 'stdio') {
      // Native STDIO server
      server = {
        ...(input.command ? { command: input.command } : {}),
        ...(input.args ? { args: input.args } : {}),
        ...(nonEmpty(input.env) ? { env: input.env } : {}),
        disabled: false,
        autoApprove: []
      };
    } else {
      // Remote endpoints use mcp-remote wrapper
      const mcpRemoteArgs = ['mcp-remote'];
      if (input.url) {
        mcpRemoteArgs.push(input.url);
      }
      // Convert transport to mcp-remote format
      let mcpRemoteTransport: string = transport;
      if (transport === 'sse') {
        mcpRemoteTransport = 'sse-only';
      } else if (transport === 'http') {
        mcpRemoteTransport = 'http-only';
      }
      mcpRemoteArgs.push('--transport', mcpRemoteTransport);
      
      // Add headers using --header flag for mcp-remote
      const env = { ...input.env };
      if (input.headers) {
        Object.entries(input.headers).forEach(([key, value]) => {
          // For Authorization header, use environment variable substitution to avoid Windows spaces issue
          if (key.toLowerCase() === 'authorization') {
            mcpRemoteArgs.push('--header');
            mcpRemoteArgs.push(`Authorization:\${AUTH_HEADER}`); // No spaces around ':' to avoid Windows issues
            env['AUTH_HEADER'] = String(value); // Keep the original authorization header format
          } else {
            // For other headers, use direct format (assuming no spaces in common header names)
            mcpRemoteArgs.push('--header');
            mcpRemoteArgs.push(`${key}: ${value}`);
          }
        });
      }
      
      server = {
        command: 'npx',
        args: mcpRemoteArgs,
        ...(Object.keys(env).length > 0 ? { env } : {}),
        disabled: false,
        autoApprove: []
      };
    }
  } else {
    // Additional agent-specific shapes
    if (agent === 'windsurf') {
      if (transport === 'stdio') {
        server = {
          transport: 'stdio',
          ...(input.command ? { command: input.command } : {}),
          ...(input.args ? { args: input.args } : {}),
          ...(nonEmpty(input.env) ? { env: input.env } : {})
        };
      } else {
        // Windsurf uses serverUrl for remote (HTTP/SSE) endpoints
        server = {
          ...(input.url ? { serverUrl: input.url } : {}),
          ...(nonEmpty(input.headers) ? { headers: input.headers } : {}),
          ...(nonEmpty(input.env) ? { env: input.env } : {})
        };
      }
    } else {
      // Fallback: generic shape (Cursor-style)
      server = transport === 'stdio'
        ? { command: input.command, ...(input.args ? { args: input.args } : {}), ...(nonEmpty(input.env) ? { env: input.env } : {}) }
        : { url: input.url, ...(nonEmpty(input.headers) ? { headers: input.headers } : {}) };
    }
  }

  return {
    mcpServers: {
      [serverId]: server
    }
  };
}

