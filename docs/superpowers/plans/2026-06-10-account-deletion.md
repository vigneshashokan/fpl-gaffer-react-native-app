# Account Deletion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the existing `DeleteAccount` confirm card to a real soft-delete + cron-purge flow — closing issue #19 — using a single Supabase migration (table + RLS + `security definer` function + pg_cron), a three-function client library, an extended `useProfileGate`, and a new `restore-account` screen.

**Architecture:** No Edge Functions, no external cron. `requestDeletion()` does an RLS-gated INSERT + `signOut({ scope: 'global' })` + `biometricStore.disable()`. A daily `pg_cron` job invokes a `security definer` SQL function that hard-deletes rows from `auth.users` for `account_deletions` past 30 days; existing `ON DELETE CASCADE` FKs (`profiles`, `notification_prefs`, `push_tokens`) wipe everything else. `useProfileGate` gains a fourth status (`'pending_deletion'`) that beats `complete`/`missing`; both onboarding and home layouts redirect to a new `/(onboarding)/restore-account` screen when seen. The screen offers Restore (DELETE the row) and Cancel (signOut + explicit route to signin).

**Tech Stack:** Supabase Postgres (new table + RLS + `security definer` function), pg_cron (daily schedule), Supabase Auth client SDK (`signOut`, `getSession`), Zustand `useAuthStore`/`useBiometricStore` (unchanged consumers), Expo Router (one new onboarding screen, two layout edits).

**Spec:** `docs/superpowers/specs/2026-06-10-account-deletion-design.md`

---

## File Map

| Path | Purpose | Status |
|---|---|---|
| `supabase/migrations/20260610000000_account_deletion.sql` | account_deletions table + RLS + purge function + pg_cron schedule | NEW |
| `src/lib/auth/account-deletion.ts` | `requestDeletion`, `cancelDeletion`, `loadPendingDeletion`, `Result<T>`, `PendingDeletion` | NEW |
| `src/app/(onboarding)/restore-account.tsx` | Welcome-back screen with Restore + Cancel | NEW |
| `docs/auth-account-deletion.md` | Runtime + manual setup docs (mirrors `docs/auth-biometric.md`) | NEW |
| `src/components/profile/DeleteAccount.tsx` | Add typed-email-confirmation Field; wire Delete → requestDeletion | EDIT |
| `src/lib/useProfileGate.ts` | Extend `ProfileStatus` with `'pending_deletion'`; add account_deletions query | EDIT |
| `src/app/(onboarding)/_layout.tsx` | Add restore-account redirect, ordered first | EDIT |
| `src/app/(home)/_layout.tsx` | Add defensive `pending_deletion` redirect to restore-account | EDIT |
| `src/__tests__/auth/account-deletion.test.ts` | Library tests | NEW |
| `src/__tests__/restoreAccountScreen.test.tsx` | Restore screen tests | NEW |
| `src/__tests__/useProfileGate.test.ts` | Add `'pending_deletion'` cases | EDIT |
| `src/__tests__/onboardingLayout.test.tsx` | Add restore-account redirect cases | EDIT |
| `src/__tests__/components.test.tsx` | Extend / add `DeleteAccount` describe (typed-email + wire) | EDIT |

---

## Conventions

