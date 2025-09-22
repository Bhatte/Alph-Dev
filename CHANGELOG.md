# [0.4.1](https://github.com/Aqualia/Alph/compare/v0.3.2...v0.4.1) (2025-09-22)

### Features

* enhance README with problem/solution clarity and conversion-focused quick start ([98fed40](https://github.com/Aqualia/Alph/commit/98fed40cbe978eb4c665abf7dec86e6b85fcdfcd))
  - Add compelling 'The Problem' section highlighting configuration pain points
  - Enhance demo section with before/after comparison and quick example
  - Add GitHub stars badge for social proof
  - Restructure installation flow with 'Try in 30 seconds' approach
  - Add comprehensive CI/CD workflow with automatic publishing
  - Clean up repository structure and fix configuration discrepancies

### Bug Fixes

* resolve ESLint errors in proxy command ([a6e3766](https://github.com/Aqualia/Alph/commit/a6e376647469ba14bba8f09b9618619662888485))
* resolve GitHub Actions permissions and README table formatting ([fd06d0e](https://github.com/Aqualia/Alph/commit/fd06d0e9e2a56f16eaea9e931854a03ee8ab212a))

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.1] - 2025-09-11

### Changed
- Detection heuristics for agent providers (Windsurf, Codex, Gemini) are now strictly read-only. `detect()` only reads existing files and returns `null` when configs are absent or unreadable. No files or directories are created during detection (e.g., via `alph status`). Initialization is confined to the setup/configure flow.

### Added
- `alph status --dir <path>` now includes Claude project-level MCP servers alongside global ones and displays a `Scope: global|project` indicator.
- Claude remove now supports scope-aware removal via `--scope <auto|global|project|all>`. The default `auto` removes from global and likely project roots (or a provided `--dir`).

### Docs
- README and USER_GUIDE updated with `status --dir` and `remove --scope` flags and examples.
- Claude agent guide updated with scope and status notes, plus a restart hint after removal.
- Windsurf agent guide updated to clarify read-only detection and that initialization happens exclusively during setup.
- Gemini agent guide updated to clarify read-only detection semantics.

### Notes
- No breaking changes. Existing configure/setup flows are unchanged; status and remove gain additional clarity and control.

## [Unreleased]

## [0.3.0] - 2025-09-10

### Added
- 30-second try path: `npx @aqualia/alph-cli@latest` for instant usage without global install.
- Global `--verbose` flag to enable additional debug output.

### Changed
- UI output centralized through a new `ui` utility (`src/utils/ui.ts`) for consistent formatting and future verbosity control.
- Improved banner colors (brighter red/orange using 256-color ANSI) for a cleaner, modern look.
- Status command output retained the enhanced formatting with clear sections and ANSI emphasis.

### Removed
- Replaced `chalk` (ESM-only) with `yoctocolors-cjs` to avoid ESM/CJS friction and simplify color usage across the CLI.

### Docs
- README: neutralized vendor-specific endpoints, added a "Try in 30 seconds" block, and documented compatibility.
- Moved protocol examples into `docs/agents/protocol-examples.md`.
- Started Docs IA tidy: internal-facing documents relocated under `docs/internal/`.

### Added
- Local MCP proxy integration for Codex via Supergateway (STDIO ↔ Streamable HTTP/SSE).
- New `alph proxy` commands: `run` and `health`.
- Proxy version pinning (default `supergateway@3.4.0`), override via `--proxy-version` or `ALPH_PROXY_VERSION`.
- Non-interactive proxy flags in `alph setup`: `--proxy-remote-url`, `--proxy-transport`, `--proxy-bearer`, `--proxy-header`.
- Pre-warm step for Windows (`npx -y supergateway --help`) and 60s startup heuristic for `npx`.
- Redaction improvements across previews and logs.
- Health checks and lightweight HTTP/SSE mocks for tests.
- Optional telemetry (disabled by default) with minimal, non-PII counters.

### Docs
- User Guide: proxy usage examples, pinning policy, Windows guidance.
- Troubleshooting: transport mismatch, pin override, rollback.
- ADR-001: decision to adopt Supergateway and prefer Streamable HTTP.


### Fixed
- Claude Code: use `~/.claude.json` on all platforms; add project-scoped MCP servers under `projects[<abs path>].mcpServers` so servers are active per project; adjust list/has to honor project scope.

## [0.2.3] - 2025-01-02

### Fixed
- Fixed Claude Code configuration detection to use correct paths instead of Claude Desktop paths
- Resolved Claude Code MCP server detection and status reporting

### Changed
- Enhanced logger with optional file logging capabilities:
  - Added configurable file output with rotation support
  - Added JSON logging format option
  - Added async file operations with error handling
  - Maintained backward compatibility with existing logger API
- Consolidated duplicate `MCPServerConfig` type definitions
- Documentation updated to reflect current CLI:
  - Use `alph setup` (replacing references to `alph configure`)
  - `status` command examples simplified (no `--output` flag)
  - Installation docs use scoped package `@aqualia/alph-cli` and Node.js 18+
- CONTRIBUTING updated: Node 18+ required and pack/install instructions fixed

### Removed
- Removed deprecated `migrate` command and all related files:
  - `src/commands/migrate.ts`
  - `tests/unit/commands/migrate.unit.test.ts` 
  - `tests/integration/cli/migrate.integration.test.ts`
- Removed duplicate `src/enhancedLogger.ts` (functionality integrated into main logger)
- Documentation references to `migrate` removed from `README.md`, `USER_GUIDE.md`, and `ARCHITECTURE.md`

### Chore
- Removed unused devDependencies (`@types/inquirer`, `@types/rimraf`)
- Codebase cleanup: removed ~500 lines of dead code
- Consolidated type definitions to eliminate duplication

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
