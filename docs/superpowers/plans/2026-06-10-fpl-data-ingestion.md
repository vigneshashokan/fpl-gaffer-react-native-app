# FPL Data Ingestion Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the scheduled Supabase job that hydrates `clubs`, `players`, and `fixtures` from the public FPL API — closing issue #20 — using two SQL migrations (reference data + cron), one Edge Function (`fpl-ingest`) with internal modules per source, a local-integration script, and `docs/fpl-api.md`.

**Architecture:** `pg_cron` fires twice a week and calls our Edge Function via `pg_net.http_post`. The function dispatches by `?source=` (`bootstrap` or `fixtures`), runs source-specific logic (a calendar gate for bootstrap, a content-hash gate for fixtures), upserts via the `service_role` key, and closes exactly one `ingestion_runs` row per invocation. Off-season + non-window cron fires log a `skipped` row and exit without touching FPL.

**Tech Stack:** Supabase Postgres (four new tables + RLS + indexes), `pg_cron` + `pg_net` extensions, Supabase Vault (URL + anon key), Supabase Edge Functions (Deno; `jsr:@supabase/supabase-js@2`, built-in `fetch`, `crypto.subtle.digest`), Deno's built-in test runner (`deno test`).

**Spec:** `docs/superpowers/specs/2026-06-10-fpl-data-ingestion-design.md`

---

## File Map

| Path | Purpose | Status |
|---|---|---|
| `supabase/migrations/20260610010000_fpl_reference_data.sql` | `clubs`, `players`, `fixtures`, `ingestion_runs` + RLS + indexes | NEW |
| `supabase/migrations/20260610020000_fpl_ingest_cron.sql` | `pg_cron` + `pg_net` extensions and two scheduled jobs | NEW |
| `supabase/functions/fpl-ingest/deno.json` | Import map (matches `ping/deno.json` style) | NEW |
| `supabase/functions/fpl-ingest/index.ts` | Entry: route by `?source=`, run lifecycle, error handling | NEW |
| `supabase/functions/fpl-ingest/lib/calendar.ts` | `isPLSeasonActive`, `isInTransferWindow` | NEW |
| `supabase/functions/fpl-ingest/lib/hash.ts` | `sha256Hex(str)` over normalized projection | NEW |
| `supabase/functions/fpl-ingest/lib/supabase-admin.ts` | service-role client factory | NEW |
| `supabase/functions/fpl-ingest/lib/ingestion-runs.ts` | `startRun`, `finishRun`, `skipRun`, `errorRun` | NEW |
| `supabase/functions/fpl-ingest/lib/fpl-client.ts` | `fetchJson(url, { fetch?, timeoutMs?, retries? })` | NEW |
| `supabase/functions/fpl-ingest/sources/bootstrap.ts` | `normalizeClubs`, `normalizePlayers`, `ingestBootstrap` | NEW |
| `supabase/functions/fpl-ingest/sources/fixtures.ts` | `normalizeFixtures`, `projectForHash`, `ingestFixtures` | NEW |
| `supabase/functions/fpl-ingest/__tests__/calendar.test.ts` | Boundary-date tests | NEW |
| `supabase/functions/fpl-ingest/__tests__/hash.test.ts` | Determinism + difference tests | NEW |
| `supabase/functions/fpl-ingest/__tests__/ingestion-runs.test.ts` | Helper unit tests (mock SupabaseClient) | NEW |
| `supabase/functions/fpl-ingest/__tests__/fpl-client.test.ts` | Timeout + retry tests (stubbed `fetch`) | NEW |
| `supabase/functions/fpl-ingest/__tests__/bootstrap.test.ts` | `normalizeClubs`/`normalizePlayers` against fixture JSON | NEW |
| `supabase/functions/fpl-ingest/__tests__/fixtures.test.ts` | `normalizeFixtures` + `projectForHash` against fixture JSON | NEW |
| `supabase/functions/fpl-ingest/__tests__/index.test.ts` | Dispatch + 400 on bad source | NEW |
| `supabase/functions/fpl-ingest/__tests__/_fixtures/bootstrap-static.json` | Trimmed FPL bootstrap response (2 clubs, 3 players) | NEW |
| `supabase/functions/fpl-ingest/__tests__/_fixtures/fixtures.json` | Trimmed FPL fixtures response (3 fixtures) | NEW |
| `scripts/test-ingest-locally.sh` | One-command local E2E against `supabase start` | NEW |
| `.github/workflows/deploy-supabase.yml` | Add `fpl-ingest` to the functions deploy step | EDIT |
| `docs/fpl-api.md` | Endpoint quirks, refresh cadence, manual ops, known limits | NEW |
| `docs/architecture.md` | Add one-time vault-secrets setup snippet | EDIT |

---

## Conventions

- **Working directory** for every command: `/Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app`.
- **Branch:** all commits go to `spec/issue-20-fpl-data-ingestion` (already checked out from the spec commit `e65c33a`). When implementation begins, optionally rename the branch to `feat/fpl-data-ingestion` first: `git branch -m spec/issue-20-fpl-data-ingestion feat/fpl-data-ingestion`.
- **Deno tests:** run via `cd supabase/functions/fpl-ingest && deno test --allow-env --allow-read __tests__/`. Use `-- --filter '<name>'` for targeting (note the double dashes: `deno test ... -- --filter`).
- **Mocks:** dependency-injected. Modules accept their dependencies (`fetch`, `SupabaseClient`, `now`) as parameters, so tests pass stubs without globals.
- **Commit messages:** imperative style matching the repo's existing commits (e.g., "Add X", "Wire Y to Z").
- **Migration timestamps:** `20260610010000_*` (reference data) precedes `20260610020000_*` (cron). Both come after the existing `20260610000000_account_deletion.sql`.

---

## Task 1: Reference data migration

**Files:**
- Create: `supabase/migrations/20260610010000_fpl_reference_data.sql`

No automated test — applied via `supabase db reset` locally if the implementer has the CLI configured. The structure mirrors the existing `20260607000000_initial_schema.sql`.

- [ ] **Step 1: Create the migration**

Create `supabase/migrations/20260610010000_fpl_reference_data.sql`:

```sql
-- FPL reference data tables for issue #20.
--
-- Four tables:
--   - clubs            (20 rows; FPL teams)
--   - players          (~600 rows; FPL elements)
--   - fixtures         (~380 rows per season)
--   - ingestion_runs   (operator-facing; one row per cron fire)
--
-- RLS: clubs/players/fixtures are SELECT-only for `authenticated`; writes
-- go through service_role (Edge Function only). ingestion_runs is
-- service_role only.

----------------------------------------------------------------------
-- clubs
----------------------------------------------------------------------
create table public.clubs (
  id                       smallint  primary key,
  name                     text      not null,
  short_name               text      not null,
  code                     integer   not null,
  strength_overall_home    smallint  not null,
  strength_overall_away    smallint  not null,
  strength_attack_home     smallint  not null,
  strength_attack_away     smallint  not null,
  strength_defence_home    smallint  not null,
  strength_defence_away    smallint  not null,
  updated_at               timestamptz not null default now()
);

alter table public.clubs enable row level security;

create policy "clubs: authenticated select" on public.clubs
  for select to authenticated using (true);

grant select on public.clubs to authenticated;

----------------------------------------------------------------------
-- players
----------------------------------------------------------------------
create table public.players (
  id                              integer   primary key,
  web_name                        text      not null,
  full_name                       text      not null,
  team_id                         smallint  not null references public.clubs(id),
  position                        text      not null check (position in ('GKP','DEF','MID','FWD')),
  now_cost                        smallint  not null,
  form                            numeric(3,1) not null,
  total_points                    smallint  not null,
  status                          char(1)   not null,
  news                            text      not null default '',
  news_added                      timestamptz,
  chance_of_playing_next_round    smallint,
  ep_next                         numeric(4,1) not null,
  ep_this                         numeric(4,1) not null,
  selected_by_percent             numeric(4,1) not null,
  ict_index                       numeric(5,1) not null,
  bps                             integer   not null,
  transfers_in_event              integer   not null,
  updated_at                      timestamptz not null default now()
);

alter table public.players enable row level security;

create policy "players: authenticated select" on public.players
  for select to authenticated using (true);

grant select on public.players to authenticated;

create index players_team_id_idx  on public.players (team_id);
create index players_position_idx on public.players (position);
create index players_status_idx   on public.players (status) where status <> 'a';

----------------------------------------------------------------------
-- fixtures
----------------------------------------------------------------------
create table public.fixtures (
  id                     integer  primary key,
  event                  smallint,
  kickoff_time           timestamptz,
  team_h                 smallint not null references public.clubs(id),
  team_a                 smallint not null references public.clubs(id),
  team_h_difficulty      smallint not null,
  team_a_difficulty      smallint not null,
  team_h_score           smallint,
  team_a_score           smallint,
  started                boolean  not null default false,
  finished               boolean  not null default false,
  finished_provisional   boolean  not null default false,
  updated_at             timestamptz not null default now()
);

alter table public.fixtures enable row level security;

create policy "fixtures: authenticated select" on public.fixtures
  for select to authenticated using (true);

grant select on public.fixtures to authenticated;

create index fixtures_event_idx        on public.fixtures (event);
create index fixtures_kickoff_idx      on public.fixtures (kickoff_time);
create index fixtures_team_h_event_idx on public.fixtures (team_h, event);
create index fixtures_team_a_event_idx on public.fixtures (team_a, event);

----------------------------------------------------------------------
-- ingestion_runs
----------------------------------------------------------------------
create table public.ingestion_runs (
  id              uuid primary key default gen_random_uuid(),
  source          text not null check (source in ('bootstrap','fixtures')),
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  status          text not null check (status in ('success','skipped','error')),
  skip_reason     text,
  rows_upserted   integer,
  content_hash    text,
  error_message   text
);

alter table public.ingestion_runs enable row level security;
-- No policies; only service_role can read/write.

create index ingestion_runs_source_started_idx
  on public.ingestion_runs (source, started_at desc);
```

