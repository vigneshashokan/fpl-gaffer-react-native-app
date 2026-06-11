import React from 'react';
import { act, render } from '@testing-library/react-native';

const mockEnable = jest.fn();
const mockDisable = jest.fn();
let mockBiometricEnabled = false;
const mockIsSupported = jest.fn();

jest.mock('@/lib/auth/biometric/capability', () => ({
  __esModule: true,
  isSupported: () => mockIsSupported(),
}));

jest.mock('@/store/biometricStore', () => ({
  __esModule: true,
  useBiometricStore: (selector: (s: {
    enabled: boolean;
    enable: () => Promise<unknown>;
    disable: () => Promise<void>;
  }) => unknown) =>
    selector({
      enabled: mockBiometricEnabled,
      enable: () => mockEnable(),
      disable: () => mockDisable(),
    }),
}));

jest.mock('@/store/authStore', () => ({
  __esModule: true,
  useAuthStore: (selector: (s: { session: { user: { email: string | null } } | null }) => unknown) =>
    selector({ session: { user: { email: 'test@example.com' } } }),
}));

jest.mock('@/lib/auth/account-deletion', () => ({
  __esModule: true,
  requestDeletion: jest.fn(),
}));

jest.mock('@/store/themeStore', () => ({
  __esModule: true,
  useThemeStore: () => ({ paletteKey: 'classic', dark: true }),
}));

jest.mock('expo-router', () => ({
  __esModule: true,
  useRouter: () => ({ back: jest.fn() }),
}));

import Profile from '@/app/(home)/profile';

describe('Profile screen — Face ID row moved to Settings', () => {
  beforeEach(() => {
    mockEnable.mockReset();
    mockDisable.mockReset();
    mockIsSupported.mockReset();
    mockBiometricEnabled = false;
  });

  it('does not render the Face ID row even when biometrics are supported', async () => {
    mockIsSupported.mockResolvedValueOnce(true);
    const { queryByText } = render(<Profile />);
    // Flush any pending biometric-capability promise so the assertion
    // would catch the old behavior (Face ID rendered after isSupported resolves).
    await act(async () => {
      await Promise.resolve();
    });
    expect(queryByText('Face ID login')).toBeNull();
  });
});
