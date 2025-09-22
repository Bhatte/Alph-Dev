import path from 'path';
import fs from 'fs';

/**
 * Finds the root directory of the Alph package by looking for package.json
 * with the correct package name. This works regardless of execution context:
 * - Local development
 * - Global npm installation 
 * - npx execution
 * - Running from different working directories
 * - Symlinked installations
 */
export function findPackageRoot(): string {
  // Start from this file's directory and walk up
  let currentDir = __dirname;
  let attempts = 0;
  const maxAttempts = 50; // Safety limit to prevent infinite loops
  
  // Cross-platform filesystem root detection
  // On Unix: '/' === path.dirname('/') -> true (stop)
  // On Windows: 'C:\\' === path.dirname('C:\\') -> true (stop)  
  // Also handle edge cases like UNC paths, relative paths, etc.
  while (currentDir !== path.dirname(currentDir) && attempts < maxAttempts) {
    try {
      const packageJsonPath = path.join(currentDir, 'package.json');
      
      if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        
        // Check if this is the Alph package
        if (packageJson.name === '@aqualia/alph-cli') {
          return currentDir;
        }
      }
    } catch {
      // Continue searching if package.json is malformed
    }
    
    currentDir = path.dirname(currentDir);
    attempts++;
  }
  
  // Fallback: try to find based on known structure
  // In compiled form, this file is at dist/utils/packageRoot.js
  // So package root should be two levels up from dist/utils/
  const distUtilsDir = __dirname;
  const distDir = path.dirname(distUtilsDir);
  const possibleRoot = path.dirname(distDir);
  
  try {
    const packageJsonPath = path.join(possibleRoot, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      if (packageJson.name === '@aqualia/alph-cli') {
        return possibleRoot;
      }
    }
  } catch {
    // Continue to error
  }
  
  throw new Error(
    `Could not find Alph package root. Searched from ${__dirname} upward. ` +
    `Platform: ${process.platform}, attempts: ${attempts}, max: ${maxAttempts}. ` +
    `This might indicate a packaging issue or unsupported installation method.`
  );
}

/**
 * Cached package root to avoid repeated filesystem traversal
 */
let cachedPackageRoot: string | undefined;

export function getPackageRoot(): string {
  if (!cachedPackageRoot) {
    cachedPackageRoot = findPackageRoot();
  }
  return cachedPackageRoot;
}

/**
 * Helper to resolve paths relative to the package root
 */
export function resolvePackagePath(...pathSegments: string[]): string {
  return path.resolve(getPackageRoot(), ...pathSegments);
}