- [ ] **Step 2: Smoke-check via local Postgres (if Supabase CLI is configured)**

```bash
supabase db reset
```

Expected: no errors. All four tables exist with the listed columns. (If `supabase start` is not running, skip this step — the migration is applied in production via `supabase db push` on merge.)

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260610010000_fpl_reference_data.sql
git commit -m "Add FPL reference data tables: clubs, players, fixtures, ingestion_runs"
```

---

## Task 2: Edge Function scaffold

**Files:**
- Create: `supabase/functions/fpl-ingest/deno.json`
- Create: `supabase/functions/fpl-ingest/index.ts`
- Create: `supabase/functions/fpl-ingest/__tests__/index.test.ts`

This task stands up the minimum: `deno.json`, an `index.ts` that returns 400 on a missing/invalid source, and a test that proves it. Source-specific behavior arrives in Tasks 9–11.

- [ ] **Step 1: Create `deno.json`**

Create `supabase/functions/fpl-ingest/deno.json`:

```json
{
  "imports": {
    "@supabase/functions-js": "jsr:@supabase/functions-js@^2",
    "@supabase/supabase-js": "jsr:@supabase/supabase-js@^2",
    "@std/assert": "jsr:@std/assert@^1"
  }
}
```

- [ ] **Step 2: Write the failing test**

Create `supabase/functions/fpl-ingest/__tests__/index.test.ts`:

```ts
import { assertEquals } from '@std/assert';
import { handler } from '../index.ts';

Deno.test('returns 400 when source query param is missing', async () => {
  const req = new Request('http://localhost/functions/v1/fpl-ingest');
  const res = await handler(req);
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, 'missing or invalid ?source= (expected bootstrap|fixtures)');
});

Deno.test('returns 400 when source query param is unrecognised', async () => {
  const req = new Request('http://localhost/functions/v1/fpl-ingest?source=garbage');
  const res = await handler(req);
  assertEquals(res.status, 400);
});
```

- [ ] **Step 3: Run the test, verify it fails**

```bash
cd supabase/functions/fpl-ingest && deno test --allow-env --allow-read __tests__/index.test.ts
```

Expected: FAIL — `Module not found "../index.ts"`.

- [ ] **Step 4: Implement the scaffold**

Create `supabase/functions/fpl-ingest/index.ts`:

```ts
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

type Source = 'bootstrap' | 'fixtures';

const isSource = (s: string | null): s is Source =>
  s === 'bootstrap' || s === 'fixtures';

export async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const source = url.searchParams.get('source');

  if (!isSource(source)) {
    return Response.json(
      { error: 'missing or invalid ?source= (expected bootstrap|fixtures)' },
      { status: 400 },
    );
  }

  // Real dispatch lands in Task 11. For now, signal not-yet-wired.
  return Response.json({ error: 'not implemented yet' }, { status: 501 });
}

Deno.serve(handler);
```

- [ ] **Step 5: Run the test, verify it passes**

```bash
cd supabase/functions/fpl-ingest && deno test --allow-env --allow-read __tests__/index.test.ts
```

Expected: 2/2 passing.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/fpl-ingest/deno.json \
        supabase/functions/fpl-ingest/index.ts \
        supabase/functions/fpl-ingest/__tests__/index.test.ts
git commit -m "Scaffold fpl-ingest Edge Function with source param validation"
```

---

## Task 3: `lib/calendar.ts`

**Files:**
- Create: `supabase/functions/fpl-ingest/lib/calendar.ts`
- Create: `supabase/functions/fpl-ingest/__tests__/calendar.test.ts`

- [ ] **Step 1: Write failing tests**

Create `supabase/functions/fpl-ingest/__tests__/calendar.test.ts`:

```ts
import { assertEquals } from '@std/assert';
import { isInTransferWindow, isPLSeasonActive } from '../lib/calendar.ts';

Deno.test('isPLSeasonActive: true on the start boundary', () => {
  assertEquals(isPLSeasonActive(new Date('2026-08-15T00:00:00Z')), true);
});

Deno.test('isPLSeasonActive: true on the end boundary', () => {
  assertEquals(isPLSeasonActive(new Date('2027-05-25T00:00:00Z')), true);
});

Deno.test('isPLSeasonActive: false the day before season starts', () => {
  assertEquals(isPLSeasonActive(new Date('2026-08-14T23:59:59Z')), false);
});

Deno.test('isPLSeasonActive: false the day after season ends', () => {
  assertEquals(isPLSeasonActive(new Date('2027-05-26T00:00:00Z')), false);
});

Deno.test('isInTransferWindow: true inside summer window', () => {
  assertEquals(isInTransferWindow(new Date('2026-07-04T12:00:00Z')), true);
});

Deno.test('isInTransferWindow: true on summer window edges', () => {
  assertEquals(isInTransferWindow(new Date('2026-06-15T00:00:00Z')), true);
  assertEquals(isInTransferWindow(new Date('2026-09-01T00:00:00Z')), true);
});

Deno.test('isInTransferWindow: true inside winter window', () => {
  assertEquals(isInTransferWindow(new Date('2027-01-15T12:00:00Z')), true);
});

Deno.test('isInTransferWindow: false outside both windows', () => {
  assertEquals(isInTransferWindow(new Date('2026-11-01T12:00:00Z')), false);
  assertEquals(isInTransferWindow(new Date('2027-03-15T12:00:00Z')), false);
});

Deno.test('isInTransferWindow: false the day before summer opens', () => {
  assertEquals(isInTransferWindow(new Date('2026-06-14T23:59:59Z')), false);
});

Deno.test('isInTransferWindow: false the day after winter closes', () => {
  assertEquals(isInTransferWindow(new Date('2027-02-02T00:00:00Z')), false);
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
cd supabase/functions/fpl-ingest && deno test --allow-env --allow-read __tests__/calendar.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `supabase/functions/fpl-ingest/lib/calendar.ts`:

```ts
// Season + transfer-window dates. Bumped via PR at season rollover.
//
// Dates are inclusive on both ends and compared via UTC. Mid-day local
// drift around the boundary is fine — we run at 02:00 UTC so the
// boundary is crossed cleanly.

const PL_SEASON_START = new Date('2026-08-15T00:00:00Z');
const PL_SEASON_END   = new Date('2027-05-25T23:59:59Z');

const TRANSFER_WINDOWS: ReadonlyArray<{ start: Date; end: Date }> = [
  { start: new Date('2026-06-15T00:00:00Z'), end: new Date('2026-09-01T23:59:59Z') },
  { start: new Date('2027-01-01T00:00:00Z'), end: new Date('2027-02-01T23:59:59Z') },
];

export function isPLSeasonActive(d: Date): boolean {
  return d >= PL_SEASON_START && d <= PL_SEASON_END;
}

export function isInTransferWindow(d: Date): boolean {
  return TRANSFER_WINDOWS.some((w) => d >= w.start && d <= w.end);
}
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
cd supabase/functions/fpl-ingest && deno test --allow-env --allow-read __tests__/calendar.test.ts
```

Expected: 10/10 passing.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/fpl-ingest/lib/calendar.ts \
        supabase/functions/fpl-ingest/__tests__/calendar.test.ts
git commit -m "Add calendar policy: PL season + transfer window predicates"
```

---

## Task 4: `lib/hash.ts`

**Files:**
- Create: `supabase/functions/fpl-ingest/lib/hash.ts`
- Create: `supabase/functions/fpl-ingest/__tests__/hash.test.ts`

- [ ] **Step 1: Write failing tests**

Create `supabase/functions/fpl-ingest/__tests__/hash.test.ts`:

```ts
import { assert, assertEquals, assertNotEquals } from '@std/assert';
import { sha256Hex } from '../lib/hash.ts';

Deno.test('sha256Hex is deterministic for identical inputs', async () => {
  const a = await sha256Hex('hello');
  const b = await sha256Hex('hello');
  assertEquals(a, b);
});

Deno.test('sha256Hex differs for distinct inputs', async () => {
  const a = await sha256Hex('hello');
  const b = await sha256Hex('hello!');
  assertNotEquals(a, b);
});

Deno.test('sha256Hex returns 64-char lowercase hex', async () => {
  const h = await sha256Hex('hello');
  assertEquals(h.length, 64);
  assert(/^[0-9a-f]+$/.test(h), `expected lowercase hex, got ${h}`);
});

Deno.test('sha256Hex of empty string matches the known SHA-256 of ""', async () => {
  const h = await sha256Hex('');
  // Well-known constant: SHA-256("") = e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  assertEquals(h, 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
cd supabase/functions/fpl-ingest && deno test --allow-env --allow-read __tests__/hash.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `supabase/functions/fpl-ingest/lib/hash.ts`:

```ts
export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(digest);
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return hex;
}
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
cd supabase/functions/fpl-ingest && deno test --allow-env --allow-read __tests__/hash.test.ts
```

Expected: 4/4 passing.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/fpl-ingest/lib/hash.ts \
        supabase/functions/fpl-ingest/__tests__/hash.test.ts
git commit -m "Add sha256Hex helper for fixtures content-hash gate"
```

