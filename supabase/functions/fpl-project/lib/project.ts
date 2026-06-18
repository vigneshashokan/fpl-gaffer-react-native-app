import { MODEL_VERSION, QUANTILES } from '../feature-spec.ts';
import { buildFeatureRow, type ClubStrength, type FixtureTarget, type HistoryRow } from './features.ts';
import { type Artifact, predict } from './scorer.ts';

export interface PlayerInput {
  id: number;
  position: string;
  team_id: number;
  now_cost: number;
}

export interface FixtureLite {
  event: number;
  team_h: number;
  team_a: number;
}

export interface ProjectionRow {
  player_id: number;
  gw: number;
  p25: number;
  p50: number;
  p75: number;
  model_version: string;
}

const round1 = (x: number): number => Math.round(x * 10) / 10;

export function buildProjections(params: {
  players: PlayerInput[];
  historyByPlayer: Record<number, HistoryRow[]>;
  fixturesByGw: Record<number, FixtureLite[]>;
  clubStrengths: Record<number, ClubStrength>;
  artifact: Artifact;
  gws: number[];
}): ProjectionRow[] {
  const out: ProjectionRow[] = [];
  for (const player of params.players) {
    if (!params.artifact.coefficients[player.position]) continue; // unknown position -> skip
    const prior = params.historyByPlayer[player.id] ?? [];
    for (const gw of params.gws) {
      const fixtures = (params.fixturesByGw[gw] ?? []).filter(
        (f) => f.team_h === player.team_id || f.team_a === player.team_id,
      );
      if (fixtures.length === 0) continue; // blank GW -> no row
      let p25 = 0, p50 = 0, p75 = 0;
      for (const f of fixtures) {
        const wasHome = f.team_h === player.team_id;
        const target: FixtureTarget = {
          was_home: wasHome,
          opponent_team: wasHome ? f.team_a : f.team_h,
          value: player.now_cost,
        };
        const feat = buildFeatureRow(prior, target, params.clubStrengths);
        p25 += predict(params.artifact, feat, player.position, QUANTILES[0]);
        p50 += predict(params.artifact, feat, player.position, QUANTILES[1]);
        p75 += predict(params.artifact, feat, player.position, QUANTILES[2]);
      }
      out.push({
        player_id: player.id, gw,
        p25: round1(p25), p50: round1(p50), p75: round1(p75),
        model_version: MODEL_VERSION,
      });
    }
  }
  return out;
}
