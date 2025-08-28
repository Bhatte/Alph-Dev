const colors = require('yoctocolors-cjs');

/**
 * Help text and documentation for the Alph CLI
 */

export const HELP_TEXTS = {
  // Main help text shown in `alph --help`
  MAIN: `
${colors.bold('Alph - Universal MCP Server Management')}

${colors.dim('Configure AI agents (Gemini CLI, Cursor, Claude Code, etc.) to work with MCP servers.')}

${colors.bold('Usage:')}
  alph [options]

${colors.bold('Options:')}
  -i, --interactive            Run interactive configuration (default when no options)
  -l, --list                   List detected AI agents and configurations
      --show                   Show current MCP server configuration for detected agents
      --validate               Validate current configuration
      --mcp-server-endpoint    MCP server endpoint URL (e.g., https://askhuman.net/mcp/<server-id>)
      --transport <type>       Transport protocol (http|sse) (default: http)
      --force                  Force apply configuration even if validation fails
      --verbose                Show verbose output
  -v, --version                Show version number
  -h, --help                   Show help

${colors.bold('Examples:')}
  # Interactive configuration (wizard)
  ${colors.cyan('alph')}

  # Non-interactive configuration with Async.link MCP
  ${colors.cyan('alph --mcp-server-endpoint https://askhuman.net/mcp/<server-id> --transport sse --force')}

  # Utilities
  ${colors.cyan('alph --list')}
  ${colors.cyan('alph --show')}
  ${colors.cyan('alph --validate')}
`,

  // Troubleshooting guide
  TROUBLESHOOTING: `
${colors.bold('Troubleshooting Guide')}

${colors.bold('1. Agent Not Detected')}
  • Verify the agent is installed and in your PATH
  • Check that the agent's configuration directory exists
  • Run with --verbose for detailed error messages

${colors.bold('2. MCP Server Connection Issues')}
  • Verify the server URL is correct and accessible
  • If using Async.link, confirm your server ID and account status
  • Ensure the transport protocol (http/sse) matches the server configuration

${colors.bold('3. Permission Issues')}
  • Run with elevated privileges if needed
  • Check file and directory permissions
  • Verify the user has write access to config directories

${colors.bold('Getting Help')}
  • Run with --verbose for detailed logs
  • Check the documentation at https://askhuman.net/docs
  • Report issues at https://github.com/Aqualia/Alph/issues
`
} as const;

/**
 * Prints help text for a specific command or the main help
 * @param command - Optional command to show help for
 */
export function showHelp(command?: string): void {
  const helpText = command && command in HELP_TEXTS 
    ? HELP_TEXTS[command as keyof typeof HELP_TEXTS]
    : HELP_TEXTS.MAIN;
  
  console.log(helpText);
}

/**
 * Prints the troubleshooting guide
 */
export function showTroubleshootingGuide(): void {
  console.log(HELP_TEXTS.TROUBLESHOOTING);
}

/**
 * Shows contextual help during interactive setup
 * @param context - The current setup context
 */
export function showContextualHelp(context: {
  step: string;
  agentType?: string;
  mcpServerId?: string;
}): void {
  const { step, agentType } = context;
  
  console.log('\n' + colors.bold('Help:'));
  
  switch (step) {
    case 'agent-selection':
      console.log(`Select the AI agent you want to configure with MCP servers.`);
      if (agentType) {
        console.log(`\nSelected: ${colors.cyan(agentType)}`);
      }
      break;
      
    case 'mcp-config':
      console.log(`Configure the MCP server connection for ${colors.cyan(agentType)}.`);
      console.log(`\nEnter the MCP server endpoint (e.g., https://askhuman.net/mcp/<server-id>)`);
      break;
      
    case 'transport':
      console.log(`Select the transport protocol for communication with the MCP server.`);
      console.log(`\n${colors.cyan('http:')} Standard HTTP/HTTPS requests`);
      console.log(`${colors.cyan('sse:')}  Server-Sent Events for real-time updates`);
      break;
      
    default:
      console.log('Type your answer or use the arrow keys to select an option.');
      console.log('Press Enter to confirm your selection.');
  }
  
  console.log('\nPress ? to show this help again.');
}