---

## Task 5: `lib/supabase-admin.ts`

**Files:**
- Create: `supabase/functions/fpl-ingest/lib/supabase-admin.ts`

This module is a thin factory — testing it directly requires running against Supabase and gives no useful signal. Its consumers (`ingestion-runs.ts`, source modules) are tested with their own mocks. No test file in this task.

- [ ] **Step 1: Implement**

Create `supabase/functions/fpl-ingest/lib/supabase-admin.ts`:

```ts
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export function createAdminClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!url) throw new Error('SUPABASE_URL is not set');
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
```

`SUPABASE_URL` is injected automatically by Supabase Edge Functions runtime; `SUPABASE_SERVICE_ROLE_KEY` is set via `supabase secrets set`.

- [ ] **Step 2: Type-check**

```bash
cd supabase/functions/fpl-ingest && deno check lib/supabase-admin.ts
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/fpl-ingest/lib/supabase-admin.ts
git commit -m "Add service-role Supabase client factory"
```

---

## Task 6: `lib/ingestion-runs.ts`

**Files:**
- Create: `supabase/functions/fpl-ingest/lib/ingestion-runs.ts`
- Create: `supabase/functions/fpl-ingest/__tests__/ingestion-runs.test.ts`

This module owns the lifecycle row writes. Tests use a hand-rolled mock that records the calls.

- [ ] **Step 1: Write failing tests**

Create `supabase/functions/fpl-ingest/__tests__/ingestion-runs.test.ts`:

```ts
import { assertEquals } from '@std/assert';
import {
  startRun,
  finishRun,
  skipRun,
  errorRun,
} from '../lib/ingestion-runs.ts';

interface CallLog {
  table: string;
  op: 'insert' | 'update';
  payload: Record<string, unknown>;
  matchId?: string;
}

function makeMockSupabase() {
  const calls: CallLog[] = [];
  const supabase = {
    from(table: string) {
      return {
        insert(payload: Record<string, unknown>) {
          calls.push({ table, op: 'insert', payload });
          return {
            select() {
              return {
                single() {
                  return Promise.resolve({
                    data: { id: 'run-123' },
                    error: null,
                  });
                },
              };
            },
          };
        },
        update(payload: Record<string, unknown>) {
          return {
            eq(_col: string, val: string) {
              calls.push({ table, op: 'update', payload, matchId: val });
              return Promise.resolve({ data: null, error: null });
            },
          };
        },
      };
    },
  };
  // deno-lint-ignore no-explicit-any
  return { supabase: supabase as any, calls };
}

Deno.test('startRun inserts a row and returns the new id', async () => {
  const { supabase, calls } = makeMockSupabase();
  const id = await startRun(supabase, 'bootstrap');
  assertEquals(id, 'run-123');
  assertEquals(calls.length, 1);
  assertEquals(calls[0].table, 'ingestion_runs');
  assertEquals(calls[0].op, 'insert');
  assertEquals(calls[0].payload.source, 'bootstrap');
});

Deno.test('finishRun updates the row with success status + rows_upserted', async () => {
  const { supabase, calls } = makeMockSupabase();
  await finishRun(supabase, 'run-123', { rowsUpserted: 620 });
  assertEquals(calls.length, 1);
  assertEquals(calls[0].op, 'update');
  assertEquals(calls[0].matchId, 'run-123');
  assertEquals(calls[0].payload.status, 'success');
  assertEquals(calls[0].payload.rows_upserted, 620);
});

Deno.test('finishRun stores content_hash when provided', async () => {
  const { supabase, calls } = makeMockSupabase();
  await finishRun(supabase, 'run-123', { rowsUpserted: 380, contentHash: 'abc' });
  assertEquals(calls[0].payload.content_hash, 'abc');
});

Deno.test('skipRun updates the row with skipped status + reason', async () => {
  const { supabase, calls } = makeMockSupabase();
  await skipRun(supabase, 'run-123', 'outside refresh window');
  assertEquals(calls[0].op, 'update');
  assertEquals(calls[0].payload.status, 'skipped');
  assertEquals(calls[0].payload.skip_reason, 'outside refresh window');
});

Deno.test('skipRun stores content_hash when provided (fixtures no-op case)', async () => {
  const { supabase, calls } = makeMockSupabase();
  await skipRun(supabase, 'run-123', 'no content change', { contentHash: 'abc' });
  assertEquals(calls[0].payload.content_hash, 'abc');
});

Deno.test('errorRun updates the row with error status + truncated error message', async () => {
  const { supabase, calls } = makeMockSupabase();
  const longMessage = 'x'.repeat(3000);
  await errorRun(supabase, 'run-123', new Error(longMessage));
  assertEquals(calls[0].payload.status, 'error');
  const msg = String(calls[0].payload.error_message);
  assertEquals(msg.length <= 2000, true, `expected <=2000 chars, got ${msg.length}`);
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
cd supabase/functions/fpl-ingest && deno test --allow-env --allow-read __tests__/ingestion-runs.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `supabase/functions/fpl-ingest/lib/ingestion-runs.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';

const MAX_ERROR_CHARS = 2000;

export async function startRun(
  supabase: SupabaseClient,
  source: 'bootstrap' | 'fixtures',
): Promise<string> {
  const { data, error } = await supabase
    .from('ingestion_runs')
    .insert({ source, status: 'success' /* provisional; closed by finish/skip/error */ })
    .select()
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function finishRun(
  supabase: SupabaseClient,
  runId: string,
  args: { rowsUpserted: number; contentHash?: string },
): Promise<void> {
  const patch: Record<string, unknown> = {
    finished_at: new Date().toISOString(),
    status: 'success',
    rows_upserted: args.rowsUpserted,
  };
  if (args.contentHash !== undefined) patch.content_hash = args.contentHash;
  await supabase.from('ingestion_runs').update(patch).eq('id', runId);
}

export async function skipRun(
  supabase: SupabaseClient,
  runId: string,
  reason: string,
  args: { contentHash?: string } = {},
): Promise<void> {
  const patch: Record<string, unknown> = {
    finished_at: new Date().toISOString(),
    status: 'skipped',
    skip_reason: reason,
  };
  if (args.contentHash !== undefined) patch.content_hash = args.contentHash;
  await supabase.from('ingestion_runs').update(patch).eq('id', runId);
}

export async function errorRun(
  supabase: SupabaseClient,
  runId: string,
  err: unknown,
): Promise<void> {
  const stack = err instanceof Error ? (err.stack ?? err.message) : String(err);
  const truncated = stack.length > MAX_ERROR_CHARS
    ? stack.slice(0, MAX_ERROR_CHARS)
    : stack;
  await supabase
    .from('ingestion_runs')
    .update({
      finished_at: new Date().toISOString(),
      status: 'error',
      error_message: truncated,
    })
    .eq('id', runId);
}
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
cd supabase/functions/fpl-ingest && deno test --allow-env --allow-read __tests__/ingestion-runs.test.ts
```

Expected: 6/6 passing.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/fpl-ingest/lib/ingestion-runs.ts \
        supabase/functions/fpl-ingest/__tests__/ingestion-runs.test.ts
git commit -m "Add ingestion_runs lifecycle helpers (start/finish/skip/error)"
```

---

## Task 7: `lib/fpl-client.ts`

**Files:**
- Create: `supabase/functions/fpl-ingest/lib/fpl-client.ts`
- Create: `supabase/functions/fpl-ingest/__tests__/fpl-client.test.ts`

- [ ] **Step 1: Write failing tests**

Create `supabase/functions/fpl-ingest/__tests__/fpl-client.test.ts`:

```ts
import { assert, assertEquals, assertRejects } from '@std/assert';
import { fetchJson } from '../lib/fpl-client.ts';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.test('fetchJson returns parsed JSON on 200', async () => {
  const stubFetch: typeof fetch = () => Promise.resolve(jsonResponse({ ok: true }));
  const body = await fetchJson<{ ok: boolean }>('https://example.com/data', {
    fetch: stubFetch,
  });
  assertEquals(body.ok, true);
});

Deno.test('fetchJson retries once on 500 then succeeds', async () => {
  let calls = 0;
  const stubFetch: typeof fetch = () => {
    calls++;
    return Promise.resolve(
      calls === 1 ? jsonResponse({}, 500) : jsonResponse({ ok: true }, 200),
    );
  };
  const body = await fetchJson<{ ok: boolean }>('https://example.com/data', {
    fetch: stubFetch,
    retryDelayMs: 0,
  });
  assertEquals(calls, 2);
  assertEquals(body.ok, true);
});

Deno.test('fetchJson throws after two 5xx attempts', async () => {
  let calls = 0;
  const stubFetch: typeof fetch = () => {
    calls++;
    return Promise.resolve(jsonResponse({}, 503));
  };
  await assertRejects(
    () => fetchJson('https://example.com/data', { fetch: stubFetch, retryDelayMs: 0 }),
    Error,
    'FPL fetch failed: 503',
  );
  assertEquals(calls, 2);
});

Deno.test('fetchJson does NOT retry 4xx errors', async () => {
  let calls = 0;
  const stubFetch: typeof fetch = () => {
    calls++;
    return Promise.resolve(jsonResponse({ err: 'nope' }, 404));
  };
  await assertRejects(
    () => fetchJson('https://example.com/data', { fetch: stubFetch, retryDelayMs: 0 }),
    Error,
    'FPL fetch failed: 404',
  );
  assertEquals(calls, 1);
});

Deno.test('fetchJson aborts when timeout exceeded', async () => {
  const stubFetch: typeof fetch = (_url, init) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(new DOMException('aborted', 'AbortError'));
      });
    });
  let threw = false;
  try {
    await fetchJson('https://example.com/data', {
      fetch: stubFetch,
      timeoutMs: 10,
      retryDelayMs: 0,
    });
  } catch (e) {
    threw = true;
    assert(e instanceof Error);
  }
  assertEquals(threw, true);
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
cd supabase/functions/fpl-ingest && deno test --allow-env --allow-read __tests__/fpl-client.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `supabase/functions/fpl-ingest/lib/fpl-client.ts`:

```ts
export interface FetchJsonOptions {
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
  retryDelayMs?: number;
}

const USER_AGENT = 'fpl-gaffer/1.0 (https://github.com/vigneshashokan/fpl-gaffer-react-native-app)';

export async function fetchJson<T>(
  url: string,
  opts: FetchJsonOptions = {},
): Promise<T> {
  const fetchFn = opts.fetch ?? globalThis.fetch;
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const retryDelayMs = opts.retryDelayMs ?? 2_000;

  const attempt = async (): Promise<Response> => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      return await fetchFn(url, {
        signal: ctrl.signal,
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      });
    } finally {
      clearTimeout(timer);
    }
  };

  let res = await attempt();
  if (res.status >= 500 && res.status < 600) {
    await new Promise((r) => setTimeout(r, retryDelayMs));
    res = await attempt();
  }
  if (!res.ok) {
    throw new Error(`FPL fetch failed: ${res.status} ${res.statusText} for ${url}`);
  }
  return (await res.json()) as T;
}
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
cd supabase/functions/fpl-ingest && deno test --allow-env --allow-read __tests__/fpl-client.test.ts
```

Expected: 5/5 passing.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/fpl-ingest/lib/fpl-client.ts \
        supabase/functions/fpl-ingest/__tests__/fpl-client.test.ts
git commit -m "Add FPL fetch client with timeout + single 5xx retry"
```

