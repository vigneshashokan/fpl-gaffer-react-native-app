const mockGetSession = jest.fn();
const mockSignInWithPassword = jest.fn();
const mockUpdateUser = jest.fn();
const mockSignOut = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
      signInWithPassword: (a: unknown) => mockSignInWithPassword(a),
      updateUser: (a: unknown) => mockUpdateUser(a),
      signOut: (a: unknown) => mockSignOut(a),
    },
  },
}));

import { changePassword } from '@/lib/auth/email';

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSession.mockResolvedValue({ data: { session: { user: { email: 'a@b.co' } } } });
});

describe('changePassword', () => {
  it('verifies the current password, then updates, then signs out other devices', async () => {
    mockSignInWithPassword.mockResolvedValueOnce({ data: { user: {} }, error: null });
    mockUpdateUser.mockResolvedValueOnce({ data: { user: {} }, error: null });
    mockSignOut.mockResolvedValueOnce({ error: null });

    const r = await changePassword('OldPass1', 'NewPass1');

    expect(r.ok).toBe(true);
    expect(mockSignInWithPassword).toHaveBeenCalledWith({ email: 'a@b.co', password: 'OldPass1' });
    expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'NewPass1' });
    expect(mockSignOut).toHaveBeenCalledWith({ scope: 'others' });
  });

  it('returns invalid_credentials and does NOT update when current password is wrong', async () => {
    mockSignInWithPassword.mockResolvedValueOnce({
      data: null,
      error: { code: 'invalid_credentials', message: 'Invalid login credentials' },
    });

    const r = await changePassword('WrongPass', 'NewPass1');

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('invalid_credentials');
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('maps a weak new-password error from updateUser', async () => {
    mockSignInWithPassword.mockResolvedValueOnce({ data: { user: {} }, error: null });
    mockUpdateUser.mockResolvedValueOnce({ data: null, error: { code: 'weak_password', message: 'weak' } });

    const r = await changePassword('OldPass1', '123');

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('weak_password');
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('still succeeds when signOut(others) fails (best-effort)', async () => {
    mockSignInWithPassword.mockResolvedValueOnce({ data: { user: {} }, error: null });
    mockUpdateUser.mockResolvedValueOnce({ data: { user: {} }, error: null });
    mockSignOut.mockRejectedValueOnce(new Error('network'));

    const r = await changePassword('OldPass1', 'NewPass1');
    expect(r.ok).toBe(true);
  });

  it('returns unknown when there is no session email', async () => {
    mockGetSession.mockResolvedValueOnce({ data: { session: null } });
    const r = await changePassword('OldPass1', 'NewPass1');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('unknown');
    expect(mockSignInWithPassword).not.toHaveBeenCalled();
  });
});
