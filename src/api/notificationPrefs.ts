// src/api/notificationPrefs.ts
//
// useNotificationPrefs() reads the current user's notification_prefs row;
// useUpdateNotificationPrefs() patches one or more channels with an
// optimistic cache update + rollback. Mirrors src/api/linkTeam.ts: user id
// comes from useAuthStore so the cache key matches per account.
//
// UI uses camelCase `gwConfirm`; the DB column is `gw_confirm`. The mapping
// lives entirely in this file so no component sees the snake_case name.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { queryKeys } from './queryKeys';

export interface NotificationPrefs {
  deadlines: boolean;
  prices: boolean;
  gwConfirm: boolean;
  transfer: boolean;
}

// Matches the DB column defaults (transfer defaults off — it's noisy).
// Exported so UI can show a stable fallback before the row loads without
// duplicating the default values.
export const DEFAULT_PREFS: NotificationPrefs = {
  deadlines: true,
  prices: true,
  gwConfirm: true,
  transfer: false,
};

interface PostgrestErrorShape {
  message: string;
  code?: string;
}

export function useNotificationPrefs() {
  const userId = useAuthStore((s) => s.session?.user.id);

  return useQuery({
    queryKey: queryKeys.notificationPrefs(userId ?? 'anon'),
    enabled: !!userId,
    staleTime: Infinity,
    queryFn: async (): Promise<NotificationPrefs> => {
      const { data, error } = await supabase
        .from('notification_prefs')
        .select('deadlines, prices, gw_confirm, transfer')
        .eq('user_id', userId!)
        .maybeSingle();
      if (error) throw error;
      if (!data) return DEFAULT_PREFS; // row created at profile completion; defensive fallback
      return {
        deadlines: data.deadlines,
        prices: data.prices,
        gwConfirm: data.gw_confirm,
        transfer: data.transfer,
      };
    },
  });
}

export function useUpdateNotificationPrefs() {
  const qc = useQueryClient();
  const userId = useAuthStore((s) => s.session?.user.id);
  const key = queryKeys.notificationPrefs(userId ?? 'anon');

  return useMutation<void, PostgrestErrorShape, Partial<NotificationPrefs>, { prev?: NotificationPrefs }>({
    mutationFn: async (patch) => {
      if (!userId) {
        throw new Error('No authenticated user') as unknown as PostgrestErrorShape;
      }
      const row: Record<string, unknown> = {
        user_id: userId,
        updated_at: new Date().toISOString(),
      };
      if ('deadlines' in patch) row.deadlines = patch.deadlines;
      if ('prices' in patch) row.prices = patch.prices;
      if ('gwConfirm' in patch) row.gw_confirm = patch.gwConfirm;
      if ('transfer' in patch) row.transfer = patch.transfer;

      // upsert (not update): self-heals if the row is somehow missing.
      const { error } = await supabase
        .from('notification_prefs')
        .upsert(row, { onConflict: 'user_id' });
      if (error) throw error as PostgrestErrorShape;
    },
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<NotificationPrefs>(key);
      if (prev) qc.setQueryData<NotificationPrefs>(key, { ...prev, ...patch });
      return { prev };
    },
    onError: (_err, _patch, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },
  });
}
