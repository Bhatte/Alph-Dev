import { FileOperations } from './fileOps';
import { BackupManager, BackupInfo } from './backup';

/**
 * Result of a safe edit operation
 */
export interface SafeEditResult {
  success: boolean;
  backupInfo?: BackupInfo | undefined;
  error?: Error | undefined;
}

/**
 * Options for safe edit operations
 */
export interface SafeEditOptions<T> {
  /** Custom validator function to verify the modified configuration */
  validator?: (config: T) => boolean | Promise<boolean>;
  /** Whether to create a backup before editing (default: true) */
  createBackup?: boolean;
  /** Whether to automatically rollback on validation failure (default: true) */
  autoRollback?: boolean;
}

/**
 * Manages safe configuration file editing with atomic operations
 * Implements the backup → parse → inject → atomic write → validate pattern
 * 
 * INVARIANTS:
 * 1. Atomic writes: All file modifications are atomic (write to temp, then move)
 * 2. Backup creation: Original files are backed up with timestamped suffix before modification
 * 3. Validation enforcement: Post-write validation ensures file integrity
 * 4. Auto-rollback: Failed operations automatically restore from backup when enabled
 * 5. Error isolation: Exceptions during operations don't leave files in inconsistent state
 * 6. Idempotency: Operations can be safely retried without side effects
 */
export class SafeEditManager {
  /**
   * Internal assertion helper for testing invariants
   * Only active when NODE_ENV === 'test'
   */
  private static assert(condition: boolean, message: string): void {
    // Always check invariants in test environment
    const isTest = typeof process !== 'undefined' && 
                   (process.env?.['NODE_ENV'] === 'test' || 
                    process.env?.['JEST_WORKER_ID'] !== undefined);
    
    if (isTest && !condition) {
      throw new Error(`SafeEditManager invariant violation: ${message}`);
    }
  }

