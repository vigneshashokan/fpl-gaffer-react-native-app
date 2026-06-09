jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(() => Promise.resolve(null)),
    setItem: jest.fn(() => Promise.resolve()),
    removeItem: jest.fn(() => Promise.resolve()),
  },
}));

const mockMaybeSingle = jest.fn();
const mockEq = jest.fn((_col: string, _val: unknown) => ({ maybeSingle: mockMaybeSingle }));
const mockSelect = jest.fn((_cols: string) => ({ eq: mockEq }));
const mockFrom = jest.fn((_table: string) => ({ select: mockSelect }));

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: jest.fn(() => ({ data: { subscription: { unsubscribe: jest.fn() } } })),
      getSession: jest.fn(() => Promise.resolve({ data: { session: null }, error: null })),
      signOut: jest.fn(),
    },
    from: ((table: string) => mockFrom(table)) as never,
  },
}));

import { renderHook, waitFor } from '@testing-library/react-native';
import { act } from 'react';
import { useAuthStore } from '../store/authStore';
import { useProfileGate } from '../lib/useProfileGate';

const fakeSession = { user: { id: 'u1' }, access_token: 't' };

describe('useProfileGate', () => {
  beforeEach(() => {
    mockMaybeSingle.mockReset();
    mockEq.mockClear();
    mockSelect.mockClear();
    mockFrom.mockClear();
    act(() => useAuthStore.setState({ session: null, hydrated: true }));
  });

  it('stays loading while auth is unhydrated', () => {
    act(() => useAuthStore.setState({ session: null, hydrated: false }));
    const { result } = renderHook(() => useProfileGate());
    expect(result.current.status).toBe('loading');
  });

  it('stays loading when there is no session', async () => {
    const { result } = renderHook(() => useProfileGate());
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current.status).toBe('loading');
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('resolves to missing when there is a session and no profile row', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    act(() => useAuthStore.setState({ session: fakeSession as never, hydrated: true }));
    const { result } = renderHook(() => useProfileGate());
    await waitFor(() => expect(result.current.status).toBe('missing'));
    expect(mockFrom).toHaveBeenCalledWith('profiles');
    expect(mockEq).toHaveBeenCalledWith('user_id', 'u1');
  });

  it('resolves to complete when a profile row is returned', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { user_id: 'u1' }, error: null });
    act(() => useAuthStore.setState({ session: fakeSession as never, hydrated: true }));
    const { result } = renderHook(() => useProfileGate());
    await waitFor(() => expect(result.current.status).toBe('complete'));
  });

  it('refetch() re-runs the query', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    act(() => useAuthStore.setState({ session: fakeSession as never, hydrated: true }));
    const { result } = renderHook(() => useProfileGate());
    await waitFor(() => expect(result.current.status).toBe('missing'));
    mockMaybeSingle.mockResolvedValueOnce({ data: { user_id: 'u1' }, error: null });
    act(() => result.current.refetch());
    await waitFor(() => expect(result.current.status).toBe('complete'));
  });
});
