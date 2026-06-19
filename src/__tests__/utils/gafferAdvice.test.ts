import { availabilityFactor, adjusted } from '@/utils/gafferAdvice';
import type { Player } from '@/types/fpl';
import type { SquadPlayer } from '@/api/squad';
import type { ProjectionStat } from '@/api/projections';

// Test helpers — reused by later tasks in this file.
export function sp(id: string, pos: Player['pos'], extra: Partial<Player> = {}): SquadPlayer {
  return {
    id, name: `P${id}`, pos, club: 'ARS', p: 5, f: 4, tp: 30, own: 5,
    gw: 2, status: 'a', news: '', chanceNext: null, ict: 50, bps: 100,
    ...extra,
  };
}
// p50 = value; symmetric band p25=v-1, p75=v+1.
export function projMap(entries: Record<string, number>): Map<string, ProjectionStat> {
  const m = new Map<string, ProjectionStat>();
  for (const [id, p50] of Object.entries(entries)) m.set(id, { p25: p50 - 1, p50, p75: p50 + 1 });
  return m;
}

describe('availabilityFactor', () => {
  it('is 0 for hard-out statuses (injured/suspended/unavailable/ineligible)', () => {
    expect(availabilityFactor(sp('1', 'MID', { status: 'i' }))).toBe(0);
    expect(availabilityFactor(sp('2', 'MID', { status: 's' }))).toBe(0);
    expect(availabilityFactor(sp('3', 'MID', { status: 'u' }))).toBe(0);
    expect(availabilityFactor(sp('4', 'MID', { status: 'n' }))).toBe(0);
  });
  it('uses chance_of_playing / 100 when a chance is set', () => {
    expect(availabilityFactor(sp('5', 'MID', { status: 'd', chanceNext: 25 }))).toBe(0.25);
    expect(availabilityFactor(sp('6', 'MID', { status: 'a', chanceNext: 75 }))).toBe(0.75);
  });
  it('defaults to 1.0 for a non-hard-out status with no chance set', () => {
    expect(availabilityFactor(sp('7', 'MID', { status: 'a', chanceNext: null }))).toBe(1);
    expect(availabilityFactor(sp('8', 'MID', { status: 'd', chanceNext: null }))).toBe(1);
  });
});

describe('adjusted', () => {
  it('multiplies the requested quantile by the availability factor', () => {
    const proj = projMap({ '1': 10 }); // p50 10, p75 11
    expect(adjusted(sp('1', 'FWD'), proj, 'p50')).toBe(10);
    expect(adjusted(sp('1', 'FWD'), proj, 'p75')).toBe(11);
    expect(adjusted(sp('1', 'FWD', { status: 'd', chanceNext: 50 }), proj, 'p50')).toBe(5);
  });
  it('falls back to ep_next (gw) when no projection row exists', () => {
    expect(adjusted(sp('9', 'MID', { gw: 6 }), new Map(), 'p50')).toBe(6);
    expect(adjusted(sp('9', 'MID', { gw: 6, status: 'i' }), new Map(), 'p50')).toBe(0);
  });
});
