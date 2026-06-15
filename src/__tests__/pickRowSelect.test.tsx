import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { apexTokens } from '@/constants/apexTokens';
import type { TopPickPlayer } from '@/types/fpl';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ __esModule: true, useRouter: () => ({ push: mockPush }) }));

import { PickRow } from '@/components/picks/PickRow';

const PLAYER: TopPickPlayer = {
  id: '401', name: 'Haaland', club: 'MCI', p: 14.2, f: 8.4, tp: 175, own: 62.3, gw: 9.1,
};
const tk = apexTokens(true, 'classic');
const base = { p: PLAYER, zebra: false, last: true, tk, dark: true, fixtures: {} };

describe('PickRow select-for-transfer', () => {
  beforeEach(() => mockPush.mockReset());

  it('shows an IN pill for a non-owned selectable row and fires onSelect (no nav)', () => {
    const onSelect = jest.fn();
    const { getByTestId } = render(
      <PickRow {...base} squadNames={new Set()} selectable selectedId={null} onSelect={onSelect} />,
    );
    fireEvent.press(getByTestId('in-pill-401'));
    expect(onSelect).toHaveBeenCalledWith('401');
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('still navigates to stats when the row body is pressed', () => {
    const { getByText } = render(
      <PickRow {...base} squadNames={new Set()} selectable selectedId={null} onSelect={jest.fn()} />,
    );
    fireEvent.press(getByText('Haaland'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/(home)/player/[id]', params: { id: '401' } });
  });

  it('hides the IN pill for an owned (in team) row', () => {
    const { queryByTestId } = render(
      <PickRow {...base} squadNames={new Set(['Haaland'])} selectable selectedId={null} onSelect={jest.fn()} />,
    );
    expect(queryByTestId('in-pill-401')).toBeNull();
  });

  it('renders no IN pill when not selectable (Top Picks default)', () => {
    const { queryByTestId } = render(<PickRow {...base} squadNames={new Set()} />);
    expect(queryByTestId('in-pill-401')).toBeNull();
  });
});
