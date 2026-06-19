// src/utils/chipAdvice.ts
//
// The chip slice of the decision layer: pure functions that turn the user's
// squad + full-season fixture structure (DGW/BGW/FDR) + the served 3-GW
// projections into advisory timing tips for the four FPL chips. No React, no
// I/O — fully unit-tested. Fixtures carry the long horizon; projections add a
// near-term point estimate only inside the 3-GW window.

import type { ClubCode, Player, TransferChip } from '@/types/fpl';
import type { SquadPlayer } from '@/api/squad';
import type { ProjectionStat } from '@/api/projections';
import type { SeasonFixtures } from '@/api/fixtures';

export interface ChipTip {
  title: string;
  lines: string[];
}

const FH_MIN_PLAYERS = 11;

const round1 = (n: number): number => Math.round(n * 10) / 10;

// GWs present in the fixtures, from upcoming onward, ascending.
function gwRange(seasonFixtures: SeasonFixtures, upcomingGw: number): number[] {
  return [...seasonFixtures.keys()].filter((gw) => gw >= upcomingGw).sort((a, b) => a - b);
}

function clubFixtureCount(seasonFixtures: SeasonFixtures, club: ClubCode, gw: number): number {
  return seasonFixtures.get(gw)?.[club]?.count ?? 0;
}

function clubFdrs(seasonFixtures: SeasonFixtures, club: ClubCode, gw: number): number[] {
  return seasonFixtures.get(gw)?.[club]?.fdrs ?? [];
}

// "Use this GW" when the chosen GW is the upcoming one; else "Hold for GW{X}".
function headline(bestGw: number, upcomingGw: number): string {
  return bestGw === upcomingGw ? 'Use this GW' : `Hold for GW${bestGw}`;
}

export function benchBoostTip(
  squad: { starters: SquadPlayer[]; bench: SquadPlayer[] },
  seasonFixtures: SeasonFixtures,
  upcomingGw: number,
  projMaps: Map<string, ProjectionStat>[],
): ChipTip {
  const owned = [...squad.starters, ...squad.bench];
  let bestGw: number | null = null;
  let bestDoublers = 0;
  for (const gw of gwRange(seasonFixtures, upcomingGw)) {
    const doublers = owned.filter((p) => clubFixtureCount(seasonFixtures, p.club, gw) === 2).length;
    if (doublers > bestDoublers) {
      bestDoublers = doublers;
      bestGw = gw;
    }
  }
  if (bestGw == null) return { title: 'Hold', lines: ['No double gameweek scheduled yet'] };
  const lines = [`${bestDoublers} of your players play twice in GW${bestGw}`];
  const offset = bestGw - upcomingGw;
  if (offset >= 0 && offset < projMaps.length) {
    const benchPts = squad.bench.reduce((s, p) => s + (projMaps[offset].get(p.id)?.p50 ?? 0), 0);
    if (benchPts > 0) lines.push(`~${round1(benchPts)} projected from your bench`);
  }
  return { title: headline(bestGw, upcomingGw), lines };
}

export function freeHitTip(
  owned: Player[],
  seasonFixtures: SeasonFixtures,
  upcomingGw: number,
): ChipTip {
  for (const gw of gwRange(seasonFixtures, upcomingGw)) {
    const withFixture = owned.filter((p) => clubFixtureCount(seasonFixtures, p.club, gw) >= 1).length;
    if (withFixture < FH_MIN_PLAYERS) {
      return {
        title: headline(gw, upcomingGw),
        lines: [`Only ${withFixture} of your players have a fixture in GW${gw}`],
      };
    }
  }
  return { title: 'Hold', lines: ['No blank gameweek scheduled'] };
}
