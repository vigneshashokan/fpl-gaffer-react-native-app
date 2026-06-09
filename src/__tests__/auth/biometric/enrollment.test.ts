const mockIsSupported = jest.fn();
const mockPromptBiometric = jest.fn();
const mockGetSession = jest.fn();
const mockSaveSession = jest.fn();
const mockSetItem = jest.fn();

jest.mock('@/lib/auth/biometric/capability', () => ({
  __esModule: true,
  isSupported: () => mockIsSupported(),
  promptBiometric: (reason: string) => mockPromptBiometric(reason),
}));

jest.mock('@/lib/auth/biometric/storage', () => ({
  __esModule: true,
  saveSession: (s: unknown) => mockSaveSession(s),
}));

jest.mock('@/lib/supabase', () => ({
  __esModule: true,
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
    },
  },
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    setItem: (k: string, v: string) => mockSetItem(k, v),
  },
}));

import { enable } from '@/lib/auth/biometric/enrollment';

describe('enable', () => {
  beforeEach(() => {
    mockIsSupported.mockReset();
    mockPromptBiometric.mockReset();
    mockGetSession.mockReset();
    mockSaveSession.mockReset();
    mockSetItem.mockReset();
  });

  it('returns unsupported when device cannot do biometrics', async () => {
    mockIsSupported.mockResolvedValueOnce(false);
    const r = await enable();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('unsupported');
    expect(mockPromptBiometric).not.toHaveBeenCalled();
  });

  it('returns cancel when user dismisses the prompt', async () => {
    mockIsSupported.mockResolvedValueOnce(true);
    mockPromptBiometric.mockResolvedValueOnce({ ok: false, error: 'cancel' });
    const r = await enable();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('cancel');
    expect(mockGetSession).not.toHaveBeenCalled();
    expect(mockSaveSession).not.toHaveBeenCalled();
    expect(mockSetItem).not.toHaveBeenCalled();
  });

  it('returns no_session when supabase has no active session', async () => {
    mockIsSupported.mockResolvedValueOnce(true);
    mockPromptBiometric.mockResolvedValueOnce({ ok: true });
    mockGetSession.mockResolvedValueOnce({ data: { session: null }, error: null });
    const r = await enable();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('no_session');
    expect(mockSaveSession).not.toHaveBeenCalled();
    expect(mockSetItem).not.toHaveBeenCalled();
  });

  it('saves session to storage and flips the AsyncStorage flag on happy path', async () => {
    mockIsSupported.mockResolvedValueOnce(true);
    mockPromptBiometric.mockResolvedValueOnce({ ok: true });
    mockGetSession.mockResolvedValueOnce({
      data: {
        session: {
          access_token: 'aaa',
          refresh_token: 'rrr',
          user: { id: 'u1' },
        },
      },
      error: null,
    });
    mockSaveSession.mockResolvedValueOnce(undefined);
    mockSetItem.mockResolvedValueOnce(undefined);
    const r = await enable();
    expect(r.ok).toBe(true);
    expect(mockSaveSession).toHaveBeenCalledWith({
      access_token: 'aaa',
      refresh_token: 'rrr',
      user_id: 'u1',
    });
    expect(mockSetItem).toHaveBeenCalledWith('biometric_enabled', 'true');
  });

  it('passes "Confirm Face ID to enable" as the prompt reason', async () => {
    mockIsSupported.mockResolvedValueOnce(true);
    mockPromptBiometric.mockResolvedValueOnce({ ok: false, error: 'cancel' });
    await enable();
    expect(mockPromptBiometric).toHaveBeenCalledWith('Confirm Face ID to enable');
  });
});
