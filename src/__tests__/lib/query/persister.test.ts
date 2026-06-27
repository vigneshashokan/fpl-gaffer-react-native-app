jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

import { persistOptions, CACHE_MAX_AGE } from '@/lib/query/persister';

describe('query persister', () => {
  it('uses a 24h offline window for maxAge', () => {
    expect(CACHE_MAX_AGE).toBe(24 * 60 * 60 * 1000);
    expect(persistOptions.maxAge).toBe(CACHE_MAX_AGE);
  });

  it('configures a persister and a string cache buster', () => {
    expect(persistOptions.persister).toBeDefined();
    expect(typeof persistOptions.buster).toBe('string');
  });
});
