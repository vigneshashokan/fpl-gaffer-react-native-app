import { DECAY_ALPHA, FORM_STATS, FORM_WINDOW, STRENGTH_SCALE, VALUE_SCALE } from '../feature-spec.ts';

export interface HistoryRow {
  gw: number;
  fixture_id: number;
  starts: number;
  expected_goals: number;
  expected_assists: number;
  expected_goal_involvements: number;
  threat: number;
  creativity: number;
  influence: number;
  bps: number;
  defensive_contribution: number;
  total_points: number;
}

export interface ClubStrength {
  strength_defence_home: number;
  strength_defence_away: number;
  strength_attack_home: number;
  strength_attack_away: number;
}

export interface FixtureTarget {
  was_home: boolean;
  opponent_team: number;
  value: number;
}

export function decayWeights(n: number, alpha: number = DECAY_ALPHA): number[] {
  if (n <= 0) return [];
  const w = Array.from({ length: n }, (_, i) => alpha ** i);
  const sum = w.reduce((a: number, b: number) => a + b, 0);
  return w.map((x) => x / sum);
}

export function expDecayMean(valuesRecentFirst: number[], alpha: number = DECAY_ALPHA): number {
  if (valuesRecentFirst.length === 0) return 0;
  const w = decayWeights(valuesRecentFirst.length, alpha);
  let total = 0;
  for (let i = 0; i < w.length; i++) total += w[i] * valuesRecentFirst[i];
  return total;
}

export function opponentStrengths(
  wasHome: boolean,
  opponentTeam: number,
  clubStrengths: Record<number, ClubStrength>,
): { def: number; att: number } {
  const t = clubStrengths[opponentTeam];
  if (!t) return { def: 0, att: 0 };
  // player home -> opponent plays away -> use opponent's away strengths
  const def = wasHome ? t.strength_defence_away : t.strength_defence_home;
  const att = wasHome ? t.strength_attack_away : t.strength_attack_home;
  return { def: def / STRENGTH_SCALE, att: att / STRENGTH_SCALE };
}

export function buildFeatureRow(
  priorRows: HistoryRow[],
  target: FixtureTarget,
  clubStrengths: Record<number, ClubStrength>,
): Record<string, number> {
  // most-recent-first by (gw, fixture_id), capped at the form window
  const prior = [...priorRows]
    .sort((a, b) => (b.gw - a.gw) || (b.fixture_id - a.fixture_id))
    .slice(0, FORM_WINDOW);

  const feat: Record<string, number> = {};
  for (const stat of FORM_STATS) {
    feat[`form_${stat}`] = expDecayMean(prior.map((r) => Number(r[stat as keyof HistoryRow])));
  }
  feat.xmin = prior.length ? prior.reduce((a: number, r: HistoryRow) => a + Number(r.starts), 0) / prior.length : 0;

  const opp = opponentStrengths(target.was_home, target.opponent_team, clubStrengths);
  feat.opp_strength_def = opp.def;
  feat.opp_strength_att = opp.att;
  feat.was_home = target.was_home ? 1 : 0;
  feat.value_scaled = Number(target.value) / VALUE_SCALE;
  return feat;
}
