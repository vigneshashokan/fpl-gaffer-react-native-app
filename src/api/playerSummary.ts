// src/api/playerSummary.ts
//
// Lazy per-player history + upcoming fixtures from the public FPL
// /element-summary/{id}/ endpoint. history[] drives the form sparkline;
// fixtures[] drives the next-5 FDR strip. Other fields in the payload
// (expected_goals, etc.) are intentionally ignored at this tier.

import { useQuery } from '@tanstack/react-query';
import { fplGet } from './fpl-client';
import { queryKeys } from './queryKeys';

export interface SummaryHistoryRow {
  round: number;
  total_points: number;
}
export interface SummaryFixtureRow {
  event: number | null;
  is_home: boolean;
  team_h: number;
  team_a: number;
  difficulty: number;
}
export interface ElementSummary {
  history: SummaryHistoryRow[];
  fixtures: SummaryFixtureRow[];
}

export interface FormPoint {
  round: number;
  points: number;
}
export interface NextFixture {
  event: number | null;
  isHome: boolean;
  opponentTeamId: number;
  difficulty: number;
}

export function last5FromHistory(history: SummaryHistoryRow[]): FormPoint[] {
  return [...history]
    .sort((a, b) => a.round - b.round)
    .slice(-5)
    .map((h) => ({ round: h.round, points: h.total_points }));
}

export function next5Fixtures(fixtures: SummaryFixtureRow[]): NextFixture[] {
  return fixtures.slice(0, 5).map((f) => ({
    event: f.event,
    isHome: f.is_home,
    opponentTeamId: f.is_home ? f.team_a : f.team_h,
    difficulty: f.difficulty,
  }));
}

export function fetchPlayerSummary(id: string): Promise<ElementSummary> {
  return fplGet<ElementSummary>(`/element-summary/${id}/`);
}

export function useElementSummary(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.elementSummary(id ?? ''),
    queryFn: () => fetchPlayerSummary(id as string),
    enabled: !!id,
    staleTime: 15 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}
