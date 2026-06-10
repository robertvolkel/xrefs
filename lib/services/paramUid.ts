/**
 * Deterministic short UID for an unmapped-param name.
 *
 * FNV-1a 32-bit hash printed as 6 hex chars with a "TR-" prefix. The same
 * input always yields the same UID across sessions, machines, the client,
 * AND the server, so engineers can copy/paste "TR-a8f2c1" (from a Slack
 * thread, a ticket, an earlier debug session) into the Triage search box and
 * the row resolves consistently.
 *
 * This was originally defined (and exported) in GlobalUnmappedParamsTable.tsx.
 * It now lives here so the SERVER-SIDE Triage search (search-by-UID in
 * lib/services/triageQueueQuery.ts) uses the byte-for-byte identical
 * implementation — any divergence would break paste-a-UID search.
 *
 * 6 hex chars = 16M slots — collision probability under our queue size
 * (~14–20K paramNames) is negligible. No DB / migration needed because the
 * input itself (the paramName string) is the canonical identity.
 */
export function paramUid(paramName: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < paramName.length; i++) {
    h ^= paramName.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return 'TR-' + (h >>> 0).toString(16).padStart(8, '0').slice(-6);
}
