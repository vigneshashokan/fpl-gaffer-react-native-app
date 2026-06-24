import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

const mockTrack = jest.fn();
jest.mock('@/lib/analytics', () => ({
  __esModule: true,
  track: (...a: unknown[]) => mockTrack(...a),
}));

import { ChipsRow } from '@/components/transfer/ChipsRow';
import { apexTokens } from '@/constants/apexTokens';

const tk = apexTokens(true, 'classic');

describe('ChipsRow onExpand', () => {
  beforeEach(() => jest.clearAllMocks());

  it('calls onExpand with the chip name when a tile is opened, not when collapsed', () => {
    const onExpand = jest.fn();
    const chips = [
      { name: 'Wildcard', state: 'available', status: 'Available' },
      { name: 'Bench Boost', state: 'available', status: 'Available' },
    ] as never;
    const { getByText } = render(<ChipsRow chips={chips} tk={tk} onExpand={onExpand} />);

    fireEvent.press(getByText('Wildcard'));
    expect(onExpand).toHaveBeenCalledWith('Wildcard');

    onExpand.mockClear();
    fireEvent.press(getByText('Wildcard')); // collapse — must NOT fire
    expect(onExpand).not.toHaveBeenCalled();
  });
});
