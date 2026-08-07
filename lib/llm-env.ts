/**
 * North / LLM environment config. Server-only.
 * Reads process.env at request time so Railway dashboard variables work in production
 * (no NEXT_PUBLIC_ prefix, no build-time inlining required).
 */

const DEFAULT_HOST = 'zhoom.democloud.cohere.com';

function read(name: string): string | undefined {
  const value = process.env[name];
  if (value == null) return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

/** Strip accidental https:// or trailing slashes from NORTH_HOST. */
export function northHost(): string {
  const raw = read('NORTH_HOST') ?? DEFAULT_HOST;
  return raw.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
}

export function northToken(): string | undefined {
  return read('NORTH_TOKEN');
}

export function llmEnabled(): boolean {
  if (read('LLM_ENABLED') === '0') return false;
  return Boolean(northToken());
}

export function northIapHeaders(): Record<string, string> | null {
  const header = read('NORTH_IAP_HEADER');
  const token = read('NORTH_IAP_TOKEN');
  if (!header || !token) return null;
  return { [header]: token };
}

/** Safe summary for /api/llm/status — never includes secrets. */
export function llmConfigStatus() {
  const token = northToken();
  const iap = northIapHeaders();
  return {
    enabled: llmEnabled(),
    host: northHost(),
    hasToken: Boolean(token),
    iapConfigured: Boolean(iap),
    source: process.env.RAILWAY_ENVIRONMENT ? 'railway' : process.env.NODE_ENV ?? 'development',
  };
}
