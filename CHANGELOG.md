# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- Documentation updated to reflect current CLI:
  - Use `alph setup` (replacing references to `alph configure`).
  - `status` command examples simplified (no `--output` flag).
  - Installation docs use scoped package `@aqualia/alph-cli` and Node.js 18+.
- CONTRIBUTING updated: Node 18+ required and pack/install instructions fixed.

### Removed
- `migrate` command has been removed from the CLI. The implementation now throws a clear error when referenced and is no longer registered in `src/commands/unified.ts`.
- All migrate-related tests are skipped and will be removed in a future cleanup.
- Documentation references to `migrate` removed from `README.md`, `USER_GUIDE.md`, and `ARCHITECTURE.md`.

### Chore
- Removed unused devDependencies (`@types/inquirer`, `@types/rimraf`).

## [0.1.14] - 2025-08-23

### Security
- Fixed 3 low severity vulnerabilities by updating dependencies
- Updated Inquirer from v9 to v12 to resolve security issues

### Fixed
- Resolved TypeScript compilation errors caused by Inquirer API changes
- Fixed property access issues with bracket notation in interactive prompts
- Removed unsupported prefix property from prompt objects
- Updated prompt syntax to match new Inquirer API

### Changed
- Dependency updates to resolve security vulnerabilities
- Improved NPX compatibility with updated dependencies

## [0.1.13] - 2025-08-23

### Security
- Fixed 3 low severity vulnerabilities by updating dependencies
- Updated Inquirer from v9 to v12 to resolve security issues

### Fixed
- Resolved TypeScript compilation errors caused by Inquirer API changes
- Fixed property access issues with bracket notation in interactive prompts
- Removed unsupported prefix property from prompt objects
- Updated prompt syntax to match new Inquirer API

### Changed
- Dependency updates to resolve security vulnerabilities
- Improved NPX compatibility with updated dependencies

## [0.1.0] - 2025-08-18

### Added
- Subcommand-based CLI (`configure`, `status`) via `src/commands/unified.ts`.
- Access key support for MCP servers with automatic redaction in all outputs.
- Interactive wizard improvements: prefilled values, masked access key prompt.
- Robust CLI flag parsing and safe argv-fallback gated by `ALPH_ARGV_FALLBACK=1`.

### Changed
- Configure flow (`src/commands/configure.ts`) supports dry-run previews, agent filtering, and rollback on failure.
- Status command (`src/commands/status.ts`) shows table/JSON outputs with sensitive value redaction.
- Documentation (`README.md`, `USER_GUIDE.md`) updated to reflect subcommands and security practices.

### Security
- Secrets and access keys redacted consistently (show only last 4) across CLI previews and status output.

### Testing
- Added focused Jest tests for configure and status commands covering interactive delegation, dry-run, filtering, JSON redaction, and missing config handling.

## [1.0.0] - 2024-08-14

### Added
- Initial NPM release of alph-cli
- Complete TypeScript rewrite of askhumanctl
- Multi-agent provider support:
  - Gemini CLI provider
  - Cursor provider  
  - Claude Code provider
  - Generic provider for custom agents
- Cross-platform compatibility (Windows, macOS, Linux)
- Atomic file operations with backup protection
- Comprehensive test suite with Jest
- ESLint and Prettier configuration
- Automated build and publishing pipeline
- Detailed documentation and usage examples

### Changed
- Migrated from Go binary to Node.js/TypeScript NPM package
- Command name changed from `askhumanctl` to `alph`
- Installation method changed to `npm install -g alph-cli`

### Security
- Stateless, local-only operations (no network requests)
- Input validation and sanitization
- Safe file operations with atomic writes
- Automatic backup creation before modifications

## Migration Guide

### From askhumanctl (Go) to alph-cli (NPM)

1. **Uninstall old binary**:
   ```bash
   # Remove from PATH or delete binary
   ```

2. **Install new NPM package**:
   ```bash
   npm install -g alph-cli
   ```

3. **Update commands**:
   ```bash
   # Old command
   askhumanctl setup --mcp-server-id id --mcp-access-key key
   
   # New command  
   alph setup --mcp-server-endpoint https://askhuman.net/mcp/id --bearer key -y
   ```

4. **Verify installation**:
   ```bash
   alph --help
   ```

All functionality remains the same, only the installation method and command name have changed.