import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { apexTokens } from '@/constants/apexTokens';
import type { TopPickPlayer } from '@/types/fpl';

jest.mock('expo-router', () => ({ __esModule: true, useRouter: () => ({ push: jest.fn() }) }));

import { PicksCard } from '@/components/picks/PicksCard';

const ROWS: TopPickPlayer[] = [
  { id: '401', name: 'Haaland', club: 'MCI', p: 14.2, f: 8.4, tp: 175, own: 62.3, gw: 9.1 },
  { id: '500', name: 'Wood', club: 'NEW', p: 7.5, f: 6.7, tp: 120, own: 21.0, gw: 7.0 },
];
const tk = apexTokens(true, 'classic');

describe('PicksCard selectable', () => {
  it('renders an IN pill for non-owned rows only and forwards onSelect', () => {
    const onSelect = jest.fn();
    const { getByTestId, queryByTestId } = render(
      <PicksCard
        pos="FWD" rows={ROWS} tk={tk} dark fixtures={{}}
        squadNames={new Set(['Haaland'])}
        selectable selectedId={null} onSelect={onSelect}
      />,
    );
    expect(queryByTestId('in-pill-401')).toBeNull(); // owned
    fireEvent.press(getByTestId('in-pill-500'));      // non-owned
    expect(onSelect).toHaveBeenCalledWith('500');
  });

  it('renders no IN pills by default (Top Picks usage)', () => {
    const { queryByTestId } = render(
      <PicksCard pos="FWD" rows={ROWS} tk={tk} dark fixtures={{}} squadNames={new Set()} />,
    );
    expect(queryByTestId('in-pill-500')).toBeNull();
  });
});
