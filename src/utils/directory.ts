import { access, constants, mkdir, readdir } from 'fs/promises';
import { join, resolve, dirname } from 'path';
import { homedir } from 'os';

/**
 * Checks if a directory exists and is accessible
 * @param path Path to check
 * @returns Promise<boolean> True if directory exists and is accessible
 */
export async function directoryExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.R_OK | constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Creates a directory if it doesn't exist
 * @param path Path to create
 * @returns Promise<string> The path that was created or already exists
 */
export async function ensureDirectory(path: string): Promise<string> {
  try {
    await mkdir(path, { recursive: true });
    return path;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'EEXIST') {
      return path;
    }
    throw error;
  }
}

/**
 * Gets the default configuration directory for the current platform
 * @param appName Name of the application
 * @returns Platform-specific configuration directory path
 */
export function getDefaultConfigDir(appName: string): string {
  const platform = process.platform;
  const home = homedir();
  
  switch (platform) {
    case 'win32':
      return join(process.env['APPDATA'] || join(home, 'AppData', 'Roaming'), appName);
    case 'darwin':
      return join(home, 'Library', 'Application Support', appName);
    case 'linux':
    default:
      return join(process.env['XDG_CONFIG_HOME'] || join(home, '.config'), appName);
  }
}

/**
 * Finds all valid configuration directories for an application
 * @param appName Name of the application
 * @returns Promise<string[]> List of valid configuration directories
 */
export async function findConfigDirs(appName: string): Promise<string[]> {
  const possibleDirs = [
    getDefaultConfigDir(appName),
    join(homedir(), `.${appName}`),
    join(homedir(), appName)
  ];
  
  const validDirs: string[] = [];
  
  for (const dir of possibleDirs) {
    if (await directoryExists(dir)) {
      validDirs.push(dir);
    }
  }
  
  return validDirs;
}

/**
 * Validates a directory path and returns a normalized version
 * @param path Path to validate
 * @returns Promise<{valid: boolean, path: string, error?: string}> Validation result
 */
export async function validateDirectory(
  path: string
): Promise<{ valid: boolean; path: string; error?: string }> {
  try {
    const normalizedPath = resolve(path);
    
    // Check if path exists and is accessible
    try {
      await access(normalizedPath, constants.R_OK | constants.W_OK);
    } catch (error) {
      return {
        valid: false,
        path: normalizedPath,
        error: 'Directory does not exist or is not accessible'
      };
    }
    
    return { valid: true, path: normalizedPath };
  } catch (error) {
    return {
      valid: false,
      path,
      error: error instanceof Error ? error.message : 'Invalid directory path'
    };
  }
}

/**
 * Suggests alternative directories if the primary path is not available
 * @param primaryPath Primary directory path
 * @param appName Application name for context
 * @returns Promise<string[]> List of suggested alternative paths
 */
export async function suggestAlternativeDirs(
  primaryPath: string,
  appName: string
): Promise<string[]> {
  const suggestions = new Set<string>();
  
  // Add parent directory if it exists
  const parentDir = dirname(primaryPath);
  if (await directoryExists(parentDir)) {
    suggestions.add(parentDir);
  }
  
  // Always include the platform default config directory for the app
  // even if it doesn't exist yet (users may want to create it).
  suggestions.add(getDefaultConfigDir(appName));
  
  // Add home directory as last resort
  suggestions.add(homedir());
  
  return Array.from(suggestions);
}

/**
 * Lists all files in a directory with a specific extension
 * @param dir Directory to search in
 * @param extension File extension to look for (without the dot)
 * @returns Promise<string[]> List of matching file paths
 */
export async function listFilesByExtension(
  dir: string,
  extension: string
): Promise<string[]> {
  try {
    const files = await readdir(dir, { withFileTypes: true });
    return files
      .filter(
        file =>
          file.isFile() &&
          file.name.toLowerCase().endsWith(`.${extension.toLowerCase()}`)
      )
      .map(file => join(dir, file.name));
  } catch (error) {
    return [];
  }
}

/**
 * Normalizes a path for the current platform
 * @param path Path to normalize
 * @returns Normalized path
 */
export function normalizePath(path: string): string {
  let out = '';
  for (let i = 0; i < path.length; i++) {
    const ch = path[i];
    switch (ch) {
      case '\\':
      case '/':
        if (out.length === 0 || out[out.length - 1] !== '/') out += '/';
        break;
      case '\t':
        if (out.length === 0 || out[out.length - 1] !== '/') out += '/';
        out += 't';
        break;
      case '\n':
        if (out.length === 0 || out[out.length - 1] !== '/') out += '/';
        out += 'n';
        break;
      case '\r':
        if (out.length === 0 || out[out.length - 1] !== '/') out += '/';
        out += 'r';
        break;
      case '\f':
        if (out.length === 0 || out[out.length - 1] !== '/') out += '/';
        out += 'f';
        break;
      case '\v':
        if (out.length === 0 || out[out.length - 1] !== '/') out += '/';
        out += 'v';
        break;
      default:
        out += ch;
    }
  }
  // Collapse any double slashes that might have appeared
  return out.replace(/\/+/g, '/');
}

/**
 * Gets a user-friendly display name for a path
 * @param path Full path
 * @returns Display-friendly path (e.g., ~/config/app)
 */
export function getDisplayPath(path: string): string {
  const home = homedir();
  return path.startsWith(home) 
    ? `~${path.substring(home.length)}` 
    : path;
}
