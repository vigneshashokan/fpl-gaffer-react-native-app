import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';

export type ProfileStatus = 'loading' | 'pending_deletion' | 'missing' | 'complete';

export function useProfileGate(): { status: ProfileStatus; refetch: () => void } {
  const session = useAuthStore((s) => s.session);
  const hydrated = useAuthStore((s) => s.hydrated);
  const [status, setStatus] = useState<ProfileStatus>('loading');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!hydrated) return;
    if (!session) {
      setStatus('loading');
      return;
    }
    setStatus('loading');

    const userId = session.user.id;
    let cancelled = false;

    Promise.all([
      supabase.from('profiles').select('user_id').eq('user_id', userId).maybeSingle(),
      supabase.from('account_deletions').select('user_id').eq('user_id', userId).maybeSingle(),
    ])
      .then(([profile, deletion]) => {
        if (cancelled) return;
        // pending_deletion wins over both other states.
        if (deletion.data) {
          setStatus('pending_deletion');
          return;
        }
        setStatus(profile.data ? 'complete' : 'missing');
      })
      .catch(() => {
        // If either query throws (e.g. network error), leave status as
        // 'loading' so the gate stays in its safe default state.
      });

    return () => {
      cancelled = true;
    };
  }, [hydrated, session, tick]);

  return { status, refetch: () => setTick((t) => t + 1) };
}
