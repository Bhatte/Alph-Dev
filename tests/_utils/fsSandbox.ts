import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

/**
 * Sandbox configuration for filesystem tests
 */
export interface SandboxOptions {
  /** Prefix for the temporary directory name */
  prefix?: string;
  /** Whether to automatically cleanup on process exit */
  autoCleanup?: boolean;
  /** Custom temporary directory base path */
  tmpDir?: string;
}

/**
 * Represents a filesystem sandbox for testing
 */
export interface Sandbox {
  /** Root path of the sandbox */
  root: string;
  /** Create a file in the sandbox */
  createFile: (relativePath: string, content: string) => Promise<string>;
  /** Create a directory in the sandbox */
  createDir: (relativePath: string) => Promise<string>;
  /** Get absolute path within sandbox */
  resolve: (relativePath: string) => string;
  /** Check if file/directory exists */
  exists: (relativePath: string) => Promise<boolean>;
  /** Read file content */
  readFile: (relativePath: string) => Promise<string>;
  /** Write file content */
  writeFile: (relativePath: string, content: string) => Promise<void>;
  /** Set file/directory permissions */
  setPermissions: (relativePath: string, mode: number) => Promise<void>;
  /** Cleanup the sandbox */
  cleanup: () => Promise<void>;
}

/**
 * Creates a temporary filesystem sandbox for testing
 * @param options - Sandbox configuration options
 * @returns Promise resolving to a Sandbox instance
 */
export async function createSandbox(options: SandboxOptions = {}): Promise<Sandbox> {
  const {
    prefix = 'alph-test-',
    autoCleanup = true,
    tmpDir = os.tmpdir()
  } = options;

  // Create unique temporary directory
  const sandboxRoot = await fs.mkdtemp(path.join(tmpDir, prefix));

  const sandbox: Sandbox = {
    root: sandboxRoot,

    createFile: async (relativePath: string, content: string): Promise<string> => {
      const fullPath = path.join(sandboxRoot, relativePath);
      const dir = path.dirname(fullPath);
      
      // Ensure directory exists
      await fs.mkdir(dir, { recursive: true });
      
      // Write file
      await fs.writeFile(fullPath, content, 'utf8');
      
      return fullPath;
    },

    createDir: async (relativePath: string): Promise<string> => {
      const fullPath = path.join(sandboxRoot, relativePath);
      await fs.mkdir(fullPath, { recursive: true });
      return fullPath;
    },

    resolve: (relativePath: string): string => {
      return path.join(sandboxRoot, relativePath);
    },

    exists: async (relativePath: string): Promise<boolean> => {
      try {
        await fs.access(path.join(sandboxRoot, relativePath));
        return true;
      } catch {
        return false;
      }
    },

    readFile: async (relativePath: string): Promise<string> => {
      return fs.readFile(path.join(sandboxRoot, relativePath), 'utf8');
    },

    writeFile: async (relativePath: string, content: string): Promise<void> => {
      const fullPath = path.join(sandboxRoot, relativePath);
      const dir = path.dirname(fullPath);
      
      // Ensure directory exists
      await fs.mkdir(dir, { recursive: true });
      
      // Write file
      await fs.writeFile(fullPath, content, 'utf8');
    },

    setPermissions: async (relativePath: string, mode: number): Promise<void> => {
      await fs.chmod(path.join(sandboxRoot, relativePath), mode);
    },

    cleanup: async (): Promise<void> => {
      try {
        await fs.rm(sandboxRoot, { recursive: true, force: true });
      } catch (error) {
        // Ignore cleanup errors in tests
        console.warn(`Failed to cleanup sandbox ${sandboxRoot}:`, error);
      }
    }
  };

  // Auto-cleanup on process exit if enabled
  if (autoCleanup) {
    const cleanup = () => {
      sandbox.cleanup().catch(() => {
        // Ignore cleanup errors on exit
      });
    };

    process.on('exit', cleanup);
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('uncaughtException', cleanup);
  }

  return sandbox;
}

/**
 * Helper to create a sandbox with common test directory structure
 * @param options - Sandbox configuration options
 * @returns Promise resolving to a Sandbox with common directories created
 */
export async function createTestSandbox(options: SandboxOptions = {}): Promise<Sandbox> {
  const sandbox = await createSandbox(options);

  // Create common test directories
  await sandbox.createDir('configs');
  await sandbox.createDir('backups');
  await sandbox.createDir('temp');

  return sandbox;
}
