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
