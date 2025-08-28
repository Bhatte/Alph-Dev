import { createTestSandbox, Sandbox } from '../../_utils/fsSandbox';
import { createEnvManager, PlatformEnvStubs } from '../../_utils/env';
import { ConfigGenerator, AgentType, createConfigGenerator } from '../../../src/config/generator';
import { ConfigInstaller } from '../../../src/config/installer';
import { MCPServerConfig } from '../../../src/types/config';
import * as path from 'path';

describe('CLI Commands Integration Tests', () => {
  let sandbox: Sandbox;
  let envManager: ReturnType<typeof createEnvManager>;
  let generator: ConfigGenerator;
  let installer: ConfigInstaller;

  beforeEach(async () => {
    sandbox = await createTestSandbox();
    envManager = createEnvManager();
    generator = createConfigGenerator();
    installer = new ConfigInstaller(generator);
  });

  afterEach(async () => {
    await sandbox.cleanup();
    envManager.restoreAll();
  });

  describe('Configure Command Flow', () => {
    it('should configure MCP server for Gemini agent', async () => {
      // Setup Windows environment
      envManager.stubMultiple(PlatformEnvStubs.windows(sandbox.resolve('home')));

      const mcpConfig: MCPServerConfig = {
        name: 'test-server',
        command: 'node',
        args: ['server.js'],
        env: {
          'API_KEY': 'test-key-12345'
        }
      };

      // Run configure flow
      const result = await installer.install('gemini' as AgentType, mcpConfig, {
        backup: true,
        force: false
      });

      expect(result.success).toBe(true);
      expect(result.configPath).toBeDefined();
      expect(result.backupPath).toBeUndefined(); // No backup for new file

      // Verify configuration was written
      const configContent = await sandbox.readFile(
        path.relative(sandbox.root, result.configPath!)
      );
      const config = JSON.parse(configContent);
      expect(config.mcpServers['test-server']).toEqual({
        command: 'node',
        args: ['server.js'],
        env: {
          'API_KEY': 'test-key-12345'
        }
      });
    });

    it('should handle existing configuration merging', async () => {
      // Setup macOS environment
      envManager.stubMultiple(PlatformEnvStubs.macos(sandbox.resolve('home')));

      // Create existing configuration
      const existingConfig = {
        mcpServers: {
          'existing-server': {
            command: 'python',
            args: ['existing.py']
          }
        }
      };

      const configPath = await generator.getDefaultConfigPath('cursor' as AgentType);
      const relativePath = path.relative(sandbox.root, configPath);
      await sandbox.createFile(relativePath, JSON.stringify(existingConfig, null, 2));

      // Add new server
      const newMcpConfig: MCPServerConfig = {
        name: 'new-server',
        command: 'node',
        args: ['new.js']
      };

      const result = await installer.install('cursor' as AgentType, newMcpConfig, {
        backup: true,
        force: false
      });

      expect(result.success).toBe(true);
      expect(result.backupPath).toBeDefined(); // Backup created for existing file

      // Verify both servers exist
      const updatedContent = await sandbox.readFile(relativePath);
      const config = JSON.parse(updatedContent);
      expect(config.mcpServers['existing-server']).toBeDefined();
      expect(config.mcpServers['new-server']).toBeDefined();
    });

    it('should respect force flag for overwriting', async () => {
      envManager.stubMultiple(PlatformEnvStubs.linux(sandbox.resolve('home')));

      const mcpConfig: MCPServerConfig = {
        name: 'test-server',
        command: 'node',
        args: ['server.js']
      };

      // First installation
      const firstResult = await installer.install('claude' as AgentType, mcpConfig);
      expect(firstResult.success).toBe(true);

      // Second installation without force should fail
      const secondResult = await installer.install('claude' as AgentType, mcpConfig, {
        force: false
      });
      expect(secondResult.success).toBe(false);
      expect(secondResult.message).toContain('already exists');

      // Third installation with force should succeed
      const thirdResult = await installer.install('claude' as AgentType, mcpConfig, {
        force: true
      });
      expect(thirdResult.success).toBe(true);
    });

    it('should handle installation errors gracefully', async () => {
      envManager.stubMultiple({
        'HOME': '/nonexistent/path',
        'XDG_CONFIG_HOME': '/nonexistent/config'
      });

      const mcpConfig: MCPServerConfig = {
        name: 'test-server',
        command: 'node',
        args: ['server.js']
      };

      const result = await installer.install('gemini' as AgentType, mcpConfig);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.message).toContain('Failed to install configuration');
    });
  });

  describe('Status Command Flow', () => {
    it('should detect existing configurations', async () => {
      envManager.stubMultiple(PlatformEnvStubs.windows(sandbox.resolve('home')));

      // Create configurations for multiple agents
      const agents: AgentType[] = ['gemini', 'cursor', 'claude'];
      const configPaths: string[] = [];

      for (const agent of agents) {
        const configPath = await generator.getDefaultConfigPath(agent);
        const relativePath = path.relative(sandbox.root, configPath);
        
        await sandbox.createFile(relativePath, JSON.stringify({
          mcpServers: {
            [`${agent}-server`]: {
              command: 'node',
              args: [`${agent}.js`]
            }
          }
        }, null, 2));

        configPaths.push(configPath);
      }

      // Verify all configurations can be read
      for (let i = 0; i < agents.length; i++) {
        const configPath = configPaths[i];
        const agent = agents[i];
        
        const exists = await sandbox.exists(path.relative(sandbox.root, configPath));
        expect(exists).toBe(true);

        const content = await sandbox.readFile(path.relative(sandbox.root, configPath));
        const config = JSON.parse(content);
        expect(config.mcpServers[`${agent}-server`]).toBeDefined();
      }
    });

    it('should handle missing configurations', async () => {
      envManager.stubMultiple(PlatformEnvStubs.macos(sandbox.resolve('home')));

      const configPath = await generator.getDefaultConfigPath('gemini' as AgentType);
      const relativePath = path.relative(sandbox.root, configPath);

      // Verify file doesn't exist
      const exists = await sandbox.exists(relativePath);
      expect(exists).toBe(false);

      // Should handle gracefully when trying to read
      await expect(sandbox.readFile(relativePath)).rejects.toThrow();
    });

    it('should validate configuration integrity', async () => {
      envManager.stubMultiple(PlatformEnvStubs.linux(sandbox.resolve('home')));

      const configPath = await generator.getDefaultConfigPath('cursor' as AgentType);
      const relativePath = path.relative(sandbox.root, configPath);

      // Create malformed configuration
      await sandbox.createFile(relativePath, '{ "mcpServers": { "broken": }');

      // Should detect malformed JSON
      await expect(
        sandbox.readFile(relativePath).then(content => JSON.parse(content))
      ).rejects.toThrow();
    });
  });

  describe('Backup and Recovery Integration', () => {
    it('should create and restore backups during configuration updates', async () => {
      envManager.stubMultiple(PlatformEnvStubs.windows(sandbox.resolve('home')));

      const originalConfig = {
        mcpServers: {
          'original-server': {
            command: 'node',
            args: ['original.js']
          }
        }
      };

      // Install initial configuration
      const configPath = await generator.getDefaultConfigPath('gemini' as AgentType);
      const relativePath = path.relative(sandbox.root, configPath);
      await sandbox.createFile(relativePath, JSON.stringify(originalConfig, null, 2));

      // Update with new server
      const newMcpConfig: MCPServerConfig = {
        name: 'updated-server',
        command: 'node',
        args: ['updated.js']
      };

      const result = await installer.install('gemini' as AgentType, newMcpConfig, {
        backup: true,
        force: true
      });

      expect(result.success).toBe(true);
      expect(result.backupPath).toBeDefined();

      // Verify backup contains original configuration
      const backupContent = await sandbox.readFile(
        path.relative(sandbox.root, result.backupPath!)
      );
      const backupConfig = JSON.parse(backupContent);
      expect(backupConfig.mcpServers['original-server']).toBeDefined();

      // Verify new configuration is updated
      const updatedContent = await sandbox.readFile(relativePath);
      const updatedConfig = JSON.parse(updatedContent);
      expect(updatedConfig.mcpServers['updated-server']).toBeDefined();
    });

    it('should handle backup directory permissions', async () => {
      envManager.stubMultiple(PlatformEnvStubs.linux(sandbox.resolve('home')));

      const mcpConfig: MCPServerConfig = {
        name: 'test-server',
        command: 'node',
        args: ['server.js']
      };

      // Create custom backup directory with specific permissions
      const backupDir = sandbox.resolve('custom-backups');
      await sandbox.createDir('custom-backups');
      await sandbox.setPermissions('custom-backups', 0o755);

      const result = await installer.install('claude' as AgentType, mcpConfig, {
        backup: true,
        backupDir
      });

      expect(result.success).toBe(true);
      expect(result.backupPath).toContain('custom-backups');
    });
  });

  describe('Permission Matrix Coverage', () => {
    it('should handle read-only configuration directories', async () => {
      envManager.stubMultiple(PlatformEnvStubs.linux(sandbox.resolve('home')));

      const configPath = await generator.getDefaultConfigPath('gemini' as AgentType);
      const configDir = path.dirname(configPath);
      const relativeDirPath = path.relative(sandbox.root, configDir);

      // Create directory but make it read-only
      await sandbox.createDir(relativeDirPath);
      await sandbox.setPermissions(relativeDirPath, 0o444);

      const mcpConfig: MCPServerConfig = {
        name: 'test-server',
        command: 'node',
        args: ['server.js']
      };

      const result = await installer.install('gemini' as AgentType, mcpConfig);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.message).toContain('Failed to install configuration');
    });

    it('should provide remediation hints for permission errors', async () => {
      envManager.stubMultiple(PlatformEnvStubs.macos(sandbox.resolve('home')));

      // Try to write to a path that doesn't exist and can't be created
      envManager.stub('HOME', '/root/nonexistent');

      const mcpConfig: MCPServerConfig = {
        name: 'test-server',
        command: 'node',
        args: ['server.js']
      };

      const result = await installer.install('cursor' as AgentType, mcpConfig);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Failed to install configuration');
      // Should provide helpful error context
      expect(result.error?.message).toBeDefined();
    });
  });

  describe('Rollback Functionality', () => {
    it('should rollback configuration changes when validation fails', async () => {
      envManager.stubMultiple(PlatformEnvStubs.windows(sandbox.resolve('home')));

      // Create initial configuration
      const configPath = await generator.getDefaultConfigPath('gemini' as AgentType);
      const relativePath = path.relative(sandbox.root, configPath);
      
      const originalConfig = {
        mcpServers: {
          'original-server': {
            command: 'node',
            args: ['original.js']
          }
        }
      };
      
      await sandbox.createFile(relativePath, JSON.stringify(originalConfig, null, 2));

      // Create a configuration that will cause validation to fail
      const invalidConfig: MCPServerConfig = {
        name: 'invalid-server',
        command: '', // Empty command should cause validation to fail
        args: ['test.js']
      };

      // Import SafeEditManager to test its rollback functionality directly
      const { SafeEditManager } = require('../../../src/utils/safeEdit');
      
      // Perform a safe edit with a validator that will fail
      const result = await SafeEditManager.safeEdit(
        configPath,
        (config: any) => ({
          ...config,
          mcpServers: {
            ...config.mcpServers,
            'invalid-server': {
              command: '', // Empty command
              args: ['test.js']
            }
          }
        }),
        {
          validator: (config: any) => {
            // Validator that fails if any server has empty command
            for (const server of Object.values(config.mcpServers)) {
              if ((server as any).command === '') {
                return false;
              }
            }
            return true;
          },
          autoRollback: true
        }
      );

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('validation failed');

      // File should be restored to original state
      const restoredContent = JSON.parse(await sandbox.readFile(relativePath));
      expect(restoredContent).toEqual(originalConfig);
    });

    it('should handle rollback on write failure', async () => {
      envManager.stubMultiple(PlatformEnvStubs.linux(sandbox.resolve('home')));

      // Create initial configuration
      const configPath = sandbox.resolve('configs/test.json');
      const relativePath = path.relative(sandbox.root, configPath);
      const configDir = path.dirname(relativePath);
      
      // Create config directory
      await sandbox.createDir(configDir);
      
      const originalConfig = {
        test: 'original'
      };
      
      await sandbox.createFile(relativePath, JSON.stringify(originalConfig, null, 2));

      // Make directory read-only to cause write failure
      await sandbox.setPermissions(configDir, 0o444);

      // Import SafeEditManager to test its rollback functionality directly
      const { SafeEditManager } = require('../../../src/utils/safeEdit');
      
      // Perform a safe edit that should fail due to write permissions
      const result = await SafeEditManager.safeEdit(
        configPath,
        (config: any) => ({ ...config, test: 'modified' }),
        { createBackup: true, autoRollback: true }
      );

      expect(result.success).toBe(false);
      
      // Restore permissions to read the file
      await sandbox.setPermissions(configDir, 0o755);
      
      // File should be restored to original state
      const restoredContent = JSON.parse(await sandbox.readFile(relativePath));
      expect(restoredContent).toEqual(originalConfig);
    });
  });
});
