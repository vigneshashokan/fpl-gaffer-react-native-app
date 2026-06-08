import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';

export type ProfileStatus = 'loading' | 'missing' | 'complete';

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
    supabase
      .from('profiles')
      .select('user_id')
      .eq('user_id', session.user.id)
      .maybeSingle()
      .then(({ data }) => setStatus(data ? 'complete' : 'missing'));
  }, [hydrated, session, tick]);

  return { status, refetch: () => setTick((t) => t + 1) };
}
