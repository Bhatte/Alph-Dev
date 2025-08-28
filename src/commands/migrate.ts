/**
 * The migrate command has been removed from Alph CLI.
 * This file remains as a minimal shim to provide a clear error if referenced.
 */

export interface MigrateCommandOptions {
  agents?: string[] | string;
  configDir?: string;
  includeTokens?: boolean;
  target?: 'project' | 'user';
  yes?: boolean;
  dryRun?: boolean;
}

export async function executeMigrateCommand(_options: MigrateCommandOptions = {}): Promise<void> {
  throw new Error('The migrate command has been removed from alph. Please use setup/status/remove as documented.');
}
