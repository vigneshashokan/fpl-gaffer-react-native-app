// src/lib/auth/authCacheClear.tsx
//
// Side-effect component (renders null). Subscribes to supabase auth state
// changes and clears the entire TanStack QueryClient on SIGNED_OUT,
// SIGNED_IN, and USER_UPDATED. Prevents user A's cached data from leaking
// to user B on the same device.
//
// We deliberately clear on SIGNED_IN too: cold-start hydration fires
// SIGNED_IN once, but the cache is already empty at that point; for
// subsequent in-app account switches it nukes any user-A entries before
// user B's queries fire. TOKEN_REFRESHED and INITIAL_SESSION are left
// alone — same user, cache is still valid.

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

const CLEAR_ON: ReadonlySet<string> = new Set([
  'SIGNED_OUT',
  'SIGNED_IN',
  'USER_UPDATED',
]);

export function AuthCacheClear() {
  const client = useQueryClient();
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (CLEAR_ON.has(event)) client.clear();
    });
    return () => subscription.unsubscribe();
  }, [client]);
  return null;
}
