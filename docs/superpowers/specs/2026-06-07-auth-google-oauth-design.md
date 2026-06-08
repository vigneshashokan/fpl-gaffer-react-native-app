# Sub-project C: Google OAuth + Auth Foundation — Design Spec

**Issue:** [#13 — OAuth: Google Sign-In](https://github.com/vigneshashokan/fpl-gaffer-react-native-app/issues/13)
**Date:** 2026-06-07
**Status:** Approved

---

## Purpose

Replace the mock `useAuthStore` with a real Supabase-backed auth flow, and wire the "Continue with Google" button on the SignIn screen to a working OAuth flow that lands the user in the app with a complete profile.

This is the first of five sub-projects in the auth cluster:

| Sub-project | Closes | Status |
|---|---|---|
| **C** Google OAuth + auth foundation | #13 | **this spec** |
| A Email/password + signup | #15, #16 | next, after C ships |
| B Forgot password | #17 | after A |
| E Biometric + account deletion | #18, #19 | after B |
| D Apple OAuth | #14 | deferred to just before App Store submission |

Sub-project C lays foundational work (auth store, profile-completion screen, routing) that the four follow-ups reuse, so it carries more weight than the others.

## Framing Decision: Issue ACs Need Rewriting

Issue #13's original acceptance criteria assume a custom backend ("ID token sent to backend, session token returned, stored in SecureStore"). Our architecture is **Supabase Auth** (per #10), which brokers the OAuth dance server-side and returns a Supabase session directly — no custom token-exchange endpoint, no SecureStore for session storage (AsyncStorage adapter handles persistence, wired up in #10).

After this sub-project merges, we'll comment on #13 with the rewritten framing — same pattern as the #24 comment posted during #11.

## Tech Stack

- **`expo-auth-session` + `expo-web-browser`** — handle the OAuth redirect flow. Works in Expo Go (no dev build needed for now); we'll swap to native `@react-native-google-signin/google-signin` in Phase 5 when we have a dev-build pipeline.
- **`@react-native-community/datetimepicker`** — DOB picker on the profile-completion screen (Expo-installable).
- **Supabase Auth** — `signInWithOAuth({ provider: 'google' })` + `exchangeCodeForSession`.
- **Zustand** — auth store (rewritten from mock).
- **Expo Router** — `<Redirect>` in group `_layout.tsx`s for route protection.

## Architecture

Three layers, each with one clear responsibility:

### 1. Auth store (`src/store/authStore.ts`, rewritten)

Read-only mirror of Supabase's session. Subscribes once at module init to `supabase.auth.onAuthStateChange` and re-exposes `{ session, hydrated, signOut }`. Setters disappear — Supabase owns all writes; the store is observation + a `signOut()` convenience that delegates to `supabase.auth.signOut()`.

```ts
import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

interface AuthState {
  session: Session | null;
  hydrated: boolean;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => {
  supabase.auth.onAuthStateChange((_event, session) => {
    set({ session, hydrated: true });
  });
  supabase.auth.getSession().then(({ data }) => {
    set({ session: data.session, hydrated: true });
  });
  return {
    session: null,
    hydrated: false,
    signOut: async () => {
      await supabase.auth.signOut();
    },
  };
});
```

The dual subscription (`onAuthStateChange` + initial `getSession`) ensures we flip `hydrated = true` even on a fresh cold start with no session, where `onAuthStateChange` doesn't fire until something changes.

### 2. Profile gate (`src/lib/useProfileGate.ts`, new)

Hook that queries the current user's `profiles` row to decide where to send them. Returns `{ status: 'loading' | 'missing' | 'complete', refetch }`.

```ts
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';

type ProfileStatus = 'loading' | 'missing' | 'complete';

export function useProfileGate() {
  const session = useAuthStore((s) => s.session);
  const hydrated = useAuthStore((s) => s.hydrated);
  const [status, setStatus] = useState<ProfileStatus>('loading');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!hydrated) return;
    if (!session) { setStatus('loading'); return; }
    setStatus('loading');
    supabase
      .from('profiles')
      .select('user_id')
      .eq('user_id', session.user.id)
      .maybeSingle()
      .then(({ data }) => setStatus(data ? 'complete' : 'missing'));
  }, [hydrated, session, tick]);

  return { status, refetch: () => setTick((t) => t + 1) };
}
```

`refetch()` flips the status after the completion screen successfully inserts a row, so routing reacts immediately without waiting for the next auth event.

### 3. Routing (`<Redirect>` in `_layout.tsx` files)

Each group layout owns its protection logic:

- **`src/app/_layout.tsx`** (root) — extends the existing gate from #12 to also wait for `useAuthStore.hydrated`. Render is blocked on `fontsLoaded && themeHydrated && authHydrated`. The splash screen covers the wait.
- **`src/app/(home)/_layout.tsx`** — gains `Redirect` to `/(onboarding)/signin` when there's no session, and to `/(onboarding)/complete-profile` when session exists but profile is missing.
- **`src/app/(onboarding)/_layout.tsx`** — inverse: redirects to home if session exists and profile is complete. Uses `useSegments` to avoid infinite redirect loops when the user is on `complete-profile`.

## Google OAuth Flow

```
1. User taps "Continue with Google" on /(onboarding)/signin
2. App calls supabase.auth.signInWithOAuth({
     provider: 'google',
     options: { redirectTo: makeRedirectUri({ scheme: 'fplgafferreactnativeapp' }) }
   })
3. Supabase returns a Google OAuth URL.
4. App opens WebBrowser.openAuthSessionAsync(url, redirectUri).
5. User signs in with Google in the in-app browser sheet.
6. Google redirects to `fplgafferreactnativeapp://...?code=...`.
7. WebBrowser intercepts → returns { type: 'success', url } to the app.
8. App calls supabase.auth.exchangeCodeForSession(result.url).
9. Session lands in the Supabase client + AsyncStorage.
10. supabase.auth.onAuthStateChange fires → authStore updates → routing kicks in.
11. useProfileGate hook fetches profiles row → 'missing' on first sign-in.
12. Onboarding layout's Redirect sends user to /(onboarding)/complete-profile.
```

User-cancellation (`{ type: 'cancel' }`) is a no-op — we don't surface it as an error.

The flow lives in `src/lib/auth/google.ts`:

```ts
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import { supabase } from '@/lib/supabase';

export async function signInWithGoogle(): Promise<{ ok: boolean; error?: string }> {
  const redirectTo = makeRedirectUri({ scheme: 'fplgafferreactnativeapp' });
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error || !data?.url) return { ok: false, error: error?.message ?? 'unknown' };

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') return { ok: false, error: result.type };

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(result.url);
  if (exchangeError) return { ok: false, error: exchangeError.message };
  return { ok: true };
}
```

`skipBrowserRedirect: true` is important — without it, Supabase tries to redirect using `window.location` (a web concept), which fails on RN. With it set, we get the auth URL back as data and drive the browser ourselves.

## Profile-Completion Screen

**New screen `src/app/(onboarding)/complete-profile.tsx`:**

Form fields:
- `first_name` (text) — pre-filled from `session.user.user_metadata.given_name` (Google's `profile` scope payload)
- `last_name` (text) — pre-filled from `session.user.user_metadata.family_name`
- `dob` (date picker via `@react-native-community/datetimepicker`)

We deliberately do **not** pull DOB from Google — it requires the sensitive `user.birthday.read` scope, which would trigger Google's app verification process, add an extra consent prompt that scares users off, and still produce unreliable data (many Google profiles don't have DOB set, or have month/day only). Apple OAuth doesn't return DOB at all, so building this for Google would create an asymmetric code path. Keep DOB as a typed field for all providers.

**Client-side validation (before submit):**
- `first_name.trim().length > 0`, `last_name.trim().length > 0`
- `dob` set, parseable, AND `dob <= today - 13 years` (COPPA)

**Submit flow:**
1. `supabase.from('profiles').insert({ user_id, first_name, last_name, dob })`.
2. On success, `supabase.from('notification_prefs').insert({ user_id })` — DB defaults take care of the channel values.
3. Call `profileGate.refetch()` → routing flips status to 'complete' → onboarding layout redirects to home.

**Error states:**
- Network error → "Couldn't save your profile. Try again." (retry button).
- COPPA CHECK constraint violation (theoretically unreachable past client validation) → "You must be 13 or older to use FPL Gaffer."
- Unique constraint violation (race — user clicked submit twice) → treat as success, refetch.

If the `notification_prefs` insert fails after `profiles` succeeded (very unlikely — same RLS, same DB), the app retries on the next launch via a small `ensureNotificationPrefs()` helper called from the home layout.

## Sign-In Screen Changes

`src/app/(onboarding)/signin.tsx` (modified, not rewritten):

- **`<SocialBtn provider="google">`** `onPress` → calls `signInWithGoogle()`. Loading spinner during the round trip. Result handling: success = no UI action (routing redirects), cancel = no UI action, error = inline error message under the button.
- **`<SocialBtn provider="apple">`**, the email/password Field rows, the `<PillBtn>` "Sign in" button, the "Forgot password?" link, and the Face ID button → tapping any of them triggers a small "Coming in a future update" alert. They stay visible (so the UI doesn't keep shifting between sub-projects) but are clearly inactive.

`useAuthStore.signIn()` no longer exists — the existing `handleSignIn` is removed. The success path now belongs entirely to the routing layer (Supabase session change → `onAuthStateChange` → routing).

## Sign-Out Wiring

`src/components/nav/AccountMenu.tsx` already has a "Sign out" row (added in #10's work) wired to an `onSignOut` prop passed from its parent. Currently the parent passes a no-op. Change the wiring so the row directly calls `useAuthStore.getState().signOut()`. The auth-state change cascades: session → null → `onAuthStateChange` → routing → onboarding/signin.

## Route Protection Logic

Each group's `_layout.tsx` is its own gate, decided declaratively via `<Redirect>`:

```tsx
// (home)/_layout.tsx
const session = useAuthStore((s) => s.session);
if (!session) return <Redirect href="/(onboarding)/signin" />;

