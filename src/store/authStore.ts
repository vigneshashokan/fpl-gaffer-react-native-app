import { create } from 'zustand';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { identify, reset, track } from '@/lib/analytics';

interface AuthState {
  session: Session | null;
  hydrated: boolean;
  signOut: () => Promise<void>;
}

// Mirrors auth lifecycle into analytics: stitch identity across sessions on
// sign-in, clear it on sign-out, and record the sign_in funnel event. Exported
// so it can be unit-tested without the module-init subscription.
export function handleAuthChange(event: AuthChangeEvent, session: Session | null): void {
  if (event === 'SIGNED_IN' && session) {
    identify(session.user.id);
    const provider = (session.user.app_metadata?.provider as string | undefined) ?? 'unknown';
    track('sign_in', { provider });
  }
  if (event === 'SIGNED_OUT') {
    reset();
  }
}

export const useAuthStore = create<AuthState>((set) => {
  // Subscribe once at module init.
  supabase.auth.onAuthStateChange((event, session) => {
    set({ session, hydrated: true });
    handleAuthChange(event, session);
  });

  // Resolve current session so cold-start doesn't wait for an event.
  // If the stored refresh token is invalid (revoked / expired / cleared
  // server-side), `getSession` rejects via Supabase auto-refresh. Catch it
  // and degrade gracefully to signed-out; clear any stale local session.
  const handleSessionError = async (err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[authStore] getSession failed, treating as signed out:', message);
    // Local-only sign-out: drops the stored session without trying to
    // invalidate on the server (which would fail too).
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch {
      /* swallow — already in failure recovery */
    }
    set({ session: null, hydrated: true });
  };

  supabase.auth
    .getSession()
    .then(({ data, error }) => {
      if (error) {
        handleSessionError(error);
        return;
      }
      set({ session: data.session, hydrated: true });
    })
    .catch(handleSessionError);

  return {
    session: null,
    hydrated: false,
    signOut: async () => {
      await supabase.auth.signOut();
    },
  };
});