---

## Task 8: Test fixtures (`_fixtures/*.json`)

**Files:**
- Create: `supabase/functions/fpl-ingest/__tests__/_fixtures/bootstrap-static.json`
- Create: `supabase/functions/fpl-ingest/__tests__/_fixtures/fixtures.json`

Trimmed but structurally faithful samples from the real FPL API. These power the normalize tests in Tasks 9 and 10.

- [ ] **Step 1: Create `_fixtures/bootstrap-static.json`**

Create `supabase/functions/fpl-ingest/__tests__/_fixtures/bootstrap-static.json`:

```json
{
  "teams": [
    {
      "id": 1,
      "name": "Arsenal",
      "short_name": "ARS",
      "code": 3,
      "strength_overall_home": 1300,
      "strength_overall_away": 1290,
      "strength_attack_home": 1280,
      "strength_attack_away": 1270,
      "strength_defence_home": 1320,
      "strength_defence_away": 1310
    },
    {
      "id": 12,
      "name": "Liverpool",
      "short_name": "LIV",
      "code": 14,
      "strength_overall_home": 1340,
      "strength_overall_away": 1330,
      "strength_attack_home": 1350,
      "strength_attack_away": 1340,
      "strength_defence_home": 1310,
      "strength_defence_away": 1290
    }
  ],
  "elements": [
    {
      "id": 100,
      "web_name": "Saka",
      "first_name": "Bukayo",
      "second_name": "Saka",
      "team": 1,
      "element_type": 3,
      "now_cost": 95,
      "form": "5.6",
      "total_points": 142,
      "status": "a",
      "news": "",
      "news_added": null,
      "chance_of_playing_next_round": 100,
      "ep_next": "5.3",
      "ep_this": "5.1",
      "selected_by_percent": "32.5",
      "ict_index": "215.4",
      "bps": 612,
      "transfers_in_event": 12345
    },
    {
      "id": 200,
      "web_name": "Salah",
      "first_name": "Mohamed",
      "second_name": "Salah",
      "team": 12,
      "element_type": 3,
      "now_cost": 130,
      "form": "8.2",
      "total_points": 198,
      "status": "a",
      "news": "",
      "news_added": null,
      "chance_of_playing_next_round": null,
      "ep_next": "7.4",
      "ep_this": "7.2",
      "selected_by_percent": "58.1",
      "ict_index": "302.5",
      "bps": 815,
      "transfers_in_event": 99999
    },
    {
      "id": 300,
      "web_name": "Saliba",
      "first_name": "William",
      "second_name": "Saliba",
      "team": 1,
      "element_type": 2,
      "now_cost": 60,
      "form": "4.5",
      "total_points": 110,
      "status": "i",
      "news": "Knock - 50% chance of playing",
      "news_added": "2026-06-09T10:00:00Z",
      "chance_of_playing_next_round": 50,
      "ep_next": "3.1",
      "ep_this": "0.0",
      "selected_by_percent": "18.4",
      "ict_index": "148.0",
      "bps": 420,
      "transfers_in_event": 8
    }
  ]
}
```

- [ ] **Step 2: Create `_fixtures/fixtures.json`**

Create `supabase/functions/fpl-ingest/__tests__/_fixtures/fixtures.json`:

```json
[
  {
    "id": 1,
    "event": 1,
    "kickoff_time": "2026-08-15T11:30:00Z",
    "team_h": 1,
    "team_a": 12,
    "team_h_difficulty": 3,
    "team_a_difficulty": 4,
    "team_h_score": null,
    "team_a_score": null,
    "started": false,
    "finished": false,
    "finished_provisional": false
  },
  {
    "id": 2,
    "event": 1,
    "kickoff_time": "2026-08-15T14:00:00Z",
    "team_h": 12,
    "team_a": 1,
    "team_h_difficulty": 4,
    "team_a_difficulty": 3,
    "team_h_score": null,
    "team_a_score": null,
    "started": false,
    "finished": false,
    "finished_provisional": false
  },
  {
    "id": 3,
    "event": null,
    "kickoff_time": null,
    "team_h": 1,
    "team_a": 12,
    "team_h_difficulty": 3,
    "team_a_difficulty": 4,
    "team_h_score": null,
    "team_a_score": null,
    "started": false,
    "finished": false,
    "finished_provisional": false
  }
]
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/fpl-ingest/__tests__/_fixtures/
git commit -m "Add trimmed FPL API response fixtures for unit tests"
```

---

## Task 9: `sources/bootstrap.ts` — normalize functions

**Files:**
- Create: `supabase/functions/fpl-ingest/sources/bootstrap.ts`
- Create: `supabase/functions/fpl-ingest/__tests__/bootstrap.test.ts`

This task introduces the **pure** parts of bootstrap: type definitions, `normalizeClubs`, `normalizePlayers`. The `ingestBootstrap` orchestration lands in Task 11 with the dispatcher.

- [ ] **Step 1: Write failing tests**

Create `supabase/functions/fpl-ingest/__tests__/bootstrap.test.ts`:

