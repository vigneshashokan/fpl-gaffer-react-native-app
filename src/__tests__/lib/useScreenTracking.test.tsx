import { renderHook } from '@testing-library/react-native';

const mockTrack = jest.fn();
let mockPathname = '/(home)/(tabs)/team';

jest.mock('@/lib/analytics', () => ({
  __esModule: true,
  track: (...args: unknown[]) => mockTrack(...args),
  posthog: { reloadFeatureFlagsAsync: jest.fn().mockResolvedValue({}) },
}));

jest.mock('expo-router', () => ({
  __esModule: true,
  usePathname: () => mockPathname,
}));

import { useScreenTracking, normalizeScreen } from '@/lib/analytics/provider';

describe('useScreenTracking', () => {
  beforeEach(() => jest.clearAllMocks());

  it('fires screen_viewed for the current pathname on mount', () => {
    renderHook(() => useScreenTracking());
    expect(mockTrack).toHaveBeenCalledWith('screen_viewed', {
      screen: '/(home)/(tabs)/team',
    });
  });

  it('fires screen_viewed again when the pathname changes', () => {
    const { rerender } = renderHook(() => useScreenTracking());
    mockTrack.mockClear();
    mockPathname = '/(home)/(tabs)/transfer';
    rerender({});
    expect(mockTrack).toHaveBeenCalledWith('screen_viewed', {
      screen: '/(home)/(tabs)/transfer',
    });
  });
});

describe('normalizeScreen', () => {
  it('replaces pure-numeric path segments with [id]', () => {
    expect(normalizeScreen('/(home)/player/42')).toBe('/(home)/player/[id]');
  });

  it('leaves paths with no numeric segment unchanged', () => {
    expect(normalizeScreen('/(home)/(tabs)/team')).toBe('/(home)/(tabs)/team');
  });
});
