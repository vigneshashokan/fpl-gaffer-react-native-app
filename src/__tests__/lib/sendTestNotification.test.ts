import * as Notifications from 'expo-notifications';
import { sendTestNotification } from '@/lib/notifications/sendTestNotification';

describe('sendTestNotification (dev harness)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('schedules a local notification carrying the deep-link payload in data', async () => {
    await sendTestNotification({
      title: 'Deadline soon',
      body: 'GW1 deadline in 1h',
      url: '/(home)/(tabs)/transfer',
      type: 'deadline',
    });
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith({
      content: {
        title: 'Deadline soon',
        body: 'GW1 deadline in 1h',
        data: { url: '/(home)/(tabs)/transfer', type: 'deadline' },
      },
      trigger: { type: 'timeInterval', seconds: 4 },
    });
  });

  it('uses an immediate (null) trigger when delaySeconds is 0', async () => {
    await sendTestNotification(
      { title: 't', body: 'b', url: '/(home)/(tabs)/team', type: 'gw_confirm' },
      0,
    );
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({ trigger: null }),
    );
  });
});
