import { getTheme, PALETTE } from '../constants/theme';

describe('getTheme', () => {
  it('returns correct primary colour for classic light', () => {
    const t = getTheme('classic', false);
    expect(t.primary).toBe('#37003C');
    expect(t.dark).toBe(false);
    expect(t.bg).toBe('#EFE9F3');
    expect(t.surface).toBe('#FFFFFF');
    expect(t.text).toBe('#23042B');
  });

  it('returns correct surfaces for classic dark', () => {
    const t = getTheme('classic', true);
    expect(t.dark).toBe(true);
    expect(t.bg).toBe('#120016');
    expect(t.surface).toBe('#241030');
    expect(t.text).toBe('#F6EEFB');
  });

  it('defaults to classic light when called with no args', () => {
    const t = getTheme();
    expect(t.paletteKey).toBe('classic');
    expect(t.dark).toBe(false);
  });

  it('PALETTE contains classic, pitch, electric', () => {
    expect(PALETTE.map(p => p.key)).toEqual(['classic', 'pitch', 'electric']);
  });
});
