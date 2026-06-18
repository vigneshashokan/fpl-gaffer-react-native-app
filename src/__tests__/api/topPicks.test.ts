jest.mock('@/lib/supabase', () => ({ supabase: {} }));

import { rankTopPicks } from '@/api/players';
import type { Player } from '@/types/fpl';

const base = {
  pos: 'MID' as const, club: 'ARS' as const, p: 7, f: 5, tp: 40, own: 10,
  status: 'a' as const, news: '', chanceNext: null, ict: 50, bps: 100,
};

function player(id: string, epNext: number): Player {
  return { id, name: `P${id}`, gw: epNext, ...base };
}

describe('rankTopPicks', () => {
  it('ranks by projection p50 when present, overriding ep_next order', () => {
    const players = [player('1', 9.0), player('2', 3.0)]; // ep_next says 1 > 2
    const proj = new Map([['2', { p25: 4, p50: 8, p75: 12 }], ['1', { p25: 1, p50: 2, p75: 4 }]]);
    const out = rankTopPicks(players, proj);
    expect(out.MID.map((p) => p.id)).toEqual(['2', '1']); // p50 flips the order
    expect(out.MID[0].xp).toBe(8);
  });

  it('falls back to ep_next (gw) when a projection is missing', () => {
    const players = [player('1', 9.0), player('2', 3.0)];
    const out = rankTopPicks(players, new Map());
    expect(out.MID.map((p) => p.id)).toEqual(['1', '2']);
    expect(out.MID[0].xp).toBeUndefined();
  });
});
