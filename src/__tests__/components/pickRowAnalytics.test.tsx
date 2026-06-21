import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

const mockTrack = jest.fn();
jest.mock('@/lib/analytics', () => ({
  __esModule: true,
  track: (...a: unknown[]) => mockTrack(...a),
}));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  __esModule: true,
  useRouter: () => ({ push: mockPush }),
}));

import { PickRow } from '@/components/picks/PickRow';
import { apexTokens } from '@/constants/apexTokens';

const tk = apexTokens(true, 'classic');

const player = {
  id: '42', name: 'Salah', club: 'LIV', pos: 'MID',
  p: 12.5, f: 6.0, gw: 5.5, xp: 6.1,
} as never;

describe('PickRow analytics', () => {
  beforeEach(() => jest.clearAllMocks());

  it('tracks pick_row_opened when the row opens player detail', () => {
    const { getByText } = render(
      <PickRow
        p={player} zebra={false} last tk={tk} dark
        fixtures={{}} squadNames={new Set()}
      />,
    );
    fireEvent.press(getByText('Salah'));
    expect(mockTrack).toHaveBeenCalledWith('pick_row_opened', { player_id: '42' });
    expect(mockPush).toHaveBeenCalled();
  });
});