  /**
   * Performs a safe edit operation on a configuration file
   * @param filePath - Path to the configuration file
   * @param modifier - Function that modifies the configuration object
   * @param options - Options for the safe edit operation
   * @returns SafeEditResult with operation details
   */
  static async safeEdit<T>(
    filePath: string,
    modifier: (config: T) => T | Promise<T>,
    options: SafeEditOptions<T> = {}
  ): Promise<SafeEditResult> {
    const {
      validator,
      createBackup = true,
      autoRollback = true
    } = options;

    let backupInfo: BackupInfo | undefined;

    try {
      // INVARIANT: filePath must be provided and non-empty
      this.assert(typeof filePath === 'string' && filePath.length > 0, 'filePath must be a non-empty string');
      this.assert(typeof modifier === 'function', 'modifier must be a function');

      // Step 1: Create backup if requested and file exists
      if (createBackup && await FileOperations.fileExists(filePath)) {
        backupInfo = await BackupManager.createBackup(filePath);
        // INVARIANT: Backup must be created successfully if file exists
        this.assert(backupInfo !== undefined, 'backup creation failed for existing file');
      }

      // Step 2: Parse existing configuration
      let config: T;
      try {
        config = await FileOperations.readJsonFile<T>(filePath);
      } catch (error) {
        // If file doesn't exist, start with empty object
        if (error instanceof Error && (
          error.message.startsWith('File not found:') || 
          error.message.includes('ENOENT')
        )) {
          config = {} as T;
        } else {
          throw error;
        }
      }

      // Step 3: Apply modifications
      const modifiedConfig = await modifier(config);

      // Step 4: Validate modified configuration if validator provided
      if (validator) {
        const isValid = await validator(modifiedConfig);
        if (!isValid) {
          throw new Error('Configuration validation failed after modification');
        }
      }

      // Step 5: Atomic write of modified configuration
      await FileOperations.writeJsonFile(filePath, modifiedConfig);

      // Step 6: Final validation by re-reading and parsing the written file
      try {
        const writtenConfig = await FileOperations.readJsonFile<T>(filePath);
        if (validator) {
          const isValid = await validator(writtenConfig);
          if (!isValid) {
            throw new Error('Configuration validation failed after write');
          }
        }
      } catch (validationError) {
        // If final validation fails, attempt rollback
        if (autoRollback && backupInfo) {
          try {
            await BackupManager.restoreBackup(backupInfo);
          } catch (rollbackError) {
            throw new Error(
              `Validation failed and rollback failed: ${validationError}. Rollback error: ${rollbackError}`
            );
          }
          throw new Error(`Configuration validation failed, rolled back to backup: ${validationError}`);
        }
        throw validationError;
      }

      return {
        success: true,
        backupInfo
      };

    } catch (error) {
      // Handle errors with optional rollback
      if (autoRollback && backupInfo) {
        try {
          await BackupManager.restoreBackup(backupInfo);
        } catch (rollbackError) {
          return {
            success: false,
            backupInfo,
            error: new Error(
              `Original error: ${error}. Rollback also failed: ${rollbackError}`
            )
          };
        }
      }

      return {
        success: false,
        backupInfo,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }

  /**
   * Performs a safe merge operation, combining new data with existing configuration
   * @param filePath - Path to the configuration file
   * @param newData - New data to merge into the configuration
   * @param options - Options for the safe edit operation
   * @returns SafeEditResult with operation details
   */
  static async safeMerge<T extends Record<string, any>>(
    filePath: string,
    newData: Partial<T>,
    options: SafeEditOptions<T> = {}
  ): Promise<SafeEditResult> {
    return this.safeEdit<T>(
      filePath,
      (config) => {
        return { ...config, ...newData };
      },
      options
    );
  }

  /**
   * Performs a safe deep merge operation for nested configuration objects
   * @param filePath - Path to the configuration file
   * @param newData - New data to deep merge into the configuration
   * @param options - Options for the safe edit operation
   * @returns SafeEditResult with operation details
   */
  static async safeDeepMerge<T extends Record<string, any>>(
    filePath: string,
    newData: Partial<T>,
    options: SafeEditOptions<T> = {}
  ): Promise<SafeEditResult> {
    return this.safeEdit<T>(
      filePath,
      (config) => {
        return this.deepMerge(config, newData);
      },
      options
    );
  }

  /**
   * Performs a safe update of a specific path in the configuration
   * @param filePath - Path to the configuration file
   * @param path - Dot-notation path to the property to update (e.g., 'mcpServers.my-server')
   * @param value - New value for the property
   * @param options - Options for the safe edit operation
   * @returns SafeEditResult with operation details
   */
  static async safeUpdatePath<T extends Record<string, any>>(
    filePath: string,
    path: string,
    value: any,
    options: SafeEditOptions<T> = {}
  ): Promise<SafeEditResult> {
    return this.safeEdit<T>(
      filePath,
      (config) => {
        const result = { ...config };
        this.setNestedProperty(result, path, value);
        return result;
      },
      options
    );
  }

  /**
   * Rolls back a configuration file using backup information
   * @param backupInfo - Backup information from a previous safe edit operation
   * @returns Promise that resolves when rollback is complete
   */
  static async rollback(backupInfo: BackupInfo): Promise<void> {
    await BackupManager.restoreBackup(backupInfo);
  }

  /**
   * Deep merges two objects, with the second object taking precedence
   * @param target - Target object to merge into
   * @param source - Source object to merge from
   * @returns Merged object
   */
  private static deepMerge<T extends Record<string, any>>(target: T, source: Partial<T>): T {
    const result = { ...target };

    for (const key in source) {
      if (source.hasOwnProperty(key)) {
        const sourceValue = source[key];
        const targetValue = result[key];

        if (
          sourceValue &&
          typeof sourceValue === 'object' &&
          !Array.isArray(sourceValue) &&
          targetValue &&
          typeof targetValue === 'object' &&
          !Array.isArray(targetValue)
        ) {
          // Recursively merge nested objects
          result[key] = this.deepMerge(targetValue, sourceValue);
        } else {
          // Direct assignment for primitives, arrays, or null values
          result[key] = sourceValue as T[Extract<keyof T, string>];
        }
      }
    }

    return result;
  }

  /**
   * Sets a nested property using dot notation
   * @param obj - Object to modify
   * @param path - Dot-notation path (e.g., 'a.b.c')
   * @param value - Value to set
   */
  private static setNestedProperty(obj: any, path: string, value: any): void {
    const keys = path.split('.');
    let current = obj;

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!key) continue;
      if (!(key in current) || typeof current[key] !== 'object' || current[key] === null) {
        current[key] = {};
      }
      current = current[key];
    }

    const lastKey = keys[keys.length - 1];
    if (lastKey) {
      current[lastKey] = value;
    }
  }


}