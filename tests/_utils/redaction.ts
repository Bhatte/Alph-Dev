/**
 * Redaction utilities for testing secret masking functionality
 */

/**
 * Test patterns for secrets that should be redacted
 */
export const TEST_SECRETS = {
  // OpenAI-style API keys
  openai: 'sk-1234567890abcdef1234567890abcdef12345678',
  // GitHub personal access token
  github: 'ghp_1234567890abcdef1234567890abcdef123456',
  // GitHub OAuth token
  githubOAuth: 'gho_1234567890abcdef1234567890abcdef1234',
  // Generic long API key
  generic: 'abc123def456ghi789jkl012mno345pqr678stu901vwx234yz',
  // Base64 encoded secret
  base64: 'YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXoxMjM0NTY3ODkw',
  // Publishable key
  publishable: 'pk_test_1234567890abcdef1234567890abcdef12345678'
} as const;

/**
 * Expected redacted versions of test secrets
 */
export const EXPECTED_REDACTED = {
  openai: '****f678',
  github: '****3456',
  githubOAuth: '****1234',
  generic: '****4yz',
  base64: '****TkwOQ==',
  publishable: '****5678'
} as const;

/**
 * Test data that should NOT be redacted
 */
export const NON_SECRETS = [
  'short123', // Too short
  'normaltext',
  'user@example.com',
  'https://example.com/path',
  '1234567890', // Numbers only, but short
  'config.json'
] as const;

/**
 * Assert that a string contains properly redacted secrets
 * @param text - Text to check for redaction
 * @param expectedRedactions - Expected redacted patterns
 */
export function assertSecretsRedacted(
  text: string, 
  expectedRedactions: string[]
): void {
  for (const redacted of expectedRedactions) {
    if (!text.includes(redacted)) {
      throw new Error(`Expected redacted pattern "${redacted}" not found in: ${text}`);
    }
  }
}

/**
 * Assert that a string does not contain any unredacted secrets
 * @param text - Text to check
 * @param secrets - Array of secret strings that should not appear
 */
export function assertNoUnredactedSecrets(
  text: string,
  secrets: string[]
): void {
  for (const secret of secrets) {
    if (text.includes(secret)) {
      throw new Error(`Unredacted secret "${secret}" found in: ${text}`);
    }
  }
}

/**
 * Assert that non-secret data is not redacted
 * @param text - Text to check
 * @param nonSecrets - Array of strings that should remain unredacted
 */
export function assertNonSecretsNotRedacted(
  text: string,
  nonSecrets: string[]
): void {
  for (const nonSecret of nonSecrets) {
    if (!text.includes(nonSecret)) {
      throw new Error(`Non-secret "${nonSecret}" was incorrectly redacted in: ${text}`);
    }
  }
}

/**
 * Create test data with mixed secrets and non-secrets
 * @returns Object with test data and expected results
 */
export function createRedactionTestData() {
  const secrets = Object.values(TEST_SECRETS);
  const expectedRedacted = Object.values(EXPECTED_REDACTED);
  const nonSecrets = [...NON_SECRETS];

  // Create mixed content
  const mixedContent = [
    'API Key: ' + TEST_SECRETS.openai,
    'GitHub Token: ' + TEST_SECRETS.github,
    'User email: user@example.com',
    'Config file: config.json',
    'Secret: ' + TEST_SECRETS.base64,
    'Normal text content'
  ].join('\n');

  const expectedRedactedContent = [
    'API Key: ' + EXPECTED_REDACTED.openai,
    'GitHub Token: ' + EXPECTED_REDACTED.github,
    'User email: user@example.com',
    'Config file: config.json',
    'Secret: ' + EXPECTED_REDACTED.base64,
    'Normal text content'
  ].join('\n');

  return {
    secrets,
    expectedRedacted,
    nonSecrets,
    mixedContent,
    expectedRedactedContent
  };
}

/**
 * Comprehensive redaction test helper
 * @param redactionFn - Function that performs redaction
 * @param testData - Optional custom test data
 */
export function testRedactionFunction(
  redactionFn: (text: string) => string,
  testData = createRedactionTestData()
): void {
  const { mixedContent, expectedRedactedContent, secrets, nonSecrets } = testData;

  // Test redaction
  const redacted = redactionFn(mixedContent);

  // Verify secrets are redacted
  assertNoUnredactedSecrets(redacted, secrets);

  // Verify non-secrets are preserved
  assertNonSecretsNotRedacted(redacted, nonSecrets);

  // Verify expected redacted patterns are present
  const expectedRedactions = Object.values(EXPECTED_REDACTED);
  assertSecretsRedacted(redacted, expectedRedactions);

  // Optional: Check exact match if deterministic
  if (redacted !== expectedRedactedContent) {
    console.warn('Redaction output differs from expected (this may be acceptable):');
    console.warn('Expected:', expectedRedactedContent);
    console.warn('Actual:  ', redacted);
  }
}

/**
 * Helper to create log messages with embedded secrets for testing
 * @param level - Log level
 * @param message - Base message
 * @param secretType - Type of secret to embed
 * @returns Log message with embedded secret
 */
export function createLogWithSecret(
  level: string,
  message: string,
  secretType: keyof typeof TEST_SECRETS
): string {
  const secret = TEST_SECRETS[secretType];
  return `[${level.toUpperCase()}] ${message}: ${secret}`;
}

/**
 * Verify that logger output properly masks secrets
 * @param logOutput - Captured logger output
 * @param secretType - Type of secret that should be masked
 */
export function assertLogSecretMasked(
  logOutput: string,
  secretType: keyof typeof TEST_SECRETS
): void {
  const secret = TEST_SECRETS[secretType];
  const expectedMask = EXPECTED_REDACTED[secretType];

  // Should not contain the original secret
  if (logOutput.includes(secret)) {
    throw new Error(`Log output contains unmasked secret: ${secret}`);
  }

  // Should contain the masked version
  if (!logOutput.includes(expectedMask)) {
    throw new Error(`Log output does not contain expected mask: ${expectedMask}`);
  }
}
