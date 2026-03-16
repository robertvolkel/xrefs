import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Loads .env.local from the project root into process.env.
 * Skips if env vars are already set (e.g., injected by Claude Desktop config).
 */
export function loadEnvLocal(): void {
  // If a key env var is already set, assume all are provided externally
  if (process.env.DIGIKEY_CLIENT_ID) return;

  const envPath = resolve(process.cwd(), '.env.local');
  try {
    const content = readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // .env.local doesn't exist — env vars must be set externally
  }
}
