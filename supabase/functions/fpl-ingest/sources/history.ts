import type { Position } from './bootstrap.ts';

export interface ElementSummaryHistoryRow {
  element: number;
  fixture: number;
  opponent_team: number;
  was_home: boolean;
  round: number;
  minutes: number;
  starts: number;
  goals_scored: number;
  assists: number;
  clean_sheets: number;
  goals_conceded: number;
  bonus: number;
  bps: number;
  total_points: number;
  expected_goals: string;
  expected_assists: string;
  expected_goal_involvements: string;
  expected_goals_conceded: string;
  ict_index: string;
  influence: string;
  creativity: string;
  threat: string;
  defensive_contribution: number;
  value: number;
}

export interface ElementSummaryResponse {
  history: ElementSummaryHistoryRow[];
}

export interface PlayerGwHistoryRow {
  season: string;
  player_id: number;
  fixture_id: number;
  gw: number;
  position: Position;
  team_id: number;
  opponent_team: number;
  was_home: boolean;
  minutes: number;
  starts: number;
  goals_scored: number;
  assists: number;
  clean_sheets: number;
  goals_conceded: number;
  bonus: number;
  bps: number;
  total_points: number;
  expected_goals: number;
  expected_assists: number;
  expected_goal_involvements: number;
  expected_goals_conceded: number;
  ict_index: number;
  influence: number;
  creativity: number;
  threat: number;
  defensive_contribution: number;
  value: number;
}

function num(s: string | number | null | undefined): number {
  const n = typeof s === 'number' ? s : parseFloat(s ?? '');
  return Number.isFinite(n) ? n : 0;
}

export function normalizeHistory(
  season: string,
  meta: { position: Position; teamId: number },
  rows: ElementSummaryHistoryRow[],
): PlayerGwHistoryRow[] {
  return rows.map((r) => ({
    season,
    player_id: r.element,
    fixture_id: r.fixture,
    gw: r.round,
    position: meta.position,
    team_id: meta.teamId,
    opponent_team: r.opponent_team,
    was_home: r.was_home,
    minutes: r.minutes,
    starts: r.starts,
    goals_scored: r.goals_scored,
    assists: r.assists,
    clean_sheets: r.clean_sheets,
    goals_conceded: r.goals_conceded,
    bonus: r.bonus,
    bps: r.bps,
    total_points: r.total_points,
    expected_goals: num(r.expected_goals),
    expected_assists: num(r.expected_assists),
    expected_goal_involvements: num(r.expected_goal_involvements),
    expected_goals_conceded: num(r.expected_goals_conceded),
    ict_index: num(r.ict_index),
    influence: num(r.influence),
    creativity: num(r.creativity),
    threat: num(r.threat),
    defensive_contribution: r.defensive_contribution,
    value: r.value,
  }));
}

export interface HistoryEvent {
  id: number;
  finished: boolean;
  data_checked: boolean;
}

// Current-season GWs that are finished AND bonus-settled, minus those already
// captured. Ascending. Drives the self-healing capture loop.
export function selectMissingGws(events: HistoryEvent[], presentGws: number[]): number[] {
  const present = new Set(presentGws);
  return events
    .filter((e) => e.finished && e.data_checked && !present.has(e.id))
    .map((e) => e.id)
    .sort((a, b) => a - b);
}

// event/{gw}/live element. xG / ict / influence / creativity / threat arrive as
// strings (like element-summary); the rest as numbers. `num()` coerces both.
export interface LiveElementStats {
  minutes: number;
  starts: number;
  goals_scored: number;
  assists: number;
  clean_sheets: number;
  goals_conceded: number;
  bonus: number;
  bps: number;
  total_points: number;
  expected_goals: string;
  expected_assists: string;
  expected_goal_involvements: string;
  expected_goals_conceded: string;
  influence: string;
  creativity: string;
  threat: string;
  ict_index: string;
  defensive_contribution: number;
}

export interface LiveElement {
  id: number;
  stats: LiveElementStats;
}

export interface LiveEventResponse {
  elements: LiveElement[];
}

export interface ElementMeta {
  position: Position;
  team_id: number;
  now_cost: number;
}

export interface GwFixture {
  fixture_id: number;
  team_h: number;
  team_a: number;
}

// Build per-player history rows for one GW from the live endpoint, joining the
// fixtures table (opponent / was_home) and bootstrap meta (position / team /
// price). Every element whose club played gets a row (incl. 0-minute rows).
// Blank GW → no row. DGW → one row on the first fixture by id (aggregate stats).
export function liveToHistoryRows(
  season: string,
  gw: number,
  liveByElement: Map<number, LiveElementStats>,
  elementMeta: Map<number, ElementMeta>,
  gwFixtures: GwFixture[],
): PlayerGwHistoryRow[] {
  const rows: PlayerGwHistoryRow[] = [];
  for (const [playerId, meta] of elementMeta) {
    const clubFixtures = gwFixtures
      .filter((f) => f.team_h === meta.team_id || f.team_a === meta.team_id)
      .sort((a, b) => a.fixture_id - b.fixture_id);
    if (clubFixtures.length === 0) continue; // blank GW
    const fx = clubFixtures[0]; // DGW → first fixture
    const s = liveByElement.get(playerId);
    if (!s) continue; // element absent from live (defensive)
    const wasHome = fx.team_h === meta.team_id;
    rows.push({
      season,
      player_id: playerId,
      fixture_id: fx.fixture_id,
      gw,
      position: meta.position,
      team_id: meta.team_id,
      opponent_team: wasHome ? fx.team_a : fx.team_h,
      was_home: wasHome,
      minutes: s.minutes,
      starts: s.starts,
      goals_scored: s.goals_scored,
      assists: s.assists,
      clean_sheets: s.clean_sheets,
      goals_conceded: s.goals_conceded,
      bonus: s.bonus,
      bps: s.bps,
      total_points: s.total_points,
      expected_goals: num(s.expected_goals),
      expected_assists: num(s.expected_assists),
      expected_goal_involvements: num(s.expected_goal_involvements),
      expected_goals_conceded: num(s.expected_goals_conceded),
      ict_index: num(s.ict_index),
      influence: num(s.influence),
      creativity: num(s.creativity),
      threat: num(s.threat),
      defensive_contribution: s.defensive_contribution,
      value: meta.now_cost,
    });
  }
  return rows;
}
