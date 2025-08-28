/**
 * Environment variable utilities for testing
 */

/**
 * Typed environment variable keys for common test scenarios
 */
export type EnvKey = 
  | 'HOME'
  | 'APPDATA'
  | 'XDG_CONFIG_HOME'
  | 'XDG_DATA_HOME'
  | 'XDG_CACHE_HOME'
  | 'USERPROFILE'
  | 'LOCALAPPDATA'
  | 'NODE_ENV'
  | 'PATH'
  | string; // Allow custom keys

/**
 * Environment variable backup for restoration
 */
interface EnvBackup {
  [key: string]: string | undefined;
}

/**
 * Environment variable manager for tests
 */
export class EnvManager {
  private backup: EnvBackup = {};
  private stubbed: Set<string> = new Set();

  /**
   * Stub an environment variable with a test value
   * @param key - Environment variable key
   * @param value - Test value to set
   */
  stub(key: EnvKey, value: string): void {
    // Backup original value if not already backed up
    if (!this.stubbed.has(key)) {
      this.backup[key] = process.env[key];
      this.stubbed.add(key);
    }

    // Set test value
    process.env[key] = value;
  }

  /**
   * Stub multiple environment variables
   * @param vars - Object with key-value pairs to stub
   */
  stubMultiple(vars: Record<EnvKey, string>): void {
    for (const [key, value] of Object.entries(vars)) {
      this.stub(key, value);
    }
  }

  /**
   * Restore a specific environment variable to its original value
   * @param key - Environment variable key to restore
   */
  restore(key: EnvKey): void {
    if (this.stubbed.has(key)) {
      const originalValue = this.backup[key];
      
      if (originalValue === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalValue;
      }
      
      this.stubbed.delete(key);
      delete this.backup[key];
    }
  }

  /**
   * Restore all stubbed environment variables
   */
  restoreAll(): void {
    for (const key of this.stubbed) {
      this.restore(key);
    }
  }

  /**
   * Get current value of an environment variable
   * @param key - Environment variable key
   * @returns Current value or undefined
   */
  get(key: EnvKey): string | undefined {
    return process.env[key];
  }

  /**
   * Check if an environment variable is currently stubbed
   * @param key - Environment variable key
   * @returns True if stubbed
   */
  isStubbed(key: EnvKey): boolean {
    return this.stubbed.has(key);
  }

  /**
   * Get list of all stubbed keys
   * @returns Array of stubbed environment variable keys
   */
  getStubbedKeys(): string[] {
    return Array.from(this.stubbed);
  }
}

/**
 * Create a new environment manager for testing
 * @returns New EnvManager instance
 */
export function createEnvManager(): EnvManager {
  return new EnvManager();
}

/**
 * Helper to create platform-specific environment stubs
 */
export const PlatformEnvStubs = {
  /**
   * Windows environment variables
   */
  windows: (homeDir: string = 'C:\\Users\\testuser') => ({
    'HOME': homeDir,
    'USERPROFILE': homeDir,
    'APPDATA': `${homeDir}\\AppData\\Roaming`,
    'LOCALAPPDATA': `${homeDir}\\AppData\\Local`,
    'PATH': 'C:\\Windows\\System32;C:\\Windows'
  }),

  /**
   * macOS environment variables
   */
  macos: (homeDir: string = '/Users/testuser') => ({
    'HOME': homeDir,
    'XDG_CONFIG_HOME': `${homeDir}/.config`,
    'XDG_DATA_HOME': `${homeDir}/.local/share`,
    'XDG_CACHE_HOME': `${homeDir}/.cache`,
    'PATH': '/usr/local/bin:/usr/bin:/bin'
  }),

  /**
   * Linux environment variables
   */
  linux: (homeDir: string = '/home/testuser') => ({
    'HOME': homeDir,
    'XDG_CONFIG_HOME': `${homeDir}/.config`,
    'XDG_DATA_HOME': `${homeDir}/.local/share`,
    'XDG_CACHE_HOME': `${homeDir}/.cache`,
    'PATH': '/usr/local/bin:/usr/bin:/bin'
  })
};

/**
 * Helper function to stub environment for a specific platform
 * @param manager - Environment manager instance
 * @param platform - Target platform
 * @param homeDir - Optional custom home directory
 */
export function stubPlatformEnv(
  manager: EnvManager, 
  platform: 'windows' | 'macos' | 'linux',
  homeDir?: string
): void {
  const envVars = PlatformEnvStubs[platform](homeDir);
  manager.stubMultiple(envVars);
}

/**
 * Utility for testing with temporary environment changes
 * @param envVars - Environment variables to set
 * @param testFn - Test function to run with stubbed environment
 * @returns Promise resolving to test function result
 */
export async function withEnv<T>(
  envVars: Record<EnvKey, string>,
  testFn: () => Promise<T> | T
): Promise<T> {
  const manager = createEnvManager();
  
  try {
    manager.stubMultiple(envVars);
    return await testFn();
  } finally {
    manager.restoreAll();
  }
}
