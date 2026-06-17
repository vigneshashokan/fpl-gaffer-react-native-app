import { assertEquals } from '@std/assert';
import type { SupabaseClient } from '@supabase/supabase-js';
import { runBackfill, type BackfillDeps } from '../../../scripts/backfill-history.ts';

const BOOTSTRAP = {
  teams: [],
  elements: [
    { id: 1, web_name: 'A', first_name: 'A', second_name: 'A', team: 10,
      element_type: 3, now_cost: 50, form: '0.0', total_points: 0, status: 'a',
      news: '', news_added: null, chance_of_playing_next_round: null,
      ep_next: '0.0', ep_this: '0.0', selected_by_percent: '0.0',
      ict_index: '0.0', bps: 0, transfers_in_event: 0 },
    { id: 2, web_name: 'B', first_name: 'B', second_name: 'B', team: 11,
      element_type: 4, now_cost: 60, form: '0.0', total_points: 0, status: 'a',
      news: '', news_added: null, chance_of_playing_next_round: null,
      ep_next: '0.0', ep_this: '0.0', selected_by_percent: '0.0',
      ict_index: '0.0', bps: 0, transfers_in_event: 0 },
  ],
};

const HISTORY_ROW = {
  fixture: 100, opponent_team: 5, was_home: true, round: 1, minutes: 90,
  starts: 1, goals_scored: 0, assists: 0, clean_sheets: 0, goals_conceded: 0,
  bonus: 0, bps: 10, total_points: 2, expected_goals: '0.10',
  expected_assists: '0.20', expected_goal_involvements: '0.30',
  expected_goals_conceded: '0.90', ict_index: '5.0', influence: '10.0',
  creativity: '8.0', threat: '12.0', defensive_contribution: 1, value: 50,
};

function fakeFetch(): typeof globalThis.fetch {
  return ((url: string | URL | Request) => {
    const u = String(url);
    if (u.includes('bootstrap-static')) {
      return Promise.resolve(new Response(JSON.stringify(BOOTSTRAP)));
    }
    // element-summary/{id}/ → one history row whose element id matches the URL
    const id = Number(u.match(/element-summary\/(\d+)/)![1]);
    return Promise.resolve(
      new Response(JSON.stringify({ history: [{ ...HISTORY_ROW, element: id }] })),
    );
  }) as typeof globalThis.fetch;
}

function fakeSupabase(captured: unknown[][]): SupabaseClient {
  return {
    from: (_table: string) => ({
      upsert: (rows: unknown[], _opts?: unknown) => {
        captured.push(rows);
        return Promise.resolve({ error: null });
      },
    }),
  } as unknown as SupabaseClient;
}

function deps(captured: unknown[][]): BackfillDeps {
  return { supabase: fakeSupabase(captured), fetch: fakeFetch(), sleep: () => Promise.resolve(), log: () => {} };
}

Deno.test('runBackfill fetches each player and upserts normalized rows', async () => {
  const captured: unknown[][] = [];
  const result = await runBackfill(deps(captured), { season: '2025/26', delayMs: 0 });
  assertEquals(result.players, 2);
  assertEquals(result.rows, 2);
  const all = captured.flat() as Array<{ player_id: number; season: string; gw: number }>;
  assertEquals(all.map((r) => r.player_id).sort(), [1, 2]);
  assertEquals(all[0].season, '2025/26');
  assertEquals(all[0].gw, 1);
});

Deno.test('runBackfill respects limit and dryRun (no upsert when dryRun)', async () => {
  const captured: unknown[][] = [];
  const result = await runBackfill(deps(captured), { season: '2025/26', limit: 1, dryRun: true, delayMs: 0 });
  assertEquals(result.players, 1);
  assertEquals(result.rows, 1);
  assertEquals(captured.length, 0); // dryRun → nothing written
});
