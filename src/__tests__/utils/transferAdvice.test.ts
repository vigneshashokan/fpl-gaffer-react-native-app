import { score3 } from '@/utils/transferAdvice';
import type { Player } from '@/types/fpl';
import type { ProjectionStat } from '@/api/projections';

function pl(id: string, over: Partial<Player> = {}): Player {
  return {
    id, name: `P${id}`, pos: 'MID', club: 'ARS', p: 6, f: 4, tp: 40, own: 5,
    gw: 3, status: 'a', news: '', chanceNext: null, ict: 50, bps: 100, ...over,
  };
}
function pmap(entries: Record<string, number>): Map<string, ProjectionStat> {
  const m = new Map<string, ProjectionStat>();
  for (const [id, p50] of Object.entries(entries)) m.set(id, { p25: p50 - 1, p50, p75: p50 + 1 });
  return m;
}

describe('score3', () => {
  it('sums p50 across the projection window, scaled by availability', () => {
    const maps = [pmap({ '1': 5 }), pmap({ '1': 4 }), pmap({ '1': 6 })];
    expect(score3(pl('1'), maps)).toBe(15); // 5+4+6, available → ×1
    expect(score3(pl('1', { status: 'd', chanceNext: 50 }), maps)).toBe(7.5); // ×0.5
  });

  it('sums only the GWs that have a row (blank GW contributes 0)', () => {
    const maps = [pmap({ '1': 5 }), pmap({}), pmap({ '1': 6 })]; // middle GW missing
    expect(score3(pl('1'), maps)).toBe(11);
  });

  it('falls back to ep_next (1-GW proxy) when no row exists in any window GW', () => {
    expect(score3(pl('9', { gw: 4 }), [pmap({}), pmap({}), pmap({})])).toBe(4);
    expect(score3(pl('9', { gw: 4, status: 'i' }), [pmap({})])).toBe(0); // injured → 0
  });
});