```ts
import { assertEquals } from '@std/assert';
import {
  normalizeClubs,
  normalizePlayers,
  type BootstrapStaticResponse,
} from '../sources/bootstrap.ts';

async function loadFixture(): Promise<BootstrapStaticResponse> {
  const url = new URL('./_fixtures/bootstrap-static.json', import.meta.url);
  const txt = await Deno.readTextFile(url);
  return JSON.parse(txt) as BootstrapStaticResponse;
}

Deno.test('normalizeClubs maps all 11 columns for every team', async () => {
  const raw = await loadFixture();
  const rows = normalizeClubs(raw);
  assertEquals(rows.length, 2);
  assertEquals(rows[0], {
    id: 1,
    name: 'Arsenal',
    short_name: 'ARS',
    code: 3,
    strength_overall_home: 1300,
    strength_overall_away: 1290,
    strength_attack_home: 1280,
    strength_attack_away: 1270,
    strength_defence_home: 1320,
    strength_defence_away: 1310,
  });
});

Deno.test('normalizePlayers maps element_type 1-4 to GKP/DEF/MID/FWD', async () => {
  const raw = await loadFixture();
  const rows = normalizePlayers(raw);
  const saliba = rows.find((p) => p.id === 300);
  const saka = rows.find((p) => p.id === 100);
  assertEquals(saliba?.position, 'DEF');
  assertEquals(saka?.position, 'MID');
});

Deno.test('normalizePlayers parses string-typed numeric FPL fields to numbers', async () => {
  const raw = await loadFixture();
  const rows = normalizePlayers(raw);
  const saka = rows.find((p) => p.id === 100)!;
  assertEquals(typeof saka.form, 'number');
  assertEquals(saka.form, 5.6);
  assertEquals(saka.ep_next, 5.3);
  assertEquals(saka.ep_this, 5.1);
  assertEquals(saka.selected_by_percent, 32.5);
  assertEquals(saka.ict_index, 215.4);
});

Deno.test('normalizePlayers builds full_name as first + last', async () => {
  const raw = await loadFixture();
  const rows = normalizePlayers(raw);
  const salah = rows.find((p) => p.id === 200);
  assertEquals(salah?.full_name, 'Mohamed Salah');
});

Deno.test('normalizePlayers preserves nullable chance_of_playing_next_round + news_added', async () => {
  const raw = await loadFixture();
  const rows = normalizePlayers(raw);
  const salah = rows.find((p) => p.id === 200)!;
  const saliba = rows.find((p) => p.id === 300)!;
  assertEquals(salah.chance_of_playing_next_round, null);
  assertEquals(salah.news_added, null);
  assertEquals(saliba.chance_of_playing_next_round, 50);
  assertEquals(saliba.news_added, '2026-06-09T10:00:00Z');
});

Deno.test('normalizePlayers propagates status code + news string', async () => {
  const raw = await loadFixture();
  const rows = normalizePlayers(raw);
  const saliba = rows.find((p) => p.id === 300)!;
  assertEquals(saliba.status, 'i');
  assertEquals(saliba.news, 'Knock - 50% chance of playing');
});

Deno.test('normalizePlayers passes through team_id, bps, transfers_in_event, total_points, now_cost', async () => {
  const raw = await loadFixture();
  const rows = normalizePlayers(raw);
  const salah = rows.find((p) => p.id === 200)!;
  assertEquals(salah.team_id, 12);
  assertEquals(salah.bps, 815);
  assertEquals(salah.transfers_in_event, 99999);
  assertEquals(salah.total_points, 198);
  assertEquals(salah.now_cost, 130);
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
cd supabase/functions/fpl-ingest && deno test --allow-env --allow-read __tests__/bootstrap.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `supabase/functions/fpl-ingest/sources/bootstrap.ts`:

```ts
export interface BootstrapTeam {
  id: number;
  name: string;
  short_name: string;
  code: number;
  strength_overall_home: number;
  strength_overall_away: number;
  strength_attack_home: number;
  strength_attack_away: number;
  strength_defence_home: number;
  strength_defence_away: number;
}

export interface BootstrapElement {
  id: number;
  web_name: string;
  first_name: string;
  second_name: string;
  team: number;
  element_type: 1 | 2 | 3 | 4;
  now_cost: number;
  form: string;
  total_points: number;
  status: string;
  news: string;
  news_added: string | null;
  chance_of_playing_next_round: number | null;
  ep_next: string;
  ep_this: string;
  selected_by_percent: string;
  ict_index: string;
  bps: number;
  transfers_in_event: number;
}

export interface BootstrapStaticResponse {
  teams: BootstrapTeam[];
  elements: BootstrapElement[];
}

export interface ClubRow {
  id: number;
  name: string;
  short_name: string;
  code: number;
  strength_overall_home: number;
  strength_overall_away: number;
  strength_attack_home: number;
  strength_attack_away: number;
  strength_defence_home: number;
  strength_defence_away: number;
}

export type Position = 'GKP' | 'DEF' | 'MID' | 'FWD';

export interface PlayerRow {
  id: number;
  web_name: string;
  full_name: string;
  team_id: number;
  position: Position;
  now_cost: number;
  form: number;
  total_points: number;
  status: string;
  news: string;
  news_added: string | null;
  chance_of_playing_next_round: number | null;
  ep_next: number;
  ep_this: number;
  selected_by_percent: number;
  ict_index: number;
  bps: number;
  transfers_in_event: number;
}

const POSITION_MAP: Record<1 | 2 | 3 | 4, Position> = {
  1: 'GKP',
  2: 'DEF',
  3: 'MID',
  4: 'FWD',
};

export function normalizeClubs(raw: BootstrapStaticResponse): ClubRow[] {
  return raw.teams.map((t) => ({
    id: t.id,
    name: t.name,
    short_name: t.short_name,
    code: t.code,
    strength_overall_home: t.strength_overall_home,
    strength_overall_away: t.strength_overall_away,
    strength_attack_home: t.strength_attack_home,
    strength_attack_away: t.strength_attack_away,
    strength_defence_home: t.strength_defence_home,
    strength_defence_away: t.strength_defence_away,
  }));
}

export function normalizePlayers(raw: BootstrapStaticResponse): PlayerRow[] {
  return raw.elements.map((e) => ({
    id: e.id,
    web_name: e.web_name,
    full_name: `${e.first_name} ${e.second_name}`,
    team_id: e.team,
    position: POSITION_MAP[e.element_type],
    now_cost: e.now_cost,
    form: parseFloat(e.form),
    total_points: e.total_points,
    status: e.status,
    news: e.news,
    news_added: e.news_added,
    chance_of_playing_next_round: e.chance_of_playing_next_round,
    ep_next: parseFloat(e.ep_next),
    ep_this: parseFloat(e.ep_this),
    selected_by_percent: parseFloat(e.selected_by_percent),
    ict_index: parseFloat(e.ict_index),
    bps: e.bps,
    transfers_in_event: e.transfers_in_event,
  }));
}
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
cd supabase/functions/fpl-ingest && deno test --allow-env --allow-read __tests__/bootstrap.test.ts
```

Expected: 7/7 passing.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/fpl-ingest/sources/bootstrap.ts \
        supabase/functions/fpl-ingest/__tests__/bootstrap.test.ts
git commit -m "Add bootstrap normalize functions (clubs, players)"
```

---

## Task 10: `sources/fixtures.ts` — normalize + projection

**Files:**
- Create: `supabase/functions/fpl-ingest/sources/fixtures.ts`
- Create: `supabase/functions/fpl-ingest/__tests__/fixtures.test.ts`

Pure parts only: `normalizeFixtures` (raw → row shape) and `projectForHash` (row → stable JSON for hashing). The `ingestFixtures` orchestration lands in Task 11.

- [ ] **Step 1: Write failing tests**

Create `supabase/functions/fpl-ingest/__tests__/fixtures.test.ts`:

```ts
import { assertEquals, assertNotEquals } from '@std/assert';
import {
  normalizeFixtures,
  projectForHash,
  type FixtureRaw,
} from '../sources/fixtures.ts';

async function loadFixture(): Promise<FixtureRaw[]> {
  const url = new URL('./_fixtures/fixtures.json', import.meta.url);
  const txt = await Deno.readTextFile(url);
  return JSON.parse(txt) as FixtureRaw[];
}

Deno.test('normalizeFixtures maps all columns, preserving nulls for event/kickoff', async () => {
  const raw = await loadFixture();
  const rows = normalizeFixtures(raw);
  assertEquals(rows.length, 3);
  assertEquals(rows[0].id, 1);
  assertEquals(rows[0].event, 1);
  assertEquals(rows[0].kickoff_time, '2026-08-15T11:30:00Z');
  assertEquals(rows[0].team_h, 1);
  assertEquals(rows[0].team_a, 12);
  assertEquals(rows[0].team_h_difficulty, 3);
  assertEquals(rows[0].team_a_difficulty, 4);
  assertEquals(rows[0].started, false);
  assertEquals(rows[0].finished, false);
  assertEquals(rows[0].finished_provisional, false);
  assertEquals(rows[2].event, null);
  assertEquals(rows[2].kickoff_time, null);
});

Deno.test('projectForHash is deterministic for the same input', async () => {
  const raw = await loadFixture();
  const rows = normalizeFixtures(raw);
  assertEquals(projectForHash(rows), projectForHash(rows));
});

Deno.test('projectForHash differs when a fixture is added', async () => {
  const raw = await loadFixture();
  const rows = normalizeFixtures(raw);
  const extra = [...rows, { ...rows[0], id: 999 }];
  assertNotEquals(projectForHash(rows), projectForHash(extra));
});

Deno.test('projectForHash differs when kickoff_time changes (postponement)', async () => {
  const raw = await loadFixture();
  const rows = normalizeFixtures(raw);
  const shifted = rows.map((r, i) =>
    i === 0 ? { ...r, kickoff_time: '2026-08-22T11:30:00Z' } : r,
  );
  assertNotEquals(projectForHash(rows), projectForHash(shifted));
});

Deno.test('projectForHash IGNORES score changes (live scoring is #37)', async () => {
  const raw = await loadFixture();
  const rows = normalizeFixtures(raw);
  const withScore = rows.map((r, i) =>
    i === 0 ? { ...r, team_h_score: 2, team_a_score: 1 } : r,
  );
  assertEquals(projectForHash(rows), projectForHash(withScore));
});

Deno.test('projectForHash respects fixture order (sorted by id)', async () => {
  const raw = await loadFixture();
  const rows = normalizeFixtures(raw);
  const reordered = [...rows].reverse();
  // Same content, different array order in => same projection.
  assertEquals(projectForHash(rows), projectForHash(reordered));
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
cd supabase/functions/fpl-ingest && deno test --allow-env --allow-read __tests__/fixtures.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `supabase/functions/fpl-ingest/sources/fixtures.ts`:

```ts
export interface FixtureRaw {
  id: number;
  event: number | null;
  kickoff_time: string | null;
  team_h: number;
  team_a: number;
  team_h_difficulty: number;
  team_a_difficulty: number;
  team_h_score: number | null;
  team_a_score: number | null;
  started: boolean;
  finished: boolean;
  finished_provisional: boolean;
}

