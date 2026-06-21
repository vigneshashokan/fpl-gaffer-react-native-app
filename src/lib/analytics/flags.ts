import { useFeatureFlag } from 'posthog-react-native';

// PostHog feature flags + their offline/unset defaults. Provisioned now; the
// paywall + A/B that consume them arrive in Phase 5.
export const FLAG_DEFAULTS = {
  premium_paywall: false,
  live_scoring: false,
  xpts_model_v2: 'control',
  analytics_consent_required: false,
} as const;

export type FlagName = keyof typeof FLAG_DEFAULTS;
export type FlagValue<F extends FlagName> = (typeof FLAG_DEFAULTS)[F];

export function resolveFlag<F extends FlagName>(
  name: F,
  raw: boolean | string | null | undefined,
): FlagValue<F> {
  return (raw ?? FLAG_DEFAULTS[name]) as FlagValue<F>;
}

export function useFlag<F extends FlagName>(name: F): FlagValue<F> {
  const raw = useFeatureFlag(name) as boolean | string | null | undefined;
  return resolveFlag(name, raw);
}
