'use client';

import { useCallback, useState } from 'react';
import { ManufacturerProfile } from '@/lib/types';
import { getManufacturerProfile } from '@/lib/mockManufacturerData';

interface ManufacturerProfileResult {
  mfrProfile: ManufacturerProfile | null;
  chatManuallyCollapsed: boolean;
  chatCollapsed: boolean;
  mfrOpen: boolean;
  handleManufacturerClick: (manufacturer: string) => void;
  handleExpandChat: () => void;
  clearManualCollapse: () => void;
  reset: () => void;
}

export function useManufacturerProfile(): ManufacturerProfileResult {
  const [mfrProfile, setMfrProfile] = useState<ManufacturerProfile | null>(null);
  // Manual chat collapse via hamburger (independent of MFR profile)
  const [chatManuallyCollapsed, setChatManuallyCollapsed] = useState(false);
  const chatCollapsed = mfrProfile !== null || chatManuallyCollapsed;
  const mfrOpen = mfrProfile !== null;

  const handleManufacturerClick = useCallback((manufacturer: string) => {
    const profile = getManufacturerProfile(manufacturer);
    if (profile) setMfrProfile(profile);
  }, []);

  const handleExpandChat = useCallback(() => {
    setChatManuallyCollapsed(false);
    setMfrProfile(null);
  }, []);

  const clearManualCollapse = useCallback(() => {
    setChatManuallyCollapsed(false);
  }, []);

  const reset = useCallback(() => {
    setMfrProfile(null);
    setChatManuallyCollapsed(false);
  }, []);

  return {
    mfrProfile,
    chatManuallyCollapsed,
    chatCollapsed,
    mfrOpen,
    handleManufacturerClick,
    handleExpandChat,
    clearManualCollapse,
    reset,
  };
}
