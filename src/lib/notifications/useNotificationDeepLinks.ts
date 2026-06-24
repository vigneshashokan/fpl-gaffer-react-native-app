import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { router, type Href } from 'expo-router';
import { track } from '@/lib/analytics';

// Routes a tapped notification to data.url (covers cold-start + warm taps via
// useLastNotificationResponse). Guards against re-handling the same response on
// re-render by its notification identifier.
export function useNotificationDeepLinks(): void {
  const response = Notifications.useLastNotificationResponse();
  const handledId = useRef<string | null>(null);

  useEffect(() => {
    if (!response) return;
    const id = response.notification.request.identifier;
    if (handledId.current === id) return;
    handledId.current = id;

    const data = response.notification.request.content.data as { url?: string; type?: string };
    if (typeof data?.url === 'string') {
      track('notification_opened', { type: typeof data.type === 'string' ? data.type : 'unknown' });
      router.push(data.url as Href);
    }
  }, [response]);
}
