// src/__tests__/components/navIdentity.test.tsx
//
// The brand-header avatar and account menu must show the *real* signed-in
// user's initials, name and FPL team name — never the old hard-coded
// "AG" / "A. Gaffer" / "Apex Pitch FC" placeholders.

import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { renderWithProviders as render } from '../utils/renderWithProviders';
import { AccountMenu } from '@/components/nav/AccountMenu';
import { BrandHeader } from '@/components/nav/BrandHeader';

const mockSignOut = jest.fn();

jest.mock('@/store/themeStore', () => ({
  __esModule: true,
  useThemeStore: () => ({ paletteKey: 'classic', dark: true, setDark: jest.fn() }),
}));

jest.mock('@/store/authStore', () => {
  const useAuthStore = (selector?: (s: unknown) => unknown) => {
    const state = { signOut: mockSignOut, session: null };
    return selector ? selector(state) : state;
  };
  useAuthStore.getState = () => ({ signOut: mockSignOut });
  return { __esModule: true, useAuthStore };
});

jest.mock('expo-router', () => ({
  __esModule: true,
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));

const mockUseProfile = jest.fn();
const mockUseManager = jest.fn();
jest.mock('@/api/profile', () => ({
  __esModule: true,
  useProfile: () => mockUseProfile(),
}));
jest.mock('@/api/manager', () => ({
  __esModule: true,
  useManager: () => mockUseManager(),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockUseProfile.mockReturnValue({
    data: { firstName: 'Vignesh', lastName: 'Ashokan', fplTeamId: 12345 },
  });
  mockUseManager.mockReturnValue({ data: { name: 'Doyle Dynamos' } });
});

describe('AccountMenu identity', () => {
  it('shows the real name, team name and initials', () => {
    const { getByText, queryByText } = render(
      <AccountMenu
        visible
        onClose={jest.fn()}
        onProfile={jest.fn()}
        onSettings={jest.fn()}
        onSignOut={jest.fn()}
      />,
    );

    expect(getByText('Vignesh Ashokan')).toBeTruthy();
    expect(getByText('Doyle Dynamos')).toBeTruthy();
    expect(getByText('VA')).toBeTruthy();

    expect(queryByText('A. Gaffer')).toBeNull();
    expect(queryByText('Apex Pitch FC')).toBeNull();
    expect(queryByText('AG')).toBeNull();
  });

  it('omits the team line when no FPL team is connected', () => {
    mockUseProfile.mockReturnValue({
      data: { firstName: 'Vignesh', lastName: 'Ashokan', fplTeamId: null },
    });
    mockUseManager.mockReturnValue({ data: undefined });

    const { getByText, queryByText } = render(
      <AccountMenu
        visible
        onClose={jest.fn()}
        onProfile={jest.fn()}
        onSettings={jest.fn()}
        onSignOut={jest.fn()}
      />,
    );

    expect(getByText('Vignesh Ashokan')).toBeTruthy();
    expect(queryByText('Apex Pitch FC')).toBeNull();
  });
});

describe('BrandHeader avatar', () => {
  it('shows the real user initials, not the AG placeholder', () => {
    const { getByText, queryByText } = render(<BrandHeader />);
    expect(getByText('VA')).toBeTruthy();
    expect(queryByText('AG')).toBeNull();
  });

  it('opens the account menu with the real name on press', () => {
    const { getByText, getAllByText } = render(<BrandHeader />);
    // avatar shows initials; pressing it opens the menu
    fireEvent.press(getByText('VA'));
    expect(getByText('Vignesh Ashokan')).toBeTruthy();
    // initials now appear in both the header avatar and the menu avatar
    expect(getAllByText('VA').length).toBeGreaterThanOrEqual(1);
  });
});
