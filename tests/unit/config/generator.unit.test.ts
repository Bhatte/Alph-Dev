import { ConfigGenerator, AgentType, createConfigGenerator } from '../../../src/config/generator';
import { MCPServerConfig } from '../../../src/types/config';
import { createEnvManager, PlatformEnvStubs } from '../../_utils/env';

describe('ConfigGenerator Unit Tests', () => {
  let envManager: ReturnType<typeof createEnvManager>;
  let generator: ConfigGenerator;

  beforeEach(() => {
    envManager = createEnvManager();
    generator = createConfigGenerator();
  });

  afterEach(() => {
    envManager.restoreAll();
  });

  describe('Path Resolution', () => {
    it('should resolve Windows paths correctly', async () => {
      envManager.stubMultiple(PlatformEnvStubs.windows('C:\\Users\\testuser'));

      const configPath = await generator.getDefaultConfigPath('gemini' as AgentType);
      
      expect(configPath).toContain('C:\\Users\\testuser');
      expect(configPath).toContain('AppData');
    });

    it('should resolve macOS paths correctly', async () => {
      envManager.stubMultiple(PlatformEnvStubs.macos('/Users/testuser'));

      const configPath = await generator.getDefaultConfigPath('cursor' as AgentType);
      
      expect(configPath).toContain('/Users/testuser');
      expect(configPath).toContain('.cursor');
    });

    it('should resolve Linux paths correctly', async () => {
      envManager.stubMultiple(PlatformEnvStubs.linux('/home/testuser'));

      const configPath = await generator.getDefaultConfigPath('claude' as AgentType);
      
      expect(configPath).toContain('/home/testuser');
      expect(configPath).toContain('.claude');
    });

    it('should handle missing environment variables gracefully', async () => {
      // Clear all relevant env vars
      envManager.stubMultiple({
        'HOME': '',
        'APPDATA': '',
        'XDG_CONFIG_HOME': ''
      });

      // Should not throw, but provide fallback
      await expect(
        generator.getDefaultConfigPath('gemini' as AgentType)
      ).resolves.toBeDefined();
    });
  });

  describe('MCP Configuration Generation', () => {
    it('should generate valid MCP server configuration', async () => {
      const mcpConfig: MCPServerConfig = {
        name: 'test-server',
        command: 'node',
        args: ['server.js'],
        env: {
          'API_KEY': 'test-key'
        }
      };

      const config = await generator.generate('gemini' as AgentType, mcpConfig);

      expect(config).toBeDefined();
      expect(config.mcpServers).toBeDefined();
      expect(config.mcpServers['test-server']).toEqual({
        command: 'node',
        args: ['server.js'],
        env: {
          'API_KEY': 'test-key'
        }
      });
    });

    it('should merge with existing configuration', async () => {
      const existingConfig = {
        mcpServers: {
          'existing-server': {
            command: 'python',
            args: ['existing.py']
          }
        }
      };

      const newMcpConfig: MCPServerConfig = {
        name: 'new-server',
        command: 'node',
        args: ['new.js']
      };

      const config = await generator.generate(
        'cursor' as AgentType, 
        newMcpConfig, 
        { existingConfig }
      );

      expect(config.mcpServers['existing-server']).toBeDefined();
      expect(config.mcpServers['new-server']).toBeDefined();
    });

    it('should handle duplicate server names', async () => {
      const existingConfig = {
        mcpServers: {
          'duplicate-server': {
            command: 'old-command',
            args: ['old.js']
          }
        }
      };

      const newMcpConfig: MCPServerConfig = {
        name: 'duplicate-server',
        command: 'new-command',
        args: ['new.js']
      };

      const config = await generator.generate(
        'claude' as AgentType, 
        newMcpConfig, 
        { existingConfig }
      );

      // New configuration should override existing
      expect(config.mcpServers['duplicate-server'].command).toBe('new-command');
      expect(config.mcpServers['duplicate-server'].args).toEqual(['new.js']);
    });
  });

  describe('Validation', () => {
    it('should validate required MCP server fields', async () => {
      const invalidConfig = {
        name: 'test-server'
        // Missing command
      } as MCPServerConfig;

      await expect(
        generator.generate('gemini' as AgentType, invalidConfig)
      ).rejects.toThrow();
    });

    it('should validate agent type', async () => {
      const mcpConfig: MCPServerConfig = {
        name: 'test-server',
        command: 'node',
        args: ['server.js']
      };

      await expect(
        generator.generate('invalid-agent' as AgentType, mcpConfig)
      ).rejects.toThrow();
    });
  });

  describe('JSON Merge Logic', () => {
    it('should perform shallow merge for simple properties', async () => {
      const existingConfig = {
        version: '1.0',
        mcpServers: {}
      };

      const mcpConfig: MCPServerConfig = {
        name: 'test-server',
        command: 'node',
        args: ['server.js']
      };

      const config = await generator.generate(
        'gemini' as AgentType, 
        mcpConfig, 
        { existingConfig }
      );

      expect(config.version).toBe('1.0');
      expect(config.mcpServers['test-server']).toBeDefined();
    });

    it('should handle nested object merging', async () => {
      const existingConfig = {
        mcpServers: {
          'server-1': {
            command: 'node',
            args: ['server1.js'],
            env: {
              'EXISTING_VAR': 'value1'
            }
          }
        }
      };

      const mcpConfig: MCPServerConfig = {
        name: 'server-1',
        command: 'node',
        args: ['server1.js'],
        env: {
          'NEW_VAR': 'value2'
        }
      };

      const config = await generator.generate(
        'cursor' as AgentType, 
        mcpConfig, 
        { existingConfig, mergeStrategy: 'deep' }
      );

      const serverConfig = config.mcpServers['server-1'];
      expect(serverConfig.env).toEqual({
        'EXISTING_VAR': 'value1',
        'NEW_VAR': 'value2'
      });
    });
  });
});
