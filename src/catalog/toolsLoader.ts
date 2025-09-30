import fs from 'fs';
import Ajv, { ErrorObject } from 'ajv';
import { parse as parseYAML } from 'yaml';
import { resolvePackagePath } from '../utils/packageRoot';

export interface ToolInstaller { type: string; command: string }
export interface ToolHealthCmd { command: string }

export interface ToolEnvPrompt { key: string; label?: string; secret?: boolean; optional?: boolean }

export interface ToolEntry {
  id: string;
  bin: string;
  discovery?: { commands?: string[] };
  installers: {
    macos?: ToolInstaller[];
    linux?: ToolInstaller[];
    windows?: ToolInstaller[];
  };
  health?: { version?: ToolHealthCmd; probe?: ToolHealthCmd };
  meta?: {
    envPrompts?: ToolEnvPrompt[];
    notes?: string;
  };
}

export interface ToolsCatalog {
  tools: ToolEntry[];
}

export class ToolsCatalogValidationError extends Error {
  readonly details: ErrorObject[];
  constructor(message: string, details: ErrorObject[]) {
    super(message);
    this.name = 'ToolsCatalogValidationError';
    this.details = details;
  }
}

export class ToolsCatalogLoader {
  private ajv: Ajv;
  constructor() {
    this.ajv = new Ajv({ allErrors: true, strict: false });
  }

  load(filePath?: string, schemaPath?: string): ToolsCatalog {
    let f: string;
    let s: string;
    
    try {
      f = filePath ?? resolvePackagePath('catalog', 'tools.yaml');
      s = schemaPath ?? resolvePackagePath('schema', 'tools.schema.json');
    } catch (error) {
      throw new ToolsCatalogValidationError(
        `Failed to locate catalog files. This usually means the Alph package is corrupted or not properly installed. ` +
        `Try reinstalling with 'npm install -g @aqualia/alph-cli@latest' or contact support.`,
        []
      );
    }

    let data: ToolsCatalog;
    try {
      if (!fs.existsSync(f)) {
        throw new Error(`Tools catalog file not found: ${f}`);
      }
      data = parseYAML(fs.readFileSync(f, 'utf8')) as ToolsCatalog;
    } catch (error) {
      if (error instanceof Error && (error.message.includes('ENOENT') || error.message.includes('not found'))) {
        // Fallback to minimal embedded catalog
        return this.getFallbackCatalog();
      }
      throw new ToolsCatalogValidationError(
        `Failed to read tools catalog from ${f}: ${error instanceof Error ? error.message : String(error)}`,
        []
      );
    }

    try {
      if (!fs.existsSync(s)) {
        // Schema validation is optional - proceed without it if file is missing
        console.warn(`Warning: Schema file not found at ${s}, skipping validation`);
        return data;
      }
      const schema = JSON.parse(fs.readFileSync(s, 'utf8'));
      
      const schemaId: string | undefined = schema['$id'];
      let validate;
      if (schemaId) {
        validate = this.ajv.getSchema(schemaId) || this.ajv.compile(schema);
      } else {
        validate = this.ajv.compile(schema);
      }
      const ok = validate(data);
      if (!ok) {
        throw new ToolsCatalogValidationError('tools.yaml failed schema validation', validate.errors ?? []);
      }
    } catch (error) {
      if (error instanceof ToolsCatalogValidationError) {
        throw error;
      }
      console.warn(`Warning: Schema validation failed, proceeding without validation: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    return data;
  }

  /**
   * Provides a minimal fallback catalog when files are missing
   * This ensures STDIO setup can still work even if catalog files are not found
   */
  private getFallbackCatalog(): ToolsCatalog {
    return {
      tools: [
        {
          id: "filesystem-mcp",
          bin: "npx",
          discovery: {
            commands: ["npx -y @modelcontextprotocol/server-filesystem --help"]
          },
          installers: {
            macos: [{ type: "npm", command: "npm i -g @modelcontextprotocol/server-filesystem" }],
            linux: [{ type: "npm", command: "npm i -g @modelcontextprotocol/server-filesystem" }],
            windows: [{ type: "npm", command: "npm i -g @modelcontextprotocol/server-filesystem" }]
          },
          health: {
            version: { command: "npx -y @modelcontextprotocol/server-filesystem --help" }
          },
          meta: {
            notes: "Read and write files in specified directories"
          }
        },
        {
          id: "memory-mcp",
          bin: "npx",
          discovery: {
            commands: ["npx -y @modelcontextprotocol/server-memory --help"]
          },
          installers: {
            macos: [{ type: "npm", command: "npm i -g @modelcontextprotocol/server-memory" }],
            linux: [{ type: "npm", command: "npm i -g @modelcontextprotocol/server-memory" }],
            windows: [{ type: "npm", command: "npm i -g @modelcontextprotocol/server-memory" }]
          },
          health: {
            version: { command: "npx -y @modelcontextprotocol/server-memory --help" }
          },
          meta: {
            notes: "Store and retrieve information in memory during conversations"
          }
        },
        {
          id: "github-mcp",
          bin: "github-mcp",
          discovery: {
            commands: ["github-mcp --help", "npx -y @modelcontextprotocol/github-mcp --help"]
          },
          installers: {
            macos: [{ type: "npm", command: "npm i -g @modelcontextprotocol/github-mcp" }],
            linux: [{ type: "npm", command: "npm i -g @modelcontextprotocol/github-mcp" }],
            windows: [{ type: "npm", command: "npm i -g @modelcontextprotocol/github-mcp" }]
          },
          health: {
            version: { command: "github-mcp --version" },
            probe: { command: "github-mcp --help" }
          },
          meta: {
            notes: "Access GitHub repositories, issues, and PRs through AI",
            envPrompts: [
              { key: "GITHUB_TOKEN", label: "GitHub Personal Access Token", secret: true }
            ]
          }
        }
      ]
    };
  }
}

export const defaultToolsCatalogLoader = new ToolsCatalogLoader();
