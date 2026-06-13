import React from 'react';
import { render } from '@testing-library/react-native';

const mockRedirect = jest.fn();
const mockStack = jest.fn();
let mockSession: { user: { id: string } } | null = null;
let mockProfileStatus: 'loading' | 'pending_deletion' | 'missing' | 'complete' = 'loading';
let mockSegments: string[] = [];

jest.mock('expo-router', () => ({
  __esModule: true,
  Redirect: (props: { href: string }) => {
    mockRedirect(props.href);
    return null;
  },
  Stack: (props: unknown) => {
    mockStack(props);
    return null;
  },
  useSegments: () => mockSegments,
}));

jest.mock('@/store/authStore', () => ({
  __esModule: true,
  useAuthStore: (selector: (s: { session: unknown }) => unknown) =>
    selector({ session: mockSession }),
}));

jest.mock('@/lib/useProfileGate', () => ({
  __esModule: true,
  useProfileGate: () => ({ status: mockProfileStatus }),
}));

import OnboardingLayout from '@/app/(onboarding)/_layout';

describe('OnboardingLayout', () => {
  beforeEach(() => {
    mockRedirect.mockReset();
    mockStack.mockReset();
    mockSession = null;
    mockProfileStatus = 'loading';
    mockSegments = [];
  });

  it('renders Stack when there is no session', () => {
    render(<OnboardingLayout />);
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(mockStack).toHaveBeenCalled();
  });

  it('redirects signed-in user with complete profile to home', () => {
    mockSession = { user: { id: 'u1' } };
    mockProfileStatus = 'complete';
    mockSegments = ['(onboarding)', 'signin'];
    render(<OnboardingLayout />);
    expect(mockRedirect).toHaveBeenCalledWith('/(home)/(tabs)/team');
  });

  it('keeps the user on reset-password even if their profile is complete', () => {
    mockSession = { user: { id: 'u1' } };
    mockProfileStatus = 'complete';
    mockSegments = ['(onboarding)', 'reset-password'];
    render(<OnboardingLayout />);
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(mockStack).toHaveBeenCalled();
  });

  it('keeps the user on reset-password even if their profile is missing', () => {
    mockSession = { user: { id: 'u1' } };
    mockProfileStatus = 'missing';
    mockSegments = ['(onboarding)', 'reset-password'];
    render(<OnboardingLayout />);
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(mockStack).toHaveBeenCalled();
  });

  it('redirects signed-in user with missing profile to complete-profile', () => {
    mockSession = { user: { id: 'u1' } };
    mockProfileStatus = 'missing';
    mockSegments = ['(onboarding)', 'signin'];
    render(<OnboardingLayout />);
    expect(mockRedirect).toHaveBeenCalledWith('/(onboarding)/complete-profile');
  });

  it('stays on complete-profile when already there with missing profile', () => {
    mockSession = { user: { id: 'u1' } };
    mockProfileStatus = 'missing';
    mockSegments = ['(onboarding)', 'complete-profile'];
    render(<OnboardingLayout />);
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(mockStack).toHaveBeenCalled();
  });

  it("redirects to /(onboarding)/restore-account when status is 'pending_deletion'", () => {
    mockSession = { user: { id: 'u1' } };
    mockProfileStatus = 'pending_deletion';
    mockSegments = ['(onboarding)', 'signin'];
    render(<OnboardingLayout />);
    expect(mockRedirect).toHaveBeenCalledWith('/(onboarding)/restore-account');
  });

  it("stays on restore-account when already there with 'pending_deletion'", () => {
    mockSession = { user: { id: 'u1' } };
    mockProfileStatus = 'pending_deletion';
    mockSegments = ['(onboarding)', 'restore-account'];
    render(<OnboardingLayout />);
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(mockStack).toHaveBeenCalled();
  });

  it("'pending_deletion' beats 'complete' — does not redirect to home", () => {
    mockSession = { user: { id: 'u1' } };
    mockProfileStatus = 'pending_deletion';
    mockSegments = ['(onboarding)', 'signin'];
    render(<OnboardingLayout />);
    expect(mockRedirect).toHaveBeenCalledWith('/(onboarding)/restore-account');
    expect(mockRedirect).not.toHaveBeenCalledWith('/(home)/(tabs)/team');
  });

  it('keeps a complete-profile user on connect-team when they navigate in via the CTA', () => {
    mockSession = { user: { id: 'u1' } };
    mockProfileStatus = 'complete';
    mockSegments = ['(onboarding)', 'connect-team'];
    render(<OnboardingLayout />);
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(mockStack).toHaveBeenCalled();
  });

  it('keeps the user on connect-team during the post-signup race when status is still missing', () => {
    // After complete-profile INSERTs the row and router.replace's to
    // connect-team, useProfileGate has not yet refetched — status is the
    // stale "missing" from before the INSERT. The layout must not bounce
    // them back to complete-profile.
    mockSession = { user: { id: 'u1' } };
    mockProfileStatus = 'missing';
    mockSegments = ['(onboarding)', 'connect-team'];
    render(<OnboardingLayout />);
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(mockStack).toHaveBeenCalled();
  });

  it('still routes a pending_deletion user away from connect-team to restore-account', () => {
    mockSession = { user: { id: 'u1' } };
    mockProfileStatus = 'pending_deletion';
    mockSegments = ['(onboarding)', 'connect-team'];
    render(<OnboardingLayout />);
    expect(mockRedirect).toHaveBeenCalledWith('/(onboarding)/restore-account');
  });
});
