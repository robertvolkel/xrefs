'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { createClient } from '@/lib/supabase/client';

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: 'user' | 'admin';
  disabled: boolean;
  created_at: string;
}

export function useProfile() {
  const { user, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      setProfile(null);
      setLoading(false);
      return;
    }

    const supabase = createClient();
    supabase
      .from('profiles')
      .select('id, email, full_name, role, disabled, created_at')
      .eq('id', user.id)
      .single()
      .then(({ data, error }) => {
        if (error || !data) {
          setProfile(null);
        } else {
          setProfile(data as Profile);
        }
        setLoading(false);
      });
  }, [user, authLoading]);

  return {
    profile,
    isAdmin: profile?.role === 'admin',
    loading: authLoading || loading,
  };
}
