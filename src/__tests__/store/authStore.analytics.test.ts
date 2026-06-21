const mockIdentify = jest.fn();
const mockReset = jest.fn();
const mockTrack = jest.fn();

jest.mock('@/lib/analytics', () => ({
  __esModule: true,
  identify: (...a: unknown[]) => mockIdentify(...a),
  reset: (...a: unknown[]) => mockReset(...a),
  track: (...a: unknown[]) => mockTrack(...a),
}));

// authStore subscribes to supabase at module init; stub the client so import is safe.
jest.mock('@/lib/supabase', () => ({
  __esModule: true,
  supabase: {
    auth: {
      onAuthStateChange: jest.fn(),
      getSession: jest.fn().mockResolvedValue({ data: { session: null }, error: null }),
      signOut: jest.fn().mockResolvedValue({ error: null }),
    },
  },
}));

import { handleAuthChange } from '@/store/authStore';

describe('handleAuthChange', () => {
  beforeEach(() => jest.clearAllMocks());

  it('identifies the user and tracks sign_in on SIGNED_IN', () => {
    handleAuthChange('SIGNED_IN', {
      user: { id: 'u-9', app_metadata: { provider: 'google' } },
    } as never);
    expect(mockIdentify).toHaveBeenCalledWith('u-9');
    expect(mockTrack).toHaveBeenCalledWith('sign_in', { provider: 'google' });
  });

  it('falls back to provider "unknown" when missing', () => {
    handleAuthChange('SIGNED_IN', { user: { id: 'u-1', app_metadata: {} } } as never);
    expect(mockTrack).toHaveBeenCalledWith('sign_in', { provider: 'unknown' });
  });

  it('resets identity on SIGNED_OUT', () => {
    handleAuthChange('SIGNED_OUT', null);
    expect(mockReset).toHaveBeenCalled();
    expect(mockIdentify).not.toHaveBeenCalled();
  });
});