const { status } = useProfileGate();
if (status === 'loading') return null;
if (status === 'missing') return <Redirect href="/(onboarding)/complete-profile" />;

return <Stack screenOptions={{ headerShown: false }}>{/* existing screens */}</Stack>;

// (onboarding)/_layout.tsx
const session = useAuthStore((s) => s.session);
const { status } = useProfileGate();
const segments = useSegments();
const onCompleteProfile = segments[segments.length - 1] === 'complete-profile';

if (session && status === 'complete') return <Redirect href="/(home)/(tabs)/team" />;
if (session && status === 'missing' && !onCompleteProfile) {
  return <Redirect href="/(onboarding)/complete-profile" />;
}
return <Stack screenOptions={{ headerShown: false }} />;
```

The `useSegments` check on the onboarding side prevents an infinite redirect loop when the user IS already on `complete-profile`.

Routing truth table:

| Auth state | Profile state | Current group | Result |
|---|---|---|---|
| signed out | — | `(home)` | redirect → `(onboarding)/signin` |
| signed in | loading | any | render null (brief, ≪ 1 frame typically) |
| signed in | missing | `(home)` | redirect → `(onboarding)/complete-profile` |
| signed in | missing | `(onboarding)/signin` | redirect → `(onboarding)/complete-profile` |
| signed in | missing | `(onboarding)/complete-profile` | render the form |
| signed in | complete | `(onboarding)/*` | redirect → `(home)/(tabs)/team` |
| signed in | complete | `(home)/*` | render |

## Testing

| Unit | Mocks | What we verify |
|---|---|---|
| `authStore.ts` (rewritten test) | `supabase.auth.onAuthStateChange`, `supabase.auth.getSession`, `supabase.auth.signOut` | `hydrated` flips true on initial `getSession`; `session` updates on `onAuthStateChange`; `signOut()` calls the underlying `supabase.auth.signOut` |
| `useProfileGate.ts` | `supabase.from('profiles').select(...).maybeSingle()` | Status transitions `loading → missing` (null result) and `loading → complete` (row returned) |
| `signin.tsx` smoke render | `@/lib/auth/google`, both stores | Renders; Google button calls `signInWithGoogle`; non-Google buttons trigger the "Coming soon" handler |
| `complete-profile.tsx` smoke render | supabase client, auth store | Renders; submit button disabled until all three fields pass validation |
| Existing `authStore.test.ts` | — | **Rewritten** — old `signedIn`/`signIn` tests deleted; new tests target the rewritten store |

The actual OAuth round trip can't be unit-tested (requires real Google + Supabase). Verified manually post-merge.

## Manual User Setup (Out-of-Band)

These steps require a logged-in human and can't be automated — same pattern as #10's Supabase manual provisioning.

1. Open Google Cloud Console (https://console.cloud.google.com); create or pick a project.
2. **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
3. **Application type: Web application.** Name it "FPL Gaffer Supabase" or similar.
4. **Authorised redirect URIs:** add `https://<YOUR_PROJECT_REF>.supabase.co/auth/v1/callback` (substitute your Supabase project ref from #10's setup).
5. Save → copy the **Client ID** and **Client Secret**.
6. **(First time only)** Configure the OAuth consent screen: app name, support email, scopes = `email` + `profile` + `openid`. Publishing status can stay in **Testing** for now (add your own Google account as a test user — Testing mode caps at 100 users, fine for dev/beta).
7. Open Supabase Dashboard → **Authentication → Providers → Google**. Toggle on, paste the Client ID + Client Secret from step 5, save.
8. Open **Authentication → URL Configuration**. Under "Redirect URLs", add `fplgafferreactnativeapp://*` (wildcard catches any deep-link path).

The implementation plan will reference this checklist; the engineer's responsibility is the code, the user's responsibility is steps 1-8.

## Acceptance Criteria (rewritten per Supabase architecture)

From issue #13, mapped to where each is satisfied:

| Original AC | Status |
|---|---|
| `Continue with Google` button triggers Google sign-in sheet | ✅ Manual verify post-merge |
| ~~On success: ID token sent to backend, session token returned, stored in SecureStore~~ | **Rewritten:** Supabase session is stored in AsyncStorage automatically by the SDK's adapter (wired in #10). No SecureStore needed for the session — RLS gates real access |
| ~~`useAuthStore.signedIn` becomes true and routes to /(home)~~ | **Rewritten:** `useAuthStore.session` becomes non-null; routing in `(home)/_layout.tsx` allows entry; if first-time, redirects to `/(onboarding)/complete-profile` first |
| Cancellation does not change auth state | ✅ `WebBrowser.openAuthSessionAsync` resolves with `{ type: 'cancel' }`; we no-op |
| Documented in `docs/auth-google.md` | New file: covers the flow, manual setup, env vars, runtime trace, and "what to do if X goes wrong" |

A comment will be posted to issue #13 on merge summarising these rewrites.

## Files Changed / Created

**Created:**
- `src/lib/auth/google.ts` — `signInWithGoogle()` orchestration
- `src/lib/useProfileGate.ts` — profile-existence hook
- `src/app/(onboarding)/complete-profile.tsx` — completion screen
- `docs/auth-google.md` — runtime + setup docs

**Modified:**
- `src/store/authStore.ts` — replaced mock with Supabase-backed store
- `src/__tests__/authStore.test.ts` — rewritten for the new store shape
- `src/app/_layout.tsx` — gate render on auth hydration in addition to fonts + theme
- `src/app/(home)/_layout.tsx` — add `<Redirect>` protection
- `src/app/(onboarding)/_layout.tsx` — add inverse `<Redirect>` protection
- `src/app/(onboarding)/signin.tsx` — wire Google button; stub other buttons with "Coming soon" alerts; remove the mock `handleSignIn`
- `src/components/nav/AccountMenu.tsx` — wire sign-out row to real `signOut()`
- `package.json` / `package-lock.json` — add `expo-auth-session`, `expo-web-browser`, `expo-crypto`, `@react-native-community/datetimepicker`

## Risks

- **Google OAuth consent screen in "Testing" mode** caps at 100 test users. Fine for early dev + beta; needs publishing before public launch (Phase 5).
- **Universal/deep link reliability.** `expo-auth-session` uses `ASWebAuthenticationSession` on iOS and Custom Tabs on Android. Both are robust, but the app's scheme must be intact in `app.config.ts` (it is, from #10).
- **Race on cold start with persisted session.** `getSession` resolves async; meanwhile `useProfileGate` may fire before session is ready. Mitigated by the `hydrated` flag in the store + loading-state handling in the gate.
- **Profile-completion screen abandonment.** If the user closes the app mid-completion, they re-land on it on next launch (routing forces it). Acceptable — one-time wall.
- **Two-step profile insert (profiles then notification_prefs) is not atomic.** If the second insert fails, we have a `profiles` row but no prefs. Mitigated by a small `ensureNotificationPrefs()` retry on home layout mount. If this proves flaky in practice, we move to a Postgres RPC for atomic insert.

## Out of Scope (Each Has Its Own Sub-project)

Follow-on auth sub-projects, in the agreed order:

1. **Sub-project A (#15 + #16)** — Email/password sign-in + signup. Adds another sign-in path. Profile-completion screen built here is reused.
2. **Sub-project B (#17)** — Forgot password. Only meaningful once A ships.
3. **Sub-project E (#18 + #19)** — Biometric session unlock and account deletion. #19 is a launch blocker (GDPR + App Store policy).
4. **Sub-project D (#14)** — Apple OAuth. Deferred to just before App Store submission (App Store requires it if any other social login is offered; Apple Developer account costs $99/year).

Other deferred items, not in any sub-project yet:

- **Native Google Sign-In SDK** (`@react-native-google-signin/google-signin`) — UX upgrade (no in-app browser switch). Requires a dev build pipeline; lands in Phase 5.
- **Profile editing post-completion** — currently the Profile screen shows `first_name`/`last_name`/`dob` as `ReadField`s. Editing those would be its own ticket (UI + UPDATE call + DOB editing has the CHECK-on-update subtlety we noted in #11's review).
- **Multi-account support on one device** — high complexity, very low payoff for an FPL app. Probably never.
