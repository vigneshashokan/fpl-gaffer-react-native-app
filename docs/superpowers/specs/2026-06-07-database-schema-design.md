# Database Schema — Design Spec

**Issue:** [#11 — Design and create database schema](https://github.com/vigneshashokan/fpl-gaffer-react-native-app/issues/11)
**Date:** 2026-06-07
**Status:** Approved

---

## Purpose

Define the application's persistent storage in Supabase Postgres. The schema captures only what *we* own: user identity (via Supabase Auth), profile data the user enters at signup, notification preferences, and push tokens. Game-state data (squads, transfers, fixtures, chip usage, gameweek points) is the official FPL API's responsibility and is fetched on demand + cached on the device — we do not maintain a parallel ledger.

This issue covers the foundational tables only. Future tables (`squads` cache, `players`, `fixtures`) will be added as later phases require them.

## Framing Decision: FPL Is the Source of Truth

The original issue listed `teams`, `squads`, `transfers`, `chips_used`, and `gw_points` as standalone tables. All five hold data that FPL's public API already provides. The app's role is **read-only viewer + analytics layer** — it never executes transfers, captain changes, or chip activations (FPL has no public write API). Persisting that data on our side would mean:

- Duplicating FPL's record without owning the write side
- Inventing a sync story for data we don't author
- Building referential integrity for IDs (players, gameweeks) that FPL controls

So we drop those tables. The mobile client reads directly from FPL via TanStack Query with AsyncStorage persistence (stale-while-revalidate), and we only persist data that has no canonical home elsewhere.

A `squads` table will re-enter the picture when the live-scoring push job (Phase 4, #37) needs server-side knowledge of who owns whom for fan-out — but that's not this issue.

## Tables

### `public.profiles`

1:1 with `auth.users`. Holds the app-specific fields not covered by Supabase Auth.

```sql
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
```

Field notes:

| Column | Notes |
|---|---|
| `user_id` | PK + FK to `auth.users(id)`. `on delete cascade` cleans up when account deletion (#19) calls `supabase.auth.admin.deleteUser`. |
| `first_name`, `last_name` | NOT NULL. OAuth pre-fills from `raw_user_meta_data->>'given_name'/'family_name'`; the profile-completion screen lets the user confirm/edit. |
| `dob` | NOT NULL. Required for COPPA — the CHECK constraint refuses anyone under 13 even if client-side checks are bypassed. |
| `fpl_team_id` | Nullable. Linking the FPL team is its own onboarding step (#22) and may not happen at signup time. Not unique — two users could legitimately watch the same team (partner, friend). |
| `created_at`, `updated_at` | Standard audit fields. App sets `updated_at = now()` on UPDATE — no Postgres trigger for MVP. |

Dropped from the original issue list:
- `gender` — no use case justifies the friction. Modern mobile ad networks don't lean on app-supplied demographics; FPL audience is ~85-90% male making segmentation low-value.
- `face_id_enabled` — biometric login is a device-local choice, not a server fact. Lives in AsyncStorage per #12.
- `gw_joined` — derivable from FPL's `/entry/{id}/history/` endpoint; no need to cache.

### `public.notification_prefs`

One row per user, one column per channel. Defaults are set in the schema so a freshly-inserted row has sensible values.

```sql
create table public.notification_prefs (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  deadlines   boolean not null default true,
  prices      boolean not null default true,
  gw_confirm  boolean not null default true,
  transfer    boolean not null default false,
  updated_at  timestamptz not null default now()
);
```

Why column-per-channel rather than row-per-(user,channel): we have 4 fixed channels, not a user-defined set. Reading "all of this user's prefs" is one row, no aggregation. Adding a 5th channel later is a one-line `ALTER TABLE`. The generic shape's flexibility has no payoff at this scale.

The four channels match the current Settings UI's `NotificationsCard`: deadlines, prices, gw_confirm, transfer.

`transfer` defaults to **false** because the transfer-window notifications are noisy. The other three default to **true** because users who want notifications at all usually want these.

### `public.push_tokens`

Multi-row per user — a user can have multiple devices (phone, tablet) and tokens rotate over time.

```sql
create table public.push_tokens (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  token        text not null,
  platform     text not null check (platform in ('ios', 'android', 'web')),
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (user_id, token)
);
```

Field notes:

| Column | Notes |
|---|---|
| `id` | UUID PK so individual rows can be deleted by ID (unregister a device). |
| `user_id` | FK to `auth.users(id)`; cascade on delete. |
| `token` | Expo push token, e.g. `ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]`. Treated as opaque. |
| `platform` | CHECK constraint to `'ios' | 'android' | 'web'` — anything else is a bug. |
| `last_seen_at` | Bumped on app open. The cleanup job (Phase 4) deletes tokens not seen in 90 days to keep the table from accumulating stale Expo tokens (which fail silently when push attempts hit them). |
| `unique (user_id, token)` | Prevents the same device being recorded twice if the app's permission-grant flow runs again. |

## Profile-Creation Flow (No Auto-Trigger)

We deliberately do **not** install a Postgres trigger that auto-creates a `profiles` row on `auth.users` INSERT. The standard Supabase pattern is convenient but breaks here because `profiles` has `NOT NULL` columns (`first_name`, `last_name`, `dob`) that OAuth providers don't always supply:

- Email signup: app can pass first_name/last_name/dob via `signUp({ options: { data: {...} } })` → ends up in `raw_user_meta_data` → trigger could read them. Works.
- Google OAuth: provides `given_name`/`family_name`. **No dob, ever.**
- Apple OAuth: provides name only on the very first sign-in if the user shared it. Often missing. **No dob, ever.**

If we kept the trigger with NOT NULL columns, OAuth signups would fail at INSERT time, leaving a half-created account (`auth.users` row but no `profiles` row) with no recovery path.

The replacement pattern is **profile-as-gate**:

1. Auth row creation creates **only** the `auth.users` row. No trigger.
2. App's post-auth routing: if `profiles` row exists for `auth.uid()` → main app. If not → force the "Complete your profile" screen.
3. Completion screen collects `first_name`, `last_name`, `dob`. For OAuth users it pre-fills from `raw_user_meta_data` so the user just confirms.
4. Client-side COPPA check (`age >= 13`); under-13 is refused with a clear message, no row written.
5. On submit, the client `INSERT`s the `profiles` row (RLS allows users to insert their own row only).
6. The COPPA CHECK constraint on the DB rejects the row as belt-and-suspenders if the client check is bypassed.
7. App also INSERTs a default `notification_prefs` row in the same client-side step so notification toggles immediately persist.

This makes the gate visible to the user (they see the completion screen and understand what's happening) instead of relying on a hidden trigger. It also guarantees NOT NULL means NOT NULL — no broken half-state is possible because main-app routes are unreachable without a complete profile row.

## Row Level Security

Every table has RLS enabled. Same pattern for all three: the owner can read/write their own row, nothing else. The service_role key (used only server-side by jobs like the push-send worker) bypasses RLS by design. The anon role gets no access — only Supabase Auth itself uses the anon key, to start a session.

```sql
alter table public.profiles enable row level security;

create policy "profiles: own row select" on public.profiles
  for select using (auth.uid() = user_id);

create policy "profiles: own row insert" on public.profiles
  for insert with check (auth.uid() = user_id);

create policy "profiles: own row update" on public.profiles
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- notification_prefs: identical pattern (select / insert / update) on user_id

-- push_tokens: identical pattern, PLUS a delete policy so a user can
-- unregister a single device on sign-out:
create policy "push_tokens: own rows delete" on public.push_tokens
  for delete using (auth.uid() = user_id);

-- explicit grants (Supabase's auto_expose_new_tables defaulted to false on
-- 2026-05-30; pattern established in #10's migration):
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update on public.notification_prefs to authenticated;
grant select, insert, update, delete on public.push_tokens to authenticated;
```

No DELETE policy on `profiles` or `notification_prefs`. Account deletion (#19) cascades from `auth.users.delete`, so we don't want a path where a user can drop their profile row without dropping the auth row.

## Indexes

One explicit index; everything else uses an index implied by another constraint.

```sql
create index push_tokens_last_seen_at_idx on public.push_tokens (last_seen_at);
```

- `push_tokens(last_seen_at)`: the stale-token cleanup job filters by this; small table so it's cheap insurance.
- `push_tokens(user_id)` — **not** declared explicitly. The `unique (user_id, token)` constraint creates a B-tree index on `(user_id, token)`, and Postgres can satisfy `user_id`-only queries (e.g. the push-send fan-out in #37) using that composite index's leading column. A separate `(user_id)` index would be redundant write overhead.

Nothing on `profiles.fpl_team_id` — we don't currently query "find all users watching team X." If a future analytics use case appears, the index is a one-line follow-up.

## Migration

Single file: `supabase/migrations/20260607000000_initial_schema.sql`. Contains:

1. `drop table if exists public.health;` — removes the smoke-test table from #10. Real tables exist now.
2. Three `create table` statements with their constraints and defaults.
3. `alter table ... enable row level security` × 3.
4. RLS policies.
5. Indexes.
6. Grants.

One migration because the three tables are conceptually one unit ("initial schema") and their policies/grants need to stay in sync with the tables they protect. Splitting into separate files invites drift.

We do **not** edit `20260604000000_init.sql` from #10. Migration history is immutable.

## Seed Script

`supabase/seed.sql` stays effectively empty:

```sql
-- Intentionally empty. Test data is created via the app's signup flow:
-- run `npm start`, sign up with Google/Apple/email, complete profile.
-- Direct seeding of auth.users is fragile (encrypted password format,
-- identity rows, audit logs) and produces test rows that diverge from
-- real-signup state.
```

The issue's AC asked for "a seed script for local dev" but the realistic path forward is the app itself. If automated test seeding becomes needed (e.g., for the E2E tests in #48), the right tool is a TypeScript script using `supabase.auth.admin.createUser()` via the service role — not raw SQL.

## Schema Documentation

`docs/schema.md` is written as the human-readable reference. The migration file is the authoritative source of truth; the doc explains "what's in the DB and why" without scrolling through SQL.

Outline:
- Scope (what's owned vs fetched from FPL)
- Relationships diagram (text)
- Per-table reference (columns + intent)
- Profile-creation flow (the "profile-as-gate" pattern)
- RLS summary
- Future tables (deferred)

## Acceptance Criteria

| Criterion (from #11) | Where satisfied |
|---|---|
| Migrations checked into repo and reproducible | Single migration file under `supabase/migrations/`, applied via `supabase db push` (CI from #10). |
| Foreign keys + indexes on hot paths | FKs on every table; explicit index on `push_tokens(last_seen_at)`. `push_tokens(user_id)` is covered by the `unique (user_id, token)` constraint's index, not a separate declaration. PK indexes elsewhere. (The original AC mentioned `team_id+gw` — moot now that `squads`/`transfers` are dropped.) |
| Seed script for local dev | `supabase/seed.sql` exists with a comment explaining why it's empty and where test data comes from. |
| Document schema in `docs/schema.md` | New file written per the outline above. |

## Out of Scope (Each Has Its Own Issue or Deferral)

- Auth UI / OAuth wiring (#13 Google, #14 Apple, #15 email, #16 sign-up, #17 forgot-password, #18 biometric)
- The actual "Complete your profile" screen — wired up in the auth issues that need it
- AsyncStorage persistence for theme/palette (#12)
- TanStack Query setup + FPL API client (part of #21, replace mock data)
- FPL data ingestion (#20) — `players`, `fixtures` tables land there
- Account deletion job (#19) — uses cascade from this schema but adds its own admin RPC
- `squads` server-side cache for push notifications (#37)
- Live scoring, push send job (#37)

## Risks & Migration Paths

- **Profile-completion gate friction.** Users who close the app mid-completion-screen end up with an `auth.users` row but no `profiles` row, and on next sign-in they hit the same screen again. Acceptable — it's a one-time wall and OAuth users have most fields pre-filled. Documented in the schema doc.
- **NOT NULL on `first_name`/`last_name`.** Apple users who choose "Hide my name" on the first sign-in have to type their name manually. Real but unavoidable — Apple gives no other path.
- **Adding `squads` later** is a clean additive migration. The migration file pattern from #10/#11 (single file per logical unit) extends naturally.
- **Schema portability.** All standard Postgres + the Supabase-specific `auth.users` reference. If we ever migrated off Supabase, the only thing that changes is the `auth.users` FK (becomes a `users` table we own).
