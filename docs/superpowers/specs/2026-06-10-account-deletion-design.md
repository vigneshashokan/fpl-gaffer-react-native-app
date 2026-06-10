# Sub-project E (part 2): Account Deletion — Design Spec

**Issue:** [#19 — Account deletion (GDPR-compliant data purge)](https://github.com/vigneshashokan/fpl-gaffer-react-native-app/issues/19)
**Date:** 2026-06-10
**Status:** Approved

---

## Purpose

Wire the existing `DeleteAccount` confirm card (Profile → Danger zone) to a real soft-delete + cron-purge flow. After this sub-project ships, every onboarding entry and exit path on the auth surface is fully wired except Apple Sign-In (#14, deferred to Phase 5).

This is the fifth sub-project in the auth cluster:

| Sub-project | Closes | Status |
|---|---|---|
| C Google OAuth + auth foundation | #13 | shipped |
| A Email/password + signup + forgot password | #15, #16, #17 | shipped |
| E (part 1) Biometric unlock | #18 | shipped |
| **E (part 2)** Account deletion | #19 | **this spec** |
| D Apple OAuth | #14 | deferred to just before App Store submission |

## Framing Decision: Issue ACs Need Rewriting

Issue #19's original acceptance criteria assume a custom REST backend with manual cascade deletes ("`DELETE /account` requires fresh re-auth", "Cascades: profiles, teams, squads…", "Scheduled job runner (cron / Inngest / Trigger.dev)"). Our architecture is **Supabase** with foreign-key cascades already in place:

- Every user-owned table in the schema (`profiles`, `notification_prefs`, `push_tokens`, and every future one) declares `references auth.users(id) on delete cascade`.
- Supabase ships `pg_cron` as a first-class extension.
- Supabase Auth manages sign-out / session revocation via the client SDK.

So the real work isn't "build a backend service"; it's:

1. A small SQL migration: one new `account_deletions` table + RLS policies + one `security definer` SQL function + one pg_cron schedule.
2. A small client library (`src/lib/auth/account-deletion.ts`) with three functions (`requestDeletion`, `cancelDeletion`, `loadPendingDeletion`).
3. Two UI changes: wire the existing `DeleteAccount` component, add a `restore-account` screen, extend `useProfileGate` and `(onboarding)/_layout`.

No Edge Functions. No external cron service. No backend service. No custom email provider (deferred — see "Out of scope").

After this sub-project merges, we'll comment on #19 with the rewritten framing — same pattern as #13, #15/#16/#17, #18.

## Tech Stack

- **Supabase Postgres** — new table + RLS policies.
- **pg_cron** — daily sweep at 03:00 UTC; built-in Supabase extension. Verify it's enabled in the target project; the migration includes `create extension if not exists pg_cron;` defensively.
- **Supabase Auth client SDK** — `signOut({ scope: 'global' })` for revoking all sessions on all devices.
- **Zustand `useAuthStore` / `useBiometricStore`** — unchanged. The deletion flow uses `signOut()` (existing) and `biometricStore.disable()` (existing).
- **Expo Router** — one new screen at `/(onboarding)/restore-account`. `(onboarding)/_layout.tsx` extended with one new redirect.

## Architecture

Three layers; nothing requires an Edge Function or external service.

### 1. Database (`supabase/migrations/2026-06-10-account-deletion.sql`)

```sql
-- pg_cron extension (no-op if already enabled).
create extension if not exists pg_cron;

-- Soft-delete table. One row per user marked for hard delete.
create table public.account_deletions (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  requested_at timestamptz not null default now()
);

alter table public.account_deletions enable row level security;

create policy "account_deletions: own row select" on public.account_deletions
  for select using (auth.uid() = user_id);
create policy "account_deletions: own row insert" on public.account_deletions
  for insert with check (auth.uid() = user_id);
create policy "account_deletions: own row delete" on public.account_deletions
  for delete using (auth.uid() = user_id);

grant select, insert, delete on public.account_deletions to authenticated;
-- No UPDATE: row content is immutable once written.

create or replace function public.purge_expired_account_deletions()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from auth.users
   where id in (
     select user_id from public.account_deletions
      where requested_at < now() - interval '30 days'
   );
end;
$$;

select cron.schedule(
  'purge-expired-account-deletions',
  '0 3 * * *',
  $$select public.purge_expired_account_deletions();$$
);
```

**Why these choices:**

- **`on delete cascade` on the FK back to `auth.users`** — when the cron hard-deletes the auth.users row, the account_deletions row goes with it. No explicit cleanup step.
- **`security definer`** — pg_cron runs the function under the function-owner's privileges so it can delete from `auth.users`. The function-owner is the migration role (service_role-equivalent). This is the standard Supabase pattern for cron-style privileged operations.
- **No UPDATE grant or policy** — the row is write-once. A user marks themselves once, then either DELETEs (restore) or leaves it for the cron. No re-arming.
- **`requested_at default now()`** — server fills the timestamp. Client doesn't pass it. Prevents clock-skew shenanigans.
- **Daily 03:00 UTC** — minimal compute; up to 24-hour delay between the 30-day expiry and actual hard-delete. The user is signed out the whole time; the delay is invisible.

### 2. Client library (`src/lib/auth/account-deletion.ts`)

Same `Result<T>` discriminated union shape as `src/lib/auth/email.ts`. Three exports:

```ts
type Result<T = void> =
  | { ok: true; value: T }
  | { ok: false; error: 'network' | 'unauthorized' | 'unknown' };

export async function requestDeletion(): Promise<Result>;
// 1. Read current user id from supabase.auth.getSession().
// 2. INSERT INTO account_deletions(user_id) VALUES (user_id).
//    - Unique-violation (already-marked) is treated as success (idempotent).
//    - Any other error → return { ok: false, error: 'network' | 'unauthorized' }.
// 3. supabase.auth.signOut({ scope: 'global' }) — revoke ALL sessions on ALL devices.
//    - Failure → log warn, still return { ok: true } (the deletion request landed).
// 4. biometricStore.disable() — clear SecureStore + AsyncStorage flag on THIS device.
//    - Failure → log warn, still return ok.

export async function cancelDeletion(): Promise<Result>;
// 1. DELETE FROM account_deletions WHERE user_id = auth.uid()
//    - Success or no-op → return { ok: true }.
//    - Error → return { ok: false, error: ... }.

export interface PendingDeletion {
  requestedAt: Date;
  daysRemaining: number;  // clamped at 0; never negative.
}
export async function loadPendingDeletion(): Promise<PendingDeletion | null>;
// SELECT requested_at FROM account_deletions WHERE user_id = auth.uid()
// → returns { requestedAt, daysRemaining } or null.
// daysRemaining = Math.max(0, Math.ceil((requestedAt + 30d - now) / 1 day))
// Query error → return null (defensive; treat as no pending deletion).
```

### 3. `useProfileGate` extension

The existing hook returns `'loading' | 'missing' | 'complete'`. Add a fourth member and run two queries in parallel:

```ts
type ProfileStatus = 'loading' | 'pending_deletion' | 'missing' | 'complete';
```

Logic (pending_deletion wins over everything else):

| account_deletions row | profiles row | status |
|---|---|---|
| present | any | `'pending_deletion'` |
| absent | present | `'complete'` |
| absent | absent | `'missing'` |
| either query in flight | — | `'loading'` |

One source of truth; one hook. No live subscriptions on either table — the state only changes via user action, which already triggers a route change and re-evaluation.

### 4. UI

#### DeleteAccount confirm card (`src/components/profile/DeleteAccount.tsx`)

Current state: a confirm card whose "Delete" button just `setConfirm(false)`. Wire it:

```
┌── confirm card ──┐
│ Delete your      │
│ account?         │
│                  │
│ [body]           │
│                  │
│ Type your email  │
│ to confirm:      │
│ [ Field ]        │
│                  │
│ [Cancel] [Delete]│  ← Delete is disabled until typed email matches
└──────────────────┘
```

- Email comparison is case-insensitive (`typed.trim().toLowerCase() === sessionEmail.toLowerCase()`).
- Delete button is disabled until match; tapping when matched calls `requestDeletion()`.
- On `{ ok: true }` → `signOut` has fired internally; the (home)/_layout will redirect out as session becomes null.
- On `{ ok: false }` → render an inline error under the buttons: "Couldn't request deletion. Please try again." Don't sign out. Don't close the card.

#### Restore screen (`src/app/(onboarding)/restore-account.tsx` — NEW)

```
┌────────────────────────────────┐
│        [GafferLogo]            │
│                                │
│      Welcome back, Ada         │
│                                │
│ Your account is deleted but    │
│ can still be restored within   │
│ {daysRemaining} days.          │
│ After that, it will be         │
│ permanently removed.           │
│                                │
│ Do you want to restore your    │
│ deleted account?               │
│                                │
│ [   Restore my account   ]     │ ← PillBtn variant='accent'
│                                │
│        Cancel                  │ ← Pressable link
└────────────────────────────────┘
```

- On mount: calls `loadPendingDeletion()`, renders `daysRemaining`. If null (defensive — the gate said pending but the row is gone), fall back to rendering "Loading…" briefly, then route home (the gate will re-evaluate).
- First-name greeting reads from the profile row that still exists. If profile is missing (rare), falls back to "Welcome back" with no name.
- **Restore my account** → `cancelDeletion()` → on `ok`, `router.replace('/(home)/(tabs)/team')`. On `!ok`, inline error: "Couldn't restore your account. Please try again."
- **Cancel** → `useAuthStore.signOut()` → `router.replace('/(onboarding)/signin')`. The `account_deletions` row stays; cron will eventually hard-delete. (We can't rely on the layout to redirect here: when session becomes null the user is already inside `(onboarding)`, so `(onboarding)/_layout`'s redirects — all gated on `session && …` — don't fire. Explicit navigation is required.)

#### `(home)/_layout.tsx` defensive rule

The existing layout already redirects `!session` to signin and `'missing'` to complete-profile. Add a parallel rule for `'pending_deletion'`:

```tsx
if (!session) return <Redirect href="/(onboarding)/signin" />;
if (status === 'pending_deletion') return <Redirect href="/(onboarding)/restore-account" />;
if (status === 'loading') return null;
if (status === 'missing') return <Redirect href="/(onboarding)/complete-profile" />;
```

In practice the user always goes through signOut → `(onboarding)/` first, so this rule is defensive — but it keeps both layouts symmetric and prevents any flash of home content if a stale render ever lands there.

#### `(onboarding)/_layout.tsx` redirects (updated order)

```tsx
const onCompleteProfile = segments[segments.length - 1] === 'complete-profile';
const onResetPassword   = segments[segments.length - 1] === 'reset-password';
const onRestoreAccount  = segments[segments.length - 1] === 'restore-account';

if (session && status === 'pending_deletion' && !onRestoreAccount) {
  return <Redirect href="/(onboarding)/restore-account" />;
}
if (session && status === 'complete' && !onResetPassword) {
  return <Redirect href="/(home)/(tabs)/team" />;
}
if (session && status === 'missing' && !onCompleteProfile && !onResetPassword) {
  return <Redirect href="/(onboarding)/complete-profile" />;
}
```

Order matters: pending_deletion check first. A user with a complete profile AND a pending deletion lands on restore-account, not home. The `onResetPassword` exclusion stays — password reset is orthogonal to deletion intent.

## Edge Cases & Error Handling

| Scenario | Behavior | Notes |
|---|---|---|
| Two devices request deletion simultaneously | Second INSERT unique-violates → treated as success client-side | Idempotent |
| User signs in seconds before cron fires | If gate resolves first → restore screen, restore wins. If cron fires first → user's session rejects on next call, lands on signin | Loss-of-race acceptable; 30 days of grace |
| INSERT ok, signOut fails | Returns `ok: true`, logs warn | Next session refresh will catch up |
| signOut ok, INSERT failed | Returns `ok: false`, error surfaced; signOut never called because we order INSERT first | User stays signed in, can retry |
| User has biometric enabled, deletes, signs in within grace | `biometricStore.disable()` cleared SecureStore + flag at request time. Restoring doesn't re-enroll. User opts back in via Profile toggle | Acceptable |
| Profile row missing during soft-delete (deleted before completing profile) | Restore screen shows "Welcome back" without a name. After restore, gate returns `'missing'`, layout routes to complete-profile | Matches existing onboarding pattern |
| RLS denies INSERT | Surface "Couldn't reach the server" inline. Log error. Don't sign out | Defensive; shouldn't happen for a signed-in user |
| pg_cron paused / down | Accounts past 30 days stay until next successful sweep. No data loss; just delayed hard-delete | Operational concern; monitor via Supabase dashboard |
| Pending-deletion user requests password reset | Reset succeeds. On next sign-in, gate returns `pending_deletion` → restore screen | Acceptable; password reset is orthogonal |
| Cron deletes user's auth.users row WHILE they're on the restore screen | Restore's DELETE may succeed (JWT not yet rejected), but cron's `DELETE FROM auth.users` cascades the account_deletions row and the user's data anyway. They land on signin and can't get back | Loss-of-race; window is seconds; user had 30 days |

## Testing

### Unit tests — `src/__tests__/auth/account-deletion.test.ts`

Mock `@/lib/supabase` and `@/store/biometricStore`. Cover:

- `requestDeletion()` happy path — inserts, then signs out, then disables biometric. Verify order via call sequence.
- `requestDeletion()` INSERT error → returns `{ ok: false, error: 'network' }`, does NOT signOut, does NOT disable.
- `requestDeletion()` unique-violation → treated as `{ ok: true }`, still signs out + disables.
- `requestDeletion()` INSERT ok + signOut error → returns `{ ok: true }`, warns.
- `cancelDeletion()` happy + error paths.
- `loadPendingDeletion()` returns parsed payload when row exists, null when not, null on query error.
- `loadPendingDeletion()` `daysRemaining` math: 0 days requested → 30; 15 days requested → 15; 30 days requested → 0 (clamped, not negative); 35 days requested → 0.

### Hook tests — `src/__tests__/useProfileGate.test.ts` (extend existing)

Add cases:
- pending_deletion row present + profiles row present → `'pending_deletion'` (wins over complete).
- pending_deletion row present + profiles row absent → `'pending_deletion'` (wins over missing).
- pending_deletion absent → falls through to existing logic.
- Either query throws → status stays `'loading'`.

### Layout tests — `src/__tests__/onboardingLayout.test.tsx` (extend existing)

Add cases:
- `pending_deletion` + not on restore-account → redirects to `/(onboarding)/restore-account`.
- `pending_deletion` + already on restore-account → renders Stack (no loop).
- `pending_deletion` priority: when status is `pending_deletion`, the complete/missing redirects do NOT fire.

### Screen tests

- `src/__tests__/restoreAccountScreen.test.tsx` (NEW):
  - Renders "Welcome back, Ada" given profile.first_name.
  - Falls back to "Welcome back" without name when profile is missing.
  - Days-remaining count from mocked `loadPendingDeletion`.
  - Restore tap → `cancelDeletion()` → on ok, `router.replace('/(home)/(tabs)/team')`.
  - Cancel tap → `signOut()`.
  - cancelDeletion error → inline error rendered.

- `src/__tests__/components.test.tsx` — extend the DeleteAccount describe (or add one):
  - Typed wrong email → Delete button disabled.
  - Typed right email (case-insensitive) → Delete button enabled.
  - Delete tap when enabled → calls `requestDeletion()`.
  - requestDeletion error → inline error rendered, no signOut.

### Migration smoke (manual / documented)

We don't have SQL test infrastructure today. The migration is exercised by:

- Local `supabase db reset` to verify it applies cleanly on top of the existing schema.
- One-shot SQL probe documented in `docs/auth-account-deletion.md`:
  ```sql
  insert into public.account_deletions (user_id, requested_at)
  values ('<test-user-uuid>', now() - interval '31 days');
  select public.purge_expired_account_deletions();
  select * from auth.users where id = '<test-user-uuid>';  -- expect 0 rows.
  ```

### Manual test plan (documented in runtime docs)

Against the linked Supabase project, on a real device or simulator:

1. Profile → Delete → type email → tap Delete → confirm signed out, on SignIn.
2. Sign in again → confirm Welcome Back screen, correct days remaining.
3. Restore my account → confirm routes home, account is fully active.
4. Repeat 1; this time tap Cancel on Welcome Back → confirm routes to SignIn, account_deletions row still exists in DB.
5. Supabase Dashboard SQL editor: set `requested_at = now() - interval '31 days'` for the test row, then `select public.purge_expired_account_deletions();` → verify auth.users row is gone and account_deletions row is gone.
6. Try to sign in with the deleted user → "Invalid login credentials".

## Supabase Dashboard Config (one-time, manual)

1. **SQL Editor**: confirm `pg_cron` extension is enabled (Database → Extensions → search "pg_cron" → Enable if not on). The migration includes `create extension if not exists` defensively.
2. After applying the migration, check **Database → Cron Jobs** to confirm `purge-expired-account-deletions` is scheduled and enabled.

## Out of Scope

- **Transactional emails** (deletion-requested receipt, deletion-completed receipt). The issue called these out; deferring to a Phase 5 follow-up that introduces a transactional email provider (Resend or similar) for this AND welcome/password emails. Filed as a follow-up issue.
- **Re-authentication beyond typed email confirmation**. Issue mentioned password / biometric within last 5 min; we chose typed email per the brainstorm because (a) the 30-day grace period is the real safety net, (b) typed email works uniformly for email/Google/Apple users without provider-specific branching.
- **Restore from the Profile screen itself** (i.e., undo a Delete request before signing out). The current spec routes restore exclusively through the Welcome-Back screen on next sign-in. Adding a "your account is queued for deletion — tap to cancel" banner in Profile is a small follow-up if desired; not blocking.
- **Notifying other devices in real-time** that this account has been marked for deletion. `signOut({ scope: 'global' })` revokes all sessions, but other devices won't know until their next API call returns 401. That's the existing Supabase behavior; we accept it.
- **Apple OAuth** (#14) and **biometric re-auth verification on dev build** (#73) — separate sub-projects.

## Files (Summary)

**New:**
- `supabase/migrations/2026-06-10-account-deletion.sql`
- `src/lib/auth/account-deletion.ts`
- `src/app/(onboarding)/restore-account.tsx`
- `src/__tests__/auth/account-deletion.test.ts`
- `src/__tests__/restoreAccountScreen.test.tsx`
- `docs/auth-account-deletion.md`

**Edited:**
- `src/components/profile/DeleteAccount.tsx` (add typed-email-confirmation Field; wire Delete → requestDeletion)
- `src/lib/useProfileGate.ts` (extend ProfileStatus with `'pending_deletion'`; add account_deletions query)
- `src/app/(onboarding)/_layout.tsx` (add restore-account redirect rule, ordered first)
- `src/app/(home)/_layout.tsx` (add `pending_deletion` defensive redirect to restore-account)
- `src/__tests__/useProfileGate.test.ts` (extend with pending_deletion cases)
- `src/__tests__/onboardingLayout.test.tsx` (extend with restore-account cases)
- `src/__tests__/components.test.tsx` (extend DeleteAccount describe with typed-email + wire cases)

**Existing, unchanged:**
- `src/store/authStore.ts`
- `src/store/biometricStore.ts` (Restore screen calls existing `disable()` indirectly via requestDeletion)
- `src/lib/supabase.ts`
- `src/lib/auth/email.ts`
- `src/lib/auth/google.ts`
- `src/lib/auth/biometric/*`
- All Phase 1 schema migrations
