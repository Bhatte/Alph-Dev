import { promises as fs } from 'fs';
import { join } from 'path';
import { Logger, LogEntry, TraceContext } from '../logger';
import { maskSecrets } from '../logger';

export interface TraceFile {
  path: string;
  operation: string;
  startTime: number;
  endTime?: number | undefined;
  success?: boolean | undefined;
  entries: LogEntry[];
}

export class TraceManager {
  private readonly traceDir: string;
  private readonly logger: Logger;
  private readonly maxTraceFiles: number;
  private readonly retentionDays: number;

  constructor(
    traceDir: string,
    logger: Logger,
    options: {
      maxTraceFiles?: number;
      retentionDays?: number;
    } = {}
  ) {
    this.traceDir = traceDir;
    this.logger = logger;
    this.maxTraceFiles = options.maxTraceFiles || 100;
    this.retentionDays = options.retentionDays || 7;
  }

  /**
   * Create a new trace file for an operation
   */
  async createTraceFile(traceContext: TraceContext): Promise<string> {
    await this.ensureTraceDir();
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${traceContext.operation}-${timestamp}-${traceContext.traceId}.jsonl`;
    const tracePath = join(this.traceDir, filename);

    const initialEntry: LogEntry = {
      message: `Starting trace for operation: ${traceContext.operation}`,
      timestamp: new Date(traceContext.startTime).toISOString(),
      level: 'info',
      operation: traceContext.operation,
      traceId: traceContext.traceId,
      context: traceContext.context
    };

    await this.writeTraceEntry(tracePath, initialEntry);
    return tracePath;
  }

  /**
   * Write a log entry to a trace file
   */
  async writeTraceEntry(tracePath: string, entry: LogEntry): Promise<void> {
    try {
      // Mask secrets before writing to file
      const maskedEntry = this.maskSecretsInEntry(entry);
      const jsonLine = JSON.stringify(maskedEntry) + '\n';
      
      await fs.appendFile(tracePath, jsonLine, 'utf8');
    } catch (error) {
      this.logger.error('Failed to write trace entry', { tracePath, error });
    }
  }

  /**
   * Finalize a trace file when operation completes
   */
  async finalizeTrace(
    tracePath: string, 
    traceContext: TraceContext, 
    success: boolean, 
    error?: Error
  ): Promise<void> {
    const finalEntry: LogEntry = {
      message: `Completed operation: ${traceContext.operation}`,
      timestamp: new Date().toISOString(),
      level: success ? 'info' : 'error',
      operation: traceContext.operation,
      traceId: traceContext.traceId,
      duration: Date.now() - traceContext.startTime,
      context: traceContext.context
    };

    if (error) {
      finalEntry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack
      };
    }

    await this.writeTraceEntry(tracePath, finalEntry);

    // If operation failed, retain the trace file
    if (!success) {
      this.logger.info(`Trace retained for failed operation: ${tracePath}`);
    }
  }

  /**
   * Read all entries from a trace file
   */
  async readTraceFile(tracePath: string): Promise<LogEntry[]> {
    try {
      const content = await fs.readFile(tracePath, 'utf8');
      const lines = content.trim().split('\n').filter(line => line.trim());
      
      return lines.map(line => {
        try {
          return JSON.parse(line) as LogEntry;
        } catch (error) {
          this.logger.warn('Failed to parse trace line', { line, error });
          return {
            message: `Unparseable trace line: ${line}`,
            timestamp: new Date().toISOString(),
            level: 'warn'
          };
        }
      });
    } catch (error) {
      this.logger.error('Failed to read trace file', { tracePath, error });
      return [];
    }
  }

  /**
   * List all trace files
   */
  async listTraceFiles(): Promise<string[]> {
    try {
      await this.ensureTraceDir();
      const files = await fs.readdir(this.traceDir);
      return files
        .filter(file => file.endsWith('.jsonl'))
        .map(file => join(this.traceDir, file))
        .sort();
    } catch (error) {
      this.logger.error('Failed to list trace files', { error });
      return [];
    }
  }

  /**
   * Clean up old trace files
   */
  async cleanupTraces(): Promise<void> {
    try {
      const traceFiles = await this.listTraceFiles();
      const now = Date.now();
      const retentionMs = this.retentionDays * 24 * 60 * 60 * 1000;

      // Remove files older than retention period
      for (const tracePath of traceFiles) {
        try {
          const stats = await fs.stat(tracePath);
          if (now - stats.mtime.getTime() > retentionMs) {
            await fs.unlink(tracePath);
            this.logger.debug('Removed old trace file', { tracePath });
          }
        } catch (error) {
          this.logger.warn('Failed to check/remove trace file', { tracePath, error });
        }
      }

      // If still too many files, remove oldest ones
      const remainingFiles = await this.listTraceFiles();
      if (remainingFiles.length > this.maxTraceFiles) {
        const filesToRemove = remainingFiles
          .slice(0, remainingFiles.length - this.maxTraceFiles);
        
        for (const tracePath of filesToRemove) {
          try {
            await fs.unlink(tracePath);
            this.logger.debug('Removed excess trace file', { tracePath });
          } catch (error) {
            this.logger.warn('Failed to remove excess trace file', { tracePath, error });
          }
        }
      }
    } catch (error) {
      this.logger.error('Failed to cleanup traces', { error });
    }
  }

  /**
   * Get trace statistics
   */
  async getTraceStats(): Promise<{
    totalFiles: number;
    totalSize: number;
    oldestFile?: string | undefined;
    newestFile?: string | undefined;
  }> {
    try {
      const traceFiles = await this.listTraceFiles();
      let totalSize = 0;
      let oldestTime = Infinity;
      let newestTime = 0;
      let oldestFile: string | undefined;
      let newestFile: string | undefined;

      for (const tracePath of traceFiles) {
        try {
          const stats = await fs.stat(tracePath);
          totalSize += stats.size;
          
          if (stats.mtime.getTime() < oldestTime) {
            oldestTime = stats.mtime.getTime();
            oldestFile = tracePath;
          }
          
          if (stats.mtime.getTime() > newestTime) {
            newestTime = stats.mtime.getTime();
            newestFile = tracePath;
          }
        } catch (error) {
          this.logger.warn('Failed to stat trace file', { tracePath, error });
        }
      }

      return {
        totalFiles: traceFiles.length,
        totalSize,
        oldestFile: oldestFile as string | undefined,
        newestFile: newestFile as string | undefined
      };
    } catch (error) {
      this.logger.error('Failed to get trace stats', { error });
      return { totalFiles: 0, totalSize: 0 };
    }
  }

  private async ensureTraceDir(): Promise<void> {
    try {
      await fs.mkdir(this.traceDir, { recursive: true });
    } catch (error) {
      this.logger.error('Failed to create trace directory', { traceDir: this.traceDir, error });
      throw error;
    }
  }

  private maskSecretsInEntry(entry: LogEntry): LogEntry {
    const masked = { ...entry };
    
    // Mask secrets in message
    if (masked.message) {
      masked.message = maskSecrets(masked.message);
    }
    
    // Mask secrets in context
    if (masked.context) {
      masked.context = this.maskSecretsInObject(masked.context);
    }
    
    // Mask secrets in error
    if (masked.error) {
      masked.error = {
        ...masked.error,
        message: maskSecrets(masked.error.message),
        stack: masked.error.stack ? maskSecrets(masked.error.stack) : undefined
      } as {
        name: string;
        message: string;
        stack?: string | undefined;
      } | undefined;
    }
    
    return masked;
  }

  private maskSecretsInObject(obj: Record<string, unknown>): Record<string, unknown> {
    const masked: Record<string, unknown> = {};
    
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        masked[key] = maskSecrets(value);
      } else if (typeof value === 'object' && value !== null) {
        masked[key] = this.maskSecretsInObject(value as Record<string, unknown>);
      } else {
        masked[key] = value;
      }
    }
    
    return masked;
  }
}