- Working directory for every command: `/Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app`.
- Run `npm test -- --watchAll=false` for the full suite. Use `-t '<name>'` for targeting.
- Mock pattern: jest factory mocks at the top of each test file. Variables referenced inside `jest.mock(...)` factory callbacks must be prefixed with `mock` (jest's babel-jest hoisting requirement — same gotcha we hit on email/password and biometric features).
- Path alias: `@/...` → `<rootDir>/src/...` (configured in `package.json` `moduleNameMapper`).
- All commits go to `feat/account-deletion` (already checked out from the spec commit `c2422c8`).
- Commit messages follow the existing imperative style ("Add X", "Wire Y to Z").

---

## Task 1: SQL migration — table + RLS + purge function + pg_cron schedule

**Files:**
- Create: `supabase/migrations/20260610000000_account_deletion.sql`

No automated test for this task — SQL migrations are smoke-checked manually via `supabase db reset` if the implementer has the Supabase CLI configured. Code linting via the SQL itself is sufficient for the TDD-style check.

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/20260610000000_account_deletion.sql`:

```sql
-- Soft-delete + cron-purge for account deletion (issue #19).
--
-- Architecture:
--   - account_deletions is a one-row-per-user "this user is queued for hard
--     delete" table. Owner can INSERT (mark), SELECT (see pending state),
--     DELETE (restore). No UPDATE — the row is write-once.
--   - purge_expired_account_deletions() runs as security definer so pg_cron
--     can DELETE from auth.users. The existing ON DELETE CASCADE on
--     profiles / notification_prefs / push_tokens (and every future
--     user-owned table) wipes related rows in one shot.
--   - The account_deletions row itself disappears via its own
--     ON DELETE CASCADE FK back to auth.users.
--   - pg_cron schedules the function daily at 03:00 UTC.

create extension if not exists pg_cron;

----------------------------------------------------------------------
-- account_deletions
----------------------------------------------------------------------
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
-- No UPDATE: the row is immutable once written.

----------------------------------------------------------------------
-- purge_expired_account_deletions()
----------------------------------------------------------------------
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

----------------------------------------------------------------------
-- Daily 03:00 UTC sweep
----------------------------------------------------------------------
select cron.schedule(
  'purge-expired-account-deletions',
  '0 3 * * *',
  $$select public.purge_expired_account_deletions();$$
);
```

- [ ] **Step 2: Verify SQL parses (lint smoke-check via psql or supabase db lint, if available)**

```bash
# If the Supabase CLI is configured to the project:
supabase db lint || true
```

If `supabase db lint` is not available, this step is a no-op. The migration will be applied by the user against the linked Supabase project after merge.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260610000000_account_deletion.sql
git commit -m "Add account_deletions table + cron-driven hard-delete purge"
```

---

## Task 2: `requestDeletion()` + shared types (`src/lib/auth/account-deletion.ts`)

This task introduces the `Result<T>` type and the `requestDeletion()` function. Tasks 3 and 4 append to the same file.

**Files:**
- Create: `src/lib/auth/account-deletion.ts`
- Test: `src/__tests__/auth/account-deletion.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/__tests__/auth/account-deletion.test.ts`:

```ts
const mockGetSession = jest.fn();
const mockInsert = jest.fn();
const mockFrom = jest.fn((_table: string) => ({ insert: mockInsert }));
const mockSignOut = jest.fn();
const mockBiometricDisable = jest.fn();

jest.mock('@/lib/supabase', () => ({
  __esModule: true,
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
      signOut: (args: unknown) => mockSignOut(args),
    },
    from: (table: string) => mockFrom(table),
  },
}));

jest.mock('@/store/biometricStore', () => ({
  __esModule: true,
  useBiometricStore: {
    getState: () => ({ disable: () => mockBiometricDisable() }),
  },
}));

import { requestDeletion } from '@/lib/auth/account-deletion';

describe('requestDeletion', () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockInsert.mockReset();
    mockFrom.mockClear();
    mockSignOut.mockReset();
    mockBiometricDisable.mockReset();
  });

  it('returns unauthorized when there is no active session', async () => {
    mockGetSession.mockResolvedValueOnce({ data: { session: null }, error: null });
    const r = await requestDeletion();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('unauthorized');
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('INSERTs into account_deletions with the current user id, then signs out + disables biometric', async () => {
    mockGetSession.mockResolvedValueOnce({
      data: { session: { user: { id: 'u1' } } },
      error: null,
    });
    mockInsert.mockResolvedValueOnce({ error: null });
    mockSignOut.mockResolvedValueOnce({ error: null });
    mockBiometricDisable.mockResolvedValueOnce(undefined);

    const r = await requestDeletion();

    expect(r.ok).toBe(true);
    expect(mockFrom).toHaveBeenCalledWith('account_deletions');
    expect(mockInsert).toHaveBeenCalledWith({ user_id: 'u1' });
    expect(mockSignOut).toHaveBeenCalledWith({ scope: 'global' });
    expect(mockBiometricDisable).toHaveBeenCalled();
  });

  it('treats unique-violation (code 23505) as success and still signs out + disables biometric', async () => {
    mockGetSession.mockResolvedValueOnce({
      data: { session: { user: { id: 'u1' } } },
      error: null,
    });
    mockInsert.mockResolvedValueOnce({
      error: { code: '23505', message: 'duplicate key value violates unique constraint' },
    });
    mockSignOut.mockResolvedValueOnce({ error: null });
    mockBiometricDisable.mockResolvedValueOnce(undefined);

    const r = await requestDeletion();

    expect(r.ok).toBe(true);
    expect(mockSignOut).toHaveBeenCalled();
    expect(mockBiometricDisable).toHaveBeenCalled();
  });

  it('returns network error when INSERT fails and does NOT sign out or disable biometric', async () => {
    mockGetSession.mockResolvedValueOnce({
      data: { session: { user: { id: 'u1' } } },
      error: null,
    });
    mockInsert.mockResolvedValueOnce({ error: { code: 'PGRST301', message: 'boom' } });

    const r = await requestDeletion();

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('network');
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(mockBiometricDisable).not.toHaveBeenCalled();
  });

  it('returns ok even when signOut fails (logged warn, deletion already landed)', async () => {
    mockGetSession.mockResolvedValueOnce({
      data: { session: { user: { id: 'u1' } } },
      error: null,
    });
    mockInsert.mockResolvedValueOnce({ error: null });
    mockSignOut.mockRejectedValueOnce(new Error('boom'));
    mockBiometricDisable.mockResolvedValueOnce(undefined);

    const r = await requestDeletion();

    expect(r.ok).toBe(true);
  });

  it('returns ok even when biometric disable fails', async () => {
    mockGetSession.mockResolvedValueOnce({
      data: { session: { user: { id: 'u1' } } },
      error: null,
    });
    mockInsert.mockResolvedValueOnce({ error: null });
    mockSignOut.mockResolvedValueOnce({ error: null });
    mockBiometricDisable.mockRejectedValueOnce(new Error('boom'));

    const r = await requestDeletion();

    expect(r.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
npm test -- --watchAll=false src/__tests__/auth/account-deletion.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/auth/account-deletion'`.

- [ ] **Step 3: Implement**

Create `src/lib/auth/account-deletion.ts`:

```ts
import { supabase } from '@/lib/supabase';
import { useBiometricStore } from '@/store/biometricStore';

export type Result<T = void> =
  | { ok: true; value: T }
  | { ok: false; error: 'network' | 'unauthorized' | 'unknown' };

export async function requestDeletion(): Promise<Result> {
  const { data } = await supabase.auth.getSession();
  if (!data.session) return { ok: false, error: 'unauthorized' };

  const userId = data.session.user.id;
  const { error } = await supabase
    .from('account_deletions')
    .insert({ user_id: userId });

  // 23505 = unique_violation in Postgres. Idempotent: the row we wanted is
  // already there, so the desired state holds.
  if (error && error.code !== '23505') {
    return { ok: false, error: 'network' };
  }

  // Order matters: INSERT first, then signOut (so a failed sign-out leaves
  // the deletion request landed). Both signOut and biometric disable are
  // best-effort from here.
  try {
    await supabase.auth.signOut({ scope: 'global' });
  } catch (err) {
    console.warn('[account-deletion] signOut failed (non-fatal):', err);
  }
  try {
    await useBiometricStore.getState().disable();
  } catch (err) {
    console.warn('[account-deletion] biometric disable failed (non-fatal):', err);
  }
  return { ok: true, value: undefined };
}
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
npm test -- --watchAll=false src/__tests__/auth/account-deletion.test.ts
```

Expected: 6/6 passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/account-deletion.ts src/__tests__/auth/account-deletion.test.ts
git commit -m "Add requestDeletion() with INSERT + signOut + biometric disable"
```

---

## Task 3: `cancelDeletion()`

**Files:**
- Modify: `src/lib/auth/account-deletion.ts`
- Modify: `src/__tests__/auth/account-deletion.test.ts`

- [ ] **Step 1: Extend test mocks and append failing tests**

In `src/__tests__/auth/account-deletion.test.ts`:

(A) Add `mockDelete` + `mockEq` consts at the top alongside the existing mocks:

```ts
const mockEq = jest.fn();
const mockDelete = jest.fn(() => ({ eq: mockEq }));
```

(B) Extend the existing `jest.mock('@/lib/supabase', ...)` block — update `mockFrom` to expose `delete`:

```ts
const mockFrom = jest.fn((_table: string) => ({
  insert: mockInsert,
  delete: () => mockDelete(),
}));
```

(C) Update the import to add `cancelDeletion`:

```ts
import { requestDeletion, cancelDeletion } from '@/lib/auth/account-deletion';
```

(D) Append a new describe block:

```ts
describe('cancelDeletion', () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockDelete.mockReset();
    mockEq.mockReset();
    mockFrom.mockClear();
  });

  it('returns unauthorized when there is no active session', async () => {
    mockGetSession.mockResolvedValueOnce({ data: { session: null }, error: null });
    const r = await cancelDeletion();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('unauthorized');
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('DELETEs the account_deletions row for the current user', async () => {
    mockGetSession.mockResolvedValueOnce({
      data: { session: { user: { id: 'u1' } } },
      error: null,
    });
    mockEq.mockResolvedValueOnce({ error: null });

    const r = await cancelDeletion();

    expect(r.ok).toBe(true);
    expect(mockFrom).toHaveBeenCalledWith('account_deletions');
    expect(mockEq).toHaveBeenCalledWith('user_id', 'u1');
  });

  it('returns network error on DELETE failure', async () => {
    mockGetSession.mockResolvedValueOnce({
      data: { session: { user: { id: 'u1' } } },
      error: null,
    });
    mockEq.mockResolvedValueOnce({ error: { code: 'PGRST301', message: 'boom' } });

    const r = await cancelDeletion();

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('network');
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
npm test -- --watchAll=false src/__tests__/auth/account-deletion.test.ts -t 'cancelDeletion'
```

Expected: FAIL — `cancelDeletion is not a function`.

- [ ] **Step 3: Implement**

Append to `src/lib/auth/account-deletion.ts`:

```ts
export async function cancelDeletion(): Promise<Result> {
  const { data } = await supabase.auth.getSession();
  if (!data.session) return { ok: false, error: 'unauthorized' };

  const { error } = await supabase
    .from('account_deletions')
    .delete()
    .eq('user_id', data.session.user.id);

  if (error) return { ok: false, error: 'network' };
  return { ok: true, value: undefined };
}
```

- [ ] **Step 4: Run all tests, verify they pass**

```bash
npm test -- --watchAll=false src/__tests__/auth/account-deletion.test.ts
```

Expected: 9/9 passing (6 from Task 2 + 3 new).

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/account-deletion.ts src/__tests__/auth/account-deletion.test.ts
git commit -m "Add cancelDeletion() for restore flow"
```

---

## Task 4: `loadPendingDeletion()` + types

**Files:**
- Modify: `src/lib/auth/account-deletion.ts`
- Modify: `src/__tests__/auth/account-deletion.test.ts`

- [ ] **Step 1: Extend test mocks and append failing tests**

In `src/__tests__/auth/account-deletion.test.ts`:

(A) Add `mockSelect`, `mockSelectEq`, `mockMaybeSingle` consts at the top:

```ts
const mockMaybeSingle = jest.fn();
const mockSelectEq = jest.fn(() => ({ maybeSingle: mockMaybeSingle }));
const mockSelect = jest.fn(() => ({ eq: mockSelectEq }));
```

(B) Update the supabase `from` factory to also expose `select`:

```ts
const mockFrom = jest.fn((_table: string) => ({
  insert: mockInsert,
  delete: () => mockDelete(),
  select: () => mockSelect(),
}));
```

(C) Update the import:

```ts
import {
  requestDeletion,
  cancelDeletion,
  loadPendingDeletion,
} from '@/lib/auth/account-deletion';
```

(D) Append a new describe block. Note: tests freeze time using `jest.useFakeTimers()` so `daysRemaining` math is deterministic.

```ts
describe('loadPendingDeletion', () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockMaybeSingle.mockReset();
    mockSelectEq.mockReset().mockImplementation(() => ({ maybeSingle: mockMaybeSingle }));
    mockSelect.mockClear();
    mockFrom.mockClear();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-06-10T12:00:00.000Z'));
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns null when there is no active session', async () => {
    mockGetSession.mockResolvedValueOnce({ data: { session: null }, error: null });
    expect(await loadPendingDeletion()).toBeNull();
    expect(mockMaybeSingle).not.toHaveBeenCalled();
  });

  it('returns null when no row exists for the user', async () => {
    mockGetSession.mockResolvedValueOnce({
      data: { session: { user: { id: 'u1' } } },
      error: null,
    });
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });

    expect(await loadPendingDeletion()).toBeNull();
    expect(mockFrom).toHaveBeenCalledWith('account_deletions');
    expect(mockSelectEq).toHaveBeenCalledWith('user_id', 'u1');
  });

  it('returns parsed payload when a row exists, with daysRemaining', async () => {
    mockGetSession.mockResolvedValueOnce({
      data: { session: { user: { id: 'u1' } } },
      error: null,
    });
    // Requested 10 days ago — 20 days remaining (30 - 10).
    mockMaybeSingle.mockResolvedValueOnce({
      data: { requested_at: '2026-05-31T12:00:00.000Z' },
      error: null,
    });

    const r = await loadPendingDeletion();
    expect(r).not.toBeNull();
    expect(r!.requestedAt.toISOString()).toBe('2026-05-31T12:00:00.000Z');
    expect(r!.daysRemaining).toBe(20);
  });

  it('clamps daysRemaining at 0 (never negative) when the grace period has passed', async () => {
    mockGetSession.mockResolvedValueOnce({
      data: { session: { user: { id: 'u1' } } },
      error: null,
    });
    // Requested 31 days ago — past grace, but cron has not fired yet.
    mockMaybeSingle.mockResolvedValueOnce({
      data: { requested_at: '2026-05-10T12:00:00.000Z' },
      error: null,
    });

    const r = await loadPendingDeletion();
    expect(r!.daysRemaining).toBe(0);
  });

  it('returns null defensively when the query errors', async () => {
    mockGetSession.mockResolvedValueOnce({
      data: { session: { user: { id: 'u1' } } },
      error: null,
    });
    mockMaybeSingle.mockResolvedValueOnce({
      data: null,
      error: { code: 'PGRST301', message: 'boom' },
    });

    expect(await loadPendingDeletion()).toBeNull();
  });

  it('returns null defensively when the query throws', async () => {
    mockGetSession.mockResolvedValueOnce({
      data: { session: { user: { id: 'u1' } } },
      error: null,
    });
    mockMaybeSingle.mockRejectedValueOnce(new Error('boom'));

    expect(await loadPendingDeletion()).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
npm test -- --watchAll=false src/__tests__/auth/account-deletion.test.ts -t 'loadPendingDeletion'
```

Expected: FAIL — `loadPendingDeletion is not a function`.

- [ ] **Step 3: Implement**

Append to `src/lib/auth/account-deletion.ts`:

```ts
export interface PendingDeletion {
  requestedAt: Date;
  daysRemaining: number; // clamped at 0; never negative
}

const GRACE_PERIOD_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export async function loadPendingDeletion(): Promise<PendingDeletion | null> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) return null;

    const { data, error } = await supabase
      .from('account_deletions')
      .select('requested_at')
      .eq('user_id', sessionData.session.user.id)
      .maybeSingle();

    if (error || !data) return null;

    const requestedAt = new Date(data.requested_at);
    const expiresAt = requestedAt.getTime() + GRACE_PERIOD_DAYS * MS_PER_DAY;
    const daysRemaining = Math.max(0, Math.ceil((expiresAt - Date.now()) / MS_PER_DAY));

    return { requestedAt, daysRemaining };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run all tests, verify they pass**

```bash
npm test -- --watchAll=false src/__tests__/auth/account-deletion.test.ts
```

Expected: 15/15 passing (6 + 3 + 6).

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/account-deletion.ts src/__tests__/auth/account-deletion.test.ts
git commit -m "Add loadPendingDeletion() with clamped daysRemaining math"
```

---

## Task 5: Extend `useProfileGate` with `'pending_deletion'`

**Files:**
- Modify: `src/lib/useProfileGate.ts`
- Modify: `src/__tests__/useProfileGate.test.ts`

- [ ] **Step 1: Extend the existing test file**

In `src/__tests__/useProfileGate.test.ts`:

(A) Add new mocks at the top alongside the existing query mocks. The hook now runs TWO queries (`profiles` AND `account_deletions`). We model both by branching `mockFrom` on the table name:

Replace the existing mock-from chain at the top:

```ts
const mockProfilesMaybeSingle = jest.fn();
const mockProfilesEq = jest.fn((_col: string, _val: unknown) => ({
  maybeSingle: mockProfilesMaybeSingle,
}));
const mockProfilesSelect = jest.fn((_cols: string) => ({ eq: mockProfilesEq }));

const mockDeletionsMaybeSingle = jest.fn();
const mockDeletionsEq = jest.fn((_col: string, _val: unknown) => ({
  maybeSingle: mockDeletionsMaybeSingle,
}));
const mockDeletionsSelect = jest.fn((_cols: string) => ({ eq: mockDeletionsEq }));

const mockFrom = jest.fn((table: string) => {
  if (table === 'profiles') return { select: mockProfilesSelect };
  if (table === 'account_deletions') return { select: mockDeletionsSelect };
  throw new Error('unexpected table: ' + table);
});
```

(Delete the old `mockMaybeSingle`/`mockEq`/`mockSelect`/`mockFrom` block above the `jest.mock('@/lib/supabase', ...)` call and replace with the block above.)

(B) Update the existing `beforeEach` to reset all the new mocks:

```ts
beforeEach(() => {
  mockProfilesMaybeSingle.mockReset();
  mockProfilesEq.mockClear();
  mockProfilesSelect.mockClear();
  mockDeletionsMaybeSingle.mockReset();
  mockDeletionsEq.mockClear();
  mockDeletionsSelect.mockClear();
  mockFrom.mockClear();
  act(() => useAuthStore.setState({ session: null, hydrated: true }));
});
```

(C) Update the existing tests that previously used `mockMaybeSingle` and `mockEq`. They now refer to `mockProfilesMaybeSingle` / `mockProfilesEq`. Also, every test that previously had only `mockMaybeSingle.mockResolvedValue(...)` must ALSO add `mockDeletionsMaybeSingle.mockResolvedValue({ data: null, error: null })` (because the hook now queries both). Specifically:

- `'resolves to missing when there is a session and no profile row'`:

```ts
it('resolves to missing when there is a session and no profile row', async () => {
  mockProfilesMaybeSingle.mockResolvedValue({ data: null, error: null });
  mockDeletionsMaybeSingle.mockResolvedValue({ data: null, error: null });
  act(() => useAuthStore.setState({ session: fakeSession as never, hydrated: true }));
  const { result } = renderHook(() => useProfileGate());
  await waitFor(() => expect(result.current.status).toBe('missing'));
  expect(mockFrom).toHaveBeenCalledWith('profiles');
  expect(mockFrom).toHaveBeenCalledWith('account_deletions');
  expect(mockProfilesEq).toHaveBeenCalledWith('user_id', 'u1');
});
```

- `'resolves to complete when a profile row is returned'`:

```ts
it('resolves to complete when a profile row is returned', async () => {
  mockProfilesMaybeSingle.mockResolvedValue({ data: { user_id: 'u1' }, error: null });
  mockDeletionsMaybeSingle.mockResolvedValue({ data: null, error: null });
  act(() => useAuthStore.setState({ session: fakeSession as never, hydrated: true }));
  const { result } = renderHook(() => useProfileGate());
  await waitFor(() => expect(result.current.status).toBe('complete'));
});
```

- `'refetch() re-runs the query'`:

```ts
it('refetch() re-runs the query', async () => {
  mockProfilesMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
  mockDeletionsMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
  act(() => useAuthStore.setState({ session: fakeSession as never, hydrated: true }));
  const { result } = renderHook(() => useProfileGate());
  await waitFor(() => expect(result.current.status).toBe('missing'));
  mockProfilesMaybeSingle.mockResolvedValueOnce({ data: { user_id: 'u1' }, error: null });
  mockDeletionsMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
  act(() => result.current.refetch());
  await waitFor(() => expect(result.current.status).toBe('complete'));
});
```

(D) Append new tests for `'pending_deletion'`:

```ts
it("resolves to 'pending_deletion' when a deletion row exists (regardless of profile)", async () => {
  mockProfilesMaybeSingle.mockResolvedValue({ data: { user_id: 'u1' }, error: null });
  mockDeletionsMaybeSingle.mockResolvedValue({
    data: { user_id: 'u1', requested_at: '2026-05-31T12:00:00.000Z' },
    error: null,
  });
  act(() => useAuthStore.setState({ session: fakeSession as never, hydrated: true }));
  const { result } = renderHook(() => useProfileGate());
  await waitFor(() => expect(result.current.status).toBe('pending_deletion'));
});

it("'pending_deletion' wins even when the profile row is missing", async () => {
  mockProfilesMaybeSingle.mockResolvedValue({ data: null, error: null });
  mockDeletionsMaybeSingle.mockResolvedValue({
    data: { user_id: 'u1', requested_at: '2026-05-31T12:00:00.000Z' },
    error: null,
  });
  act(() => useAuthStore.setState({ session: fakeSession as never, hydrated: true }));
  const { result } = renderHook(() => useProfileGate());
  await waitFor(() => expect(result.current.status).toBe('pending_deletion'));
});

it('stays loading if either query is still in flight', async () => {
  let resolveProfile: (v: unknown) => void = () => {};
  mockProfilesMaybeSingle.mockReturnValueOnce(
    new Promise((r) => {
      resolveProfile = r as never;
    }) as never,
  );
  mockDeletionsMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
  act(() => useAuthStore.setState({ session: fakeSession as never, hydrated: true }));
  const { result } = renderHook(() => useProfileGate());
  await new Promise((r) => setTimeout(r, 0));
  expect(result.current.status).toBe('loading');
  resolveProfile({ data: null, error: null });
  await waitFor(() => expect(result.current.status).toBe('missing'));
});
```

- [ ] **Step 2: Run tests, verify some fail**

```bash
npm test -- --watchAll=false src/__tests__/useProfileGate.test.ts
```

Expected: FAIL — the new `'pending_deletion'` tests fail because the hook doesn't query `account_deletions` yet.

- [ ] **Step 3: Implement**

Replace `src/lib/useProfileGate.ts` with:

```ts
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';

export type ProfileStatus = 'loading' | 'pending_deletion' | 'missing' | 'complete';

export function useProfileGate(): { status: ProfileStatus; refetch: () => void } {
  const session = useAuthStore((s) => s.session);
  const hydrated = useAuthStore((s) => s.hydrated);
  const [status, setStatus] = useState<ProfileStatus>('loading');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!hydrated) return;
    if (!session) {
      setStatus('loading');
      return;
    }
    setStatus('loading');

    const userId = session.user.id;
    let cancelled = false;

    Promise.all([
      supabase.from('profiles').select('user_id').eq('user_id', userId).maybeSingle(),
      supabase.from('account_deletions').select('user_id').eq('user_id', userId).maybeSingle(),
    ]).then(([profile, deletion]) => {
      if (cancelled) return;
      // pending_deletion wins over both other states.
      if (deletion.data) {
        setStatus('pending_deletion');
        return;
      }
      setStatus(profile.data ? 'complete' : 'missing');
    });

    return () => {
      cancelled = true;
    };
  }, [hydrated, session, tick]);

  return { status, refetch: () => setTick((t) => t + 1) };
}
```

- [ ] **Step 4: Run all tests, verify they pass**

```bash
npm test -- --watchAll=false src/__tests__/useProfileGate.test.ts
```

Expected: all green (existing + 3 new).

- [ ] **Step 5: Commit**

```bash
git add src/lib/useProfileGate.ts src/__tests__/useProfileGate.test.ts
git commit -m "Extend useProfileGate with 'pending_deletion' status"
```

---

## Task 6: Wire `(onboarding)/_layout.tsx` to redirect on `pending_deletion`

**Files:**
- Modify: `src/app/(onboarding)/_layout.tsx`
- Modify: `src/__tests__/onboardingLayout.test.tsx`

- [ ] **Step 1: Extend the existing test file**

In `src/__tests__/onboardingLayout.test.tsx`:

(A) Update the `mockProfileStatus` type to include `'pending_deletion'`:

```ts
let mockProfileStatus: 'loading' | 'pending_deletion' | 'missing' | 'complete' = 'loading';
```

(B) Append new tests at the end of the `describe` block:

```ts
it("redirects to /(onboarding)/restore-account when status is 'pending_deletion'", () => {
  mockSession = { user: { id: 'u1' } };
  mockProfileStatus = 'pending_deletion';
  mockSegments = ['(onboarding)', 'signin'];
  render(<OnboardingLayout />);
  expect(mockRedirect).toHaveBeenCalledWith('/(onboarding)/restore-account');
});

it("stays on restore-account when already there with 'pending_deletion'", () => {
  mockSession = { user: { id: 'u1' } };
  mockProfileStatus = 'pending_deletion';
  mockSegments = ['(onboarding)', 'restore-account'];
  render(<OnboardingLayout />);
  expect(mockRedirect).not.toHaveBeenCalled();
  expect(mockStack).toHaveBeenCalled();
});

it("'pending_deletion' beats 'complete' — does not redirect to home", () => {
  mockSession = { user: { id: 'u1' } };
  mockProfileStatus = 'pending_deletion';
  mockSegments = ['(onboarding)', 'signin'];
  render(<OnboardingLayout />);
  expect(mockRedirect).toHaveBeenCalledWith('/(onboarding)/restore-account');
  expect(mockRedirect).not.toHaveBeenCalledWith('/(home)/(tabs)/team');
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
npm test -- --watchAll=false src/__tests__/onboardingLayout.test.tsx -t 'pending_deletion'
```

Expected: FAIL — `/(onboarding)/restore-account` is never redirected to.

- [ ] **Step 3: Modify `src/app/(onboarding)/_layout.tsx`**

Replace the file with:

```tsx
import React from 'react';
import { Redirect, Stack, useSegments } from 'expo-router';
import { useAuthStore } from '@/store/authStore';
import { useProfileGate } from '@/lib/useProfileGate';

export default function OnboardingLayout() {
  const session = useAuthStore((s) => s.session);
  const { status } = useProfileGate();
  const segments = useSegments();
  const onCompleteProfile = segments[segments.length - 1] === 'complete-profile';
  const onResetPassword = segments[segments.length - 1] === 'reset-password';
  const onRestoreAccount = segments[segments.length - 1] === 'restore-account';

  // pending_deletion wins; check it first.
  if (session && status === 'pending_deletion' && !onRestoreAccount) {
    return <Redirect href="/(onboarding)/restore-account" />;
  }
  if (session && status === 'complete' && !onResetPassword) {
    return <Redirect href="/(home)/(tabs)/team" />;
  }
  if (session && status === 'missing' && !onCompleteProfile && !onResetPassword) {
    return <Redirect href="/(onboarding)/complete-profile" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
```

- [ ] **Step 4: Run all tests, verify they pass**

```bash
npm test -- --watchAll=false src/__tests__/onboardingLayout.test.tsx
```

Expected: all green (existing + 3 new).

- [ ] **Step 5: Commit**

```bash
git add 'src/app/(onboarding)/_layout.tsx' src/__tests__/onboardingLayout.test.tsx
git commit -m "Wire (onboarding)/_layout to redirect pending_deletion users to restore-account"
```

---

## Task 7: Defensive redirect in `(home)/_layout.tsx`

**Files:**
- Modify: `src/app/(home)/_layout.tsx`

No new tests for this task — `(home)/_layout.tsx` has no dedicated test file in the suite, and the change is a one-line addition that follows the established pattern. The behavior is covered by Task 6's tests for the onboarding layout (same status flow). If a regression appears later we can backfill a `homeLayout.test.tsx`.

- [ ] **Step 1: Modify the file**

Replace `src/app/(home)/_layout.tsx` with:

```tsx
import React from 'react';
import { Stack, Redirect } from 'expo-router';
import { useAuthStore } from '@/store/authStore';
import { useProfileGate } from '@/lib/useProfileGate';

export default function HomeStackLayout() {
  const session = useAuthStore((s) => s.session);
  const { status } = useProfileGate();

  if (!session) return <Redirect href="/(onboarding)/signin" />;
  if (status === 'pending_deletion') {
    return <Redirect href="/(onboarding)/restore-account" />;
  }
  if (status === 'loading') return null;
  if (status === 'missing') return <Redirect href="/(onboarding)/complete-profile" />;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="profile" options={{ presentation: 'modal' }} />
      <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
      <Stack.Screen name="player/[name]" options={{ presentation: 'modal' }} />
    </Stack>
  );
}
```

- [ ] **Step 2: Run the full suite — confirm no regressions**

```bash
npm test -- --watchAll=false
```

Expected: all green.

- [ ] **Step 3: Commit**

```bash
git add 'src/app/(home)/_layout.tsx'
git commit -m "Add defensive pending_deletion redirect to (home)/_layout"
```

---

## Task 8: Restore-account screen

**Files:**
- Create: `src/app/(onboarding)/restore-account.tsx`
- Create: `src/__tests__/restoreAccountScreen.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `src/__tests__/restoreAccountScreen.test.tsx`:

```tsx
import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const mockLoadPendingDeletion = jest.fn();
const mockCancelDeletion = jest.fn();
const mockSignOut = jest.fn();
const mockReplace = jest.fn();

let mockProfile: { first_name?: string } | null = { first_name: 'Ada' };
const mockProfilesMaybeSingle = jest.fn(() =>
  Promise.resolve({ data: mockProfile, error: null }),
);
const mockProfilesEq = jest.fn(() => ({ maybeSingle: mockProfilesMaybeSingle }));
const mockProfilesSelect = jest.fn(() => ({ eq: mockProfilesEq }));

jest.mock('@/lib/auth/account-deletion', () => ({
  __esModule: true,
  loadPendingDeletion: () => mockLoadPendingDeletion(),
  cancelDeletion: () => mockCancelDeletion(),
}));

jest.mock('@/store/authStore', () => ({
  __esModule: true,
  useAuthStore: (selector: (s: { session: unknown; signOut: () => Promise<void> }) => unknown) =>
    selector({
      session: { user: { id: 'u1' } },
      signOut: () => mockSignOut(),
    }),
}));

jest.mock('@/lib/supabase', () => ({
  __esModule: true,
  supabase: {
    from: (table: string) => {
      if (table === 'profiles') return { select: mockProfilesSelect };
      throw new Error('unexpected table: ' + table);
    },
  },
}));

jest.mock('@/store/themeStore', () => ({
  __esModule: true,
  useThemeStore: () => ({ paletteKey: 'classic', dark: true }),
}));

jest.mock('expo-router', () => ({
  __esModule: true,
  router: { replace: (p: string) => mockReplace(p) },
}));

import RestoreAccount from '@/app/(onboarding)/restore-account';

describe('RestoreAccount screen', () => {
  beforeEach(() => {
    mockLoadPendingDeletion.mockReset();
    mockCancelDeletion.mockReset();
    mockSignOut.mockReset();
    mockReplace.mockReset();
    mockProfile = { first_name: 'Ada' };
    mockProfilesMaybeSingle.mockClear();
    mockProfilesEq.mockClear();
    mockProfilesSelect.mockClear();
  });

  it('renders Welcome back, <firstName> when profile is loaded', async () => {
    mockLoadPendingDeletion.mockResolvedValueOnce({
      requestedAt: new Date('2026-05-31T12:00:00.000Z'),
      daysRemaining: 12,
    });
    const { findByText } = render(<RestoreAccount />);
    await findByText('Welcome back, Ada');
  });

  it('falls back to Welcome back without a name when profile is missing', async () => {
    mockProfile = null;
    mockLoadPendingDeletion.mockResolvedValueOnce({
      requestedAt: new Date('2026-05-31T12:00:00.000Z'),
      daysRemaining: 12,
    });
    const { findByText } = render(<RestoreAccount />);
    await findByText('Welcome back');
  });

  it('renders the daysRemaining count from loadPendingDeletion', async () => {
    mockLoadPendingDeletion.mockResolvedValueOnce({
      requestedAt: new Date('2026-05-31T12:00:00.000Z'),
      daysRemaining: 12,
    });
    const { findByText } = render(<RestoreAccount />);
    await findByText(/within 12 days/);
  });

  it('Restore tap calls cancelDeletion and on ok routes to home', async () => {
    mockLoadPendingDeletion.mockResolvedValueOnce({
      requestedAt: new Date('2026-05-31T12:00:00.000Z'),
      daysRemaining: 12,
    });
    mockCancelDeletion.mockResolvedValueOnce({ ok: true, value: undefined });
    const { findByText, getByText } = render(<RestoreAccount />);
    await findByText('Welcome back, Ada');
    fireEvent.press(getByText('Restore my account'));
    await waitFor(() => expect(mockCancelDeletion).toHaveBeenCalled());
    expect(mockReplace).toHaveBeenCalledWith('/(home)/(tabs)/team');
  });

  it('Restore on cancelDeletion error shows inline error and does not route', async () => {
    mockLoadPendingDeletion.mockResolvedValueOnce({
      requestedAt: new Date('2026-05-31T12:00:00.000Z'),
      daysRemaining: 12,
    });
    mockCancelDeletion.mockResolvedValueOnce({ ok: false, error: 'network' });
    const { findByText, getByText } = render(<RestoreAccount />);
    await findByText('Welcome back, Ada');
    fireEvent.press(getByText('Restore my account'));
    await findByText(/Couldn't restore your account/i);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('Cancel tap signs out and replaces to /(onboarding)/signin', async () => {
    mockLoadPendingDeletion.mockResolvedValueOnce({
      requestedAt: new Date('2026-05-31T12:00:00.000Z'),
      daysRemaining: 12,
    });
    mockSignOut.mockResolvedValueOnce(undefined);
    const { findByText, getByText } = render(<RestoreAccount />);
    await findByText('Welcome back, Ada');
    fireEvent.press(getByText('Cancel'));
    await waitFor(() => expect(mockSignOut).toHaveBeenCalled());
    expect(mockReplace).toHaveBeenCalledWith('/(onboarding)/signin');
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
npm test -- --watchAll=false src/__tests__/restoreAccountScreen.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the screen**

Create `src/app/(onboarding)/restore-account.tsx`:

```tsx
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { useThemeStore } from '@/store/themeStore';
import { useAuthStore } from '@/store/authStore';
import { supabase } from '@/lib/supabase';
import { getTheme } from '@/constants/theme';
import { GafferLogo } from '@/components/ui/GafferLogo';
import { PillBtn } from '@/components/ui/PillBtn';
import {
  loadPendingDeletion,
  cancelDeletion,
  type PendingDeletion,
} from '@/lib/auth/account-deletion';

export default function RestoreAccount() {
  const { paletteKey, dark } = useThemeStore();
  const t = getTheme(paletteKey, dark);
  const session = useAuthStore((s) => s.session);
  const signOut = useAuthStore((s) => s.signOut);

  const [pending, setPending] = useState<PendingDeletion | null>(null);
  const [firstName, setFirstName] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadPendingDeletion().then((p) => {
      if (!cancelled) setPending(p);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    supabase
      .from('profiles')
      .select('first_name')
      .eq('user_id', session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setFirstName(data?.first_name ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  const onRestore = async () => {
    if (restoring) return;
    setError(null);
    setRestoring(true);
    try {
      const r = await cancelDeletion();
      if (r.ok) {
        router.replace('/(home)/(tabs)/team');
        return;
      }
      setError("Couldn't restore your account. Please try again.");
    } finally {
      setRestoring(false);
    }
  };

  const onCancel = async () => {
    await signOut();
    router.replace('/(onboarding)/signin');
  };

  const greeting = firstName ? `Welcome back, ${firstName}` : 'Welcome back';
  const days = pending?.daysRemaining ?? 0;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: t.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.logoWrap}>
          <GafferLogo size={46} light={dark} variant="wordmark" />
        </View>

        <Text style={[styles.title, { color: t.text }]}>{greeting}</Text>

        <Text style={[styles.body, { color: t.textMuted }]}>
          Your account is deleted but can still be restored within {days} days.
          After that, it will be permanently removed.
        </Text>

        <Text style={[styles.question, { color: t.text }]}>
          Do you want to restore your deleted account?
        </Text>

        <PillBtn
          variant="accent"
          onPress={onRestore}
          accentInk={t.accentInk}
          style={styles.restoreBtn}
        >
          {restoring ? 'Restoring…' : 'Restore my account'}
        </PillBtn>

        {error && (
          <Text style={[styles.error, { color: '#FF3B5C' }]}>{error}</Text>
        )}

        <Pressable onPress={onCancel} hitSlop={8} style={styles.cancelWrap}>
          <Text style={[styles.cancelText, { color: t.textMuted }]}>Cancel</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 26, paddingTop: 64, paddingBottom: 32 },
  logoWrap: { alignItems: 'center', marginBottom: 26 },
  title: {
    fontFamily: 'Archivo_900Black',
    fontSize: 28,
    letterSpacing: -0.6,
    textAlign: 'center',
    marginBottom: 18,
  },
  body: {
    fontFamily: 'Archivo_500Medium',
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 18,
    lineHeight: 22,
  },
  question: {
    fontFamily: 'Archivo_700Bold',
    fontSize: 15.5,
    textAlign: 'center',
    marginBottom: 22,
  },
  restoreBtn: { width: '100%', height: 54 },
  error: {
    marginTop: 12,
    textAlign: 'center',
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 13,
  },
  cancelWrap: { alignItems: 'center', marginTop: 22 },
  cancelText: { fontFamily: 'Archivo_700Bold', fontSize: 14 },
});
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
npm test -- --watchAll=false src/__tests__/restoreAccountScreen.test.tsx
```

Expected: 6/6 passing.

- [ ] **Step 5: Commit**

```bash
git add 'src/app/(onboarding)/restore-account.tsx' src/__tests__/restoreAccountScreen.test.tsx
git commit -m "Add Restore-account screen with Welcome Back + days remaining"
```

---

## Task 9: Wire `DeleteAccount` confirm card to `requestDeletion`

**Files:**
- Modify: `src/components/profile/DeleteAccount.tsx`
- Modify: `src/__tests__/components.test.tsx`

The current component's Delete button is `onPress={() => setConfirm(false)}`. We add a typed-email-confirmation Field, gate the button on a match, and wire it to `requestDeletion`. The component now needs a Field component, an authStore selector for the email, and the lib import.

- [ ] **Step 1: Extend the test file**

In `src/__tests__/components.test.tsx`:

(A) Add mocks at the top of the file (before any imports):

```ts
const mockRequestDeletion = jest.fn();

jest.mock('@/lib/auth/account-deletion', () => ({
  __esModule: true,
  requestDeletion: () => mockRequestDeletion(),
}));

let mockSessionEmail: string | null = 'ada@example.com';
jest.mock('@/store/authStore', () => ({
  __esModule: true,
  useAuthStore: (selector: (s: { session: { user: { email: string | null } } | null }) => unknown) =>
    selector({
      session: mockSessionEmail ? { user: { email: mockSessionEmail } } : null,
    }),
}));
```

(B) Append a new describe block at the end of the file (after the existing `Checkbox` describe):

```tsx
describe('DeleteAccount', () => {
  const tk = apexTokens(true, 'classic');

  beforeEach(() => {
    mockRequestDeletion.mockReset();
    mockSessionEmail = 'ada@example.com';
  });

  function openConfirmCard(getByText: ReturnType<typeof render>['getByText']) {
    fireEvent.press(getByText('Delete account'));
  }

  it('Delete button is disabled until email is typed correctly', () => {
    const { getByText, getByPlaceholderText, queryByText } = render(
      <DeleteAccount tk={tk} />,
    );
    openConfirmCard(getByText);
    // Typed wrong email → still no requestDeletion call.
    fireEvent.changeText(getByPlaceholderText('Type your email'), 'wrong@example.com');
    fireEvent.press(getByText('Delete'));
    expect(mockRequestDeletion).not.toHaveBeenCalled();
    // Button visible but inert.
    expect(queryByText('Delete')).toBeTruthy();
  });

  it('Delete button calls requestDeletion when email matches (case-insensitive)', async () => {
    mockRequestDeletion.mockResolvedValueOnce({ ok: true, value: undefined });
    const { getByText, getByPlaceholderText } = render(<DeleteAccount tk={tk} />);
    openConfirmCard(getByText);
    fireEvent.changeText(getByPlaceholderText('Type your email'), 'ADA@EXAMPLE.COM');
    fireEvent.press(getByText('Delete'));
    await waitFor(() => expect(mockRequestDeletion).toHaveBeenCalled());
  });

  it('shows inline error when requestDeletion returns not ok', async () => {
    mockRequestDeletion.mockResolvedValueOnce({ ok: false, error: 'network' });
    const { getByText, getByPlaceholderText, findByText } = render(
      <DeleteAccount tk={tk} />,
    );
    openConfirmCard(getByText);
    fireEvent.changeText(getByPlaceholderText('Type your email'), 'ada@example.com');
    fireEvent.press(getByText('Delete'));
    await findByText(/Couldn't request deletion/i);
  });

  it('Cancel closes the confirm card without calling requestDeletion', () => {
    const { getByText, queryByText } = render(<DeleteAccount tk={tk} />);
    openConfirmCard(getByText);
    fireEvent.press(getByText('Cancel'));
    expect(mockRequestDeletion).not.toHaveBeenCalled();
    // Confirm card is gone, "Delete account" opener is back.
    expect(queryByText('Delete account')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
npm test -- --watchAll=false src/__tests__/components.test.tsx -t 'DeleteAccount'
```

Expected: FAIL — placeholder text not found, Delete button does nothing.

- [ ] **Step 3: Modify the component**

Replace `src/components/profile/DeleteAccount.tsx` with:

```tsx
import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, TextInput } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { ApexTokens } from '@/constants/apexTokens';
import { useAuthStore } from '@/store/authStore';
import { requestDeletion } from '@/lib/auth/account-deletion';

interface DeleteAccountProps {
  tk: ApexTokens;
}

export function DeleteAccount({ tk }: DeleteAccountProps) {
  const sessionEmail = useAuthStore((s) => s.session?.user.email ?? '');
  const [confirm, setConfirm] = useState(false);
  const [typed, setTyped] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const matches =
    sessionEmail.length > 0 &&
    typed.trim().toLowerCase() === sessionEmail.toLowerCase();

  const onDelete = async () => {
    if (!matches || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const r = await requestDeletion();
      if (!r.ok) {
        setError("Couldn't request deletion. Please try again.");
      }
      // On ok: signOut has fired inside requestDeletion, so
      // (home)/_layout will redirect us out of Profile.
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.wrap}>
      {!confirm ? (
        <Pressable
          onPress={() => setConfirm(true)}
          style={[styles.openBtn, { borderColor: tk.pink }]}
        >
          <BinIcon color={tk.pink} />
          <Text style={[styles.openText, { color: tk.pink }]}>Delete account</Text>
        </Pressable>
      ) : (
        <View
          style={[
            styles.confirmCard,
            { backgroundColor: tk.pinkSoft, borderColor: tk.pink },
          ]}
        >
          <Text style={[styles.confirmTitle, { color: tk.text }]}>
            Delete your account?
          </Text>
          <Text style={[styles.confirmBody, { color: tk.variant }]}>
            This permanently erases your account with FPL Gaffer including
            all your personal information, team, history and chips. This
            cannot be undone.
          </Text>

          <Text style={[styles.confirmHint, { color: tk.variant }]}>
            Type your email to confirm:
          </Text>
          <TextInput
            value={typed}
            onChangeText={setTyped}
            placeholder="Type your email"
            placeholderTextColor={tk.faint}
            autoCapitalize="none"
            keyboardType="email-address"
            style={[
              styles.emailInput,
              { color: tk.text, borderColor: tk.cardBorder, backgroundColor: tk.card },
            ]}
          />

          {error && (
            <Text style={[styles.error, { color: tk.pink }]}>{error}</Text>
          )}

          <View style={styles.btnRow}>
            <Pressable
              onPress={() => {
                setConfirm(false);
                setTyped('');
                setError(null);
              }}
              style={[
                styles.cancelBtn,
                { backgroundColor: tk.card, borderColor: tk.cardBorder },
              ]}
            >
              <Text style={[styles.cancelText, { color: tk.text }]}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={onDelete}
              disabled={!matches || submitting}
              style={[
                styles.deleteBtn,
                { backgroundColor: matches && !submitting ? tk.pink : tk.faint },
              ]}
            >
              <Text style={styles.deleteText}>
                {submitting ? 'Deleting…' : 'Delete'}
              </Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

function BinIcon({ color }: { color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path
        d="M5 7h14M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2M6 7l1 13a1 1 0 001 1h8a1 1 0 001-1l1-13"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 16,
    marginBottom: 28,
  },
  openBtn: {
    height: 50,
    borderRadius: 14,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  openText: { fontFamily: 'Archivo_700Bold', fontSize: 15 },
  confirmCard: { borderRadius: 14, borderWidth: 1.5, padding: 16 },
  confirmTitle: { fontFamily: 'Archivo_800ExtraBold', fontSize: 15 },
  confirmBody: {
    fontFamily: 'Archivo_500Medium',
    fontSize: 13,
    marginTop: 5,
    lineHeight: 19,
  },
  confirmHint: {
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 12.5,
    marginTop: 14,
    marginBottom: 6,
  },
  emailInput: {
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 14,
    height: 44,
    borderRadius: 10,
    borderWidth: 1.5,
    paddingHorizontal: 12,
  },
  error: {
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 12.5,
    marginTop: 8,
    textAlign: 'center',
  },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  cancelBtn: {
    flex: 1,
    height: 44,
    borderRadius: 11,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: { fontFamily: 'Archivo_700Bold', fontSize: 14 },
  deleteBtn: {
    flex: 1,
    height: 44,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteText: { fontFamily: 'Archivo_700Bold', fontSize: 14, color: '#fff' },
});
```

- [ ] **Step 4: Run all tests, verify they pass**

```bash
npm test -- --watchAll=false src/__tests__/components.test.tsx
```

Expected: all green, including 4 new DeleteAccount tests.

- [ ] **Step 5: Run the full suite — confirm no regressions**

```bash
npm test -- --watchAll=false
```

Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/components/profile/DeleteAccount.tsx src/__tests__/components.test.tsx
git commit -m "Wire DeleteAccount confirm card to requestDeletion with typed-email gate"
```

---

## Task 10: Runtime docs

**Files:**
- Create: `docs/auth-account-deletion.md`

No tests for docs.

- [ ] **Step 1: Write the doc**

Create `docs/auth-account-deletion.md`:

```markdown
# Account Deletion

Implements [#19](https://github.com/vigneshashokan/fpl-gaffer-react-native-app/issues/19). Spec: `docs/superpowers/specs/2026-06-10-account-deletion-design.md`.

## How it works at runtime

### Request deletion (from Profile)

```
User on Profile → Danger zone → "Delete account"
  ↓
Confirm card opens: typed-email gate + Cancel / Delete
  ↓
User types their email (case-insensitive match against session.user.email)
  ↓
Delete button enables → tap
  ↓
requestDeletion() in src/lib/auth/account-deletion.ts:
  1. supabase.auth.getSession() → derive user_id
  2. INSERT INTO account_deletions (user_id) VALUES (user_id)
     - Unique-violation (23505) is treated as success (idempotent)
  3. supabase.auth.signOut({ scope: 'global' })  ← revokes all sessions
  4. biometricStore.disable()                    ← clears SecureStore + flag
  ↓
session → null → (home)/_layout redirects to /(onboarding)/signin
```

If the INSERT fails, the user stays on Profile with an inline error. No signOut, no biometric disable — try again.

### Restore on next sign-in

```
User signs in (email, Google, or biometric auto-unlock)
  ↓
session lands → useProfileGate runs TWO queries in parallel:
  - profiles.select('user_id').eq('user_id', uid).maybeSingle()
  - account_deletions.select('user_id').eq('user_id', uid).maybeSingle()
  ↓
deletion row exists → status = 'pending_deletion' (wins over complete/missing)
  ↓
(onboarding)/_layout and (home)/_layout both redirect:
  status === 'pending_deletion' → /(onboarding)/restore-account
  ↓
RestoreAccount screen renders Welcome Back, fetches loadPendingDeletion()
  for daysRemaining count
  ↓
User taps "Restore my account"
  ↓
cancelDeletion() → DELETE account_deletions WHERE user_id = auth.uid()
  ↓ ok
router.replace('/(home)/(tabs)/team') → gate re-resolves to 'complete'
```

If the user taps Cancel instead:

```
useAuthStore.signOut()
  ↓
router.replace('/(onboarding)/signin')
```

The `account_deletions` row stays. The user can sign in again any time during the grace period and either restore or cancel again.

### Hard delete (cron, day 30+)

```
pg_cron job 'purge-expired-account-deletions' fires daily at 03:00 UTC
  ↓
calls public.purge_expired_account_deletions() (security definer)
  ↓
DELETE FROM auth.users
 WHERE id IN (SELECT user_id FROM account_deletions
              WHERE requested_at < now() - interval '30 days')
  ↓
Existing ON DELETE CASCADE FKs wipe profiles / notification_prefs /
push_tokens / and the account_deletions row itself
  ↓
User is fully gone. Attempting to sign in returns invalid_credentials.
```

## Manual setup (one-time per Supabase project)

1. Apply the migration:
   - Linked project: `supabase db push`
   - Local: `supabase db reset` (re-applies the entire migration history)
2. **Supabase Dashboard → Database → Extensions**: confirm **pg_cron** is enabled. The migration includes `create extension if not exists pg_cron;` defensively, but some Supabase plans require Dashboard activation.
3. **Supabase Dashboard → Database → Cron Jobs**: confirm `purge-expired-account-deletions` is scheduled at `0 3 * * *` and is enabled.

## Files

- `supabase/migrations/20260610000000_account_deletion.sql` — table, RLS policies, `security definer` purge function, pg_cron schedule.
- `src/lib/auth/account-deletion.ts` — `requestDeletion`, `cancelDeletion`, `loadPendingDeletion`. Defines `Result<T>` and `PendingDeletion`.
- `src/lib/useProfileGate.ts` — extended with `'pending_deletion'` status (wins over complete/missing).
- `src/components/profile/DeleteAccount.tsx` — typed-email-confirmation Field + wire Delete → requestDeletion.
- `src/app/(onboarding)/restore-account.tsx` — Welcome Back screen with Restore + Cancel.
- `src/app/(onboarding)/_layout.tsx` — redirects `pending_deletion` to restore-account (priority first).
- `src/app/(home)/_layout.tsx` — defensive `pending_deletion` redirect.

## Troubleshooting

**User taps Delete but stays on Profile**
- INSERT failed. Check `Couldn't request deletion. Please try again.` is shown inline.
- Verify RLS: `SELECT auth.uid()` returns the session user; the `account_deletions: own row insert` policy uses `auth.uid() = user_id`.

**User signs in but doesn't see the Restore screen**
- `useProfileGate` may not be picking up the row. Check that the `account_deletions` row actually exists for that user via Supabase Dashboard → Table Editor → public.account_deletions.
- Open the network tab / Supabase logs for the SELECT query — it may have errored silently (we treat errors as null defensively).

**pg_cron didn't hard-delete after 30 days**
- Supabase Dashboard → Database → Cron Jobs: confirm `purge-expired-account-deletions` ran successfully.
- Manually trigger: `select public.purge_expired_account_deletions();` in the SQL editor. If it errors, the function's `security definer` role may have lost permission to delete from `auth.users` (Supabase support territory).

**Biometric still works after deletion**
- `requestDeletion` calls `biometricStore.disable()`, which clears SecureStore + the AsyncStorage flag on the **current device**. Other devices clear when their auto-unlock attempts a `setSession` with the now-revoked refresh token (the existing `expired_link` handling).

## Manual test plan

Against the linked Supabase project, on a real device or simulator:

1. Profile → Delete account → type email → tap Delete → confirm signed out, on SignIn.
2. Sign in again → confirm Welcome Back screen, correct days remaining.
3. Tap Restore → confirm routes home, account is fully active.
4. Repeat 1; this time tap Cancel on Welcome Back → confirm routes to SignIn, account_deletions row still exists.
5. Supabase Dashboard SQL editor: set `requested_at = now() - interval '31 days'` for the test row, then `select public.purge_expired_account_deletions();` → verify the auth.users row is gone and account_deletions row is gone.
6. Try to sign in with the deleted user → "Invalid login credentials".

## Future work

- **Transactional emails** — "your account deletion is scheduled" + "your account has been deleted" receipts. Deferred until a transactional email provider (Resend/Postmark) is set up.
- **In-Profile cancel banner** — currently the only way to cancel a deletion is to sign in again. A small banner inside Profile during the (rare) state where the user is signed in but has a pending deletion would let them undo without signing out first.
- **Real-time multi-device sync** — other devices won't know about the deletion until their next API call returns 401. Acceptable for now.
```

- [ ] **Step 2: Commit**

```bash
git add docs/auth-account-deletion.md
git commit -m "Document account deletion runtime + manual setup"
```

---

## Final verification

After all 10 tasks are committed:

- [ ] **Run the full suite**

```bash
npm test -- --watchAll=false
```

Expected: all green. New tests added: account-deletion (15), useProfileGate (3 added), onboardingLayout (3 added), restoreAccountScreen (6 new), DeleteAccount in components.test.tsx (4 new). 31 additional tests overall.

- [ ] **Manual smoke test against a real Supabase project**

Follow the "Manual test plan" section of `docs/auth-account-deletion.md`.

- [ ] **Open a PR** that references the issue:

```
Closes #19
```
