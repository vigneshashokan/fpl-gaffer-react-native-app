// src/utils/transferAdvice.ts
//
// The transfer slice of the decision layer: a pure engine that ranks affordable,
// rules-valid out→in swaps by projected-points gain over the next 3 GWs. No React,
// no I/O — fully unit-tested. Reuses gafferAdvice's availability weighting; falls
// back to ep_next (Player.gw) when projections are absent.

import type { ClubCode, Player, TransferSuggestion } from '@/types/fpl';
import type { SquadPlayer } from '@/api/squad';
import type { ProjectionStat } from '@/api/projections';
import { availabilityFactor } from '@/utils/gafferAdvice';

const round1 = (n: number): number => Math.round(n * 10) / 10;

// Summed availability-weighted p50 over the projection window. Sums only the GWs
// a row exists for; if the player has NO row in any window GW, falls back to
// availabilityFactor × ep_next (Player.gw) as a single-GW proxy (no triple-count).
export function score3(p: Player, projMaps: Map<string, ProjectionStat>[]): number {
  const av = availabilityFactor(p);
  let sum = 0;
  let hasAny = false;
  for (const m of projMaps) {
    const row = m.get(p.id);
    if (row) {
      sum += row.p50;
      hasAny = true;
    }
  }
  return hasAny ? av * sum : av * p.gw;
}
