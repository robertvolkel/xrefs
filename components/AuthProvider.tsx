'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import type { Profile } from '@/lib/hooks/useProfile';

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  isAdmin: boolean;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  isAdmin: false,
  loading: true,
});

export function useAuth() {
  return useContext(AuthContext);
}

export default function AuthProvider({
  children,
  initialUser,
  initialProfile,
}: {
  children: React.ReactNode;
  initialUser: User | null;
  initialProfile: Profile | null;
}) {
  const [user, setUser] = useState<User | null>(initialUser);
  const [profile, setProfile] = useState<Profile | null>(initialProfile);
  const [loading, setLoading] = useState(!initialUser);

  // Fetch profile when user changes (e.g., auth state change after initial load)
  useEffect(() => {
    if (!user) {
      setProfile(null);
      return;
    }
    // Skip fetch if we already have the profile for this user (from SSR or previous fetch)
    if (profile?.id === user.id) return;

    const supabase = createClient();
    supabase
      .from('profiles')
      .select('id, email, full_name, role, disabled, created_at')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        setProfile(data as Profile | null);
      });
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    try {
      const supabase = createClient();
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        (_event, session) => {
          setUser(session?.user ?? null);
          setLoading(false);
        }
      );

      return () => subscription.unsubscribe();
    } catch {
      // Supabase not configured — stay with initialUser
      setLoading(false);
    }
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      profile,
      isAdmin: profile?.role === 'admin',
      loading,
    }}>
      {children}
    </AuthContext.Provider>
  );
}
