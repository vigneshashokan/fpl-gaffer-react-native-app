# Pre-Production Cleanup Checklist

A running list of dev-only hacks, workarounds, and shortcuts that need cleanup before public launch. Each entry includes the rationale (why we needed it) and the production fix.

This document grows over time as new dev-mode-only code lands. **Don't delete entries when they're fixed — strike them through and add the fix-commit reference**, so we have a permanent audit trail of what dev shortcuts shipped historically.

---

## Auth (sub-project C — Google OAuth, issue #13)

### 1. Supabase **Site URL** is set to a dev-machine `exp://` URL

- **Current value:** `exp://192.168.1.69:8081/--/auth/callback`
- **Why:** Expo Go on iOS doesn't accept custom URL schemes (`fplgafferreactnativeapp://`) as `ASWebAuthenticationSession` callback schemes, and Supabase silently dropped our `redirect_to=exp://...` in validation. Setting Site URL to the desired `exp://` URL forces Supabase to use it as the fallback regardless.
- **Production fix:** Once we have a development build (`eas build --profile development`) or release build, custom schemes work natively. Update Site URL to:
  - `fplgafferreactnativeapp://auth/callback` (mobile-only deploys)
  - OR a hosted web URL if/when we publish a web build (e.g. `https://app.fplgaffer.com/auth/callback`)
- **Why it must be cleaned:** The LAN IP `192.168.1.69` is specific to this developer's home network. Any other contributor or production user gets a different IP → Supabase falls back to a URL their device can't reach → broken sign-in.
- **Tracked in:** TBD (no follow-up issue yet — create one before dev build lands)

### 2. Supabase **Redirect URLs** includes the overly broad `exp://**` wildcard

- **Current value:** Allow list includes:
  - `fplgafferreactnativeapp://**` ✓ keep
  - `exp://**` ← dev hack
- **Why:** `exp://...` only exists in Expo Go. We added the wildcard during debugging when we couldn't get specific patterns to match.
- **Production fix:** Remove `exp://**` from the allow list entirely. The `fplgafferreactnativeapp://**` entry is the only one production needs.
- **Tracked in:** same follow-up issue as #1.

### 3. `src/lib/auth/google.ts` does manual token extraction + `setSession`