export interface FixtureRow {
  id: number;
  event: number | null;
  kickoff_time: string | null;
  team_h: number;
  team_a: number;
  team_h_difficulty: number;
  team_a_difficulty: number;
  team_h_score: number | null;
  team_a_score: number | null;
  started: boolean;
  finished: boolean;
  finished_provisional: boolean;
}

export function normalizeFixtures(raw: FixtureRaw[]): FixtureRow[] {
  return raw.map((f) => ({
    id: f.id,
    event: f.event,
    kickoff_time: f.kickoff_time,
    team_h: f.team_h,
    team_a: f.team_a,
    team_h_difficulty: f.team_h_difficulty,
    team_a_difficulty: f.team_a_difficulty,
    team_h_score: f.team_h_score,
    team_a_score: f.team_a_score,
    started: f.started,
    finished: f.finished,
    finished_provisional: f.finished_provisional,
  }));
}

// Projection excludes scores: those change as matches play but aren't what we
// hash-gate on. We only care about scheduling shape (id, event, kickoff, sides,
// finished status). Sort by id so callers can't accidentally desynchronise the
// hash by passing an array in a different order.
export function projectForHash(rows: FixtureRow[]): string {
  const sorted = [...rows].sort((a, b) => a.id - b.id);
  const projection = sorted.map((r) => [
    r.id,
    r.event,
    r.kickoff_time,
    r.team_h,
    r.team_a,
    r.finished,
  ]);
  return JSON.stringify(projection);
}
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
cd supabase/functions/fpl-ingest && deno test --allow-env --allow-read __tests__/fixtures.test.ts
```

Expected: 6/6 passing.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/fpl-ingest/sources/fixtures.ts \
        supabase/functions/fpl-ingest/__tests__/fixtures.test.ts
git commit -m "Add fixtures normalize + content-hash projection"
```

---

## Task 11: Wire orchestration in `index.ts`

**Files:**
- Modify: `supabase/functions/fpl-ingest/index.ts`
- Modify: `supabase/functions/fpl-ingest/sources/bootstrap.ts`
- Modify: `supabase/functions/fpl-ingest/sources/fixtures.ts`
- Modify: `supabase/functions/fpl-ingest/__tests__/index.test.ts`

This task wires the orchestrators (`ingestBootstrap`, `ingestFixtures`) and the dispatcher (`handler`). Tests use dependency injection to swap fetch + Supabase client.

- [ ] **Step 1: Extend `__tests__/index.test.ts`**

Replace `supabase/functions/fpl-ingest/__tests__/index.test.ts` with:

```ts
import { assertEquals } from '@std/assert';
import { handler, type Deps } from '../index.ts';

interface CallLog {
  table: string;
  op: 'insert' | 'update' | 'upsert' | 'select';
  payload?: unknown;
  matchId?: string;
}

interface MockState {
  fixturesHashOnNextRead?: string | null;
}

function makeDeps(opts: {
  source: 'bootstrap' | 'fixtures';
  fpl: unknown;
  now?: Date;
  fixturesHashOnRead?: string | null;
} & MockState): { deps: Deps; calls: CallLog[] } {
  const calls: CallLog[] = [];

  // deno-lint-ignore no-explicit-any
  const supabase: any = {
    from(table: string) {
      return {
        insert(payload: unknown) {
          calls.push({ table, op: 'insert', payload });
          return {
            select() {
              return {
                single() {
                  return Promise.resolve({
                    data: { id: 'run-1' },
                    error: null,
                  });
                },
              };
            },
          };
        },
        update(payload: unknown) {
          return {
            eq(_col: string, val: string) {
              calls.push({ table, op: 'update', payload, matchId: val });
              return Promise.resolve({ data: null, error: null });
            },
          };
        },
        upsert(payload: unknown) {
          calls.push({ table, op: 'upsert', payload });
          return Promise.resolve({ data: null, error: null });
        },
        select() {
          return {
            eq() {
              return {
                order() {
                  return {
                    limit() {
                      return {
                        maybeSingle() {
                          calls.push({ table, op: 'select' });
                          return Promise.resolve({
                            data: opts.fixturesHashOnRead === undefined
                              ? null
                              : { content_hash: opts.fixturesHashOnRead },
                            error: null,
                          });
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };

  const fetchStub: typeof fetch = () =>
    Promise.resolve(
      new Response(JSON.stringify(opts.fpl), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

  return {
    deps: {
      supabase,
      fetch: fetchStub,
      now: () => opts.now ?? new Date('2026-08-20T02:00:00Z'),
    },
    calls,
  };
}

const SAMPLE_BOOTSTRAP = {
  teams: [
    {
      id: 1, name: 'A', short_name: 'A', code: 1,
      strength_overall_home: 1, strength_overall_away: 1,
      strength_attack_home: 1, strength_attack_away: 1,
      strength_defence_home: 1, strength_defence_away: 1,
    },
  ],
  elements: [
    {
      id: 1, web_name: 'X', first_name: 'X', second_name: 'X',
      team: 1, element_type: 3, now_cost: 50, form: '4.0',
      total_points: 10, status: 'a', news: '', news_added: null,
      chance_of_playing_next_round: 100, ep_next: '4.0', ep_this: '4.0',
      selected_by_percent: '5.0', ict_index: '50.0', bps: 100, transfers_in_event: 0,
    },
  ],
};

const SAMPLE_FIXTURES = [
  {
    id: 1, event: 1, kickoff_time: '2026-08-15T11:30:00Z',
    team_h: 1, team_a: 1, team_h_difficulty: 3, team_a_difficulty: 3,
    team_h_score: null, team_a_score: null,
    started: false, finished: false, finished_provisional: false,
  },
];

// --- 400 cases (unchanged from scaffold) -----------------------------------

Deno.test('returns 400 when source query param is missing', async () => {
  const { deps } = makeDeps({ source: 'bootstrap', fpl: SAMPLE_BOOTSTRAP });
  const res = await handler(
    new Request('http://localhost/functions/v1/fpl-ingest'),
    deps,
  );
  assertEquals(res.status, 400);
});

Deno.test('returns 400 when source query param is unrecognised', async () => {
  const { deps } = makeDeps({ source: 'bootstrap', fpl: SAMPLE_BOOTSTRAP });
  const res = await handler(
    new Request('http://localhost/functions/v1/fpl-ingest?source=garbage'),
    deps,
  );
  assertEquals(res.status, 400);
});

// --- bootstrap success ----------------------------------------------------

Deno.test('source=bootstrap inside PL season upserts clubs + players and closes run', async () => {
  const { deps, calls } = makeDeps({
    source: 'bootstrap',
    fpl: SAMPLE_BOOTSTRAP,
    now: new Date('2026-09-15T02:00:00Z'), // in-season
  });
  const res = await handler(
    new Request('http://localhost/functions/v1/fpl-ingest?source=bootstrap'),
    deps,
  );
  assertEquals(res.status, 200);
  const tables = calls.map((c) => `${c.op}:${c.table}`);
  assertEquals(tables.includes('insert:ingestion_runs'), true);
  assertEquals(tables.includes('upsert:clubs'), true);
  assertEquals(tables.includes('upsert:players'), true);
  assertEquals(tables.includes('update:ingestion_runs'), true);

  const closing = calls.find((c) => c.op === 'update' && c.table === 'ingestion_runs')!;
  const payload = closing.payload as Record<string, unknown>;
  assertEquals(payload.status, 'success');
  assertEquals(payload.rows_upserted, 2); // 1 club + 1 player
});

// --- bootstrap calendar gate ----------------------------------------------

Deno.test('source=bootstrap outside season + outside windows logs skipped, no upsert', async () => {
  const { deps, calls } = makeDeps({
    source: 'bootstrap',
    fpl: SAMPLE_BOOTSTRAP,
    now: new Date('2026-11-15T02:00:00Z'), // off-season, non-window
  });
  const res = await handler(
    new Request('http://localhost/functions/v1/fpl-ingest?source=bootstrap'),
    deps,
  );
  assertEquals(res.status, 200);
  assertEquals(calls.some((c) => c.op === 'upsert'), false);
  const closing = calls.find((c) => c.op === 'update' && c.table === 'ingestion_runs')!;
  const payload = closing.payload as Record<string, unknown>;
  assertEquals(payload.status, 'skipped');
  assertEquals(payload.skip_reason, 'outside refresh window');
});

Deno.test('source=bootstrap with ?force=1 bypasses the calendar gate', async () => {
  const { deps, calls } = makeDeps({
    source: 'bootstrap',
    fpl: SAMPLE_BOOTSTRAP,
    now: new Date('2026-11-15T02:00:00Z'),
  });
  await handler(
    new Request('http://localhost/functions/v1/fpl-ingest?source=bootstrap&force=1'),
    deps,
  );
  assertEquals(calls.some((c) => c.op === 'upsert' && c.table === 'players'), true);
});

// --- fixtures content-hash gate -------------------------------------------

Deno.test('source=fixtures with no prior hash upserts and stores hash', async () => {
  const { deps, calls } = makeDeps({
    source: 'fixtures',
    fpl: SAMPLE_FIXTURES,
    fixturesHashOnRead: null,
  });
  const res = await handler(
    new Request('http://localhost/functions/v1/fpl-ingest?source=fixtures'),
    deps,
  );
  assertEquals(res.status, 200);
  assertEquals(calls.some((c) => c.op === 'upsert' && c.table === 'fixtures'), true);
  const closing = calls.find((c) => c.op === 'update' && c.table === 'ingestion_runs')!;
  const payload = closing.payload as Record<string, unknown>;
  assertEquals(payload.status, 'success');
  assertEquals(typeof payload.content_hash, 'string');
});

Deno.test('source=fixtures with matching prior hash skips upsert', async () => {
  // First invocation to learn the hash value.
  const { deps: firstDeps, calls: firstCalls } = makeDeps({
    source: 'fixtures',
    fpl: SAMPLE_FIXTURES,
    fixturesHashOnRead: null,
  });
  await handler(
    new Request('http://localhost/functions/v1/fpl-ingest?source=fixtures'),
    firstDeps,
  );
  const firstClose = firstCalls.find(
    (c) => c.op === 'update' && c.table === 'ingestion_runs',
  )!;
  const hash = (firstClose.payload as Record<string, unknown>).content_hash as string;

  // Second invocation: previous hash matches → skipped.
  const { deps: secondDeps, calls: secondCalls } = makeDeps({
    source: 'fixtures',
    fpl: SAMPLE_FIXTURES,
    fixturesHashOnRead: hash,
  });
  await handler(
    new Request('http://localhost/functions/v1/fpl-ingest?source=fixtures'),
    secondDeps,
  );
  assertEquals(secondCalls.some((c) => c.op === 'upsert' && c.table === 'fixtures'), false);
  const secondClose = secondCalls.find(
    (c) => c.op === 'update' && c.table === 'ingestion_runs',
  )!;
  const payload = secondClose.payload as Record<string, unknown>;
  assertEquals(payload.status, 'skipped');
  assertEquals(payload.skip_reason, 'no content change');
});
```

