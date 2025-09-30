import fs from 'fs';
import Ajv, { ErrorObject } from 'ajv';
import { parse as parseYAML } from 'yaml';
import { expandPathTemplate } from '../utils/pathTemplates';
import { resolvePackagePath } from '../utils/packageRoot';

export interface HeaderPolicy {
  headerName: string;
  format: string;
}

export interface ProtocolProfile {
  shape: string;
  fields?: Record<string, 'required' | 'optional'>;
  headerPolicyRef?: string | null;
}

export interface AgentEntry {
  id: string;
  displayName: string;
  writeMode: 'file' | 'cli';
  scopes: {
    project?: { pathTemplate: string | null } | null;
    user?: { pathTemplate: string | null } | null;
  };
  containerKey: string;
  protocolProfiles: {
    stdio?: ProtocolProfile;
    sse?: ProtocolProfile;
    http?: ProtocolProfile;
  };
}

export interface AgentsCatalog {
  version: number;
  defaults?: {
    containerKey?: string;
    headerPolicies?: Record<string, HeaderPolicy>;
  };
  agents: AgentEntry[];
}

export interface LoadOptions {
  /** Path to the catalog YAML file. Default: catalog/agents.yaml */
  filePath?: string;
  /** Path to the JSON schema file. Default: schema/agents.schema.json */
  schemaPath?: string;
  /** Project directory used for ${projectDir} expansion */
  projectDir?: string;
}

export class CatalogValidationError extends Error {
  readonly details: ErrorObject[];
  constructor(message: string, details: ErrorObject[]) {
    super(message);
    this.name = 'CatalogValidationError';
    this.details = details;
  }
}

export class CatalogLoader {
  private ajv: Ajv;

  constructor() {
    this.ajv = new Ajv({ allErrors: true, strict: false });
  }

  load(options: LoadOptions = {}): AgentsCatalog {
    let filePath: string;
    let schemaPath: string;
    
    try {
      filePath = options.filePath ?? resolvePackagePath('catalog', 'agents.yaml');
      schemaPath = options.schemaPath ?? resolvePackagePath('schema', 'agents.schema.json');
    } catch (error) {
      throw new CatalogValidationError(
        `Failed to locate agents catalog files. This usually means the Alph package is corrupted or not properly installed. ` +
        `Try reinstalling with 'npm install -g @aqualia/alph-cli@latest' or contact support.`,
        []
      );
    }

    let rawYaml: string;
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error(`Agents catalog file not found: ${filePath}`);
      }
      rawYaml = fs.readFileSync(filePath, 'utf8');
    } catch (error) {
      throw new CatalogValidationError(
        `Failed to read agents catalog from ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
        []
      );
    }
    
    let data: AgentsCatalog;
    try {
      data = parseYAML(rawYaml) as AgentsCatalog;
    } catch (error) {
      throw new CatalogValidationError(
        `Failed to parse agents catalog YAML: ${error instanceof Error ? error.message : String(error)}`,
        []
      );
    }

    // Schema validation is optional - proceed without it if file is missing
    try {
      if (!fs.existsSync(schemaPath)) {
        console.warn(`Warning: Agents schema file not found at ${schemaPath}, skipping validation`);
      } else {
        const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
        const schemaId: string | undefined = schema['$id'];
        let validate;
        if (schemaId) {
          validate = this.ajv.getSchema(schemaId);
          if (!validate) {
            validate = this.ajv.compile(schema);
          }
        } else {
          validate = this.ajv.compile(schema);
        }
        const valid = validate(data);
        if (!valid) {
          throw new CatalogValidationError('agents.yaml failed schema validation', validate.errors ?? []);
        }
      }
    } catch (error) {
      if (error instanceof CatalogValidationError) {
        throw error;
      }
      console.warn(`Warning: Agents schema validation failed, proceeding without validation: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Expand path templates where present
    const projectDir = options.projectDir ?? process.cwd();
    const expanded: AgentsCatalog = {
      ...data,
      agents: data.agents.map((a) => ({
        ...a,
        scopes: {
          project: a.scopes?.project
            ? { pathTemplate: expandPathTemplate(a.scopes.project.pathTemplate, { projectDir }) }
            : a.scopes?.project ?? null,
          user: a.scopes?.user
            ? { pathTemplate: expandPathTemplate(a.scopes.user.pathTemplate, { projectDir }) }
            : a.scopes?.user ?? null,
        },
      })),
    };

    return expanded;
  }
}

export const defaultCatalogLoader = new CatalogLoader();
