// Stub — real implementation added in Task 5 (notification_prefs API).
// This file exists so tests can mock it with jest.mock('@/api/notificationPrefs').

export function useNotificationPrefs() {
  return { data: undefined, isPending: true };
}

export function useUpdateNotificationPrefs() {
  return { mutate: () => {}, isError: false };
}
