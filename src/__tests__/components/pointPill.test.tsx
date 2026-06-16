import React from 'react';
import { render } from '@testing-library/react-native';
import { PointPill } from '@/components/ui/PointPill';

describe('PointPill', () => {
  it('renders points and name with no extras by default', () => {
    const r = render(<PointPill pts={7} name="Saka" />);
    expect(r.getByText('7')).toBeTruthy();
    expect(r.getByText('Saka')).toBeTruthy();
    expect(r.queryByTestId('bonus-star')).toBeNull();
    expect(r.queryByText('C')).toBeNull();
  });

  it('shows a gold star behind the number when bonus was earned', () => {
    const r = render(<PointPill pts={13} name="Salah" bonus={3} />);
    expect(r.getByTestId('bonus-star')).toBeTruthy();
  });

  it('shows no star when bonus is 0/undefined', () => {
    expect(render(<PointPill pts={5} name="X" bonus={0} />).queryByTestId('bonus-star')).toBeNull();
  });
});
