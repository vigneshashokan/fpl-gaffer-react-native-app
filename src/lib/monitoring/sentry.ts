// src/lib/monitoring/sentry.ts
//
// Single crash-reporting egress, mirroring the analytics egress
// (src/lib/analytics/index.ts). Sentry.init runs as an import side effect; with
// no DSN the SDK is an inert no-op (tests/CI/Expo Go). PII is scrubbed in
// beforeSend before any event leaves the device. Always-on — NOT gated by the
// analytics-consent toggle (crash reporting is essential service).

import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

const DSN = Constants.expoConfig?.extra?.sentryDsn as string | undefined;

// Drop request/server metadata and clamp the user object to its id (never
// email/ip/username) before any event leaves the device.
export function scrubEvent(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  delete event.request;
  delete event.server_name;
  if (event.user) event.user = { id: event.user.id };
  return event;
}

// expo-router navigation instrumentation; registered with the container ref in
// src/app/_layout.tsx. Feeds route transactions into the light perf sample.
export const navigationIntegration = Sentry.reactNavigationIntegration({
  enableTimeToInitialDisplay: true,
});

Sentry.init({
  dsn: DSN,
  enabled: !!DSN,
  tracesSampleRate: 0.15,
  sendDefaultPii: false,
  environment: __DEV__ ? 'development' : 'production',
  integrations: [navigationIntegration],
  beforeSend: scrubEvent,
});

export const wrap = Sentry.wrap;

export function captureException(error: unknown, context?: Record<string, unknown>): void {
  Sentry.captureException(error, context ? { extra: context } : undefined);
}

export function setSentryUser(id: string | null): void {
  Sentry.setUser(id ? { id } : null);
}
