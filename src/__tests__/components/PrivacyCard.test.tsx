import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

const mockSetConsent = jest.fn();
let mockOptedOut = false;
jest.mock('@/lib/analytics', () => ({
  __esModule: true,
  isOptedOut: () => mockOptedOut,
  setAnalyticsConsent: (v: boolean) => mockSetConsent(v),
}));

import { PrivacyCard } from '@/components/settings/PrivacyCard';
import { apexTokens } from '@/constants/apexTokens';

const tk = apexTokens(true, 'classic');

describe('PrivacyCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOptedOut = false;
  });

  it('renders the share-usage row and toggles consent off', () => {
    const { getByText, UNSAFE_getByType } = render(<PrivacyCard tk={tk} />);
    expect(getByText('Share usage data')).toBeTruthy();
    // The Toggle is the only switch in the card.
    const { Toggle } = require('@/components/ui/Toggle');
    fireEvent(UNSAFE_getByType(Toggle), 'onChange', false);
    expect(mockSetConsent).toHaveBeenCalledWith(false);
  });
});
