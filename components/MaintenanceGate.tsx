'use client';

import { useEffect, useRef, useState } from 'react';
import { Box } from '@mui/material';
import { useAuth } from '@/components/AuthProvider';
import MaintenanceScreen from '@/components/MaintenanceScreen';

const POLL_MS = 30_000;

/**
 * Watches the global maintenance flag and, when it's ON:
 *  - blocks regular signed-in users with a full-screen notice, and
 *  - lets admins keep working (they see a small "maintenance is on" ribbon).
 *
 * Signed-out visitors and users whose auth is still resolving pass straight
 * through, so an admin can always reach the login screen during maintenance.
 * Mounted once in the root layout, wrapping the whole app.
 */
export default function MaintenanceGate({ children }: { children: React.ReactNode }) {
  const { user, isAdmin, loading } = useAuth();
  const [maintenance, setMaintenance] = useState(false);
  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = false;
    // Non-async + promise chain so the setState lands in a .then callback
    // (external-system update), matching the app's other polling effects.
    const poll = () => {
      fetch('/api/maintenance/status', { cache: 'no-store' })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!cancelled.current && data) {
            setMaintenance(data.maintenance === true);
          }
        })
        .catch(() => {
          // Network blip — keep current state; the next poll retries.
        });
    };

    poll();
    const interval = setInterval(poll, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') poll();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', poll);
    return () => {
      cancelled.current = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', poll);
    };
  }, []);

  // Block only a resolved, signed-in, non-admin user. `loading` and signed-out
  // both pass through (never flash the block; admins reach login).
  const blockUser = maintenance && !loading && !!user && !isAdmin;
  if (blockUser) {
    return <MaintenanceScreen />;
  }

  return (
    <>
      {children}
      {maintenance && isAdmin && <AdminMaintenanceRibbon />}
    </>
  );
}

/** Small, unobtrusive banner so admins know users are seeing the block. */
function AdminMaintenanceRibbon() {
  return (
    <Box
      role="status"
      sx={{
        position: 'fixed',
        bottom: 12,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: (theme) => theme.zIndex.snackbar,
        px: 2,
        py: 0.75,
        borderRadius: 2,
        bgcolor: 'warning.main',
        color: 'warning.contrastText',
        fontSize: '0.8rem',
        fontWeight: 600,
        boxShadow: 3,
        pointerEvents: 'none',
      }}
    >
      🔧 Maintenance mode is ON — users see the maintenance screen
    </Box>
  );
}
