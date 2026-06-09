import { parseAuthDeepLink } from '@/lib/auth/deepLink';

describe('parseAuthDeepLink', () => {
  it('classifies the verify URL', () => {
    expect(parseAuthDeepLink('fplgafferreactnativeapp://verify?code=abc')).toEqual({
      kind: 'verify',
    });
  });

  it('classifies the reset-password URL', () => {
    expect(parseAuthDeepLink('fplgafferreactnativeapp://reset-password?code=xyz')).toEqual({
      kind: 'reset',
    });
  });

  it('classifies unknown paths', () => {
    expect(parseAuthDeepLink('fplgafferreactnativeapp://something-else?x=1')).toEqual({
      kind: 'unknown',
    });
  });

  it('classifies non-app schemes', () => {
    expect(parseAuthDeepLink('https://example.com/verify')).toEqual({ kind: 'unknown' });
  });

  it('handles malformed URLs gracefully', () => {
    expect(parseAuthDeepLink('not-a-url-at-all')).toEqual({ kind: 'unknown' });
  });
});
