import { assertEquals } from '@std/assert';
import { buildProjections, type FixtureLite, type PlayerInput } from '../lib/project.ts';
import type { ClubStrength, HistoryRow } from '../lib/features.ts';
import { artifact } from '../lib/scorer.ts';

const STR: Record<number, ClubStrength> = {
  1: { strength_defence_home: 1100, strength_defence_away: 1100, strength_attack_home: 1100, strength_attack_away: 1100 },
  2: { strength_defence_home: 1100, strength_defence_away: 1100, strength_attack_home: 1100, strength_attack_away: 1100 },
};

function hist(gw: number, fx: number): HistoryRow {
  return { gw, fixture_id: fx, starts: 1, total_points: 5, expected_goals: 0.2,
    expected_assists: 0.1, expected_goal_involvements: 0.3, threat: 20, creativity: 10,
    influence: 15, bps: 20, defensive_contribution: 2 };
}

Deno.test('one row per (player, gw) for players with a fixture', () => {
  const players: PlayerInput[] = [{ id: 7, position: 'MID', team_id: 1, now_cost: 70 }];
  const fixturesByGw: Record<number, FixtureLite[]> = {
    10: [{ event: 10, team_h: 1, team_a: 2 }],
  };
  const rows = buildProjections({
    players, historyByPlayer: { 7: [hist(8, 80), hist(9, 90)] },
    fixturesByGw, clubStrengths: STR, artifact, gws: [10],
  });
  assertEquals(rows.length, 1);
  assertEquals(rows[0].player_id, 7);
  assertEquals(rows[0].gw, 10);
  assertEquals(rows[0].model_version, 'v1.0.0');
  assertEquals(rows[0].p25 <= rows[0].p50 && rows[0].p50 <= rows[0].p75, true);
});

Deno.test('no fixture -> no row; double gameweek -> summed', () => {
  const players: PlayerInput[] = [{ id: 7, position: 'MID', team_id: 1, now_cost: 70 }];
  const single = buildProjections({
    players, historyByPlayer: { 7: [hist(8, 80)] },
    fixturesByGw: { 11: [] }, clubStrengths: STR, artifact, gws: [11],
  });
  assertEquals(single.length, 0); // blank GW -> skipped

  const dgw = buildProjections({
    players, historyByPlayer: { 7: [hist(8, 80)] },
    fixturesByGw: { 12: [{ event: 12, team_h: 1, team_a: 2 }, { event: 12, team_h: 2, team_a: 1 }] },
    clubStrengths: STR, artifact, gws: [12],
  });
  assertEquals(dgw.length, 1);
  const one = buildProjections({
    players, historyByPlayer: { 7: [hist(8, 80)] },
    fixturesByGw: { 12: [{ event: 12, team_h: 1, team_a: 2 }] },
    clubStrengths: STR, artifact, gws: [12],
  });
  assertEquals(dgw[0].p50 > one[0].p50, true); // two fixtures sum to more than one
});

Deno.test('unknown position is skipped', () => {
  const rows = buildProjections({
    players: [{ id: 9, position: 'XXX', team_id: 1, now_cost: 70 }],
    historyByPlayer: { 9: [hist(8, 80)] },
    fixturesByGw: { 10: [{ event: 10, team_h: 1, team_a: 2 }] },
    clubStrengths: STR, artifact, gws: [10],
  });
  assertEquals(rows.length, 0);
});
