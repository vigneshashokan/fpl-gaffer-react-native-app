// Standalone one-time backfill of 2025/26 per-GW history into player_gw_history.
//
// Run (local stack):
//   export SUPABASE_URL=http://127.0.0.1:54321
//   export SUPABASE_SERVICE_ROLE_KEY=<from `supabase status`>
//   deno run --allow-net --allow-env \
//     --config supabase/functions/fpl-ingest/deno.json \
//     supabase/scripts/backfill-history.ts
//
// Flags: --season=2025/26  --limit=N  --dry-run  --delay-ms=120

import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchJson } from '../functions/fpl-ingest/lib/fpl-client.ts';
import { createAdminClient } from '../functions/fpl-ingest/lib/supabase-admin.ts';
import {
  normalizePlayers,
  type BootstrapStaticResponse,
} from '../functions/fpl-ingest/sources/bootstrap.ts';
import {
  normalizeHistory,
  type ElementSummaryResponse,
  type PlayerGwHistoryRow,
} from '../functions/fpl-ingest/sources/history.ts';

export interface BackfillDeps {
  supabase: SupabaseClient;
  fetch: typeof globalThis.fetch;
  sleep: (ms: number) => Promise<void>;
  log: (msg: string) => void;
}

export interface BackfillOpts {
  season: string;
  limit?: number;
  dryRun?: boolean;
  delayMs?: number;
}

const CHUNK = 500;

export async function runBackfill(
  deps: BackfillDeps,
  opts: BackfillOpts,
): Promise<{ players: number; rows: number }> {
  const delayMs = opts.delayMs ?? 120;

  const boot = await fetchJson<BootstrapStaticResponse>(
    'https://fantasy.premierleague.com/api/bootstrap-static/',
    { fetch: deps.fetch },
  );
  let players = normalizePlayers(boot); // { id, position, team_id, ... }
  if (opts.limit !== undefined) players = players.slice(0, opts.limit);

  const allRows: PlayerGwHistoryRow[] = [];
  let done = 0;
  for (const p of players) {
    const summary = await fetchJson<ElementSummaryResponse>(
      `https://fantasy.premierleague.com/api/element-summary/${p.id}/`,
      { fetch: deps.fetch },
    );
    allRows.push(
      ...normalizeHistory(opts.season, { position: p.position, teamId: p.team_id }, summary.history),
    );
    done++;
    if (done % 50 === 0) deps.log(`fetched ${done}/${players.length} players, ${allRows.length} rows`);
    if (delayMs > 0) await deps.sleep(delayMs);
  }

  if (!opts.dryRun) {
    for (let i = 0; i < allRows.length; i += CHUNK) {
      const chunk = allRows.slice(i, i + CHUNK);
      const { error } = await deps.supabase
        .from('player_gw_history')
        .upsert(chunk, { onConflict: 'season,player_id,fixture_id' });
      if (error) throw error;
    }
  }

  deps.log(`done: ${players.length} players, ${allRows.length} rows${opts.dryRun ? ' (dry-run, not written)' : ''}`);
  return { players: players.length, rows: allRows.length };
}

function parseArgs(args: string[]): BackfillOpts {
  const get = (k: string) => args.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
  return {
    season: get('season') ?? '2025/26',
    limit: get('limit') ? Number(get('limit')) : undefined,
    dryRun: args.includes('--dry-run'),
    delayMs: get('delay-ms') ? Number(get('delay-ms')) : undefined,
  };
}

if (import.meta.main) {
  const opts = parseArgs(Deno.args);
  const deps: BackfillDeps = {
    supabase: createAdminClient(),
    fetch: globalThis.fetch,
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    log: (m) => console.log(`[backfill] ${m}`),
  };
  const result = await runBackfill(deps, opts);
  console.log(`[backfill] complete:`, result);
}
