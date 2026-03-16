'use client';

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import type { ServiceWarning, ServiceName } from '@/lib/types';
import { onServiceWarnings, onServiceRecoveries } from '@/lib/api';

interface ServiceStatusState {
  /** Current active warnings, keyed by service name */
  warnings: Map<ServiceName, ServiceWarning>;
  /** Services the user has manually dismissed (until status changes) */
  dismissed: Set<ServiceName>;
}

interface ServiceStatusContextValue {
  /** Active, non-dismissed warnings */
  activeWarnings: ServiceWarning[];
  /** Report new warnings (called automatically by api.ts event emitter) */
  reportWarnings: (warnings: ServiceWarning[]) => void;
  /** Clear a specific service warning (recovery) */
  clearService: (service: ServiceName) => void;
  /** User dismissed the banner for a service */
  dismissService: (service: ServiceName) => void;
  /** Dismiss all active warnings at once */
  dismissAll: () => void;
}

const ServiceStatusContext = createContext<ServiceStatusContextValue | null>(null);

export function ServiceStatusProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ServiceStatusState>({
    warnings: new Map(),
    dismissed: new Set(),
  });

  const reportWarnings = useCallback((warnings: ServiceWarning[]) => {
    setState((prev) => {
      const next = new Map(prev.warnings);
      const nextDismissed = new Set(prev.dismissed);

      for (const w of warnings) {
        const existing = next.get(w.service);
        // If severity changed, un-dismiss (re-show banner)
        if (existing && existing.severity !== w.severity) {
          nextDismissed.delete(w.service);
        }
        // New warning for a previously-unseen service
        if (!existing) {
          nextDismissed.delete(w.service);
        }
        next.set(w.service, w);
      }

      return { warnings: next, dismissed: nextDismissed };
    });
  }, []);

  const clearService = useCallback((service: ServiceName) => {
    setState((prev) => {
      if (!prev.warnings.has(service)) return prev;
      const next = new Map(prev.warnings);
      next.delete(service);
      const nextDismissed = new Set(prev.dismissed);
      nextDismissed.delete(service);
      return { warnings: next, dismissed: nextDismissed };
    });
  }, []);

  const dismissService = useCallback((service: ServiceName) => {
    setState((prev) => {
      const nextDismissed = new Set(prev.dismissed);
      nextDismissed.add(service);
      return { ...prev, dismissed: nextDismissed };
    });
  }, []);

  const dismissAll = useCallback(() => {
    setState((prev) => {
      const nextDismissed = new Set(prev.dismissed);
      for (const service of prev.warnings.keys()) {
        nextDismissed.add(service);
      }
      return { ...prev, dismissed: nextDismissed };
    });
  }, []);

  // Subscribe to api.ts event emitters
  useEffect(() => {
    const unsubWarnings = onServiceWarnings((warnings) => {
      reportWarnings(warnings);
    });
    const unsubRecoveries = onServiceRecoveries((services) => {
      for (const service of services) {
        clearService(service);
      }
    });
    return () => {
      unsubWarnings();
      unsubRecoveries();
    };
  }, [reportWarnings, clearService]);

  const activeWarnings = Array.from(state.warnings.values())
    .filter((w) => !state.dismissed.has(w.service));

  return (
    <ServiceStatusContext.Provider
      value={{ activeWarnings, reportWarnings, clearService, dismissService, dismissAll }}
    >
      {children}
    </ServiceStatusContext.Provider>
  );
}

export function useServiceStatus() {
  const ctx = useContext(ServiceStatusContext);
  if (!ctx) throw new Error('useServiceStatus must be used within ServiceStatusProvider');
  return ctx;
}
