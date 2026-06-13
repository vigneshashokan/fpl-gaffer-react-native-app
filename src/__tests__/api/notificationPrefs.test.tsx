import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useNotificationPrefs,
  useUpdateNotificationPrefs,
} from '@/api/notificationPrefs';
import { queryKeys } from '@/api/queryKeys';

jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn() } }));
jest.mock('@/store/authStore', () => ({ useAuthStore: jest.fn() }));

import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';

function setSession(session: { user: { id: string } } | null) {
  (useAuthStore as unknown as jest.Mock).mockImplementation(
    (selector?: (s: unknown) => unknown) => {
      const state = { session };
      return selector ? selector(state) : state;
    },
  );
}

function wrapperWith(client: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

beforeEach(() => jest.clearAllMocks());

describe('useNotificationPrefs', () => {
  it('maps gw_confirm to gwConfirm', async () => {
    setSession({ user: { id: 'u1' } });
    const maybeSingle = jest.fn().mockResolvedValue({
      data: { deadlines: true, prices: false, gw_confirm: true, transfer: false },
      error: null,
    });
    (supabase.from as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ maybeSingle }) }),
    });

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useNotificationPrefs(), { wrapper: wrapperWith(client) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({
      deadlines: true, prices: false, gwConfirm: true, transfer: false,
    });
  });

  it('falls back to defaults when no row exists', async () => {
    setSession({ user: { id: 'u1' } });
    const maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });
    (supabase.from as jest.Mock).mockReturnValue({
      select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ maybeSingle }) }),
    });

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useNotificationPrefs(), { wrapper: wrapperWith(client) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({
      deadlines: true, prices: true, gwConfirm: true, transfer: false,
    });
  });
});

describe('useUpdateNotificationPrefs', () => {
  it('upserts a row with gw_confirm renamed from gwConfirm', async () => {
    setSession({ user: { id: 'u1' } });
    const upsert = jest.fn().mockResolvedValue({ error: null });
    (supabase.from as jest.Mock).mockReturnValue({ upsert });

    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const { result } = renderHook(() => useUpdateNotificationPrefs(), { wrapper: wrapperWith(client) });
    await act(async () => {
      await result.current.mutateAsync({ gwConfirm: false });
    });

    expect(supabase.from).toHaveBeenCalledWith('notification_prefs');
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'u1', gw_confirm: false }),
      { onConflict: 'user_id' },
    );
  });

  it('rolls back the optimistic cache update on error', async () => {
    setSession({ user: { id: 'u1' } });
    const upsert = jest.fn().mockResolvedValue({ error: { message: 'boom' } });
    (supabase.from as jest.Mock).mockReturnValue({ upsert });

    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const key = queryKeys.notificationPrefs('u1');
    const prev = { deadlines: true, prices: true, gwConfirm: true, transfer: false };
    client.setQueryData(key, prev);

    const { result } = renderHook(() => useUpdateNotificationPrefs(), { wrapper: wrapperWith(client) });
    await act(async () => {
      await result.current.mutateAsync({ transfer: true }).catch(() => {});
    });

    expect(client.getQueryData(key)).toEqual(prev);
  });
});
