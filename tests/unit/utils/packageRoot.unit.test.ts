import { findPackageRoot, getPackageRoot, resolvePackagePath } from '../../../src/utils/packageRoot';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('packageRoot utilities', () => {
  describe('findPackageRoot', () => {
    it('should find the correct package root', () => {
      const root = findPackageRoot();
      
      // Should be able to find package.json
      const packageJsonPath = path.join(root, 'package.json');
      expect(fs.existsSync(packageJsonPath)).toBe(true);
      
      // Should be the Alph package
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      expect(packageJson.name).toBe('@aqualia/alph-cli');
    });
    
    it('should work from different working directories', () => {
      const originalCwd = process.cwd();
      
      try {
        // Change to a different directory (cross-platform)
        const tempDir = os.tmpdir();
        process.chdir(tempDir);
        
        // Should still find the correct package root
        const root = findPackageRoot();
        const packageJsonPath = path.join(root, 'package.json');
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        expect(packageJson.name).toBe('@aqualia/alph-cli');
      } finally {
        process.chdir(originalCwd);
      }
    });
  });
  
  describe('getPackageRoot', () => {
    it('should return cached result on subsequent calls', () => {
      const root1 = getPackageRoot();
      const root2 = getPackageRoot();
      
      expect(root1).toBe(root2);
    });
  });
  
  describe('resolvePackagePath', () => {
    it('should resolve paths relative to package root', () => {
      const catalogPath = resolvePackagePath('catalog', 'agents.yaml');
      const toolsPath = resolvePackagePath('catalog', 'tools.yaml');
      
      // Should exist
      expect(fs.existsSync(catalogPath)).toBe(true);
      expect(fs.existsSync(toolsPath)).toBe(true);
      
      // Should be absolute paths
      expect(path.isAbsolute(catalogPath)).toBe(true);
      expect(path.isAbsolute(toolsPath)).toBe(true);
      
      // Should end with expected paths
      expect(catalogPath.endsWith(path.join('catalog', 'agents.yaml'))).toBe(true);
      expect(toolsPath.endsWith(path.join('catalog', 'tools.yaml'))).toBe(true);
    });
    
    it('should work from different working directories', () => {
      const originalCwd = process.cwd();
      
      try {
        // Get path from original directory
        const catalogPath1 = resolvePackagePath('catalog', 'agents.yaml');
        
        // Change to different directory (cross-platform)
        process.chdir(os.tmpdir());
        
        // Should still resolve to same path
        const catalogPath2 = resolvePackagePath('catalog', 'agents.yaml');
        expect(catalogPath1).toBe(catalogPath2);
        expect(fs.existsSync(catalogPath2)).toBe(true);
      } finally {
        process.chdir(originalCwd);
      }
    });
  });
});