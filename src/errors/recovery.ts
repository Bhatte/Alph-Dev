import { AlphError, isErrorOfType, FileSystemError, PermissionError, ConfigError } from './types';
import { ensureDirectory } from '../utils/directory';

export interface RecoverySuggestion {
  /**
   * A short description of the suggested action
   */
  description: string;
  
  /**
   * The command to run to fix the issue
   */
  command?: string;
  
  /**
   * Manual steps to fix the issue
   */
  manualSteps?: string[];
  
  /**
   * Whether this recovery action can be attempted automatically
   */
  canAutoFix: boolean;
  
  /**
   * Function to attempt automatic recovery
   * @returns Promise that resolves when recovery is complete
   */
  autoFix?: () => Promise<void>;
}

/**
 * Provides recovery suggestions for common errors
 */
export class RecoveryManager {
  /**
   * Get recovery suggestions for an error
   */
  getRecoverySuggestions(error: unknown): RecoverySuggestion[] {
    if (!(error instanceof Error)) {
      return [];
    }
    
    // Handle AlphError and its subclasses
    if (isErrorOfType(error, AlphError)) {
      return this.getAxyncErrorRecovery(error);
    }
    
    // Handle Node.js system errors
    if ('code' in error) {
      return this.getSystemErrorRecovery(error as NodeJS.ErrnoException);
    }
    
    return [];
  }
  
  /**
   * Get recovery suggestions for AxyncError and its subclasses
   */
  private getAxyncErrorRecovery(error: AlphError): RecoverySuggestion[] {
    const suggestions: RecoverySuggestion[] = [];
    
    // Handle PermissionError
    if (isErrorOfType(error, PermissionError)) {
      suggestions.push({
        description: `Change permissions for '${error.path}'`,
        command: `chmod +w ${error.path}`,
        manualSteps: [
          `Open a terminal`, 
          `Run: chmod +w ${error.path}`,
          `If that doesn't work, try: sudo chmod +w ${error.path}`
        ],
        canAutoFix: false, // Don't auto-fix permissions for security reasons
      });
      
      // Suggest running as admin if it's a system directory
      if (error.path.startsWith('/usr/') || error.path.startsWith('C:\\')) {
        suggestions.push({
          description: 'Run the command with administrator privileges',
          command: `sudo ${process.argv.join(' ')}`,
          manualSteps: [
            'Close the current terminal',
            'Open a new terminal with administrator privileges',
            'Run the command again',
          ],
          canAutoFix: false,
        });
      }
    }
    
    // Handle FileSystemError
    if (isErrorOfType(error, FileSystemError)) {
      if (error.message.includes('no such file or directory')) {
        suggestions.push({
          description: `Create the directory: ${error.path}`,
          command: `mkdir -p ${error.path}`,
          canAutoFix: true,
          autoFix: async () => {
            await ensureDirectory(error.path);
          },
        });
      }
    }
    
    // Handle ConfigError
    if (isErrorOfType(error, ConfigError) && error.configPath) {
      suggestions.push({
        description: `Check the configuration file at: ${error.configPath}`,
        manualSteps: [
          `Open the file at ${error.configPath}`,
          'Verify the configuration is valid JSON',
          'Check for any syntax errors',
          'Save the file and try again',
        ],
        canAutoFix: false,
      });
      
      // If it's a validation error, suggest fixing the specific field
      if (error instanceof Error && error.message.includes('validation')) {
        suggestions.push({
          description: 'Fix the validation error in your configuration',
          manualSteps: [
            'Review the error message for the specific validation issue',
            'Update the configuration file accordingly',
            'Save the file and try again',
          ],
          canAutoFix: false,
        });
      }
    }
    
    return suggestions;
  }
  
  /**
   * Get recovery suggestions for Node.js system errors
   */
  private getSystemErrorRecovery(error: NodeJS.ErrnoException): RecoverySuggestion[] {
    const suggestions: RecoverySuggestion[] = [];
    
    switch (error.code) {
      case 'EACCES':
      case 'EPERM':
        suggestions.push({
          description: `Change permissions for '${error.path}'`,
          command: `chmod +w ${error.path}`,
          canAutoFix: false,
        });
        break;
        
      case 'ENOENT':
        if (error.path) {
          suggestions.push({
            description: `Create the missing directory: ${error.path}`,
            command: `mkdir -p ${error.path}`,
            canAutoFix: true,
            autoFix: async () => {
              await ensureDirectory(error.path!);
            },
          });
        }
        break;
        
      case 'EADDRINUSE':
        suggestions.push({
          description: 'The port is already in use',
          manualSteps: [
            'Find and stop the process using the port',
            'Or configure the application to use a different port',
          ],
          canAutoFix: false,
        });
        break;
        
      case 'ECONNREFUSED':
        suggestions.push({
          description: 'The connection was refused',
          manualSteps: [
            'Check if the server is running',
            'Verify the host and port are correct',
            'Check your network connection',
          ],
          canAutoFix: false,
        });
        break;
    }
    
    return suggestions;
  }
  
  /**
   * Attempt to automatically recover from an error
   * @returns True if recovery was attempted successfully, false otherwise
   */
  async attemptAutoRecovery(error: unknown): Promise<boolean> {
    const suggestions = this.getRecoverySuggestions(error);
    const autoFixable = suggestions.filter(s => s.canAutoFix && s.autoFix);
    
    if (autoFixable.length === 0) {
      return false;
    }
    
    // Try each auto-fix in sequence
    for (const suggestion of autoFixable) {
      try {
        if (suggestion.autoFix) {
          await suggestion.autoFix();
          return true; // Return on first successful fix
        }
      } catch (fixError) {
        // Ignore and try the next fix
        console.debug('Auto-fix failed:', fixError);
      }
    }
    
    return false;
  }
}

/**
 * Default recovery manager instance
 */
export const recoveryManager = new RecoveryManager();

/**
 * Get recovery suggestions for an error
 */
export function getRecoverySuggestions(error: unknown): RecoverySuggestion[] {
  return recoveryManager.getRecoverySuggestions(error);
}

/**
 * Attempt to automatically recover from an error
 */
export async function attemptAutoRecovery(error: unknown): Promise<boolean> {
  return recoveryManager.attemptAutoRecovery(error);
}