- **Why:** Supabase uses the **implicit OAuth flow** with custom-scheme redirects, returning the access token in the URL fragment (`#access_token=...`). Combined with `detectSessionInUrl: false` in our Supabase client, the SDK doesn't auto-parse the fragment — we extract tokens manually and call `supabase.auth.setSession(...)` ourselves.
- **Production fix (in dev build):**
  - Switch to **PKCE flow** (Supabase JS's default for newer versions); response will use `?code=` query param instead of `#access_token=` fragment
  - Replace `extractTokens()` + `setSession()` with one call: `await supabase.auth.exchangeCodeForSession(callbackUrl)`
  - Remove the `extractTokens` helper entirely
  - Remove all `console.log('[google-oauth] ...')` debug statements
- **Tracked in:** same follow-up.

### 4. `src/lib/supabase.ts` has `detectSessionInUrl: false`

- **Why:** Mobile RN has no `window.location` for the SDK to auto-detect a URL fragment. We set it to `false` so the SDK doesn't try.
- **Production fix:** Depends on which auth approach we land on:
  - **If we stick with `setSession` manually** (current shape) — leave as `false`. Document.
  - **If we switch to PKCE + `exchangeCodeForSession`** — leave as `false`. Document.
  - **If we add a Linking listener that auto-handles the URL** — set to `true` and wire the listener properly.
- **Recommended:** the PKCE-flow approach, which keeps `detectSessionInUrl: false` and uses the explicit exchange. Cleaner than auto-detection on RN.
- **Tracked in:** same follow-up.

### 5. Google Cloud OAuth Consent Screen is in **Testing** mode

- **Current state:** Capped at 100 test users; only emails explicitly added under "Test users" can sign in.
- **Production fix:** Publish the OAuth consent screen via Google Cloud's verification process:
  - Add an app logo, privacy policy URL, terms of service URL
  - Submit for verification (~3-5 business days)
  - Once verified, ANY Google account can sign in
- **Tracked in:** Phase 5 launch checklist (TBD).

### 6. `docs/auth-google.md` describes the *original* OAuth flow plan, not the final shape

- **Why:** The doc was written before we discovered the Expo Go quirks (manual token extraction, dev-only Site URL hack, etc.).
- **Production fix:** Rewrite the doc to reflect:
  - The actual `signInWithGoogle()` implementation (manual token extraction)
  - The dev-only Site URL workaround vs. the production setup
  - The Expo Go vs. dev build differences
  - Troubleshooting section covering all the issues we hit
- **Tracked in:** small follow-up to #13 (post-merge).

---

## Build / dev environment

### 7. No development build pipeline yet

- **Current state:** App runs in Expo Go only. Custom URL schemes don't work; native modules (e.g. native Google Sign-In SDK) can't be added.
- **Production fix:**
  - Set up EAS Build (`eas.json` config + `eas-cli` access)
  - Build a **development client** (`eas build --profile development`) for richer testing
  - Build **preview** and **production** profiles for TestFlight / App Store / Play Store
  - Document the local install workflow (`eas build` → install on device → `npx expo start --dev-client`)
- **Tracked in:** Phase 5 (EAS Build configuration ticket #44).

### 8. `EXPO_PUBLIC_SUPABASE_*` env vars are local-`.env`-only

- **Current state:** Locally we load via Expo's `.env` mechanism. CI doesn't bundle env vars into the JS bundle yet (no EAS Build yet).
- **Production fix:**
  - Set up EAS env vars (`eas env:create`) for each environment (development / preview / production)
  - Confirm `app.config.ts` resolves them at build time on EAS
- **Tracked in:** Phase 5 / #44.

---

## Pre-launch UX decisions

Items that aren't dev hacks but need a deliberate decision before the production build ships.

### 9. Google OAuth: force the account picker on every sign-in

- **Current behaviour:** Google's default flow skips the account picker AND consent screen for returning users who have one active Google session and previously consented to the app. Sign-in feels "instant" — tap "Continue with Google", land on home (or `complete-profile`) immediately. No picker.
- **Desired for production:** Always show Google's account picker so users can deliberately choose which Google account to sign in with (personal vs work, shared device, switching accounts).
- **Fix:** add `queryParams: { prompt: 'select_account' }` to the OAuth options in `src/lib/auth/google.ts`:
  ```ts
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      skipBrowserRedirect: true,
      queryParams: { prompt: 'select_account' },
    },
  });
  ```
  Optional: `prompt: 'select_account consent'` would also force re-consent (useful if scopes change between releases).
- **Why deferred:** The auto-flow is good UX for the dev loop. We'll re-evaluate when public launch is closer — by then we'll have user feedback on whether the picker is wanted.
- **Tracked in:** TBD (single-line change; can land in any pre-launch polish PR).

---

## Out-of-band Supabase config to mirror in dev → prod transition

When switching to a separate production Supabase project (vs. the current single-project Local + Prod setup from #10):

- Run the schema migration on the prod project
- Re-create Google OAuth credentials in Google Cloud, pointing the redirect URI at the prod Supabase callback URL
- Update Site URL + Redirect URLs in the prod Supabase
- Issue separate GitHub Actions secrets for prod (`SUPABASE_ACCESS_TOKEN_PROD`, etc.)
- Update CI workflow to dispatch deploy-to-prod via a manual workflow_dispatch
- See `docs/superpowers/specs/2026-06-04-backend-stack-foundation-design.md` "Future: adding staging" recipe — same idea applies for adding prod

---

## How to use this doc

1. When you add a new dev hack: append an entry under the relevant section (or create a new section).
2. Each entry needs: **Current state** + **Why** + **Production fix** + **Tracked in** (issue/follow-up reference).
3. When you fix a hack: don't delete the entry. Strike through the "Current state" line and add a **Fixed:** line with the commit/PR reference.
4. Before any production release, this doc must be empty of unstruck items (or each remaining item must have an acknowledged decision to ship as-is).
