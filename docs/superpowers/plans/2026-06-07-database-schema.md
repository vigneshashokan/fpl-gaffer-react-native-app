# Database Schema Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the initial DB schema for issue #11 — three tables (`profiles`, `notification_prefs`, `push_tokens`) with RLS, indexes, and grants; drop the `health` smoke-test table left over from #10; document the schema in `docs/schema.md`.

**Architecture:** A single Supabase migration file (`supabase/migrations/20260607000000_initial_schema.sql`) contains the entire schema change as one atomic unit. CI (`.github/workflows/deploy-supabase.yml`, from #10) applies it on merge to `main` via `supabase db push`. No client code, no Edge Functions, no jest tests — this is pure DB foundation work.

**Tech Stack:** Postgres 15 (via Supabase), Supabase CLI 2.x, `supabase/migrations/` workspace established in #10.

**Spec:** `docs/superpowers/specs/2026-06-07-database-schema-design.md`

---

## File Structure

**Created:**
- `supabase/migrations/20260607000000_initial_schema.sql` — drops `health`, creates `profiles` + `notification_prefs` + `push_tokens`, enables RLS, adds policies + grants + indexes.
- `docs/schema.md` — human-readable schema reference.

**Modified:**
- `supabase/seed.sql` — currently empty; replaced with a one-paragraph comment explaining intentional emptiness.

**Not touched:**
- The existing `supabase/migrations/20260604000000_init.sql` (the `health` table migration) is **left as-is** — migration history is immutable. The new migration drops `health` as its first statement.
- `app.config.ts`, `src/lib/supabase.ts`, the Settings dev-ping button, the GitHub Actions workflow — all unchanged. They keep working because `health` was only read in the dashboard SQL editor; nothing in the app references it.

---

## Prerequisites (Local Verification — Optional)

Task 4 verifies the migration via `supabase db push --dry-run` before merge. This requires:

1. The Supabase CLI installed (done in #10's Task 1).
2. The repo linked to the Supabase project: `supabase link --project-ref <REF>` (done in #10's Task 10).
3. `SUPABASE_DB_PASSWORD` available — either in your shell environment or you'll be prompted.

If you've already done #10's manual provisioning, all of this is in place. If you haven't (or you're a fresh contributor), skip Task 4 and rely on CI to validate on merge — Task 5 makes this safe by walking through dashboard-side verification post-merge.

---

### Task 1: Write the initial schema migration

**Files:**
- Create: `supabase/migrations/20260607000000_initial_schema.sql`

- [ ] **Step 1: Confirm `supabase/migrations/` exists and is on the right branch**

Run:
```bash
ls supabase/migrations/
git branch --show-current
```
Expected: list shows `20260604000000_init.sql` (from #10). Branch shows `feat/database-schema`. If the branch is different, switch via `git checkout feat/database-schema`.

- [ ] **Step 2: Write the migration file**

Create `supabase/migrations/20260607000000_initial_schema.sql` with this EXACT content:

```sql
-- Initial application schema for issue #11.
--
-- Drops the smoke-test `health` table from #10 (no longer needed — real
-- tables exist now) and creates the three foundation tables:
--   - profiles            (1:1 with auth.users, app-specific user data)
--   - notification_prefs  (1:1 with auth.users, push channel toggles)
--   - push_tokens         (1:many with auth.users, one row per device)
--
-- All three are gated by RLS: owners can read/write their own row only.
-- The service_role key (used by future server-side jobs) bypasses RLS by design.
-- The anon role gets no access.

----------------------------------------------------------------------
-- Cleanup: drop the smoke-test table from #10.
----------------------------------------------------------------------
drop table if exists public.health;

----------------------------------------------------------------------
-- profiles
----------------------------------------------------------------------
create table public.profiles (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  first_name   text    not null,
  last_name    text    not null,
  dob          date    not null,
  fpl_team_id  integer,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint profiles_dob_coppa check (dob <= current_date - interval '13 years')
);

alter table public.profiles enable row level security;

create policy "profiles: own row select" on public.profiles
  for select using (auth.uid() = user_id);

create policy "profiles: own row insert" on public.profiles
  for insert with check (auth.uid() = user_id);

create policy "profiles: own row update" on public.profiles
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update on public.profiles to authenticated;

----------------------------------------------------------------------
-- notification_prefs
----------------------------------------------------------------------
create table public.notification_prefs (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  deadlines   boolean not null default true,
  prices      boolean not null default true,
  gw_confirm  boolean not null default true,
  transfer    boolean not null default false,
  updated_at  timestamptz not null default now()
);

alter table public.notification_prefs enable row level security;

create policy "notification_prefs: own row select" on public.notification_prefs
  for select using (auth.uid() = user_id);

create policy "notification_prefs: own row insert" on public.notification_prefs
  for insert with check (auth.uid() = user_id);

create policy "notification_prefs: own row update" on public.notification_prefs
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update on public.notification_prefs to authenticated;

----------------------------------------------------------------------
-- push_tokens
----------------------------------------------------------------------
create table public.push_tokens (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  token        text not null,
  platform     text not null check (platform in ('ios', 'android', 'web')),
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (user_id, token)
);

alter table public.push_tokens enable row level security;

create policy "push_tokens: own rows select" on public.push_tokens
  for select using (auth.uid() = user_id);

create policy "push_tokens: own rows insert" on public.push_tokens
  for insert with check (auth.uid() = user_id);

create policy "push_tokens: own rows update" on public.push_tokens
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "push_tokens: own rows delete" on public.push_tokens
  for delete using (auth.uid() = user_id);

grant select, insert, update, delete on public.push_tokens to authenticated;

create index push_tokens_user_id_idx       on public.push_tokens (user_id);
create index push_tokens_last_seen_at_idx  on public.push_tokens (last_seen_at);
```

- [ ] **Step 3: Eyeball-check the SQL**

Run: `cat supabase/migrations/20260607000000_initial_schema.sql | wc -l`
Expected: roughly 90 lines.

Read through the file once. Confirm:
- The `drop table if exists public.health;` is the first non-comment statement.
- Three `create table public.X` statements, each followed by `alter table ... enable row level security`, then policies, then a `grant` statement.
- All `references auth.users(id)` are followed by `on delete cascade`.
- Two `create index` statements at the bottom.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260607000000_initial_schema.sql
git commit -m "feat(db): initial schema — profiles, notification_prefs, push_tokens"
```

---

### Task 2: Update `supabase/seed.sql`

**Files:**
- Modify: `supabase/seed.sql`

- [ ] **Step 1: Confirm `supabase/seed.sql` is currently empty**

Run: `cat supabase/seed.sql`
Expected: no output (the file is empty; created by `supabase init` in #10's Task 1).

- [ ] **Step 2: Replace with an explanatory comment**

Overwrite `supabase/seed.sql` with:

```sql
-- Intentionally empty. Test data is created via the app's signup flow:
-- run `npm start`, sign up with Google/Apple/email, complete profile.
-- Direct seeding of auth.users is fragile (encrypted password format,
-- identity rows, audit logs) and produces test rows that diverge from
-- real-signup state.
--
-- If automated test seeding becomes needed (e.g. for E2E tests in #48),
-- write a TypeScript script using supabase.auth.admin.createUser() via
-- the service-role key — not raw SQL.
```

- [ ] **Step 3: Commit**

```bash
git add supabase/seed.sql
git commit -m "docs(db): document why seed.sql is intentionally empty"
```

---

### Task 3: Write `docs/schema.md`

**Files:**
- Create: `docs/schema.md`

- [ ] **Step 1: Write the doc**

Create `docs/schema.md` with this EXACT content (the inner SQL block uses indented backticks so it sits inside the outer markdown cleanly):

```markdown
# Database Schema

Authoritative source: `supabase/migrations/20260607000000_initial_schema.sql`.
This doc is the human-readable map of what's in the DB and why.

## Scope

Three tables in the `public` schema, plus the Supabase-managed `auth.users` for identity. We deliberately do **not** persist FPL game state (squads, transfers, fixtures, chip usage, gameweek points) — that's the official FPL API's responsibility and is fetched live + cached client-side via TanStack Query. We are an "extended view" of FPL, not a parallel ledger.

## Relationships

```
auth.users                (Supabase-managed)
   │
   ├── profiles           (1:1, FK + cascade on delete)
   ├── notification_prefs (1:1, FK + cascade on delete)
   └── push_tokens        (1:many — one row per device, FK + cascade)
```

## `public.profiles`

App-specific user data. Always 1:1 with `auth.users`.

| Column | Type | Notes |
|---|---|---|
| `user_id` | `uuid` PK | FK → `auth.users(id)` `on delete cascade` |
| `first_name` | `text NOT NULL` | OAuth pre-fills from `raw_user_meta_data->>'given_name'`; user confirms on completion screen |
| `last_name` | `text NOT NULL` | Same as `first_name` |
| `dob` | `date NOT NULL` | Required by COPPA. A CHECK constraint refuses anyone under 13 even if client checks are bypassed |
| `fpl_team_id` | `integer` | Nullable until the user links a team (own onboarding step, see #22) |
| `created_at` / `updated_at` | `timestamptz` | App sets `updated_at = now()` on UPDATE; no Postgres trigger for MVP |

**COPPA constraint:** `check (dob <= current_date - interval '13 years')`. Belt-and-suspenders to the client-side age check.

## `public.notification_prefs`

Push channel toggles. One column per channel — the channel list is small and stable, so a row-per-channel shape adds no flexibility.

| Column | Type | Default | Notes |
|---|---|---|---|
| `user_id` | `uuid` PK | — | FK → `auth.users(id)` `on delete cascade` |
| `deadlines` | `boolean NOT NULL` | `true` | Gameweek deadline reminders |
| `prices` | `boolean NOT NULL` | `true` | Player price rises / falls |
| `gw_confirm` | `boolean NOT NULL` | `true` | When your XI is locked in |
| `transfer` | `boolean NOT NULL` | `false` | Transfer window open — defaults off (noisy) |
| `updated_at` | `timestamptz` | `now()` | |

Adding a 5th channel later is a one-line `ALTER TABLE`.

## `public.push_tokens`

One row per device. Multi-device support and token rotation both work cleanly with this shape.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | `default gen_random_uuid()` — separate from `(user_id, token)` so individual rows can be unregistered by ID |
| `user_id` | `uuid NOT NULL` | FK → `auth.users(id)` `on delete cascade` |
| `token` | `text NOT NULL` | Expo push token, e.g. `ExponentPushToken[...]` — treated as opaque |
| `platform` | `text NOT NULL` | `check (platform in ('ios', 'android', 'web'))` |
| `created_at` | `timestamptz` | |
| `last_seen_at` | `timestamptz` | Bumped on app open. The Phase 4 cleanup job deletes tokens not seen in 90 days |
| `unique (user_id, token)` | — | Prevents the same device being recorded twice |

Indexes: `(user_id)` and `(last_seen_at)`.

## Profile-creation flow (no auto-trigger)

The standard Supabase pattern is a Postgres trigger that auto-creates a `profiles` row on `auth.users INSERT`. We deliberately do **not** install that trigger.

The reason: our `profiles` table has `NOT NULL` columns (`first_name`, `last_name`, `dob`) that OAuth providers don't always supply. Google gives `given_name`/`family_name` but no `dob`. Apple gives name only on the very first sign-in if the user shared it. If we kept the trigger with NOT NULL columns, OAuth signups would fail at INSERT time, leaving a broken half-state (`auth.users` row but no `profiles` row).

Instead we use **profile-as-gate**:

1. Auth row creation creates only the `auth.users` row.
2. App routing checks for a `profiles` row after sign-in. If absent → force the "Complete your profile" screen.
3. Completion screen collects `first_name`, `last_name`, `dob`. For OAuth users it pre-fills from `raw_user_meta_data` so the user confirms rather than retypes.
4. Client-side COPPA check; under-13 is refused with a clear message. No row written.
5. On submit, the client `INSERT`s the `profiles` row directly (RLS allows users to insert their own row only). The CHECK constraint on `dob` is the DB-level guarantee.
6. The same client step `INSERT`s a default `notification_prefs` row so toggle changes immediately persist.

This makes the gate visible to the user (they understand what's happening) rather than relying on a hidden trigger.

## Row Level Security summary

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `profiles` | own row | own row | own row | — (cascade from auth) |
| `notification_prefs` | own row | own row | own row | — (cascade from auth) |
| `push_tokens` | own rows | own rows | own rows | own rows |

`service_role` bypasses RLS by design — used only server-side by future jobs (e.g. the push-send worker). The `anon` role has no access; it only powers session bootstrap via Supabase Auth.

## Future tables (deferred to other issues)

- `squads` — server-side cache for the live-scoring push job (#37). Until then, squads are fetched live from FPL on every render and cached client-side via TanStack Query.
- `players`, `fixtures` — populated by the FPL data ingestion service (#20).
- Anything else — appears only when a feature genuinely requires it.
```

- [ ] **Step 2: Commit**

```bash
git add docs/schema.md
git commit -m "docs: add docs/schema.md describing the initial schema and design choices"
```

---

### Task 4: Pre-merge dry-run validation (optional, user-gated)

**Files:** none (verification only).

This task validates the migration would apply cleanly against the live project **without applying it**. Skip if you don't have the Supabase CLI linked to a project (typical for fresh contributors); CI will catch any issues on merge instead.

- [ ] **Step 1: Confirm the CLI is installed**

Run: `supabase --version`
Expected: prints `2.x.x`. If not installed, skip to Task 5 and rely on CI.

- [ ] **Step 2: Run the dry-run**

Run:
```bash
supabase db push --dry-run
```

Expected: a list of statements the CLI would execute against the linked project, ending with the contents of the new migration file. NO errors.

Common failure modes:
- `Cannot find project ref. Have you run supabase link?` — you're not linked. Skip the rest of this task; CI will validate on merge.
- Password prompt → paste the DB password saved during #10's manual provisioning.
- `ERROR: syntax error` or similar → the migration file is wrong. Go back to Task 1 Step 2, find the typo, recommit.

- [ ] **Step 3: Spot-check the dry-run output**

Verify the dry-run includes:
- `drop table if exists public.health;`
- `create table public.profiles ...`
- `create table public.notification_prefs ...`
- `create table public.push_tokens ...`
- The three `alter table ... enable row level security` statements
- The 10 policies (3 each on profiles + notification_prefs, 4 on push_tokens)
- The four `grant` statements
- The two `create index` statements

If anything's missing, the migration file is incomplete — go back to Task 1 Step 2.

- [ ] **Step 4: No commit needed**

This task only verifies. Nothing to commit.

---

### Task 5: Open PR, merge, verify in dashboard

**Files:** none (orchestration).

- [ ] **Step 1: Push the branch**

```bash
git push -u origin feat/database-schema
```

- [ ] **Step 2: Open the PR**

```bash
gh pr create --title "feat: initial database schema (issue #11)" --body-file - <<'EOF'
## Summary
Implements [issue #11](https://github.com/vigneshashokan/fpl-gaffer-react-native-app/issues/11) — the foundation schema for the app.

Three tables: `profiles`, `notification_prefs`, `push_tokens`. Drops the smoke-test `health` table from #10. Includes RLS, indexes, grants, and docs.

Game-state data (squads, transfers, gw points) is NOT persisted — FPL is the source of truth, fetched live + cached client-side via TanStack Query. See spec at `docs/superpowers/specs/2026-06-07-database-schema-design.md` and the #11 brainstorming comment chain for the full reasoning.

## Acceptance criteria
- [x] Migrations checked into repo and reproducible (one file under `supabase/migrations/`).
- [x] Foreign keys + indexes on hot paths (`push_tokens(user_id)`, `push_tokens(last_seen_at)`; PKs elsewhere). The original `team_id + gw` index was moot once `squads` was dropped.
- [x] Seed script for local dev (intentionally empty with a documenting comment explaining why).
- [x] Schema documented in `docs/schema.md`.

## Test plan (post-merge)
- [ ] CI's `Deploy Supabase` workflow runs green on merge.
- [ ] Supabase Dashboard → Table Editor shows `profiles`, `notification_prefs`, `push_tokens`; `health` is gone.
- [ ] On each new table, "Auth Policies" tab shows the expected policies (and "RLS enabled").
- [ ] `select * from pg_indexes where tablename = 'push_tokens';` returns the two expected indexes.

Closes #11

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
```

- [ ] **Step 3: Merge the PR**

After the PR opens, review it once in the GitHub UI, then merge:

```bash
gh pr merge --squash --delete-branch
```

- [ ] **Step 4: Watch the deploy workflow**

```bash
gh run watch
```

(Or visit Actions tab in the GitHub UI.)

Expected: the `Deploy Supabase` workflow runs, `supabase db push` applies the migration, the job ends green. If it fails:
- "no rows in result set" on the SELECT after migration — usually a connection issue, not a migration problem. Re-run the job.
- syntax error — the migration file has a typo. Fix in a follow-up PR (don't edit the merged migration).
- permission denied — `SUPABASE_DB_PASSWORD` is wrong; rotate and retry.

- [ ] **Step 5: Verify in Supabase Dashboard**

Open the Supabase project → Table Editor. Expected:
- `profiles`, `notification_prefs`, `push_tokens` are listed in the `public` schema.
- `health` is gone.

Click each table → "Auth Policies" tab. Expected: the policies listed in the spec are present (3 for profiles + notification_prefs, 4 for push_tokens).

- [ ] **Step 6: Verify indexes**

Open the Supabase Dashboard → SQL Editor and run:

```sql
select tablename, indexname from pg_indexes
where schemaname = 'public' and tablename = 'push_tokens'
order by indexname;
```

Expected: 3 rows — the PK index (`push_tokens_pkey`), `push_tokens_user_id_idx`, `push_tokens_last_seen_at_idx`. The `(user_id, token)` unique constraint also creates an index — that's expected.

- [ ] **Step 7: Sync local main**

```bash
git checkout main
git pull --ff-only origin main
```

Issue #11 closes automatically via the `Closes #11` line.

---

## Acceptance Criteria Mapping

From issue #11, each AC mapped to its task:

| Criterion | Task |
|---|---|
| Migrations checked into repo and reproducible | Task 1 |
| Foreign keys + indexes on hot paths | Task 1 (FKs on all three tables, indexes on push_tokens) |
| Seed script for local dev | Task 2 (intentionally empty with documenting comment) |
| Document schema in `docs/schema.md` | Task 3 |

## Out of Scope (Each Has Its Own Issue or Deferral)

- The "Complete your profile" UI flow — wired up in the auth issues (#13–#17) that actually create accounts.
- Auth providers themselves — Google #13, Apple #14, email/password #15.
- AsyncStorage persistence of theme/palette and other client-only settings — #12.
- TanStack Query setup + FPL API client — part of #21 (replace mock data with live API).
- FPL data ingestion (#20) — `players`, `fixtures` tables land there.
- Account deletion job (#19) — uses the cascade from this schema but adds its own admin RPC.
- `squads` server-side cache for push notifications — #37.
- Live scoring + push send job — #37.
