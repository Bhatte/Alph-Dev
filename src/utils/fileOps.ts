import { promises as fs, Stats } from 'fs';
import { dirname, resolve } from 'path';
import { randomBytes } from 'crypto';

/**
 * Utility class for asynchronous file operations with atomic writes
 * Provides safe file I/O operations for configuration management
 */
export class FileOperations {
  /**
   * Reads and parses a JSON file
   * @param path - Path to the JSON file
   * @returns Parsed JSON object
   * @throws Error if file doesn't exist, can't be read, or contains invalid JSON
   */
  static async readJsonFile<T>(path: string): Promise<T> {
    try {
      const resolved = resolve(path);
      const t0 = Date.now();
      const content = await this.withTimeout(
        fs.readFile(resolved, 'utf-8'),
        this.defaultTimeout(),
        `readJsonFile:${resolved}`
      );
      this.debug(`readJsonFile completed in ${Date.now() - t0}ms for ${resolved}`);
      return JSON.parse(content) as T;
    } catch (error) {
      if (error instanceof Error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          throw new Error(`File not found: ${path}`);
        }
        if ((error as NodeJS.ErrnoException).code === 'EACCES') {
          throw new Error(`Permission denied reading file: ${path}`);
        }
        if (error instanceof SyntaxError) {
          throw new Error(`Invalid JSON in file: ${path} - ${error.message}`);
        }
      }
      throw new Error(`Failed to read JSON file ${path}: ${error}`);
    }
  }

  /**
   * Writes an object to a JSON file with proper formatting
   * @param path - Path to write the JSON file
   * @param data - Object to serialize to JSON
   * @throws Error if file cannot be written
   */
  static async writeJsonFile<T>(path: string, data: T): Promise<void> {
    try {
      const content = JSON.stringify(data, null, 2);
      await this.atomicWrite(path, content);
    } catch (error) {
      throw new Error(`Failed to write JSON file ${path}: ${error}`);
    }
  }

  /**
   * Performs an atomic write operation by writing to a temporary file first
   * then renaming it to the target path to prevent partial writes
   * @param path - Target file path
   * @param content - Content to write
   * @throws Error if write operation fails
   */
  static async atomicWrite(path: string, content: string): Promise<void> {
    const resolvedPath = resolve(path);
    const tempPath = `${resolvedPath}.tmp.${randomBytes(8).toString('hex')}`;
    
    try {
      // Ensure the directory exists
      await this.ensureDirectory(dirname(resolvedPath));
      
      // Write to temporary file
      {
        const t0 = Date.now();
        await this.withTimeout(
          fs.writeFile(tempPath, content, 'utf-8'),
          this.defaultTimeout(),
          `atomicWrite.writeFile:${tempPath}`
        );
        this.debug(`atomicWrite writeFile completed in ${Date.now() - t0}ms for ${tempPath}`);
      }
      
      // Atomic rename to target path
      {
        const t0 = Date.now();
        await this.withTimeout(
          fs.rename(tempPath, resolvedPath),
          this.defaultTimeout(),
          `atomicWrite.rename:${tempPath}->${resolvedPath}`
        );
        this.debug(`atomicWrite rename completed in ${Date.now() - t0}ms for ${resolvedPath}`);
      }
    } catch (error) {
      // Clean up temporary file if it exists
      try {
        await this.withTimeout(
          fs.unlink(tempPath),
          this.defaultTimeout(),
          `atomicWrite.cleanup.unlink:${tempPath}`
        );
      } catch {
        // Ignore cleanup errors
      }
      
      if (error instanceof Error) {
        if ((error as NodeJS.ErrnoException).code === 'EACCES') {
          throw new Error(`Permission denied writing to file: ${resolvedPath}`);
        }
        if ((error as NodeJS.ErrnoException).code === 'ENOSPC') {
          throw new Error(`No space left on device when writing: ${resolvedPath}`);
        }
      }
      throw new Error(`Failed to write file ${resolvedPath}: ${error}`);
    }
  }

  /**
   * Ensures a directory exists, creating it recursively if necessary
   * @param path - Directory path to create
   * @throws Error if directory cannot be created
   */
  static async ensureDirectory(path: string): Promise<void> {
    try {
      const resolved = resolve(path);
      const t0 = Date.now();
      await this.withTimeout(
        fs.mkdir(resolved, { recursive: true }),
        this.defaultTimeout(),
        `ensureDirectory:${resolved}`
      );
      this.debug(`ensureDirectory completed in ${Date.now() - t0}ms for ${resolved}`);
    } catch (error) {
      if (error instanceof Error) {
        if ((error as NodeJS.ErrnoException).code === 'EACCES') {
          throw new Error(`Permission denied creating directory: ${path}`);
        }
      }
      throw new Error(`Failed to create directory ${path}: ${error}`);
    }
  }

  /**
   * Checks if a file exists and is accessible
   * @param path - File path to check
   * @returns True if file exists and is accessible, false otherwise
   */
  static async fileExists(path: string): Promise<boolean> {
    try {
      const resolved = resolve(path);
      await this.withTimeout(
        fs.access(resolved, fs.constants.F_OK),
        this.defaultTimeout(),
        `fileExists:${resolved}`
      );
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Checks if a file is readable
   * @param path - File path to check
   * @returns True if file is readable, false otherwise
   */
  static async isReadable(path: string): Promise<boolean> {
    try {
      const resolved = resolve(path);
      await this.withTimeout(
        fs.access(resolved, fs.constants.R_OK),
        this.defaultTimeout(),
        `isReadable:${resolved}`
      );
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Checks if a file is writable
   * @param path - File path to check
   * @returns True if file is writable, false otherwise
   */
  static async isWritable(path: string): Promise<boolean> {
    try {
      const resolved = resolve(path);
      await this.withTimeout(
        fs.access(resolved, fs.constants.W_OK),
        this.defaultTimeout(),
        `isWritable:${resolved}`
      );
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Gets file stats including size and modification time
   * @param path - File path to stat
   * @returns File stats object
   * @throws Error if file cannot be accessed
   */
  static async getFileStats(path: string): Promise<Stats> {
    try {
      const resolved = resolve(path);
      const t0 = Date.now();
      const stats = await this.withTimeout(
        fs.stat(resolved),
        this.defaultTimeout(),
        `getFileStats:${resolved}`
      );
      this.debug(`getFileStats completed in ${Date.now() - t0}ms for ${resolved}`);
      return stats;
    } catch (error) {
      if (error instanceof Error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          throw new Error(`File not found: ${path}`);
        }
      }
      throw new Error(`Failed to get file stats for ${path}: ${error}`);
    }
  }

  /**
   * Deletes a file
   * @param path - File path to delete
   * @throws Error if file cannot be deleted
   */
  static async deleteFile(path: string): Promise<void> {
    try {
      const resolved = resolve(path);
      await this.withTimeout(
        fs.unlink(resolved),
        this.defaultTimeout(),
        `deleteFile:${resolved}`
      );
    } catch (error) {
      if (error instanceof Error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          // File doesn't exist, consider it already deleted
          return;
        }
        if ((error as NodeJS.ErrnoException).code === 'EACCES') {
          throw new Error(`Permission denied deleting file: ${path}`);
        }
      }
      throw new Error(`Failed to delete file ${path}: ${error}`);
    }
  }

  // Internal helpers
  private static defaultTimeout(): number {
    const v = process.env['ALPH_IO_TIMEOUT_MS'];
    const n = v ? Number(v) : NaN;
    return Number.isFinite(n) && n > 0 ? n : 15000;
  }

  private static async withTimeout<T>(promise: Promise<T>, timeoutMs: number, op: string): Promise<T> {
    let timeoutId: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<T>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`Timeout after ${timeoutMs}ms: ${op}`));
      }, timeoutMs);
    });
    try {
      const result = await Promise.race([promise, timeoutPromise]);
      return result as T;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  private static debug(msg: string) {
    const flag = process.env['ALPH_DEBUG'];
    if (flag && /^(1|true|yes)$/i.test(flag)) {
      // eslint-disable-next-line no-console
      console.debug(`[FileOps ${new Date().toISOString()}] ${msg}`);
    }
  }
}