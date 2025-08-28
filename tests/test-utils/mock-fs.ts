import { vi, Mock } from 'vitest';
import * as fs from 'fs/promises';

export interface MockFS {
  files: Record<string, string>;
  originalReaddir: typeof fs.readdir;
  originalReadFile: typeof fs.readFile;
  originalWriteFile: typeof fs.writeFile;
  originalMkdir: typeof fs.mkdir;
  originalStat: typeof fs.stat;
  originalAccess: typeof fs.access;
}

/**
 * Sets up mock file system for testing
 */
export function setupMockFS(): MockFS {
  const mockFS: MockFS = {
    files: {},
    originalReaddir: fs.readdir,
    originalReadFile: fs.readFile,
    originalWriteFile: fs.writeFile,
    originalMkdir: fs.mkdir,
    originalStat: fs.stat,
    originalAccess: fs.access,
  };

  // Mock fs.promises methods
  vi.spyOn(fs, 'readdir').mockImplementation(async (path: any, options: any) => {
    const dirPath = path.toString();
    const files = Object.keys(mockFS.files)
      .filter(file => dirname(file) === dirPath)
      .map(file => basename(file));
    
    // If withFileTypes is true, return Dirent objects
    if (options?.withFileTypes) {
      return files.map(name => ({
        name,
        isDirectory: () => mockFS.files[path.join(dirPath, name)] === '',
        isFile: () => mockFS.files[path.join(dirPath, name)] !== ''
      } as any));
    }
    
    return files;
  });

  vi.spyOn(fs, 'readFile').mockImplementation(async (path: any) => {
    const filePath = path.toString();
    if (mockFS.files[filePath]) {
      return mockFS.files[filePath];
    }
    throw new Error(`ENOENT: no such file or directory, open '${filePath}'`);
  });

  vi.spyOn(fs, 'writeFile').mockImplementation(async (path: any, data: any) => {
    const filePath = path.toString();
    mockFS.files[filePath] = data;
  });

  vi.spyOn(fs, 'mkdir').mockImplementation(async (path: any) => {
    const dirPath = path.toString();
    mockFS.files[dirPath] = ''; // Mark directory as existing
    return undefined as any;
  });

  vi.spyOn(fs, 'stat').mockImplementation(async (path: any) => {
    const filePath = path.toString();
    if (mockFS.files[filePath] !== undefined) {
      return { isDirectory: () => false, isFile: () => true } as any;
    }
    throw new Error(`ENOENT: no such file or directory, stat '${filePath}'`);
  });

  vi.spyOn(fs, 'access').mockImplementation(async (path: any) => {
    const filePath = path.toString();
    if (mockFS.files[filePath] === undefined) {
      throw new Error(`ENOENT: no such file or directory, access '${filePath}'`);
    }
  });

  return mockFS;
}

/**
 * Resets the mock file system
 */
export function resetMockFS(mockFS: MockFS): void {
  // Restore original implementations
  vi.mocked(fs.readdir).mockRestore();
  vi.mocked(fs.readFile).mockRestore();
  vi.mocked(fs.writeFile).mockRestore();
  vi.mocked(fs.mkdir).mockRestore();
  vi.mocked(fs.stat).mockRestore();
  vi.mocked(fs.access).mockRestore();
}

// Helper function to get the basename of a path
function basename(path: string): string {
  return path.split(/[\\/]/).pop() || '';
}

// Helper function to get the directory name of a path
function dirname(path: string): string {
  const parts = path.split(/[\\/]/);
  parts.pop();
  return parts.join('/');
}
