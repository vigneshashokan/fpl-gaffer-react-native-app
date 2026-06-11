# FPL Data Ingestion Service — Design Spec

**Issue:** [#20 — [Phase 1] FPL data ingestion service](https://github.com/vigneshashokan/fpl-gaffer-react-native-app/issues/20)
**Date:** 2026-06-10
**Status:** Approved

---

## Purpose

A scheduled Supabase job that hydrates our Postgres with reference data from the public FPL API: clubs, players, and fixtures. This is the foundation for every downstream phase — issue #21 (replace mock data with live API) and everything that follows needs this data in our DB to query, join, and serve.

This is the first ingestion-side issue in Phase 1; the rest of Phase 1 is shipped (#10–#13, #15–#19). #14 (Apple Sign-In) is deferred to just before App Store submission, and #21 (replace mock data with live API) is the immediate consumer of what this issue delivers.

## Framing Decision: Issue ACs Reframed for Supabase

Issue #20's original acceptance criteria assume a generic scheduled-job stack ("Scheduled job runner (Inngest / Trigger.dev / cron in Fly machine)"). Our architecture is **Supabase**, which provides `pg_cron` and `pg_net` as first-class extensions plus Deno Edge Functions for custom logic. So the real work isn't "provision a job runner"; it's:

1. Two small SQL migrations: four new tables + RLS, then pg_cron entries that call our Edge Function.
2. One Edge Function (`fpl-ingest`) that handles both bootstrap and fixtures sources via a `?source=` query param.
3. A small docs deliverable (`docs/fpl-api.md`) covering endpoint quirks and refresh cadence.

No external scheduler. No new vendors. No external alerting (deferred — see "Out of scope").

After this issue ships, we'll comment on #20 with the rewritten framing — same pattern as #13, #15/#16/#17, #18, #19.

## Tech Stack

- **Supabase Postgres** — four new tables (`clubs`, `players`, `fixtures`, `ingestion_runs`) + RLS.
- **pg_cron** — two scheduled jobs (bootstrap, fixtures); built-in Supabase extension.
- **pg_net** — used by pg_cron to invoke the Edge Function via HTTP.
- **Supabase Vault** — stores the project URL + anon key referenced by pg_cron.
- **Supabase Edge Functions (Deno)** — one function, `fpl-ingest`, with internal modules per source.
- **No external HTTP libraries** — Deno's built-in `fetch` is sufficient.
- **No external scheduling vendors** — pg_cron handles it.

## Refresh Policy

FPL data changes on predictable patterns. We schedule around those patterns rather than polling blindly.

| Data | When it changes | Schedule |
|---|---|---|
| Player roster (which club a player is at) | Transfer windows only: **Jun 15 – Sep 1 2026** (summer) and **Jan 1 – Feb 1 2027** (winter) | bootstrap cron weekly during windows |
| Player stats (form, total_points, now_cost, selected_by_percent, etc.) | After each gameweek finishes | bootstrap cron post-GW (Mon/Tue 02:00 UTC) |
| Fixtures | Rarely — only when cup competitions (FA Cup / EFL Cup) postpone PL matches | fixtures cron weekly with content-hash skip |
| Live points (per-match scoring) | During live matches | **Out of scope** — owned by #37 (Phase 4) |

The bootstrap and fixtures concerns are both served by the same single fetch of `/bootstrap-static/`, so one cron entry per source is enough. Schedules are deliberately liberal at the cron level (every Monday + Tuesday year-round); the Edge Function's calendar gate decides whether to actually fetch FPL.

**Off-season + non-window periods** (e.g., late May → mid-June, mid-September → end of December): the cron fires, the function early-exits with `status='skipped'`, no FPL traffic, no DB writes. The single skip row per fire is the heartbeat proving the pipeline is alive.

## Architecture

Three layers; nothing requires an external service.

```
┌──────────────┐   "Mon+Tue 02:00 UTC"   ┌─────────────────────────┐
│   pg_cron    │ ──────────────────────▶ │ Edge Function           │
│              │                         │  fpl-ingest             │
│              │   "Tue 03:00 UTC"       │  ?source=bootstrap      │
│              │ ──────────────────────▶ │  ?source=fixtures       │
└──────────────┘                         └────────┬────────────────┘
                                                  │
                       ┌──────────────────────────┴──────────────┐
                       │ source=bootstrap                         │
                       │   1. policy check (season / window)      │
                       │      → skip if outside → log + return    │
                       │   2. fetch /bootstrap-static/            │
                       │   3. upsert clubs, players               │
                       │   4. close ingestion_runs row            │
                       │                                          │
                       │ source=fixtures                          │
                       │   1. fetch /fixtures/                    │
                       │   2. content-hash → compare last hash    │
                       │   3. unchanged → log no-op, return       │
                       │   4. changed → upsert fixtures + hash    │
                       └──────────────────────────────────────────┘
                                                  │
                                                  ▼
                                       ┌──────────────────────┐
                                       │ Postgres              │
                                       │  clubs                │
                                       │  players              │
                                       │  fixtures             │
                                       │  ingestion_runs       │
                                       └──────────────────────┘
```

## Data Model

Four new tables. Migration: `supabase/migrations/<date>_fpl_reference_data.sql`.

### `public.clubs` (20 rows)

| Column | Type | Notes |
|---|---|---|
| `id` | `smallint PK` | FPL team id (1–20, stable within a season) |
| `name` | `text NOT NULL` | "Arsenal" |
| `short_name` | `text NOT NULL` | "ARS" — matches the `ClubCode` type in app |
| `code` | `integer NOT NULL` | FPL's cross-season identifier (used in crest image URLs) |
| `strength_overall_home` | `smallint NOT NULL` | |
| `strength_overall_away` | `smallint NOT NULL` | |
| `strength_attack_home` | `smallint NOT NULL` | |
| `strength_attack_away` | `smallint NOT NULL` | |
| `strength_defence_home` | `smallint NOT NULL` | |
| `strength_defence_away` | `smallint NOT NULL` | |
| `updated_at` | `timestamptz NOT NULL default now()` | |

Leaf reference table — no FK in or out.

### `public.players` (~600 rows)

Hot columns (what the app reads today) plus Phase 3 forecast fields (xPts model #30, top picks #35).

| Column | Type | Notes |
|---|---|---|
| `id` | `integer PK` | FPL element id |
| `web_name` | `text NOT NULL` | "Salah" — primary display |
| `full_name` | `text NOT NULL` | "Mohamed Salah" — detail screen header. Stored as `first_name || ' ' || second_name` from FPL |
| `team_id` | `smallint NOT NULL` | FK → `clubs(id)` |
| `position` | `text NOT NULL` | `check (position in ('GKP','DEF','MID','FWD'))` — translated from FPL's `element_type` 1–4 |
| `now_cost` | `smallint NOT NULL` | FPL's tenths-of-millions (55 = £5.5m). App divides on display |
| `form` | `numeric(3,1) NOT NULL` | |
| `total_points` | `smallint NOT NULL` | |
| `status` | `char(1) NOT NULL` | `a`/`i`/`d`/`u`/`s`/`n` — available/injured/doubt/unavailable/suspended/not in squad |
| `news` | `text NOT NULL default ''` | Injury/news blurb; FPL returns "" not null |
| `news_added` | `timestamptz` | Nullable — null means no news ever |
| `chance_of_playing_next_round` | `smallint` | 0/25/50/75/100, nullable |
| `ep_next` | `numeric(4,1) NOT NULL` | FPL's expected points next GW |
| `ep_this` | `numeric(4,1) NOT NULL` | FPL's expected points current GW |
| `selected_by_percent` | `numeric(4,1) NOT NULL` | |
| `ict_index` | `numeric(5,1) NOT NULL` | Influence × Creativity × Threat composite |
| `bps` | `integer NOT NULL` | Bonus point system total |
| `transfers_in_event` | `integer NOT NULL` | Current GW transfers in |
| `updated_at` | `timestamptz NOT NULL default now()` | |

**Indexes:**
- `players_team_id_idx` on `(team_id)` — list a club's players.
- `players_position_idx` on `(position)` — squad-builder filter (#23).
- `players_status_idx` on `(status) where status <> 'a'` — partial index for "exclude unavailable" in suggestions (#32/#33).

### `public.fixtures` (~380 rows per season)

| Column | Type | Notes |
|---|---|---|
| `id` | `integer PK` | FPL fixture id |
| `event` | `smallint` | Gameweek 1–38. Nullable for postponed fixtures awaiting reschedule |
| `kickoff_time` | `timestamptz` | Nullable when TBD |
| `team_h` | `smallint NOT NULL` | FK → `clubs(id)` |
| `team_a` | `smallint NOT NULL` | FK → `clubs(id)` |
| `team_h_difficulty` | `smallint NOT NULL` | FDR 1–5 |
| `team_a_difficulty` | `smallint NOT NULL` | FDR 1–5 |
| `team_h_score` | `smallint` | Populated post-match. Nullable until played |
| `team_a_score` | `smallint` | |
| `started` | `boolean NOT NULL default false` | |
| `finished` | `boolean NOT NULL default false` | |
| `finished_provisional` | `boolean NOT NULL default false` | FPL flips this first, then `finished` after data-checking |
| `updated_at` | `timestamptz NOT NULL default now()` | |

**Indexes:**
- `fixtures_event_idx` on `(event)`.
- `fixtures_kickoff_idx` on `(kickoff_time)`.
- `fixtures_team_h_event_idx` on `(team_h, event)` and `fixtures_team_a_event_idx` on `(team_a, event)` — "next 5 fixtures for team X".

### `public.ingestion_runs` (operator-facing)

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK default gen_random_uuid()` | |
| `source` | `text NOT NULL` | `check (source in ('bootstrap','fixtures'))` |
| `started_at` | `timestamptz NOT NULL default now()` | |
| `finished_at` | `timestamptz` | Null while in-flight |
| `status` | `text NOT NULL` | `check (status in ('success','skipped','error'))` |
| `skip_reason` | `text` | e.g., `'outside refresh window'`, `'no content change'` |
| `rows_upserted` | `integer` | Null if skipped or errored before write |
| `content_hash` | `text` | SHA-256 hex of normalized fixtures projection. Only set for `source='fixtures'` |
| `error_message` | `text` | First 2000 chars of error/stack on error |

**Index:**
- `ingestion_runs_source_started_idx` on `(source, started_at desc)` — "latest run per source".

### Row Level Security

| Table | `anon` | `authenticated` | `service_role` |
|---|---|---|---|
| `clubs`, `players`, `fixtures` | — | SELECT | bypass (writes) |
| `ingestion_runs` | — | — | bypass |

Reference data is `authenticated`-readable. The app already gates everything behind sign-in; no anonymous pre-auth screen needs this data. `ingestion_runs` is operator-only — accessed via Studio SQL editor or future admin tooling.

### Idempotency

- `clubs` / `players` / `fixtures`: `INSERT ... ON CONFLICT (id) DO UPDATE SET ...`. Replaying the same fetch produces zero observable diff.
- `ingestion_runs`: append-only. One row per cron fire, always closed.

## Edge Function: `fpl-ingest`

### Project layout

```
supabase/functions/fpl-ingest/
├── index.ts                    # Entry: route by ?source=, run lifecycle
├── deno.json
├── lib/
│   ├── calendar.ts             # isPLSeasonActive, isInTransferWindow
│   ├── fpl-client.ts           # fetch wrapper: timeout, user-agent, retry-once
│   ├── supabase-admin.ts       # service-role client singleton
│   ├── ingestion-runs.ts       # startRun, finishRun, skipRun, errorRun
│   └── hash.ts                 # SHA-256 over normalized projection
├── sources/
│   ├── bootstrap.ts            # fetch + normalize + upsert clubs, players
│   └── fixtures.ts             # fetch + hash-check + upsert fixtures
└── __tests__/
    ├── bootstrap.test.ts
    ├── fixtures.test.ts
    ├── calendar.test.ts
    └── _fixtures/
        ├── bootstrap-static.json   # captured real FPL response, trimmed
        └── fixtures.json
```

### Run lifecycle (`index.ts`)

1. Validate `?source=` ∈ `{'bootstrap','fixtures'}` → 400 if bad.
2. Create `ingestion_runs` row with `started_at=now()`.
3. Dispatch to `sources[source](runId, supabaseAdmin)`. The source module closes the row (success / skipped / error).
4. On uncaught exception: top-level handler runs `errorRun(runId, e)` and returns 500.
5. Return 200 with run summary.

**Exactly one `ingestion_runs` row per cron fire, always closed by return.**

### `sources/bootstrap.ts`

1. **Calendar gate** — if `!isPLSeasonActive(today) && !isInTransferWindow(today)`, `skipRun(runId, 'outside refresh window')`, return.
2. Fetch `/bootstrap-static/` (15s timeout, retry once on 5xx).
3. Normalize:
   - `clubs`: `teams[].map(t => ({ id, name, short_name, code, strength_* }))`.
   - `players`: `elements[].map(...)` with field mapping per the data model. FPL returns numeric fields like `ep_next`, `selected_by_percent`, `ict_index`, and `form` as **strings** — parse with `parseFloat`.
4. `supabaseAdmin.from('clubs').upsert(clubs)`.
5. `supabaseAdmin.from('players').upsert(players)`.
6. `finishRun(runId, { rowsUpserted: clubs.length + players.length })`.

Not transactional across the two upserts. Clubs first, players second. If players fails, clubs row updates are committed — no broken state because clubs is consistent on its own, and players just retries on next run. The `ingestion_runs` row gets `status='error'` so the failure is visible.

Batching: PostgREST's `.upsert(arr)` handles ~600 rows in a single round-trip — no chunking needed.

### `sources/fixtures.ts`

1. Fetch `/fixtures/` (15s timeout, retry once on 5xx).
2. Normalize to fixtures rows per data model.
3. Compute hash:
   ```typescript
   const projection = fixtures.map(f => [f.id, f.event, f.kickoff_time, f.team_h, f.team_a, f.finished]);
   const hash = await sha256(JSON.stringify(projection));
   ```
   Projection deliberately excludes scores — those change during matches but aren't what we care about here (live scoring is #37's domain).
4. Read last successful run's `content_hash`:
   ```sql
   select content_hash from ingestion_runs
   where source = 'fixtures' and status = 'success'
   order by started_at desc limit 1;
   ```
5. If hash matches → `skipRun(runId, 'no content change')`, store hash, return.
6. Upsert fixtures.
7. `finishRun(runId, { rowsUpserted: fixtures.length, contentHash: hash })`.

### `lib/calendar.ts` (policy)

```typescript
const PL_SEASON = {
  start: '2026-08-15',   // ~GW1; bump per season
  end:   '2027-05-25',
};

const TRANSFER_WINDOWS = [
  { start: '2026-06-15', end: '2026-09-01' },
  { start: '2027-01-01', end: '2027-02-01' },
];

export const isPLSeasonActive = (d: Date) =>
  d >= new Date(PL_SEASON.start) && d <= new Date(PL_SEASON.end);

export const isInTransferWindow = (d: Date) =>
  TRANSFER_WINDOWS.some(w => d >= new Date(w.start) && d <= new Date(w.end));
```

Constants in code, not a config table — dates are known well in advance, version controlled, no live editing surface. Bumped at season rollover via a PR (one-line change).

### Error handling

- **FPL 5xx / timeout**: one retry after 2s, then fail. No backoff loop — Edge Functions have a 150s wall clock; better to fail fast and let cron retry.
- **DB write failure**: caught, `errorRun(runId, e)`, return 500.
- **Calendar-gate skip / content-hash skip**: `skipRun`, return 200. Not an error.
- **No partial-success status.** A run is `success` only if every required upsert returned without error. Otherwise `status='error'` and next run retries everything (idempotent by design).

### Manual override: `?force=1`

The bootstrap source accepts `?force=1` to bypass the calendar gate. Use cases: initial backfill after deploy, manual maintenance, debugging. Permanently supported, not init-only.

### Wall-clock budget (Edge Function 150s limit)

| Step | Realistic ms |
|---|---|
| Fetch `/bootstrap-static/` (~1.5 MB JSON) | ~800 ms |
| Parse + normalize 600 players | ~50 ms |
| Upsert clubs | ~80 ms |
| Upsert ~600 players | ~600 ms |
| Write ingestion_runs (×2) | ~40 ms |
| **Total** | **~1.6 s** |

Fixtures (~250 KB, ~380 rows) is faster. Both well within budget.

## Migrations

Two migrations, kept separate so a schema-only re-run is possible without redoing cron setup.

### `<date>_fpl_reference_data.sql`

The four tables from "Data Model" above, their RLS policies, indexes, and grants.

### `<date>_fpl_ingest_cron.sql`

```sql
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net  with schema extensions;

-- Bootstrap: every Monday + Tuesday at 02:00 UTC
-- (= 02:00 GMT / 03:00 BST UK — within FPL's overnight refresh window either way).
-- Calendar gate inside the function decides whether to actually fetch.
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

-- Fixtures: every Tuesday at 03:00 UTC (one hour after bootstrap, logs read top-to-bottom).
-- Content-hash inside the function decides whether to upsert.
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

## Secrets / One-Time Setup

Vault secrets `supabase_url` and `supabase_anon_key` are referenced by the cron but **not created by migration** (values are project-specific; we don't want plaintext in version control).

Documented in `docs/architecture.md`, run once per environment via Studio SQL editor:

```sql
select vault.create_secret('https://<project-ref>.supabase.co',  'supabase_url');
select vault.create_secret('<anon key from Settings → API>',     'supabase_anon_key');
```

The service-role key is set as a function-level secret (read by the function from `Deno.env`):

```bash
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```

Same path as any other function-level secret in the existing `deploy-supabase.yml` workflow.

## Deploy Flow

No CI changes — existing `deploy-supabase.yml` covers it:

1. Merge PR to `main` →
2. `supabase db push` applies both migrations (extensions, tables, cron entries).
3. `supabase functions deploy fpl-ingest` ships the function.
4. Function reads `SUPABASE_SERVICE_ROLE_KEY` from project secrets at runtime.

Order: the cron migration references the function URL, but `pg_cron` only validates the SQL string at fire time, not at `cron.schedule` time. Worst case: a cron fires before the function exists, gets a 404, logs to `ingestion_runs` as an error. Self-heals on next fire after function deploy.

## Initial Backfill

Cron fires on the next Mon/Tue 02:00 UTC — could be up to ~6 days out. We need data immediately so #21 has something to serve.

After first deploy:

```bash
# Bypass calendar gate to populate immediately:
curl -X POST "https://<ref>.supabase.co/functions/v1/fpl-ingest?source=bootstrap&force=1" \
  -H "Authorization: Bearer <anon-key>"

curl -X POST "https://<ref>.supabase.co/functions/v1/fpl-ingest?source=fixtures" \
  -H "Authorization: Bearer <anon-key>"
```

(`fixtures` doesn't need `force=1` — no calendar gate, only the content-hash short-circuit.)

## Testing Strategy

- **Unit (Deno test):**
  - `calendar.test.ts` covers boundary dates (PL season edges, transfer-window edges, overlapping dates).
  - `bootstrap.test.ts` and `fixtures.test.ts` import the normalize functions and assert on parsed-row shape against checked-in `_fixtures/*.json` (captured from real FPL responses, trimmed to ~5 players + 3 fixtures for legibility).
- **Integration:**
  - `supabase functions serve fpl-ingest` against local Postgres (`supabase start`).
  - `scripts/test-ingest-locally.sh` does a full end-to-end: deploy migrations to local, invoke function with `curl ?source=bootstrap&force=1`, assert row counts and `ingestion_runs` shape.
- **No hitting the real FPL API in tests.** `fpl-client.ts` accepts an optional `fetch` injection so tests can stub.

## `docs/fpl-api.md` (Issue Ticket's Docs Deliverable)

Sections:

1. **Endpoints used + sample responses** — abbreviated, with the fields we actually consume highlighted.
2. **Field quirks** — `element_type` 1–4 → `GKP/DEF/MID/FWD` mapping; `now_cost` in tenths-of-millions; FPL returns numeric fields (`ep_next`, `selected_by_percent`, `ict_index`, `form`) as **strings** to be parsed; `status` single-char codes (`a/i/d/u/s/n`).
3. **Refresh cadence + rationale** — pointers to `calendar.ts` constants, why Mon+Tue, why content-hash on fixtures.
4. **Manual operations** — how to invoke `?force=1`, where to find `ingestion_runs` for debugging.
5. **Known limits** — no live scoring (deferred to #37), no per-player history (deferred until #28/#30 needs it).

Lives alongside `docs/architecture.md` and `docs/schema.md`.

## Acceptance Criteria

**From the issue ticket:**

- [ ] Bootstrap job runs on schedule and is idempotent.
- [ ] DB `players` row count matches FPL response (~600+).
- [ ] Fixtures populated for the full season (380 rows for 38 GWs).
- [ ] Documented FPL endpoint behaviour in `docs/fpl-api.md`.

**Added by this design:**

- [ ] `clubs` table populated with 20 rows.
- [ ] `ingestion_runs` writes exactly one row per cron fire (success / skipped / error).
- [ ] Calendar-gated skip: invoking `?source=bootstrap` on a date outside PL season and outside transfer windows returns 200 with `status='skipped'`, `skip_reason='outside refresh window'`, and zero DB writes.
- [ ] Content-hash skip: invoking `?source=fixtures` twice in a row produces one success then one skip with `skip_reason='no content change'`.
- [ ] `?force=1` bypasses the calendar gate for `?source=bootstrap`.
- [ ] RLS verified: `authenticated` can `SELECT` from clubs/players/fixtures but not `INSERT/UPDATE/DELETE`; `anon` has no access.
- [ ] Unit tests pass for normalization and calendar gates against checked-in FPL response fixtures.
- [ ] `scripts/test-ingest-locally.sh` runs end-to-end against `supabase start`.

## Out of Scope (Deferred, Boundary Sharp)

- **Live scoring** (`/event/{n}/live/`) — owned by issue #37 (Phase 4).
- **Per-player history** (`/element-summary/{player_id}/`) — fetched lazily by the app via #21/#28 when needed, not eagerly ingested.
- **Price-change history snapshots** — `players` is current-state only. No `player_prices` table; the old value is overwritten on each upsert.
- **Sentry / external alerting** — deferred to #41 (Phase 5). Until then, monitor via `ingestion_runs` queries in Studio.
- **Manager-specific data** (`/entry/{id}/`) — squad import flow, owned by issue #22.
- **Staging environment** — single Supabase project for now; staging path is already documented in `docs/architecture.md` for when we add it.

## Risk and Mitigation

| Risk | Mitigation |
|---|---|
| FPL changes endpoint contract mid-season | All normalize logic in pure functions with `_fixtures/*.json` snapshots; mismatch surfaces in `error_message` of `ingestion_runs`. |
| pg_cron silently stops firing (Supabase issue) | `ingestion_runs` heartbeat: any "no row in last 8 days" query catches this. Add a Studio SQL bookmark in `docs/fpl-api.md`. |
| Edge Function deploy fails after migrations apply | Cron fires → 404 → logged to `ingestion_runs` as error. Self-heals on next deploy. |
| Calendar constants go stale at season rollover | One-line PR; covered by `calendar.test.ts` boundary tests and noted in `docs/fpl-api.md`. |
| FPL API rate-limits us | Two-per-week schedule + content-hash skip on fixtures keeps traffic minimal. No request needed during off-season. |
