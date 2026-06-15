// src/__tests__/lib/name.test.ts
import { initialsOf } from '@/lib/name';

describe('initialsOf', () => {
  it('returns uppercase first + last initials', () => {
    expect(initialsOf('Vignesh', 'Ashokan')).toBe('VA');
  });

  it('uppercases lowercase names', () => {
    expect(initialsOf('apex', 'gaffer')).toBe('AG');
  });

  it('returns just the first initial when last name is missing', () => {
    expect(initialsOf('Sam', '')).toBe('S');
  });

  it('returns empty string when both names are missing', () => {
    expect(initialsOf('', '')).toBe('');
  });

  it('tolerates undefined inputs', () => {
    expect(initialsOf(undefined, undefined)).toBe('');
  });

  it('ignores leading whitespace when picking the initial', () => {
    expect(initialsOf('  liam', '  doyle')).toBe('LD');
  });
});
