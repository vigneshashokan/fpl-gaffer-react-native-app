import { resolveFlag, FLAG_DEFAULTS } from '@/lib/analytics/flags';

describe('resolveFlag', () => {
  it('returns the SDK value when defined', () => {
    expect(resolveFlag('premium_paywall', true)).toBe(true);
    expect(resolveFlag('xpts_model_v2', 'v2')).toBe('v2');
  });

  it('falls back to the typed default when undefined', () => {
    expect(resolveFlag('premium_paywall', undefined)).toBe(false);
    expect(resolveFlag('live_scoring', undefined)).toBe(false);
    expect(resolveFlag('xpts_model_v2', undefined)).toBe('control');
    expect(resolveFlag('analytics_consent_required', undefined)).toBe(false);
  });

  it('FLAG_DEFAULTS has the four provisioned flags', () => {
    expect(Object.keys(FLAG_DEFAULTS).sort()).toEqual([
      'analytics_consent_required',
      'live_scoring',
      'premium_paywall',
      'xpts_model_v2',
    ]);
  });
});
