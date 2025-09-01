import type { UnifiedMCPServer, UnifiedAuthentication, UnifiedTransport } from '../types/unified';
import type { CursorConfig, ClaudeConfig, GeminiConfig } from '../types/config';

// Utilities
function stripAuthHeader(headers?: Record<string, string>): { headers: Record<string, string> | undefined; token?: string } {
  if (!headers) return { headers: undefined };
  const out: Record<string, string> = {};
  let token: string | undefined;
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === 'authorization') {
      // Expect format: Bearer <token>
      const m = /^Bearer\s+(.+)$/i.exec(v.trim());
      if (m) token = m[1];
      continue;
    }
    out[k] = v;
  }
  const base = { headers: Object.keys(out).length ? out : undefined } as { headers: Record<string, string> | undefined };
  return token !== undefined ? { ...base, token } : base;
}

function extractBearerFromEnv(env?: Record<string, string>): { env: Record<string, string> | undefined; token?: string } {
  if (!env) return { env: undefined };
  const out: Record<string, string> = { ...env };
  let token: string | undefined;
  const auth = env['AUTHORIZATION'] || env['authorization'];
  if (auth) {
    const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
    if (m) token = m[1];
    delete out['AUTHORIZATION'];
    delete out['authorization'];
  }
  const base = { env: Object.keys(out).length ? out : undefined } as { env: Record<string, string> | undefined };
  return token !== undefined ? { ...base, token } : base;
}

// Providers -> Unified
export function toUnifiedFromCursor(cfg: CursorConfig, includeTokens = false): UnifiedMCPServer[] {
  const servers = cfg?.mcpServers || {};
  return Object.entries(servers).map(([id, s]) => {
    const { headers, token } = stripAuthHeader(s.headers);
    const auth: UnifiedAuthentication | undefined = token
      ? (includeTokens ? { strategy: 'bearer', token } : { strategy: 'bearer' })
      : s.headers?.['Authorization']
      ? { strategy: 'bearer' }
      : undefined;

    const endpoint = s.url || s.httpUrl;
    const entry: UnifiedMCPServer = {
      id,
      enabled: s.disabled === true ? false : true,
      transport: (s.transport as UnifiedTransport) || 'http',
      ...(endpoint ? { endpoint } : {}),
      ...(headers ? { headers } : {}),
      ...(s.env ? { env: s.env } : {}),
      ...(auth ? { authentication: auth } : {}),
    };
    return entry;
  });
}

export function toUnifiedFromClaude(cfg: ClaudeConfig, includeTokens = false): UnifiedMCPServer[] {
  const servers = cfg?.mcpServers || {};
  return Object.entries(servers).map(([id, s]) => {
    const { headers, token } = stripAuthHeader(s.headers);
    const auth: UnifiedAuthentication | undefined = token
      ? (includeTokens ? { strategy: 'bearer', token } : { strategy: 'bearer' })
      : s.headers?.['Authorization']
      ? { strategy: 'bearer' }
      : undefined;

    const endpoint = s.url;
    const entry: UnifiedMCPServer = {
      id,
      enabled: s.disabled === true ? false : true,
      transport: (s.transport as UnifiedTransport) || 'http',
      ...(endpoint ? { endpoint } : {}),
      ...(headers ? { headers } : {}),
      // Claude stores env-like items under `config`; we can't safely reconstruct env
      ...(auth ? { authentication: auth } : {}),
    };
    return entry;
  });
}

export function toUnifiedFromGemini(cfg: GeminiConfig, includeTokens = false): UnifiedMCPServer[] {
  const servers = cfg?.mcpServers || {} as NonNullable<GeminiConfig['mcpServers']>;
  return Object.entries(servers).map(([id, s]) => {
    const { env, token } = extractBearerFromEnv(s.env);
    const auth: UnifiedAuthentication | undefined = token
      ? (includeTokens ? { strategy: 'bearer', token } : { strategy: 'bearer' })
      : s.env?.['AUTHORIZATION']
      ? { strategy: 'bearer' }
      : undefined;

    const endpoint = s.httpUrl;
    const entry: UnifiedMCPServer = {
      id,
      enabled: s.disabled === true ? false : true,
      transport: 'http',
      ...(endpoint ? { endpoint } : {}),
      ...(env ? { env } : {}),
      ...(auth ? { authentication: auth } : {}),
    };
    return entry;
  });
}

// Unified -> AgentConfig (provider-agnostic); providers will inject per their own rules
import type { AgentConfig } from '../agents/provider';

export function toAgentConfigFromUnified(
  entry: UnifiedMCPServer,
  opts: {
    token?: string;
  } = {}
): AgentConfig {
  const token = opts.token;
  const transportVal = (entry.transport as any);
  const cfg: AgentConfig = {
    mcpServerId: entry.id,
    ...(entry.endpoint ? { mcpServerUrl: entry.endpoint } : {}),
    ...(transportVal && transportVal !== 'stdio' ? { transport: transportVal } : {}),
    ...(token ? { mcpAccessKey: token } : {}),
    ...(entry.headers ? { headers: entry.headers } : {}),
    ...(entry.env ? { env: entry.env } : {}),
  };
  return cfg;
}
