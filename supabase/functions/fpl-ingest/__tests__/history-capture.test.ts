import { assertEquals } from '@std/assert';
import {
  liveToHistoryRows,
  selectMissingGws,
  type ElementMeta,
  type GwFixture,
  type HistoryEvent,
  type LiveElementStats,
} from '../sources/history.ts';

const EVENTS: HistoryEvent[] = [
  { id: 1, finished: true, data_checked: true },
  { id: 2, finished: true, data_checked: true },
  { id: 3, finished: true, data_checked: false }, // bonus not settled yet
  { id: 4, finished: false, data_checked: false }, // not played
];

Deno.test('selectMissingGws: only finished+data_checked GWs not already present', () => {
  assertEquals(selectMissingGws(EVENTS, [1]), [2]);
});

Deno.test('selectMissingGws: empty when everything settled is already captured', () => {
  assertEquals(selectMissingGws(EVENTS, [1, 2]), []);
});

Deno.test('selectMissingGws: returns all uncaptured settled GWs, ascending', () => {
  assertEquals(selectMissingGws(EVENTS, []), [1, 2]);
});

Deno.test('selectMissingGws: excludes finished-but-not-data_checked GWs', () => {
  const out = selectMissingGws(EVENTS, []);
  assertEquals(out.includes(3), false);
});

function stats(over: Partial<LiveElementStats> = {}): LiveElementStats {
  return {
    minutes: 90, starts: 1, goals_scored: 0, assists: 0, clean_sheets: 0,
    goals_conceded: 0, bonus: 0, bps: 0, total_points: 2,
    expected_goals: '0.00', expected_assists: '0.00', expected_goal_involvements: '0.00',
    expected_goals_conceded: '0.00', influence: '0.0', creativity: '0.0', threat: '0.0',
    ict_index: '0.0', defensive_contribution: 0, ...over,
  };
}

// team 12 plays one fixture (home vs 9); team 3 has a DGW (fx 11 home, fx 12 away);
// team 5 is blank (no fixture this GW).
const GW_FIXTURES: GwFixture[] = [
  { fixture_id: 10, team_h: 12, team_a: 9 },
  { fixture_id: 12, team_h: 7, team_a: 3 },
  { fixture_id: 11, team_h: 3, team_a: 7 },
];
const META = new Map<number, ElementMeta>([
  [100, { position: 'MID', team_id: 12, now_cost: 75 }],
  [200, { position: 'FWD', team_id: 5, now_cost: 60 }],  // blank GW
  [300, { position: 'DEF', team_id: 3, now_cost: 50 }],  // DGW
]);

Deno.test('liveToHistoryRows: maps a single-fixture player with opponent/home from fixtures', () => {
  const live = new Map<number, LiveElementStats>([
    [100, stats({ goals_scored: 1, bps: 30, total_points: 9, expected_goals: '0.74', threat: '41.0' })],
  ]);
  const rows = liveToHistoryRows('2026/27', 2, live, new Map([[100, META.get(100)!]]), GW_FIXTURES);
  assertEquals(rows.length, 1);
  const r = rows[0];
  assertEquals(r.season, '2026/27');
  assertEquals(r.player_id, 100);
  assertEquals(r.gw, 2);
  assertEquals(r.fixture_id, 10);
  assertEquals(r.was_home, true);
  assertEquals(r.opponent_team, 9);
  assertEquals(r.position, 'MID');
  assertEquals(r.team_id, 12);
  assertEquals(r.value, 75);          // value = now_cost
  assertEquals(r.goals_scored, 1);
  assertEquals(r.bps, 30);
  assertEquals(typeof r.expected_goals, 'number');
  assertEquals(r.expected_goals, 0.74); // string "0.74" coerced
  assertEquals(r.threat, 41.0);
});

Deno.test('liveToHistoryRows: a blank-GW club gets no row', () => {
  const live = new Map<number, LiveElementStats>([[200, stats({ minutes: 0, starts: 0, total_points: 0 })]]);
  const rows = liveToHistoryRows('2026/27', 2, live, new Map([[200, META.get(200)!]]), GW_FIXTURES);
  assertEquals(rows.length, 0);
});

Deno.test('liveToHistoryRows: a DGW collapses to one row on the first fixture by id', () => {
  const live = new Map<number, LiveElementStats>([[300, stats({ clean_sheets: 1, total_points: 6 })]]);
  const rows = liveToHistoryRows('2026/27', 2, live, new Map([[300, META.get(300)!]]), GW_FIXTURES);
  assertEquals(rows.length, 1);
  assertEquals(rows[0].fixture_id, 11);  // min(11, 12)
  assertEquals(rows[0].was_home, true);  // team 3 is home in fixture 11
  assertEquals(rows[0].opponent_team, 7);
});

Deno.test('liveToHistoryRows: a 0-minute player whose club played still gets a row', () => {
  const live = new Map<number, LiveElementStats>([[100, stats({ minutes: 0, starts: 0, total_points: 0 })]]);
  const rows = liveToHistoryRows('2026/27', 2, live, new Map([[100, META.get(100)!]]), GW_FIXTURES);
  assertEquals(rows.length, 1);
  assertEquals(rows[0].minutes, 0);
});
