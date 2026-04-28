'use client';

import { useCallback, useRef, useState } from 'react';
import { ManufacturerProfile } from '@/lib/types';
import { fetchManufacturerProfile } from '@/lib/api';

export type MfrProfileSource = 'atlas' | 'mock' | 'unknown';

interface ManufacturerProfileResult {
  mfrProfile: ManufacturerProfile | null;
  mfrSource: MfrProfileSource;
  mfrLoading: boolean;
  chatManuallyCollapsed: boolean;
  chatCollapsed: boolean;
  mfrOpen: boolean;
  handleManufacturerClick: (manufacturer: string) => void;
  handleExpandChat: () => void;
  clearManualCollapse: () => void;
  reset: () => void;
}

type FetchResult = Awaited<ReturnType<typeof fetchManufacturerProfile>>;
type CacheEntry = FetchResult | Promise<FetchResult>;

function placeholderProfile(name: string): ManufacturerProfile {
  return {
    id: name,
    name,
    headquarters: '',
    country: '',
    countryFlag: '',
    isSecondSource: false,
    productCategories: [],
    certifications: [],
    designResources: [],
    manufacturingLocations: [],
    authorizedDistributors: [],
    complianceFlags: [],
    summary: '',
  };
}

function isPromise(v: CacheEntry | undefined): v is Promise<FetchResult> {
  return !!v && typeof (v as Promise<FetchResult>).then === 'function';
}

export function useManufacturerProfile(): ManufacturerProfileResult {
  const [mfrProfile, setMfrProfile] = useState<ManufacturerProfile | null>(null);
  const [mfrSource, setMfrSource] = useState<MfrProfileSource>('unknown');
  const [mfrLoading, setMfrLoading] = useState(false);
  const [chatManuallyCollapsed, setChatManuallyCollapsed] = useState(false);
  const requestIdRef = useRef(0);
  // Session-scoped cache: lowercased trimmed MFR name → resolved entry or in-flight Promise.
  const cacheRef = useRef<Map<string, CacheEntry>>(new Map());

  // Auto-collapse decision is moved to the layout consumer — it knows whether
  // the recs panel is also visible (4-panel crowding scenario). This flag only
  // reflects an explicit user action via the hamburger.
  const chatCollapsed = chatManuallyCollapsed;
  const mfrOpen = mfrProfile !== null;

  const applyResult = useCallback((reqId: number, result: FetchResult) => {
    if (reqId !== requestIdRef.current) return;
    if (result) {
      setMfrProfile(result.profile);
      setMfrSource(result.source);
    } else {
      setMfrSource('unknown');
    }
    setMfrLoading(false);
  }, []);

  const handleManufacturerClick = useCallback((manufacturer: string) => {
    const reqId = ++requestIdRef.current;
    const key = manufacturer.trim().toLowerCase();
    setMfrProfile(placeholderProfile(manufacturer));
    setMfrSource('unknown');
    setMfrLoading(true);

    const cached = cacheRef.current.get(key);
    if (cached !== undefined && !isPromise(cached)) {
      // Synchronous cache hit — apply on next microtask so the placeholder
      // render commits first (avoids one-frame flicker between old + new).
      Promise.resolve().then(() => applyResult(reqId, cached));
      return;
    }

    const pending: Promise<FetchResult> = isPromise(cached)
      ? cached
      : fetchManufacturerProfile(manufacturer)
          .then(result => {
            cacheRef.current.set(key, result);
            return result;
          })
          .catch(err => {
            console.error('useManufacturerProfile: fetch failed', err);
            cacheRef.current.delete(key);
            return null;
          });

    if (!isPromise(cached)) cacheRef.current.set(key, pending);
    void pending.then(result => applyResult(reqId, result));
  }, [applyResult]);

  const handleExpandChat = useCallback(() => {
    setChatManuallyCollapsed(false);
    setMfrProfile(null);
    setMfrSource('unknown');
    setMfrLoading(false);
    requestIdRef.current++;
  }, []);

  const clearManualCollapse = useCallback(() => {
    setChatManuallyCollapsed(false);
  }, []);

  const reset = useCallback(() => {
    setMfrProfile(null);
    setMfrSource('unknown');
    setMfrLoading(false);
    setChatManuallyCollapsed(false);
    requestIdRef.current++;
  }, []);

  return {
    mfrProfile,
    mfrSource,
    mfrLoading,
    chatManuallyCollapsed,
    chatCollapsed,
    mfrOpen,
    handleManufacturerClick,
    handleExpandChat,
    clearManualCollapse,
    reset,
  };
}
