import { renderHook } from '@testing-library/react-native';

const mockPush = jest.fn();
const mockTrack = jest.fn();
jest.mock('expo-router', () => ({ __esModule: true, router: { push: (...a: unknown[]) => mockPush(...a) } }));
jest.mock('@/lib/analytics', () => ({ __esModule: true, track: (...a: unknown[]) => mockTrack(...a) }));

import * as Notifications from 'expo-notifications';
import { useNotificationDeepLinks } from '@/lib/notifications/useNotificationDeepLinks';

function responseWith(data: Record<string, unknown>, id = 'n-1') {
  return { notification: { request: { identifier: id, content: { data } } }, actionIdentifier: 'expo.modules.notifications.actions.DEFAULT' };
}

describe('useNotificationDeepLinks', () => {
  beforeEach(() => jest.clearAllMocks());

  it('routes to data.url and tracks notification_opened on a tap', () => {
    (Notifications.useLastNotificationResponse as jest.Mock).mockReturnValue(
      responseWith({ url: '/(home)/(tabs)/transfer', type: 'deadline' }),
    );
    renderHook(() => useNotificationDeepLinks());
    expect(mockPush).toHaveBeenCalledWith('/(home)/(tabs)/transfer');
    expect(mockTrack).toHaveBeenCalledWith('notification_opened', { type: 'deadline' });
  });

  it('no-ops when there is no url in data', () => {
    (Notifications.useLastNotificationResponse as jest.Mock).mockReturnValue(responseWith({ foo: 'bar' }, 'n-2'));
    renderHook(() => useNotificationDeepLinks());
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('no-ops when there is no response', () => {
    (Notifications.useLastNotificationResponse as jest.Mock).mockReturnValue(null);
    renderHook(() => useNotificationDeepLinks());
    expect(mockPush).not.toHaveBeenCalled();
  });
});
