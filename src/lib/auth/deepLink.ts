const APP_SCHEME = 'fplgafferreactnativeapp:';

export type AuthDeepLink =
  | { kind: 'verify' }
  | { kind: 'reset' }
  | { kind: 'unknown' };

export function parseAuthDeepLink(url: string): AuthDeepLink {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== APP_SCHEME) return { kind: 'unknown' };
    // For `scheme://host/path`, `parsed.host` is the first path segment.
    const head = parsed.host || parsed.pathname.replace(/^\//, '').split('/')[0];
    if (head === 'verify') return { kind: 'verify' };
    if (head === 'reset-password') return { kind: 'reset' };
    return { kind: 'unknown' };
  } catch {
    return { kind: 'unknown' };
  }
}
