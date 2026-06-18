import { assertEquals, assertAlmostEquals } from '@std/assert';
import { FEATURE_COLUMNS } from '../feature-spec.ts';
import {
  decayWeights, expDecayMean, opponentStrengths, buildFeatureRow,
  type HistoryRow, type ClubStrength,
} from '../lib/features.ts';

const STR: Record<number, ClubStrength> = {
  5: { strength_defence_home: 1200, strength_defence_away: 1300, strength_attack_home: 1100, strength_attack_away: 1000 },
};

function row(gw: number, fixture_id: number, starts: number, tp: number, xg = 0): HistoryRow {
  return {
    gw, fixture_id, starts, total_points: tp, expected_goals: xg,
    expected_assists: 0, expected_goal_involvements: xg, threat: 0,
    creativity: 0, influence: 0, bps: 0, defensive_contribution: 0,
  };
}

Deno.test('decayWeights normalized and decreasing', () => {
  const w = decayWeights(3, 0.85);
  assertAlmostEquals(w.reduce((a: number, b: number) => a + b, 0), 1, 1e-9);
  assertEquals(w[0] > w[1] && w[1] > w[2], true);
  assertEquals(decayWeights(0).length, 0);
});

Deno.test('expDecayMean weights recent more', () => {
  assertAlmostEquals(expDecayMean([10, 0], 0.85), 10 * 1 / 1.85, 1e-9);
  assertEquals(expDecayMean([]), 0);
});

Deno.test('opponentStrengths is home/away-aware and scaled', () => {
  const home = opponentStrengths(true, 5, STR);   // player home -> opp away
  assertAlmostEquals(home.def, 1300 / 1000, 1e-9);
  assertAlmostEquals(home.att, 1000 / 1000, 1e-9);
  const away = opponentStrengths(false, 5, STR);  // player away -> opp home
  assertAlmostEquals(away.def, 1200 / 1000, 1e-9);
  assertAlmostEquals(away.att, 1100 / 1000, 1e-9); // away branch -> opp strength_attack_home
  assertEquals(opponentStrengths(true, 999, STR).def, 0); // unknown opp -> 0
});

Deno.test('buildFeatureRow uses recent window + target fixture facts', () => {
  const prior = [row(1, 10, 1, 2, 0.1), row(2, 20, 1, 8, 0.5)];
  const feat = buildFeatureRow(prior, { was_home: true, opponent_team: 5, value: 57 }, STR);
  assertEquals(Object.keys(feat).sort(), [...FEATURE_COLUMNS].sort());
  assertAlmostEquals(feat.xmin, 1, 1e-9);
  assertEquals(feat.was_home, 1);
  assertAlmostEquals(feat.value_scaled, 5.7, 1e-9);
  assertAlmostEquals(feat.opp_strength_def, 1.3, 1e-9);
  // form_total_points = exp-decay over [8, 2] most-recent-first
  assertAlmostEquals(feat.form_total_points, (8 * 1 + 2 * 0.85) / 1.85, 1e-9);
});
