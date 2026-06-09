# Sub-project A: Email/Password Auth + Sign-Up + Forgot Password — Design Spec

**Issues:** [#15 — Email + password authentication](https://github.com/vigneshashokan/fpl-gaffer-react-native-app/issues/15), [#16 — Sign-up flow](https://github.com/vigneshashokan/fpl-gaffer-react-native-app/issues/16), [#17 — Forgot password flow](https://github.com/vigneshashokan/fpl-gaffer-react-native-app/issues/17)
**Date:** 2026-06-08
**Status:** Approved

---

## Purpose

Wire the email and password fields on the existing SignIn screen to a real auth backend, add a Sign-Up flow and email-verification gate, and add a Forgot-Password / Reset-Password flow that lands the user back in the app via a deep link. After this sub-project ships, every onboarding path on the SignIn screen except Face ID and Apple (kept as `COMING_SOON`) leads somewhere real.

Three issues are bundled into one spec because they share the same Supabase Auth backend, the same `fplgafferreactnativeapp://` deep-link plumbing, the same form components, and the same verification/reset email lifecycle. Splitting them would mean three rebases through the same files.

This is the second of five sub-projects in the auth cluster:

| Sub-project | Closes | Status |
|---|---|---|
| C Google OAuth + auth foundation | #13 | shipped |
| **A** Email/password + signup + forgot password | #15, #16, #17 | **this spec** |
| E Biometric + account deletion | #18, #19 | after A |
| D Apple OAuth | #14 | deferred to just before App Store submission |

## Framing Decision: Issue ACs Need Rewriting

Issues #15–#17 were written generically — they reference `POST /auth/sign-in`, `bcrypt`/`argon2`, `express-rate-limit`, signed reset tokens stored in our DB. Our architecture is **Supabase Auth** (per #10 and reinforced by sub-project C), which provides:

- Argon2 password hashing on the server
- Per-IP and per-email rate limits on sign-in and email send (configurable in the dashboard)
- Built-in email verification with one-time signed links
- Built-in password reset with one-time signed links

So the work isn't "implement these primitives" — it's "wire Supabase's primitives to our screens." There is no Express backend, no bcrypt code, no rate-limit middleware to author. The dashboard configuration steps that the issues miss (redirect URL allow list, email templates) are documented below.

After this sub-project merges, we'll comment on #15/#16/#17 with the rewritten framing — same pattern as the #24 comment posted during #11 and the #13 rewrite during sub-project C.

## Tech Stack

- **Supabase Auth** — `signInWithPassword`, `signUp`, `resetPasswordForEmail`, `updateUser`, `resend`, `exchangeCodeForSession`.
- **`zod`** — schema-based form validation (email, password rules, confirm-match). New dependency.
- **`expo-linking`** — already installed; used to catch incoming deep links from the verification and reset emails.
- **Expo Router** — existing `(onboarding)` group adds three screens.
- **Zustand `useAuthStore`** — unchanged. Sessions land via `onAuthStateChange` exactly as in sub-project C.

## Architecture

Four layers; only the auth library and the screens are new code. The store, routing layout, and profile gate are unchanged from sub-project C.

### 1. Auth library (`src/lib/auth/`, expanded)

```
src/lib/auth/
  email.ts          — wrappers for Supabase email/password calls
  deepLink.ts       — parses incoming fplgafferreactnativeapp:// URLs
  validation.ts     — zod schemas (email, password, confirm-match)
  google.ts         — (existing, unchanged from sub-project C)
```

**`email.ts`** exposes thin wrappers that return discriminated union results so screens can pattern-match without touching Supabase error shapes:

```ts
type Result<T = void> =
  | { ok: true; value: T }
  | { ok: false; error: AuthErrorKind };

type AuthErrorKind =
  | 'invalid_credentials'
  | 'email_not_confirmed'
  | 'rate_limited'
  | 'network'
  | 'user_already_exists'
  | 'weak_password'
  | 'expired_link'
  | 'unknown';

export async function signInWithEmail(email: string, password: string): Promise<Result>;
export async function signUpWithEmail(args: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}): Promise<Result>;
export async function sendPasswordReset(email: string): Promise<Result>;
export async function resetPassword(newPassword: string): Promise<Result>;
export async function resendVerification(email: string): Promise<Result>;
```

Each wrapper normalises Supabase error codes/messages into the `AuthErrorKind` enum (`invalid_login_credentials → 'invalid_credentials'`, `email_not_confirmed → 'email_not_confirmed'`, `429 / over_email_send_rate_limit → 'rate_limited'`, etc.). Screens never branch on Supabase error strings directly.

`signUpWithEmail` passes name as `options.data = { given_name, family_name }` (stashed in `user_metadata`) and `options.emailRedirectTo = 'fplgafferreactnativeapp://verify'`. The keys deliberately match Google's standard claim names — `complete-profile` already reads `meta.given_name` / `meta.family_name` for the Google flow, so prefill works without any change to that screen.

`sendPasswordReset` passes `options.redirectTo = 'fplgafferreactnativeapp://reset-password'`. **Always** resolves `ok: true` from the caller's perspective; underlying errors are logged but never surfaced (no enumeration).

`resetPassword` calls `supabase.auth.updateUser({ password })`, then on success fires `supabase.auth.signOut({ scope: 'others' })` so other devices are invalidated. The `signOut` is best-effort: a failure logs but does not roll back the password change.

### 2. Deep-link router (`src/lib/auth/deepLink.ts` + `useEmailAuthDeepLinks` hook)

A single hook called from `app/_layout.tsx` (top-level) catches incoming URLs and dispatches:

| Incoming URL | Action |
|---|---|
| `fplgafferreactnativeapp://verify?code=…` | `exchangeCodeForSession(url)` → session lands → existing `(onboarding)/_layout.tsx` routes the user to `/(home)` or `/(onboarding)/complete-profile` (Google flow handles the rest) |
| `fplgafferreactnativeapp://reset-password?code=…` | `exchangeCodeForSession(url)` → temporary session lands → `router.replace('/(onboarding)/reset-password')` |
| Anything else | Ignored (Supabase's own OAuth callback is still handled inline by `google.ts`) |
| `exchangeCodeForSession` rejects (expired/used token) | Route to `/(onboarding)/forgot-password?expired=1` (reset) or `/(onboarding)/signin?verify_expired=1` (verify) |

**Cold-start vs warm-start** — uses `Linking.useURL()` (covers cold-start) **and** `Linking.addEventListener('url', …)` (covers warm-start). The hook waits on `useAuthStore.hydrated` before calling `exchangeCodeForSession` to avoid racing the initial `getSession()` call.

### 3. Validation (`src/lib/auth/validation.ts`)

```ts
import { z } from 'zod';

export const emailSchema = z.string().trim().toLowerCase().email();

export const passwordSchema = z.string()
  .min(8, 'At least 8 characters')
  .regex(/[A-Z]/, 'One uppercase letter')
  .regex(/[a-z]/, 'One lowercase letter')
  .regex(/[0-9]/, 'One number');

export const signUpSchema = z.object({
  firstName: z.string().trim().min(1, 'Required'),
  lastName: z.string().trim().min(1, 'Required'),
  email: emailSchema,
  password: passwordSchema,
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  path: ['confirmPassword'],
  message: 'Passwords do not match',
});

export const resetPasswordSchema = z.object({
  password: passwordSchema,
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  path: ['confirmPassword'],
  message: 'Passwords do not match',
});
```

Inline error messages on each Field map to the zod issue messages 1:1.

### 4. Screens (`src/app/(onboarding)/`)

```
signin.tsx           — EDITED: wire fields, replace COMING_SOON for Sign up + Forgot password
signup.tsx           — NEW
verify-pending.tsx   — NEW
forgot-password.tsx  — NEW
reset-password.tsx   — NEW
complete-profile.tsx — unchanged (signUpWithEmail writes the same user_metadata keys it already reads)
_layout.tsx          — unchanged (existing redirect logic already routes by session + profile gate)
```

## Screen-by-Screen Flow

### SignIn (`signin.tsx`) — edits

- Submit calls `signInWithEmail(email, password)`. While pending, the Sign in button shows a spinner.
- `Result.error === 'invalid_credentials'` → inline "Email or password is incorrect" below the password field. Same message whether the email exists or not — no enumeration.
- `Result.error === 'email_not_confirmed'` → `router.push('/(onboarding)/verify-pending?email=<email>')`.
- `Result.error === 'rate_limited'` → "Too many attempts — try again in a few minutes."
- `Result.error === 'network'` → "Couldn't reach the server. Check your connection and try again."
- "Forgot password?" link → `router.push('/(onboarding)/forgot-password')`.
- New footer link: "Don't have an account? **Sign up**" → `router.push('/(onboarding)/signup')`.
- Reading `?verify_expired=1` query param on mount → top-of-screen banner "Verification link expired. Sign in again to resend."

### SignUp (`signup.tsx`) — new

Fields, in order: first name, last name, email, password, confirm password.

- Submit → validate with `signUpSchema` → on validation failure, inline errors per field. On success, call `signUpWithEmail(...)`.
- Success → `router.replace('/(onboarding)/verify-pending?email=<email>')`.
- `Result.error === 'user_already_exists'`: Supabase actually returns a generic success in this case (and emails the real owner a "someone tried to sign up with your email" notice), but the wrapper handles it deterministically by always routing to verify-pending. No enumeration leak.
- `Result.error === 'weak_password'` → only fires if Supabase's server-side check is stricter than ours; surfaced inline on the password field as "Please choose a stronger password."
- `Result.error === 'rate_limited'` → "Too many sign-up attempts — try again later."
- Header link "Already have an account? **Sign in**" → `router.back()`.

### Verify-pending (`verify-pending.tsx`) — new

Reads `email` from query param.

Body: "We sent a verification link to **<email>**. Tap the link in the email to finish signing up."

Buttons:
- **Resend email** — calls `resendVerification(email)`. Disables for 30 s after each press (client-side throttle, complements Supabase's server-side). On `rate_limited`, shows "Already sent — check your inbox or wait a minute."
- **Already verified? Sign in** — `router.replace('/(onboarding)/signin')`. Covers the case where the user verifies on a different device than they signed up on.
- **Wrong email? Go back** — `router.back()`.

### Forgot-password (`forgot-password.tsx`) — new

Single email field.

- Submit → validate with `emailSchema` → call `sendPasswordReset(email)`.
- **Always** transitions to a success state: "If an account exists for **<email>**, we've sent a reset link. Check your inbox." No enumeration. The "always success" is enforced inside `sendPasswordReset` itself — errors are logged but not surfaced.
- Success state has a single button: "Back to sign in" → `router.replace('/(onboarding)/signin')`.
- Reading `?expired=1` query param on mount → top-of-screen banner "That reset link has expired — request a new one."

### Reset-password (`reset-password.tsx`) — new

Reached via deep link; the deep-link hook has already exchanged the code for a session.

- On mount, check `useAuthStore.session`. If absent, show "Open the link from your email to reset your password" + "Back to sign in" button → `router.replace('/(onboarding)/signin')`. (Covers direct navigation or expired-token races.)
- With session, render: new password + confirm password fields.
- Submit → validate with `resetPasswordSchema` → call `resetPassword(newPassword)`.
- Success → no navigation needed; the existing `(onboarding)/_layout.tsx` redirect picks up the session and routes to `/(home)` or `/(onboarding)/complete-profile`.

### Complete-profile (`complete-profile.tsx`) — no edit

Already reads `meta.given_name` and `meta.family_name` from `user_metadata`. Because `signUpWithEmail` writes those exact keys via `options.data`, prefill works for email signups with zero changes to this screen.

## Supabase Dashboard Config (one-time, manual)

Same pattern as sub-project C's manual setup. Documented in `docs/auth-email-password.md` (new file, to be written during implementation).

1. **Auth → URL Configuration → Redirect URLs allow list:** add `fplgafferreactnativeapp://verify` and `fplgafferreactnativeapp://reset-password`.
2. **Auth → Providers → Email:** confirm "Confirm email" is **on** (strict gate per design).
3. **Auth → Rate Limits:** confirm defaults are acceptable (5 sign-in attempts / 15 min per IP — matches issue #15's AC).
4. **Auth → Email Templates:** customise "Confirm signup" and "Reset password" templates to use the app's name and brand. (Default Supabase templates work for dev; brand polish before public launch.)

## Error Handling Matrix

| Surface | Supabase signal | User sees |
|---|---|---|
| SignIn submit | invalid credentials | "Email or password is incorrect" inline |
| SignIn submit | email not confirmed | route to `/verify-pending?email=…` |
| SignIn submit | 429 | "Too many attempts — try again in a few minutes" inline |
| SignIn submit | network failure | "Couldn't reach the server. Check your connection and try again" inline |
| SignUp submit | weak password (server) | "Please choose a stronger password" inline on password field |
| SignUp submit | 429 | "Too many sign-up attempts — try again later" inline |
| SignUp submit | duplicate email | routes to `/verify-pending` (Supabase emails owner; no client-side enumeration) |
| Resend verify | 429 | "Already sent — check your inbox or wait a minute" |
| Forgot-password submit | any error | success banner regardless (always-success) |
| Verify deep link | expired/used token | route to `/signin?verify_expired=1` with banner |
| Reset deep link | expired/used token | route to `/forgot-password?expired=1` with banner |
| Reset-password submit | any | best-effort `signOut({ scope: 'others' })` after; failure logged, not surfaced |

## Testing

### Unit tests (`src/__tests__/`)

- `auth/email.test.ts` — for each wrapper, mock `supabase.auth.*` and assert: correct args (incl. `emailRedirectTo`, `options.data` for name), correct `AuthErrorKind` mapping for every documented Supabase error code, always-success behavior of `sendPasswordReset`.
- `auth/validation.test.ts` — zod schemas: valid/invalid email, password rule matrix (too short / no uppercase / no lowercase / no digit / valid), confirm-mismatch on both signup and reset schemas.
- `auth/deepLink.test.ts` — feed mock URLs into the parser; assert dispatch for verify, reset-password, and unknown paths; assert `exchangeCodeForSession` is invoked only for known kinds; assert expired-token path routes correctly; assert it waits on `hydrated`.

### Screen tests (`src/__tests__/`)

- `signin.test.tsx` — extend existing test (if any) or new. Cases: invalid credentials inline error, email-not-confirmed routes to verify-pending, sign-up link, forgot-password link, `verify_expired=1` banner.
- `signup.test.tsx` — field validation errors inline; submit calls `signUpWithEmail` with right args; success replaces to verify-pending.
- `verifyPending.test.tsx` — renders email; Resend disables for 30 s (jest fake timers); "Already verified" routes back to signin.
- `forgotPassword.test.tsx` — submit always shows success state regardless of `sendPasswordReset` outcome; `expired=1` banner renders.
- `resetPassword.test.tsx` — no-session state shows back-to-signin; with-session submit calls `resetPassword`; assert `signOut({ scope: 'others' })` is fired after success.
- `emailAuthDeepLinks.test.tsx` — harness component that calls the hook; assert URL handling for verify, reset, unknown; assert it waits on `hydrated`.

### Manual test plan (documented, not automated)

Against the linked Supabase project, on iOS simulator:

1. Sign up with a fresh email → verify-pending screen renders.
2. Open Mail.app, click verification link → app opens, lands on complete-profile (name prefilled), then home.
3. Sign in with same creds → straight to home.
4. Sign in with wrong password → inline error.
5. Sign up with same email again → verify-pending (no enumeration).
6. Forgot password with the verified email → success state.
7. Open Mail.app, click reset link → app opens to reset-password screen.
8. Enter new password → home. Confirm prior session on a second simulator no longer works.
9. Repeat (7) with a link clicked after a deliberately long delay (>1 h) → expired banner on forgot-password.

## Out of Scope

- Apple OAuth (#14, sub-project D — Phase 5).
- Biometric sign-in / Face ID (#18, sub-project E).
- Account deletion (#19, sub-project E).
- Change password from Settings (issue #29 territory).
- Native Google Sign-In SDK swap (future work, post-dev-build).

## Files (Summary)

**New:**
- `src/lib/auth/email.ts`
- `src/lib/auth/deepLink.ts`
- `src/lib/auth/validation.ts`
- `src/app/(onboarding)/signup.tsx`
- `src/app/(onboarding)/verify-pending.tsx`
- `src/app/(onboarding)/forgot-password.tsx`
- `src/app/(onboarding)/reset-password.tsx`
- `src/__tests__/auth/email.test.ts`
- `src/__tests__/auth/validation.test.ts`
- `src/__tests__/auth/deepLink.test.ts`
- `src/__tests__/signup.test.tsx`
- `src/__tests__/verifyPending.test.tsx`
- `src/__tests__/forgotPassword.test.tsx`
- `src/__tests__/resetPassword.test.tsx`
- `src/__tests__/emailAuthDeepLinks.test.tsx`
- `docs/auth-email-password.md`

**Edited:**
- `src/app/(onboarding)/signin.tsx` (wire fields, replace COMING_SOON, add banners)
- `src/app/_layout.tsx` (call `useEmailAuthDeepLinks()`)
- `package.json` (add `zod`)

**Existing, unchanged:**
- `src/store/authStore.ts`
- `src/lib/supabase.ts`
- `src/lib/auth/google.ts`
- `src/lib/useProfileGate.ts`
- `src/app/(onboarding)/_layout.tsx`
- `src/app/(onboarding)/complete-profile.tsx`
- `src/app/(home)/_layout.tsx`
