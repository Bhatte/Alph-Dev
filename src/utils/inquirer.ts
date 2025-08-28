/**
 * Centralized dynamic import helper for the ESM-only 'inquirer' package.
 * Keeps CommonJS compatibility while avoiding duplicate code across commands.
 */
export async function getInquirer(): Promise<any> {
  const mod = await import('inquirer');
  // Prefer default export when available; fall back to the module itself.
  return (mod as any).default ?? (mod as any);
}
