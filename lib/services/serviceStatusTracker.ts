/**
 * Service Status Tracker — Request-scoped failure tracking
 *
 * Uses AsyncLocalStorage so concurrent requests don't cross-contaminate.
 * API route handlers call runWithServiceTracking() to create a scope,
 * then catch blocks call reportServiceFailure() as a side effect.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import type { ServiceName, ServiceSeverity, ServiceWarning } from '../types';

interface RequestServiceStore {
  warnings: Map<ServiceName, ServiceWarning>;
}

const asyncLocalStorage = new AsyncLocalStorage<RequestServiceStore>();

/** Wrap an API route handler to enable service status tracking. */
export function runWithServiceTracking<T>(fn: () => T | Promise<T>): T | Promise<T> {
  return asyncLocalStorage.run({ warnings: new Map() }, fn);
}

/** Record a service failure. Safe to call from any catch block — no-op if not in a tracked scope. */
export function reportServiceFailure(
  service: ServiceName,
  severity: ServiceSeverity,
  message: string,
): void {
  const store = asyncLocalStorage.getStore();
  if (!store) return;
  const existing = store.warnings.get(service);
  // Keep the most severe warning per service
  if (!existing || severity === 'unavailable') {
    store.warnings.set(service, { service, severity, message });
  }
}

/** Collect all warnings for the current request. */
export function getServiceWarnings(): ServiceWarning[] {
  const store = asyncLocalStorage.getStore();
  if (!store) return [];
  return Array.from(store.warnings.values());
}
