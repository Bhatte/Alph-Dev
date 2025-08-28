# Contributing to alph-cli

We welcome contributions to alph-cli! Please follow these guidelines to ensure a smooth development process.

## Getting Started

1. **Fork the repository** on GitHub.
2. **Clone your fork** to your local machine:
   ```bash
   git clone https://github.com/YOUR_USERNAME/Alph.git
   cd Alph
   ```
3. **Create a new branch** for your feature or bug fix:
   ```bash
   git checkout -b my-feature-branch
   ```

## Development Setup

### Prerequisites

- Node.js 18.0.0 or higher
- NPM (comes with Node.js)
- Git

### Installation

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test
```

### Project Structure

```
/src/                       # TypeScript source code
  /agents/                  # Agent provider implementations
    /gemini.ts              # Gemini CLI provider
    /cursor.ts              # Cursor provider
    /claude.ts              # Claude provider
    /generic.ts             # Generic provider
  /commands/                # CLI command implementations
  /types/                   # TypeScript type definitions
  /utils/                   # Utility functions
  /index.ts                 # Main CLI entry point
/tests/                     # Test files
  /integration/             # Integration tests
  /unit/                    # Unit tests
/dist/                      # Compiled JavaScript (generated)
```

### Development Commands

```bash
# Development build with watch mode
npm run dev

# Run tests
npm test
npm run test:watch         # Watch mode
npm run test:coverage      # With coverage

# Linting and formatting
npm run lint               # Check for issues
npm run lint:fix           # Fix issues automatically
npm run format             # Format code with Prettier

# Type checking
npm run typecheck

# Build for production
npm run build
```

## Development Guidelines

### Code Style

- Use TypeScript for all new code
- Follow the existing code style (enforced by ESLint and Prettier)
- Write meaningful variable and function names
- Add JSDoc comments for public APIs

### Testing

- Write tests for all new functionality
- Use Jest for testing framework
- Aim for high test coverage
- Test both success and error scenarios
- Use integration tests for end-to-end workflows

### Adding New Agent Providers

To add support for a new AI agent:

1. Create a new provider class in `/src/agents/`
2. Implement the `AgentProvider` interface
3. Add the provider to the registry in `/src/agents/registry.ts`
4. Write comprehensive tests
5. Update documentation

Example provider structure:
```typescript
export class NewAgentProvider implements AgentProvider {
  name = 'New Agent';
  
  async detect(): Promise<string | null> {
    // Detection logic
  }
  
  async configure(config: AgentConfig): Promise<void> {
    // Configuration logic
  }
}
```

### Commit Guidelines

- Use clear, descriptive commit messages
- Follow conventional commit format when possible:
  - `feat:` for new features
  - `fix:` for bug fixes
  - `docs:` for documentation changes
  - `test:` for test additions/changes
  - `refactor:` for code refactoring

## Testing Your Changes

Before submitting a pull request:

1. **Run the full test suite**:
   ```bash
   npm test
   ```

2. **Check code quality**:
   ```bash
   npm run lint
   npm run typecheck
   ```

3. **Test the CLI locally**:
   ```bash
   npm run build
   node dist/index.js --help
   ```

4. **Test installation**:
   ```bash
   npm pack
   # Install the generated tarball (filename printed by npm pack)
   npm install -g ./*.tgz
   alph --help
   ```

## Submitting a Pull Request

1. **Ensure your branch is up to date**:
   ```bash
   git checkout main
   git pull upstream main
   git checkout my-feature-branch
   git rebase main
   ```

2. **Run all checks**:
   ```bash
   npm run lint
   npm run typecheck
   npm test
   npm run build
   ```

3. **Commit your changes** with a clear message
4. **Push your branch** to your fork:
   ```bash
   git push origin my-feature-branch
   ```
5. **Open a pull request** with:
   - Clear description of changes
   - Reference to any related issues
   - Screenshots if UI changes are involved

## Release Process

Releases are handled by maintainers:

1. Version bump in `package.json`
2. Update `CHANGELOG.md`
3. Create release tag
4. Publish to NPM

## Getting Help

- Check existing [issues](https://github.com/Aqualia/Alph/issues)
- Create a new issue for bugs or feature requests
- Join discussions in pull requests

Thank you for contributing to alph-cli!
