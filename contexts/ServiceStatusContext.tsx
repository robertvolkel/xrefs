'use client';

import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import type { ServiceWarning, ServiceName, ServiceStatusInfo, ServiceStatusLevel } from '@/lib/types';
import { onServiceWarnings, onServiceRecoveries, fetchHealthStatus } from '@/lib/api';

const ALL_SERVICES: ServiceName[] = ['digikey', 'partsio', 'mouser', 'anthropic', 'supabase'];

function makeInitialMap(): Map<ServiceName, ServiceStatusInfo> {
  const map = new Map<ServiceName, ServiceStatusInfo>();
  for (const service of ALL_SERVICES) {
    map.set(service, { service, status: 'unknown' });
  }
  return map;
}

/** Compute aggregate: worst status across all services */
function computeAggregate(services: Map<ServiceName, ServiceStatusInfo>): ServiceStatusLevel {
  let hasUnknown = false;
  let hasDegraded = false;
  for (const info of services.values()) {
    if (info.status === 'unavailable') return 'unavailable';
    if (info.status === 'degraded') hasDegraded = true;
    if (info.status === 'unknown') hasUnknown = true;
  }
  if (hasDegraded) return 'degraded';
  if (hasUnknown) return 'unknown';
  return 'operational';
}

interface ServiceStatusContextValue {
  /** Status for all services */
  services: ServiceStatusInfo[];
  /** Worst-of-all aggregate status */
  aggregateStatus: ServiceStatusLevel;
  /** True when actively fetching health */
  checking: boolean;
  /** Trigger a manual health check */
  refresh: () => void;
  /** Active warnings (backward compat for ServiceStatusBanner) */
  activeWarnings: ServiceWarning[];
}

const ServiceStatusContext = createContext<ServiceStatusContextValue | null>(null);

export function ServiceStatusProvider({ children }: { children: ReactNode }) {
  const [statusMap, setStatusMap] = useState<Map<ServiceName, ServiceStatusInfo>>(makeInitialMap);
  const [checking, setChecking] = useState(false);
  const mountedRef = useRef(true);

  // Fetch health and update the status map
  const fetchAndUpdate = useCallback(async () => {
    setChecking(true);
    try {
      const results = await fetchHealthStatus();
      if (!mountedRef.current) return;
      setStatusMap((prev) => {
        const next = new Map(prev);
        for (const info of results) {
          next.set(info.service, info);
        }
        return next;
      });
    } catch {
      // Health endpoint itself failed — don't crash, keep existing state
    } finally {
      if (mountedRef.current) setChecking(false);
    }
  }, []);

  // Initial health check on mount
  useEffect(() => {
    mountedRef.current = true;
    fetchAndUpdate();
    return () => { mountedRef.current = false; };
  }, [fetchAndUpdate]);

  // Subscribe to reactive warning/recovery events from fetchApi
  useEffect(() => {
    const now = () => new Date().toISOString();

    const unsubWarnings = onServiceWarnings((warnings) => {
      setStatusMap((prev) => {
        const next = new Map(prev);
        for (const w of warnings) {
          next.set(w.service, {
            service: w.service,
            status: w.severity, // 'degraded' | 'unavailable' maps directly
            message: w.message,
            lastChecked: now(),
          });
        }
        return next;
      });
    });

    const unsubRecoveries = onServiceRecoveries((services) => {
      setStatusMap((prev) => {
        const next = new Map(prev);
        for (const service of services) {
          next.set(service, {
            service,
            status: 'operational',
            lastChecked: now(),
          });
        }
        return next;
      });
    });

    return () => {
      unsubWarnings();
      unsubRecoveries();
    };
  }, []);

  const services = Array.from(statusMap.values());
  const aggregateStatus = computeAggregate(statusMap);

  // Backward compat: convert non-operational services to ServiceWarning[]
  const activeWarnings: ServiceWarning[] = services
    .filter((s) => s.status === 'degraded' || s.status === 'unavailable')
    .map((s) => ({
      service: s.service,
      severity: s.status as 'degraded' | 'unavailable',
      message: s.message ?? `${s.service} is ${s.status}`,
    }));

  return (
    <ServiceStatusContext.Provider
      value={{ services, aggregateStatus, checking, refresh: fetchAndUpdate, activeWarnings }}
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