- [ ] **Step 2: Add `ingestBootstrap` to `sources/bootstrap.ts`**

Append to `supabase/functions/fpl-ingest/sources/bootstrap.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchJson } from '../lib/fpl-client.ts';
import { isInTransferWindow, isPLSeasonActive } from '../lib/calendar.ts';
import { finishRun, skipRun } from '../lib/ingestion-runs.ts';

export interface IngestBootstrapDeps {
  supabase: SupabaseClient;
  fetch: typeof globalThis.fetch;
  now: () => Date;
}

export async function ingestBootstrap(
  runId: string,
  deps: IngestBootstrapDeps,
  opts: { force: boolean },
): Promise<void> {
  const today = deps.now();
  if (!opts.force && !isPLSeasonActive(today) && !isInTransferWindow(today)) {
    await skipRun(deps.supabase, runId, 'outside refresh window');
    return;
  }

  const raw = await fetchJson<BootstrapStaticResponse>(
    'https://fantasy.premierleague.com/api/bootstrap-static/',
    { fetch: deps.fetch },
  );

  const clubs = normalizeClubs(raw);
  const players = normalizePlayers(raw);

  const clubsRes = await deps.supabase.from('clubs').upsert(clubs);
  if (clubsRes.error) throw clubsRes.error;
  const playersRes = await deps.supabase.from('players').upsert(players);
  if (playersRes.error) throw playersRes.error;

  await finishRun(deps.supabase, runId, {
    rowsUpserted: clubs.length + players.length,
  });
}
```

- [ ] **Step 3: Add `ingestFixtures` to `sources/fixtures.ts`**

Append to `supabase/functions/fpl-ingest/sources/fixtures.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchJson } from '../lib/fpl-client.ts';
import { sha256Hex } from '../lib/hash.ts';
import { finishRun, skipRun } from '../lib/ingestion-runs.ts';

export interface IngestFixturesDeps {
  supabase: SupabaseClient;
  fetch: typeof globalThis.fetch;
}

export async function ingestFixtures(
  runId: string,
  deps: IngestFixturesDeps,
): Promise<void> {
  const raw = await fetchJson<FixtureRaw[]>(
    'https://fantasy.premierleague.com/api/fixtures/',
    { fetch: deps.fetch },
  );
  const rows = normalizeFixtures(raw);
  const hash = await sha256Hex(projectForHash(rows));

  const { data: prior } = await deps.supabase
    .from('ingestion_runs')
    .select('content_hash')
    .eq('source', 'fixtures')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (prior && (prior as { content_hash: string | null }).content_hash === hash) {
    await skipRun(deps.supabase, runId, 'no content change', { contentHash: hash });
    return;
  }

  const upsertRes = await deps.supabase.from('fixtures').upsert(rows);
  if (upsertRes.error) throw upsertRes.error;

  await finishRun(deps.supabase, runId, {
    rowsUpserted: rows.length,
    contentHash: hash,
  });
}
```

- [ ] **Step 4: Replace `index.ts` with the wired dispatcher**

Replace `supabase/functions/fpl-ingest/index.ts` with:

```ts
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from './lib/supabase-admin.ts';
import { errorRun, startRun } from './lib/ingestion-runs.ts';
import { ingestBootstrap } from './sources/bootstrap.ts';
import { ingestFixtures } from './sources/fixtures.ts';

type Source = 'bootstrap' | 'fixtures';

const isSource = (s: string | null): s is Source =>
  s === 'bootstrap' || s === 'fixtures';

export interface Deps {
  supabase: SupabaseClient;
  fetch: typeof globalThis.fetch;
  now: () => Date;
}

function defaultDeps(): Deps {
  return {
    supabase: createAdminClient(),
    fetch: globalThis.fetch,
    now: () => new Date(),
  };
}

export async function handler(req: Request, depsOverride?: Deps): Promise<Response> {
  const url = new URL(req.url);
  const source = url.searchParams.get('source');
  const force = url.searchParams.get('force') === '1';

  if (!isSource(source)) {
    return Response.json(
      { error: 'missing or invalid ?source= (expected bootstrap|fixtures)' },
      { status: 400 },
    );
  }

  const deps = depsOverride ?? defaultDeps();
  const runId = await startRun(deps.supabase, source);

  try {
    if (source === 'bootstrap') {
      await ingestBootstrap(runId, deps, { force });
    } else {
      await ingestFixtures(runId, deps);
    }
    return Response.json({ ok: true, runId, source }, { status: 200 });
  } catch (err) {
    await errorRun(deps.supabase, runId, err);
    return Response.json(
      { ok: false, runId, source, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

Deno.serve(handler);
```

- [ ] **Step 5: Run all Edge Function tests, verify they pass**

```bash
cd supabase/functions/fpl-ingest && deno test --allow-env --allow-read __tests__/
```

Expected: every test file green (calendar 10, hash 4, ingestion-runs 6, fpl-client 5, bootstrap 7, fixtures 6, index 7).

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/fpl-ingest/
git commit -m "Wire fpl-ingest dispatcher with bootstrap + fixtures orchestrators"
```

---

## Task 12: Local integration script

**Files:**
- Create: `scripts/test-ingest-locally.sh`

A one-command end-to-end smoke test against a running `supabase start`. Not run in CI — operator tool.

- [ ] **Step 1: Create the script**

Create `scripts/test-ingest-locally.sh`:

```bash
#!/usr/bin/env bash
#
# End-to-end smoke test for the fpl-ingest Edge Function.
#
# Requirements:
#   - `supabase start` is running (Postgres + Edge runtime on localhost).
#   - `supabase db reset` has been run so migrations are applied.
#   - The fpl-ingest function is being served (`supabase functions serve fpl-ingest`).
#
# What it does:
#   1. Calls ?source=bootstrap&force=1 (bypass calendar gate)
#   2. Calls ?source=fixtures
#   3. Calls ?source=fixtures AGAIN (should skip via content hash)
#   4. Reads ingestion_runs for the most recent rows and prints them.
#
# This script hits the LIVE FPL API. It's intentional: integration test.

set -euo pipefail

BASE="${SUPABASE_URL:-http://localhost:54321}"
ANON="${SUPABASE_ANON_KEY:-}"

if [ -z "$ANON" ]; then
  echo "SUPABASE_ANON_KEY is not set. Get it from: supabase status"
  exit 1
fi

invoke() {
  local qs="$1"
  echo "→ POST $BASE/functions/v1/fpl-ingest?$qs"
  curl -sS -X POST \
    "$BASE/functions/v1/fpl-ingest?$qs" \
    -H "Authorization: Bearer $ANON" \
    -H "Content-Type: application/json" \
    -d '{}' \
  | tee /dev/stderr
  echo ''
}

invoke 'source=bootstrap&force=1'
invoke 'source=fixtures'
invoke 'source=fixtures'  # Expect: status=skipped, reason=no content change

echo ''
echo '--- Most recent ingestion_runs ---'
PGPASSWORD=postgres psql -h localhost -p 54322 -U postgres -d postgres -c "
  select source, status, skip_reason, rows_upserted, content_hash is not null as has_hash
    from public.ingestion_runs
    order by started_at desc
    limit 5;
