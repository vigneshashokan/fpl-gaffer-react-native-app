import { render } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthCacheClear } from '@/lib/auth/authCacheClear';

let mockCapturedCallback: ((event: string, session: unknown) => void) | null = null;
const mockUnsubscribe = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: jest.fn((cb) => {
        mockCapturedCallback = cb;
        return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
      }),
    },
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockCapturedCallback = null;
});

function setup() {
  const client = new QueryClient();
  // Seed a query so we can observe whether it survives the clear.
  client.setQueryData(['profile', 'user-A'], { firstName: 'Alice' });
  client.setQueryData(['players'], [{ id: '1', name: 'X' }]);
  const utils = render(
    <QueryClientProvider client={client}>
      <AuthCacheClear />
    </QueryClientProvider>,
  );
  return { client, ...utils };
}

describe('<AuthCacheClear />', () => {
  it('clears the QueryClient cache on SIGNED_OUT', () => {
    const { client } = setup();
    expect(client.getQueryCache().findAll()).toHaveLength(2);
    mockCapturedCallback?.('SIGNED_OUT', null);
    expect(client.getQueryCache().findAll()).toHaveLength(0);
  });

  it('clears the QueryClient cache on SIGNED_IN', () => {
    const { client } = setup();
    expect(client.getQueryCache().findAll()).toHaveLength(2);
    mockCapturedCallback?.('SIGNED_IN', { user: { id: 'user-B' } });
    expect(client.getQueryCache().findAll()).toHaveLength(0);
  });

  it('clears the QueryClient cache on USER_UPDATED', () => {
    const { client } = setup();
    mockCapturedCallback?.('USER_UPDATED', { user: { id: 'user-A' } });
    expect(client.getQueryCache().findAll()).toHaveLength(0);
  });

  it('leaves the cache alone on TOKEN_REFRESHED and other events', () => {
    const { client } = setup();
    expect(client.getQueryCache().findAll()).toHaveLength(2);
    mockCapturedCallback?.('TOKEN_REFRESHED', { user: { id: 'user-A' } });
    mockCapturedCallback?.('INITIAL_SESSION', { user: { id: 'user-A' } });
    expect(client.getQueryCache().findAll()).toHaveLength(2);
  });

  it('unsubscribes on unmount', () => {
    const { unmount } = setup();
    expect(mockUnsubscribe).not.toHaveBeenCalled();
    unmount();
    expect(mockUnsubscribe).toHaveBeenCalled();
  });
});
