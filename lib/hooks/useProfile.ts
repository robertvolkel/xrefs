'use client';

import { useAuth } from '@/components/AuthProvider';

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: 'user' | 'admin';
  disabled: boolean;
  created_at: string;
}

export function useProfile() {
  const { profile, isAdmin, loading } = useAuth();

  return {
    profile,
    isAdmin,
    loading,
  };
}
