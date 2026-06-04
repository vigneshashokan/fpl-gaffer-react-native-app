import { xPtsOf, xpColor } from '@/utils/xpts';

describe('xPtsOf', () => {
  it('adds 0.3 baseline plus price-hash bump', () => {
    // p=14.6 → round(146)%4 = 2 → +0.2; f=9.1 → 9.1 + 0.3 + 0.2 = 9.6
    expect(xPtsOf({ f: 9.1, p: 14.6 })).toBeCloseTo(9.6, 5);
  });

  it('still works when bump is zero', () => {
    // p=5.0 → round(50)%4 = 2 → +0.2; f=4.5 → 5.0
    expect(xPtsOf({ f: 4.5, p: 5.0 })).toBeCloseTo(5.0, 5);
  });
});

describe('xpColor', () => {
  it('clamps low values to band start', () => {
    expect(xpColor(2, false)).toBe('hsl(263, 72%, 68%)');
  });

  it('clamps high values to band end', () => {
    expect(xpColor(12, false)).toBe('hsl(263, 72%, 48%)');
  });

  it('uses higher saturation in dark mode', () => {
    expect(xpColor(2, true)).toContain('78%');
  });
});
