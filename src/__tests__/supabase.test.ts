describe('supabase client singleton', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('throws when env vars are missing from expo extra', () => {
    jest.doMock('expo-constants', () => ({
      __esModule: true,
      default: { expoConfig: { extra: {} } },
    }));
    jest.doMock('@supabase/supabase-js', () => ({
      createClient: jest.fn(() => ({})),
    }));

    expect(() => require('@/lib/supabase')).toThrow(/Missing EXPO_PUBLIC_SUPABASE_/);
  });

  it('creates a client when env vars are present', () => {
    const createClient = jest.fn(() => ({ from: jest.fn() }));
    jest.doMock('expo-constants', () => ({
      __esModule: true,
      default: {
        expoConfig: {
          extra: {
            supabaseUrl: 'https://test.supabase.co',
            supabaseAnonKey: 'test-anon-key',
          },
        },
      },
    }));
    jest.doMock('@supabase/supabase-js', () => ({ createClient }));

    const mod = require('@/lib/supabase');
    expect(mod.supabase).toBeDefined();
    expect(createClient).toHaveBeenCalledWith('https://test.supabase.co', 'test-anon-key');
  });
});