"
```

- [ ] **Step 2: Make executable**

```bash
chmod +x scripts/test-ingest-locally.sh
```

- [ ] **Step 3: Commit**

```bash
git add scripts/test-ingest-locally.sh
git commit -m "Add local end-to-end smoke test for fpl-ingest"
```

---

## Task 13: Cron migration

**Files:**
- Create: `supabase/migrations/20260610020000_fpl_ingest_cron.sql`

- [ ] **Step 1: Create the migration**

Create `supabase/migrations/20260610020000_fpl_ingest_cron.sql`:

```sql
-- Cron schedules for the FPL ingestion Edge Function (issue #20).
--
-- pg_cron fires on UTC. Two entries:
--   - 'fpl-ingest-bootstrap': Mon + Tue 02:00 UTC. Calendar gate inside the
--     function decides whether to actually fetch.
--   - 'fpl-ingest-fixtures': Tue 03:00 UTC. Content-hash gate inside the
--     function decides whether to upsert.
--
-- The URL + anon key live in Supabase Vault (operator runs the
-- vault.create_secret calls once per environment — see docs/architecture.md).

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net  with schema extensions;

select cron.schedule(
  'fpl-ingest-bootstrap',
  '0 2 * * 1,2',
  $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_url')
               || '/functions/v1/fpl-ingest?source=bootstrap',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_anon_key'),
      'Content-Type',  'application/json'
    ),
    body    := '{}'::jsonb
  );
  $$
);

select cron.schedule(
  'fpl-ingest-fixtures',
  '0 3 * * 2',
  $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_url')
               || '/functions/v1/fpl-ingest?source=fixtures',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_anon_key'),
      'Content-Type',  'application/json'
    ),
    body    := '{}'::jsonb
  );
  $$
);
```

- [ ] **Step 2: Smoke-check locally if Supabase CLI is configured**

```bash
supabase db reset
```

Expected: no errors. `select * from cron.job` shows two rows (`fpl-ingest-bootstrap`, `fpl-ingest-fixtures`).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260610020000_fpl_ingest_cron.sql
git commit -m "Schedule fpl-ingest cron: bootstrap Mon+Tue 02:00 UTC, fixtures Tue 03:00 UTC"
```

---

## Task 14: Wire CI to deploy `fpl-ingest`

**Files:**
- Modify: `.github/workflows/deploy-supabase.yml`

The existing workflow deploys only the `ping` function. Extend it to also deploy `fpl-ingest`.

- [ ] **Step 1: Read the current file to confirm location of the deploy step**

The deploy step currently reads:

```yaml
      - name: Deploy functions
        run: supabase functions deploy ping --no-verify-jwt
```

- [ ] **Step 2: Replace that step**

Replace the `Deploy functions` step in `.github/workflows/deploy-supabase.yml` with:

```yaml
      - name: Deploy functions
        run: |
          supabase functions deploy ping        --no-verify-jwt
          supabase functions deploy fpl-ingest  --no-verify-jwt
```

`--no-verify-jwt` is correct for `fpl-ingest` because the function is called by `pg_cron` with an anon-key bearer header — we don't want Supabase Auth to gate it on a user JWT.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/deploy-supabase.yml
git commit -m "Deploy fpl-ingest Edge Function alongside ping in CI"
```

---

## Task 15: Documentation

**Files:**
- Create: `docs/fpl-api.md`
- Modify: `docs/architecture.md`

- [ ] **Step 1: Create `docs/fpl-api.md`**

Create `docs/fpl-api.md`:

```markdown
# FPL API Reference

This is the human-readable map of the public FPL endpoints our ingestion job (#20) consumes, the quirks we've hit, and how to operate the job.

Authoritative code: `supabase/functions/fpl-ingest/`.
Spec: `docs/superpowers/specs/2026-06-10-fpl-data-ingestion-design.md`.

## Endpoints used

| Endpoint | What we pull | Cron |
|---|---|---|
| `GET https://fantasy.premierleague.com/api/bootstrap-static/` | `teams[]` → `clubs`; `elements[]` → `players` | Mon + Tue 02:00 UTC (calendar-gated) |
| `GET https://fantasy.premierleague.com/api/fixtures/` | flat array → `fixtures` | Tue 03:00 UTC (content-hash-gated) |

Endpoints **not** used by this job:
- `/event/{n}/live/` — live scoring; owned by issue #37 (Phase 4).
- `/element-summary/{player_id}/` — per-player history; fetched lazily by the app when player detail (#28) or xPts (#30) needs it.
- `/entry/{id}/` — manager-specific data; owned by issue #22 (squad import).

## Field quirks

These are the foot-guns. Hit them once.

- **`element_type`** is `1 | 2 | 3 | 4`. Map: `1 → GKP`, `2 → DEF`, `3 → MID`, `4 → FWD`. We store the string in `players.position`.
- **`now_cost`** is **tenths of millions**, not millions. `55` = £5.5m. The app divides by 10 on display.
- **`form`, `ep_next`, `ep_this`, `selected_by_percent`, `ict_index`** come back as **strings** (`"5.6"`, not `5.6`). Always `parseFloat`.
- **`status`** is a single character: `a` (available), `i` (injured), `d` (doubt), `u` (unavailable), `s` (suspended), `n` (not in squad).
- **`news`** can be an empty string `""` rather than null — we default the DB column to `''`.
- **`chance_of_playing_next_round`** can be `null` (means "no concern flagged"), otherwise one of `0 / 25 / 50 / 75 / 100`.
- **Fixtures `event`** can be `null` for postponed matches awaiting reschedule. **`kickoff_time`** can be `null` for the same reason.

## Refresh cadence

Configured in `supabase/functions/fpl-ingest/lib/calendar.ts`. Update at season rollover via a one-line PR.

- **PL season:** `2026-08-15` → `2027-05-25` (inclusive).
- **Transfer windows:** `2026-06-15` → `2026-09-01` (summer); `2027-01-01` → `2027-02-01` (winter).

The bootstrap cron fires every Mon + Tue at 02:00 UTC year-round. The function early-exits if `today` is outside the PL season AND outside every transfer window, producing one `ingestion_runs` row with `status='skipped'`, `skip_reason='outside refresh window'`. Off-season + non-window: zero FPL traffic, zero DB writes.

The fixtures cron fires every Tue at 03:00 UTC. The function fetches `/fixtures/`, computes a SHA-256 over a stable projection (`id`, `event`, `kickoff_time`, `team_h`, `team_a`, `finished` — scores deliberately excluded), and compares to the most recent successful run's `content_hash`. Match → skip + log no-op. Differ → upsert + store new hash.

## Manual operations

### Force an immediate run (bypasses calendar gate)

```bash
curl -X POST "https://<ref>.supabase.co/functions/v1/fpl-ingest?source=bootstrap&force=1" \
  -H "Authorization: Bearer <anon-key>"

curl -X POST "https://<ref>.supabase.co/functions/v1/fpl-ingest?source=fixtures" \
  -H "Authorization: Bearer <anon-key>"
```

`?force=1` is permanently supported on `bootstrap`. Use it for initial backfill after deploy, season rollover, or one-off debugging. Fixtures doesn't need `force=1` — only the content-hash short-circuits it.

### "Is the pipeline alive?" — paste into Studio SQL

```sql
select source, status, skip_reason, rows_upserted,
       started_at, finished_at - started_at as duration
  from public.ingestion_runs
 order by started_at desc
 limit 20;
```

### "Last successful run per source"

```sql
select distinct on (source) source, started_at, status, rows_upserted, content_hash
  from public.ingestion_runs
 where status = 'success'
 order by source, started_at desc;
```

### Local E2E

```bash
./scripts/test-ingest-locally.sh
```

Requires `supabase start` and `supabase functions serve fpl-ingest`. Hits the real FPL API.

## Known limits

- No live scoring (#37 owns).
- No per-player history (lazy via the app when #28/#30 needs it).
- Price-change history not snapshotted — `players` is current-state only.
- Alerting via `ingestion_runs` queries only until Sentry (#41) lands.
```

- [ ] **Step 2: Append the vault setup snippet to `docs/architecture.md`**

Add a new section to `docs/architecture.md` immediately before `## Repo layout`:

```markdown
## Per-environment one-time setup

Some features rely on values that live in Supabase Vault rather than CI secrets — they're referenced by SQL (`pg_cron`) and can't be passed via env vars.

For each environment (currently: prod), open Studio → SQL Editor and run **once**:

```sql
-- For the FPL ingestion cron (#20).
select vault.create_secret('https://<project-ref>.supabase.co', 'supabase_url');
select vault.create_secret('<anon key from Settings → API>',    'supabase_anon_key');
```

Verify with `select name from vault.decrypted_secrets;` — both names should appear.

The `fpl-ingest` Edge Function additionally needs the service-role key as a function-level secret. Run once per environment from a local terminal linked to the project:

```bash
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```
```

- [ ] **Step 3: Commit**

```bash
git add docs/fpl-api.md docs/architecture.md
git commit -m "Document FPL ingestion endpoints, cadence, and vault setup"
```

---

## Final verification

After Task 15, run the whole verification pass to make sure nothing has rotted:

- [ ] **Step 1: Edge Function test suite**

```bash
cd supabase/functions/fpl-ingest && deno test --allow-env --allow-read __tests__/
```

Expected: all suites pass (calendar 10, hash 4, ingestion-runs 6, fpl-client 5, bootstrap 7, fixtures 6, index 7 — total 45).

- [ ] **Step 2: App test suite (no regressions in unrelated code)**

```bash
npm test -- --watchAll=false
```

Expected: same green state as before this branch started.

- [ ] **Step 3: Type-check the Edge Function module graph**

```bash
cd supabase/functions/fpl-ingest && deno check index.ts
```

Expected: no errors.

- [ ] **Step 4: Branch is ready for PR**

```bash
git log --oneline main..HEAD
```

Expected: ~16 commits (spec + 15 implementation tasks).

The branch is ready to push and open a PR closing issue #20.
