// src/utils/gafferAdvice.ts
//
// The decision layer: pure functions that turn the user's 15-man squad +
// served projections + current availability into advisory best-XI, bench
// order, captain ranking, and sub suggestions. No React, no I/O — fully
// unit-tested. Falls back to ep_next (Player.gw) when a projection is absent.

import type { SquadPlayer } from '@/api/squad';
import type { ProjectionStat } from '@/api/projections';

const HARD_OUT: ReadonlySet<string> = new Set(['i', 's', 'u', 'n']);

const round1 = (n: number): number => Math.round(n * 10) / 10;

// status → availability multiplier on the projection.
//   hard-out ('i'|'s'|'u'|'n') → 0
//   otherwise: chanceNext != null ? chanceNext/100 : 1.0
export function availabilityFactor(p: SquadPlayer): number {
  if (HARD_OUT.has(p.status)) return 0;
  return p.chanceNext != null ? p.chanceNext / 100 : 1;
}

function projOf(p: SquadPlayer, proj: Map<string, ProjectionStat>, q: 'p50' | 'p75'): number {
  const row = proj.get(p.id);
  return row ? row[q] : p.gw; // ep_next fallback
}

export function adjusted(
  p: SquadPlayer,
  proj: Map<string, ProjectionStat>,
  q: 'p50' | 'p75',
): number {
  return availabilityFactor(p) * projOf(p, proj, q);
}
