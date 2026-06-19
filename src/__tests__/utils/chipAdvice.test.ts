import { benchBoostTip, freeHitTip } from '@/utils/chipAdvice';
import type { Player } from '@/types/fpl';
import type { SeasonFixtures } from '@/api/fixtures';
import type { ProjectionStat } from '@/api/projections';

function pl(id: string, club: string, over: Partial<Player> = {}): Player {
  return {
    id, name: `P${id}`, pos: 'MID', club: club as Player['club'], p: 6, f: 4, tp: 40,
    own: 5, gw: 3, status: 'a', news: '', chanceNext: null, ict: 50, bps: 100, ...over,
  };
}
// gw → club → { count, fdrs }
function sf(entries: Record<number, Record<string, { count: number; fdrs: number[] }>>): SeasonFixtures {
  const m: SeasonFixtures = new Map();
  for (const [gw, clubs] of Object.entries(entries)) m.set(Number(gw), clubs as never);
  return m;
}
function pmap(p50ById: Record<string, number>): Map<string, ProjectionStat> {
  const m = new Map<string, ProjectionStat>();
  for (const [id, p50] of Object.entries(p50ById)) m.set(id, { p25: p50 - 1, p50, p75: p50 + 1 });
  return m;
}

const SQUAD = {
  starters: [pl('a', 'ARS'), pl('b', 'LIV'), pl('c', 'MCI')],
  bench: [pl('d', 'NEW'), pl('e', 'TOT')],
};

describe('benchBoostTip', () => {
  it('recommends the GW with the most doublers (hold) + bench points when near', () => {
    // upcoming 10. GW12: ARS + NEW double. NEW is on the bench → bench points appear.
    const fixtures = sf({
      10: { ARS: { count: 1, fdrs: [3] }, LIV: { count: 1, fdrs: [3] }, MCI: { count: 1, fdrs: [3] }, NEW: { count: 1, fdrs: [3] }, TOT: { count: 1, fdrs: [3] } },
      11: { ARS: { count: 1, fdrs: [3] } },
      12: { ARS: { count: 2, fdrs: [2, 3] }, NEW: { count: 2, fdrs: [2, 3] }, LIV: { count: 1, fdrs: [3] }, MCI: { count: 1, fdrs: [3] }, TOT: { count: 1, fdrs: [3] } },
    });
    const projMaps = [pmap({}), pmap({}), pmap({ d: 4 })]; // GW12 = offset 2; bench 'd' p50 4
    const tip = benchBoostTip(SQUAD, fixtures, 10, projMaps);
    expect(tip.title).toBe('Hold for GW12');
    expect(tip.lines[0]).toContain('2 of your players play twice in GW12');
    expect(tip.lines.some((l) => l.includes('bench'))).toBe(true); // ~4 from bench
  });

  it('returns the graceful copy when no double is scheduled', () => {
    const fixtures = sf({ 10: { ARS: { count: 1, fdrs: [3] } }, 11: { ARS: { count: 1, fdrs: [3] } } });
    const tip = benchBoostTip(SQUAD, fixtures, 10, [pmap({}), pmap({}), pmap({})]);
    expect(tip).toEqual({ title: 'Hold', lines: ['No double gameweek scheduled yet'] });
  });
});

describe('freeHitTip', () => {
  // FH_MIN_PLAYERS is 11, so a realistic 11-player owned list is required: in a
  // normal GW all 11 have fixtures (not a blank); in a blank only some do.
  const ELEVEN_CLUBS = ['ARS', 'LIV', 'MCI', 'CHE', 'MUN', 'NEW', 'TOT', 'AVL', 'NFO', 'BHA', 'BOU'];
  const owned11 = ELEVEN_CLUBS.map((c, i) => pl(`p${i}`, c));
  const playing = (clubs: string[]) =>
    Object.fromEntries(clubs.map((c) => [c, { count: 1, fdrs: [3] }]));
  const allPlay = playing(ELEVEN_CLUBS);

  it('flags the first GW where fewer than 11 of the user players have a fixture', () => {
    const fixtures = sf({ 10: allPlay, 11: playing(ELEVEN_CLUBS.slice(0, 6)) }); // GW11: only 6 play
    const tip = freeHitTip(owned11, fixtures, 10);
    expect(tip.title).toBe('Hold for GW11');
    expect(tip.lines[0]).toContain('Only 6 of your players have a fixture in GW11');
  });

  it('returns the graceful copy when every GW fields a full squad', () => {
    const tip = freeHitTip(owned11, sf({ 10: allPlay, 11: allPlay }), 10);
    expect(tip).toEqual({ title: 'Hold', lines: ['No blank gameweek scheduled'] });
  });
});
