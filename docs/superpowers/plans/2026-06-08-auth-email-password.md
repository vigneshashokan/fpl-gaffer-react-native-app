# Email/Password Auth + Sign-Up + Forgot Password — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire Supabase email/password auth to the existing SignIn screen, add Sign-Up + Verify-Pending screens, and add Forgot-Password / Reset-Password flow with deep-link plumbing — closing issues #15, #16, #17.

**Architecture:** A thin auth library (`src/lib/auth/{email,deepLink,validation}.ts`) wraps Supabase Auth calls and normalises errors into a discriminated union; new screens consume those wrappers. A single root-level deep-link hook catches incoming `fplgafferreactnativeapp://verify` and `://reset-password` URLs, exchanges the code for a session, and lets the existing `(onboarding)/_layout.tsx` redirect logic route the user. Name capture at signup writes `given_name`/`family_name` into Supabase `user_metadata` — the same keys the existing `complete-profile` screen already reads for Google signups — so no edit to `complete-profile` is needed.

**Tech Stack:** Supabase Auth (`signInWithPassword`, `signUp`, `resetPasswordForEmail`, `updateUser`, `resend`, `exchangeCodeForSession`), `zod` (new dependency, for form validation), `expo-linking` (already installed, for deep-link parsing), Expo Router, Zustand `useAuthStore` (unchanged), `@testing-library/react-native` for screen tests.

**Spec:** `docs/superpowers/specs/2026-06-08-auth-email-password-design.md`

---

## File Map

| Path | Purpose | Status |
|---|---|---|
| `src/lib/auth/validation.ts` | zod schemas: email, password, signUp, resetPassword | NEW |
| `src/lib/auth/email.ts` | Supabase email/password wrappers; `AuthErrorKind` enum | NEW |
| `src/lib/auth/deepLink.ts` | Parse `fplgafferreactnativeapp://` URLs; `useEmailAuthDeepLinks` hook | NEW |
| `src/app/(onboarding)/signup.tsx` | Sign-up screen | NEW |
| `src/app/(onboarding)/verify-pending.tsx` | "Check your inbox" screen | NEW |
| `src/app/(onboarding)/forgot-password.tsx` | Request reset email | NEW |
| `src/app/(onboarding)/reset-password.tsx` | Enter new password (reached via deep link) | NEW |
| `src/app/(onboarding)/signin.tsx` | Wire fields to `signInWithEmail`; replace COMING_SOON for sign-up + forgot | EDIT |
| `src/app/_layout.tsx` | Call `useEmailAuthDeepLinks()` | EDIT |
| `package.json` | Add `zod` | EDIT |
| `docs/auth-email-password.md` | Runtime + manual setup doc (mirrors `docs/auth-google.md`) | NEW |
| `src/__tests__/auth/validation.test.ts` | Zod schema tests | NEW |
| `src/__tests__/auth/email.test.ts` | Wrapper tests | NEW |
| `src/__tests__/auth/deepLink.test.ts` | URL parser + hook tests | NEW |
| `src/__tests__/signupScreen.test.tsx` | Sign-up screen tests | NEW |
| `src/__tests__/verifyPendingScreen.test.tsx` | Verify-pending screen tests | NEW |
| `src/__tests__/forgotPasswordScreen.test.tsx` | Forgot-password screen tests | NEW |
| `src/__tests__/resetPasswordScreen.test.tsx` | Reset-password screen tests | NEW |
| `src/__tests__/signinScreen.test.tsx` | Sign-in screen tests (new file) | NEW |

---

## Conventions

- Working directory for every command: `/Users/vigneshashokan/Workspace/github/fpl-gaffer-react-native-app`.
- Run `npm test -- --watchAll=false` for the full suite; run `npm test -- --watchAll=false -t '<test name>'` to target a single test.
- Tests follow the existing pattern in `src/__tests__/supabase.test.ts` and `src/__tests__/authStore.test.ts`: `jest.doMock` + `jest.resetModules()` + `require()` for module-isolated mocks.
- All commits go directly to `main` (current branch); no feature branch unless the user requests one.
- Commit messages follow the existing imperative style ("Add X", "Wire Y to Z").

---

## Task 1: Add `zod` dependency

**Files:**
- Modify: `package.json` (dependencies block)
- Test: `src/__tests__/auth/validation.test.ts` (smoke import in Task 2)

- [ ] **Step 1: Install zod**

```bash
npm install zod
```

Expected: zod added to `dependencies`, no peer-dep warnings on this minor version.

- [ ] **Step 2: Verify install**

```bash
node -e "console.log(require('zod').z.string().email().safeParse('a@b.co'))"
```

Expected output (something like): `{ success: true, data: 'a@b.co' }`.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "Add zod dependency for auth form validation"
```

---

## Task 2: Validation schemas (`src/lib/auth/validation.ts`)

**Files:**
- Create: `src/lib/auth/validation.ts`
- Test: `src/__tests__/auth/validation.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/__tests__/auth/validation.test.ts`:

```ts
import {
  emailSchema,
  passwordSchema,
  signUpSchema,
  resetPasswordSchema,
} from '@/lib/auth/validation';

describe('emailSchema', () => {
  it('accepts a valid email and lowercases + trims', () => {
    const r = emailSchema.safeParse('  USER@Example.COM  ');
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe('user@example.com');
  });

  it('rejects an invalid email', () => {
    expect(emailSchema.safeParse('not-an-email').success).toBe(false);
  });
});

describe('passwordSchema', () => {
  it('accepts a strong password', () => {
    expect(passwordSchema.safeParse('Strong1Pass').success).toBe(true);
  });

  it('rejects under 8 chars', () => {
    const r = passwordSchema.safeParse('Aa1');
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe('At least 8 characters');
  });

  it('rejects missing uppercase', () => {
    const r = passwordSchema.safeParse('alllower1');
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe('One uppercase letter');
  });

  it('rejects missing lowercase', () => {
    const r = passwordSchema.safeParse('ALLUPPER1');
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe('One lowercase letter');
  });

  it('rejects missing digit', () => {
    const r = passwordSchema.safeParse('NoDigitsHere');
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe('One number');
  });
});

describe('signUpSchema', () => {
  const valid = {
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'ada@example.com',
    password: 'Strong1Pass',
    confirmPassword: 'Strong1Pass',
  };

  it('accepts a valid payload', () => {
    expect(signUpSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects empty firstName', () => {
    expect(signUpSchema.safeParse({ ...valid, firstName: '  ' }).success).toBe(false);
  });

  it('rejects mismatched confirmPassword with field-targeted issue', () => {
    const r = signUpSchema.safeParse({ ...valid, confirmPassword: 'Different1' });
    expect(r.success).toBe(false);
    if (!r.success) {
      const issue = r.error.issues.find((i) => i.path[0] === 'confirmPassword');
      expect(issue?.message).toBe('Passwords do not match');
    }
  });
});

describe('resetPasswordSchema', () => {
  it('accepts a valid payload', () => {
    expect(
      resetPasswordSchema.safeParse({
        password: 'Strong1Pass',
        confirmPassword: 'Strong1Pass',
      }).success,
    ).toBe(true);
  });

  it('rejects mismatched confirmPassword', () => {
    const r = resetPasswordSchema.safeParse({
      password: 'Strong1Pass',
      confirmPassword: 'Different1',
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      const issue = r.error.issues.find((i) => i.path[0] === 'confirmPassword');
      expect(issue?.message).toBe('Passwords do not match');
    }
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
npm test -- --watchAll=false src/__tests__/auth/validation.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/auth/validation'`.

- [ ] **Step 3: Implement the schemas**

Create `src/lib/auth/validation.ts`:

```ts
import { z } from 'zod';

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email();

export const passwordSchema = z
  .string()
  .min(8, 'At least 8 characters')
  .regex(/[A-Z]/, 'One uppercase letter')
  .regex(/[a-z]/, 'One lowercase letter')
  .regex(/[0-9]/, 'One number');

export const signUpSchema = z
  .object({
    firstName: z.string().trim().min(1, 'Required'),
    lastName: z.string().trim().min(1, 'Required'),
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });

export const resetPasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });

export type SignUpInput = z.infer<typeof signUpSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
npm test -- --watchAll=false src/__tests__/auth/validation.test.ts
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/validation.ts src/__tests__/auth/validation.test.ts
git commit -m "Add zod validation schemas for email auth forms"
```

---

## Task 3: `signInWithEmail` wrapper (`src/lib/auth/email.ts`)

**Files:**
- Create: `src/lib/auth/email.ts`
- Test: `src/__tests__/auth/email.test.ts`

This task defines the `AuthErrorKind` enum and the `Result` type used by the entire `email.ts` module (Tasks 3–7).

- [ ] **Step 1: Write failing tests**

Create `src/__tests__/auth/email.test.ts`:

```ts
const mockSignInWithPassword = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: (args: unknown) => mockSignInWithPassword(args),
    },
  },
}));

import { signInWithEmail } from '@/lib/auth/email';

describe('signInWithEmail', () => {
  beforeEach(() => {
    mockSignInWithPassword.mockReset();
  });

  it('calls supabase with email + password and returns ok on success', async () => {
    mockSignInWithPassword.mockResolvedValueOnce({ data: { user: { id: 'u1' } }, error: null });
    const r = await signInWithEmail('a@b.co', 'Secret123');
    expect(mockSignInWithPassword).toHaveBeenCalledWith({ email: 'a@b.co', password: 'Secret123' });
    expect(r.ok).toBe(true);
  });

  it('maps Invalid login credentials to invalid_credentials', async () => {
    mockSignInWithPassword.mockResolvedValueOnce({
      data: null,
      error: { code: 'invalid_credentials', message: 'Invalid login credentials' },
    });
    const r = await signInWithEmail('a@b.co', 'wrong');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('invalid_credentials');
  });

  it('maps email_not_confirmed', async () => {
    mockSignInWithPassword.mockResolvedValueOnce({
      data: null,
      error: { code: 'email_not_confirmed', message: 'Email not confirmed' },
    });
    const r = await signInWithEmail('a@b.co', 'Secret123');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('email_not_confirmed');
  });

  it('maps 429 / over_request_rate_limit to rate_limited', async () => {
    mockSignInWithPassword.mockResolvedValueOnce({
      data: null,
      error: { status: 429, message: 'Too many requests' },
    });
    const r = await signInWithEmail('a@b.co', 'Secret123');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('rate_limited');
  });

  it('maps thrown network errors to network', async () => {
    mockSignInWithPassword.mockRejectedValueOnce(new TypeError('Network request failed'));
    const r = await signInWithEmail('a@b.co', 'Secret123');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('network');
  });

  it('falls back to unknown for unmapped Supabase errors', async () => {
    mockSignInWithPassword.mockResolvedValueOnce({
      data: null,
      error: { code: 'some_other_code', message: '???' },
    });
    const r = await signInWithEmail('a@b.co', 'Secret123');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('unknown');
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
npm test -- --watchAll=false src/__tests__/auth/email.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/auth/email'`.

- [ ] **Step 3: Implement `signInWithEmail` and shared types**

Create `src/lib/auth/email.ts`:

```ts
import { supabase } from '@/lib/supabase';

export type AuthErrorKind =
  | 'invalid_credentials'
  | 'email_not_confirmed'
  | 'rate_limited'
  | 'network'
  | 'user_already_exists'
  | 'weak_password'
  | 'expired_link'
  | 'unknown';

export type Result<T = void> =
  | { ok: true; value: T }
  | { ok: false; error: AuthErrorKind };

function classify(err: { code?: string; status?: number; message?: string }): AuthErrorKind {
  if (err.code === 'invalid_credentials') return 'invalid_credentials';
  if (err.code === 'email_not_confirmed') return 'email_not_confirmed';
  if (err.code === 'user_already_exists') return 'user_already_exists';
  if (err.code === 'weak_password') return 'weak_password';
  if (err.code === 'otp_expired' || err.code === 'expired_link') return 'expired_link';
  if (err.status === 429 || err.code === 'over_request_rate_limit' || err.code === 'over_email_send_rate_limit') {
    return 'rate_limited';
  }
  return 'unknown';
}

function classifyThrown(err: unknown): AuthErrorKind {
  const msg = err instanceof Error ? err.message : String(err);
  if (/network/i.test(msg) || /fetch/i.test(msg)) return 'network';
  return 'unknown';
}

export async function signInWithEmail(email: string, password: string): Promise<Result> {
  try {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { ok: false, error: classify(error) };
    return { ok: true, value: undefined };
  } catch (err) {
    return { ok: false, error: classifyThrown(err) };
  }
}
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
npm test -- --watchAll=false src/__tests__/auth/email.test.ts
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/email.ts src/__tests__/auth/email.test.ts
git commit -m "Add signInWithEmail wrapper with normalised error kinds"
```

---

## Task 4: `signUpWithEmail` wrapper

**Files:**
- Modify: `src/lib/auth/email.ts`
- Modify: `src/__tests__/auth/email.test.ts`

- [ ] **Step 1: Append failing tests**

Append to `src/__tests__/auth/email.test.ts`:

```ts
const mockSignUp = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: (args: unknown) => mockSignInWithPassword(args),
      signUp: (args: unknown) => mockSignUp(args),
    },
  },
}));

import { signUpWithEmail } from '@/lib/auth/email';

describe('signUpWithEmail', () => {
  beforeEach(() => {
    mockSignUp.mockReset();
  });

  it('calls supabase with email, password, given_name+family_name metadata, and emailRedirectTo', async () => {
    mockSignUp.mockResolvedValueOnce({ data: { user: { id: 'u1' } }, error: null });
    const r = await signUpWithEmail({
      email: 'ada@example.com',
      password: 'Strong1Pass',
      firstName: 'Ada',
      lastName: 'Lovelace',
    });
    expect(mockSignUp).toHaveBeenCalledWith({
      email: 'ada@example.com',
      password: 'Strong1Pass',
      options: {
        data: { given_name: 'Ada', family_name: 'Lovelace' },
        emailRedirectTo: 'fplgafferreactnativeapp://verify',
      },
    });
    expect(r.ok).toBe(true);
  });

  it('maps user_already_exists', async () => {
    mockSignUp.mockResolvedValueOnce({
      data: null,
      error: { code: 'user_already_exists', message: 'User already registered' },
    });
    const r = await signUpWithEmail({
      email: 'a@b.co',
      password: 'Strong1Pass',
      firstName: 'A',
      lastName: 'B',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('user_already_exists');
  });

  it('maps weak_password', async () => {
    mockSignUp.mockResolvedValueOnce({
      data: null,
      error: { code: 'weak_password', message: 'Password too weak' },
    });
    const r = await signUpWithEmail({
      email: 'a@b.co',
      password: 'Strong1Pass',
      firstName: 'A',
      lastName: 'B',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('weak_password');
  });
});
```

> Note: The existing `jest.mock('@/lib/supabase', …)` block at the top of the file needs the `signUp` method added. Replace the existing block with the augmented one above (the test file's two `jest.mock` calls will be merged by jest — but to avoid hoisting surprises, edit the original block in place to include `signUp`. The append above shows the new shape; in practice, edit the single mock block to look like that and drop the duplicate.)

Concretely: the final shape of the top of the test file should have only one `jest.mock('@/lib/supabase', …)` block, listing all auth methods we'll need across Tasks 3–7. As you add tasks, extend that single block.

- [ ] **Step 2: Run tests, verify they fail**

```bash
npm test -- --watchAll=false src/__tests__/auth/email.test.ts -t 'signUpWithEmail'
```

Expected: FAIL — `signUpWithEmail is not a function`.

- [ ] **Step 3: Implement `signUpWithEmail`**

Append to `src/lib/auth/email.ts`:

```ts
export async function signUpWithEmail(args: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}): Promise<Result> {
  try {
    const { error } = await supabase.auth.signUp({
      email: args.email,
      password: args.password,
      options: {
        data: { given_name: args.firstName, family_name: args.lastName },
        emailRedirectTo: 'fplgafferreactnativeapp://verify',
      },
    });
    if (error) return { ok: false, error: classify(error) };
    return { ok: true, value: undefined };
  } catch (err) {
    return { ok: false, error: classifyThrown(err) };
  }
}
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
npm test -- --watchAll=false src/__tests__/auth/email.test.ts
```

Expected: all green (Task 3 tests still pass, Task 4 tests now pass).

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/email.ts src/__tests__/auth/email.test.ts
git commit -m "Add signUpWithEmail wrapper that stashes name in user_metadata"
```

---

## Task 5: `sendPasswordReset` wrapper (always-success)

**Files:**
- Modify: `src/lib/auth/email.ts`
- Modify: `src/__tests__/auth/email.test.ts`

- [ ] **Step 1: Append failing tests**

Extend the `jest.mock('@/lib/supabase', …)` block to add `resetPasswordForEmail`. Append the tests:

```ts
const mockResetPasswordForEmail = jest.fn();
// In the top-level jest.mock block, add:
//   resetPasswordForEmail: (args: unknown) => mockResetPasswordForEmail(args),

import { sendPasswordReset } from '@/lib/auth/email';

describe('sendPasswordReset', () => {
  beforeEach(() => {
    mockResetPasswordForEmail.mockReset();
  });

  it('calls supabase with email + redirectTo', async () => {
    mockResetPasswordForEmail.mockResolvedValueOnce({ data: {}, error: null });
    const r = await sendPasswordReset('a@b.co');
    expect(mockResetPasswordForEmail).toHaveBeenCalledWith('a@b.co', {
      redirectTo: 'fplgafferreactnativeapp://reset-password',
    });
    expect(r.ok).toBe(true);
  });

  it('returns ok even when supabase returns an error (no enumeration)', async () => {
    mockResetPasswordForEmail.mockResolvedValueOnce({
      data: null,
      error: { code: 'something_bad', message: 'nope' },
    });
    const r = await sendPasswordReset('a@b.co');
    expect(r.ok).toBe(true);
  });

  it('returns ok even when supabase throws (no enumeration)', async () => {
    mockResetPasswordForEmail.mockRejectedValueOnce(new Error('boom'));
    const r = await sendPasswordReset('a@b.co');
    expect(r.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
npm test -- --watchAll=false src/__tests__/auth/email.test.ts -t 'sendPasswordReset'
```

Expected: FAIL — `sendPasswordReset is not a function`.

- [ ] **Step 3: Implement `sendPasswordReset`**

Append to `src/lib/auth/email.ts`:

```ts
export async function sendPasswordReset(email: string): Promise<Result> {
  // Always-success from the caller's perspective: never enumerate accounts.
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'fplgafferreactnativeapp://reset-password',
    });
    if (error) {
      console.warn('[auth] resetPasswordForEmail returned error (swallowed):', error.message);
    }
  } catch (err) {
    console.warn('[auth] resetPasswordForEmail threw (swallowed):', err);
  }
  return { ok: true, value: undefined };
}
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
npm test -- --watchAll=false src/__tests__/auth/email.test.ts
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/email.ts src/__tests__/auth/email.test.ts
git commit -m "Add sendPasswordReset wrapper with always-success semantics"
```

---

## Task 6: `resetPassword` wrapper (with sign-out of other devices)

**Files:**
- Modify: `src/lib/auth/email.ts`
- Modify: `src/__tests__/auth/email.test.ts`

- [ ] **Step 1: Append failing tests**

Extend the `jest.mock('@/lib/supabase', …)` block to add `updateUser` and `signOut`. Append the tests:

```ts
const mockUpdateUser = jest.fn();
const mockSignOut = jest.fn();
// In the top-level jest.mock block, add:
//   updateUser: (args: unknown) => mockUpdateUser(args),
//   signOut: (args: unknown) => mockSignOut(args),

import { resetPassword } from '@/lib/auth/email';

describe('resetPassword', () => {
  beforeEach(() => {
    mockUpdateUser.mockReset();
    mockSignOut.mockReset();
  });

  it('updates password and signs out other devices on success', async () => {
    mockUpdateUser.mockResolvedValueOnce({ data: { user: { id: 'u1' } }, error: null });
    mockSignOut.mockResolvedValueOnce({ error: null });
    const r = await resetPassword('NewStrong1');
    expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'NewStrong1' });
    expect(mockSignOut).toHaveBeenCalledWith({ scope: 'others' });
    expect(r.ok).toBe(true);
  });

  it('returns ok even if signOut others fails (best-effort)', async () => {
    mockUpdateUser.mockResolvedValueOnce({ data: { user: { id: 'u1' } }, error: null });
    mockSignOut.mockRejectedValueOnce(new Error('boom'));
    const r = await resetPassword('NewStrong1');
    expect(r.ok).toBe(true);
  });

  it('maps weak_password from updateUser', async () => {
    mockUpdateUser.mockResolvedValueOnce({
      data: null,
      error: { code: 'weak_password', message: 'Too weak' },
    });
    const r = await resetPassword('weak');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('weak_password');
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('maps expired_link / otp_expired from updateUser', async () => {
    mockUpdateUser.mockResolvedValueOnce({
      data: null,
      error: { code: 'otp_expired', message: 'Token expired' },
    });
    const r = await resetPassword('NewStrong1');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('expired_link');
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
npm test -- --watchAll=false src/__tests__/auth/email.test.ts -t 'resetPassword'
```

Expected: FAIL — `resetPassword is not a function`.

- [ ] **Step 3: Implement `resetPassword`**

Append to `src/lib/auth/email.ts`:

```ts
export async function resetPassword(newPassword: string): Promise<Result> {
  try {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) return { ok: false, error: classify(error) };
  } catch (err) {
    return { ok: false, error: classifyThrown(err) };
  }
  // Best-effort: invalidate other devices. Don't roll back if this fails.
  try {
    await supabase.auth.signOut({ scope: 'others' });
  } catch (err) {
    console.warn('[auth] signOut(others) failed after password reset (non-fatal):', err);
  }
  return { ok: true, value: undefined };
}
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
npm test -- --watchAll=false src/__tests__/auth/email.test.ts
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/email.ts src/__tests__/auth/email.test.ts
git commit -m "Add resetPassword wrapper that signs out other devices"
```

---

## Task 7: `resendVerification` wrapper

**Files:**
- Modify: `src/lib/auth/email.ts`
- Modify: `src/__tests__/auth/email.test.ts`

- [ ] **Step 1: Append failing tests**

Extend the `jest.mock('@/lib/supabase', …)` block to add `resend`. Append the tests:

```ts
const mockResend = jest.fn();
// In the top-level jest.mock block, add:
//   resend: (args: unknown) => mockResend(args),

import { resendVerification } from '@/lib/auth/email';

describe('resendVerification', () => {
  beforeEach(() => {
    mockResend.mockReset();
  });

  it('calls supabase resend with type=signup and the email', async () => {
    mockResend.mockResolvedValueOnce({ data: {}, error: null });
    const r = await resendVerification('a@b.co');
    expect(mockResend).toHaveBeenCalledWith({ type: 'signup', email: 'a@b.co' });
    expect(r.ok).toBe(true);
  });

  it('maps over_email_send_rate_limit to rate_limited', async () => {
    mockResend.mockResolvedValueOnce({
      data: null,
      error: { code: 'over_email_send_rate_limit', message: 'Try again later' },
    });
    const r = await resendVerification('a@b.co');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('rate_limited');
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
npm test -- --watchAll=false src/__tests__/auth/email.test.ts -t 'resendVerification'
```

Expected: FAIL — `resendVerification is not a function`.

- [ ] **Step 3: Implement `resendVerification`**

Append to `src/lib/auth/email.ts`:

```ts
export async function resendVerification(email: string): Promise<Result> {
  try {
    const { error } = await supabase.auth.resend({ type: 'signup', email });
    if (error) return { ok: false, error: classify(error) };
    return { ok: true, value: undefined };
  } catch (err) {
    return { ok: false, error: classifyThrown(err) };
  }
}
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
npm test -- --watchAll=false src/__tests__/auth/email.test.ts
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/email.ts src/__tests__/auth/email.test.ts
git commit -m "Add resendVerification wrapper for verify-pending screen"
```

---

## Task 8: Deep-link URL parser (`src/lib/auth/deepLink.ts`)

**Files:**
- Create: `src/lib/auth/deepLink.ts` (parser only in this task; hook in Task 9)
- Test: `src/__tests__/auth/deepLink.test.ts`

- [ ] **Step 1: Write failing tests for the parser**

Create `src/__tests__/auth/deepLink.test.ts`:

```ts
import { parseAuthDeepLink } from '@/lib/auth/deepLink';

describe('parseAuthDeepLink', () => {
  it('classifies the verify URL', () => {
    expect(parseAuthDeepLink('fplgafferreactnativeapp://verify?code=abc')).toEqual({
      kind: 'verify',
    });
  });

  it('classifies the reset-password URL', () => {
    expect(parseAuthDeepLink('fplgafferreactnativeapp://reset-password?code=xyz')).toEqual({
      kind: 'reset',
    });
  });

  it('classifies unknown paths', () => {
    expect(parseAuthDeepLink('fplgafferreactnativeapp://something-else?x=1')).toEqual({
      kind: 'unknown',
    });
  });

  it('classifies non-app schemes', () => {
    expect(parseAuthDeepLink('https://example.com/verify')).toEqual({ kind: 'unknown' });
  });

  it('handles malformed URLs gracefully', () => {
    expect(parseAuthDeepLink('not-a-url-at-all')).toEqual({ kind: 'unknown' });
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
npm test -- --watchAll=false src/__tests__/auth/deepLink.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/auth/deepLink'`.

- [ ] **Step 3: Implement the parser**

Create `src/lib/auth/deepLink.ts`:

```ts
const APP_SCHEME = 'fplgafferreactnativeapp:';

export type AuthDeepLink =
  | { kind: 'verify' }
  | { kind: 'reset' }
  | { kind: 'unknown' };

export function parseAuthDeepLink(url: string): AuthDeepLink {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== APP_SCHEME) return { kind: 'unknown' };
    // For `scheme://host/path`, `parsed.host` is the first path segment.
    const head = parsed.host || parsed.pathname.replace(/^\//, '').split('/')[0];
    if (head === 'verify') return { kind: 'verify' };
    if (head === 'reset-password') return { kind: 'reset' };
    return { kind: 'unknown' };
  } catch {
    return { kind: 'unknown' };
  }
}
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
npm test -- --watchAll=false src/__tests__/auth/deepLink.test.ts
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/deepLink.ts src/__tests__/auth/deepLink.test.ts
git commit -m "Add parseAuthDeepLink for verify + reset-password URLs"
```

---

## Task 9: `useEmailAuthDeepLinks` hook

**Files:**
- Modify: `src/lib/auth/deepLink.ts`
- Modify: `src/__tests__/auth/deepLink.test.ts`

- [ ] **Step 1: Append failing tests**

Append to `src/__tests__/auth/deepLink.test.ts`:

```ts
import React from 'react';
import { render, act } from '@testing-library/react-native';

const mockExchangeCodeForSession = jest.fn();
const mockReplace = jest.fn();
let urlListener: ((event: { url: string }) => void) | null = null;
const mockAddEventListener = jest.fn((_evt: string, cb: (e: { url: string }) => void) => {
  urlListener = cb;
  return { remove: jest.fn() };
});

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      exchangeCodeForSession: (url: string) => mockExchangeCodeForSession(url),
    },
  },
}));

jest.mock('expo-linking', () => ({
  __esModule: true,
  useURL: jest.fn(() => null),
  addEventListener: (evt: string, cb: (e: { url: string }) => void) =>
    mockAddEventListener(evt, cb),
}));

jest.mock('expo-router', () => ({
  __esModule: true,
  router: { replace: (path: string) => mockReplace(path) },
}));

let hydrated = true;
jest.mock('@/store/authStore', () => ({
  __esModule: true,
  useAuthStore: (selector: (s: { hydrated: boolean }) => unknown) => selector({ hydrated }),
}));

import { useEmailAuthDeepLinks } from '@/lib/auth/deepLink';

function Harness() {
  useEmailAuthDeepLinks();
  return null;
}

describe('useEmailAuthDeepLinks', () => {
  beforeEach(() => {
    mockExchangeCodeForSession.mockReset();
    mockReplace.mockReset();
    mockAddEventListener.mockReset();
    urlListener = null;
    hydrated = true;
  });

  it('exchanges code and replaces to reset-password on reset URL', async () => {
    mockExchangeCodeForSession.mockResolvedValueOnce({ data: { session: {} }, error: null });
    render(<Harness />);
    await act(async () => {
      urlListener?.({ url: 'fplgafferreactnativeapp://reset-password?code=abc' });
    });
    expect(mockExchangeCodeForSession).toHaveBeenCalledWith(
      'fplgafferreactnativeapp://reset-password?code=abc',
    );
    expect(mockReplace).toHaveBeenCalledWith('/(onboarding)/reset-password');
  });

  it('exchanges code and lets layout route on verify URL (no explicit replace)', async () => {
    mockExchangeCodeForSession.mockResolvedValueOnce({ data: { session: {} }, error: null });
    render(<Harness />);
    await act(async () => {
      urlListener?.({ url: 'fplgafferreactnativeapp://verify?code=xyz' });
    });
    expect(mockExchangeCodeForSession).toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('routes to forgot-password?expired=1 if reset exchange rejects', async () => {
    mockExchangeCodeForSession.mockRejectedValueOnce(new Error('expired'));
    render(<Harness />);
    await act(async () => {
      urlListener?.({ url: 'fplgafferreactnativeapp://reset-password?code=bad' });
    });
    expect(mockReplace).toHaveBeenCalledWith('/(onboarding)/forgot-password?expired=1');
  });

  it('routes to signin?verify_expired=1 if verify exchange rejects', async () => {
    mockExchangeCodeForSession.mockRejectedValueOnce(new Error('expired'));
    render(<Harness />);
    await act(async () => {
      urlListener?.({ url: 'fplgafferreactnativeapp://verify?code=bad' });
    });
    expect(mockReplace).toHaveBeenCalledWith('/(onboarding)/signin?verify_expired=1');
  });

  it('ignores unknown URLs', async () => {
    render(<Harness />);
    await act(async () => {
      urlListener?.({ url: 'https://example.com/other' });
    });
    expect(mockExchangeCodeForSession).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('does not exchange while authStore is not hydrated', async () => {
    hydrated = false;
    render(<Harness />);
    await act(async () => {
      urlListener?.({ url: 'fplgafferreactnativeapp://reset-password?code=abc' });
    });
    expect(mockExchangeCodeForSession).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
npm test -- --watchAll=false src/__tests__/auth/deepLink.test.ts -t 'useEmailAuthDeepLinks'
```

Expected: FAIL — `useEmailAuthDeepLinks is not a function`.

- [ ] **Step 3: Implement the hook**

Append to `src/lib/auth/deepLink.ts`:

```ts
import { useEffect } from 'react';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';

export function useEmailAuthDeepLinks(): void {
  const hydrated = useAuthStore((s) => s.hydrated);
  const initialUrl = Linking.useURL();

  useEffect(() => {
    if (!hydrated) return;

    const handle = (url: string) => {
      const parsed = parseAuthDeepLink(url);
      if (parsed.kind === 'unknown') return;
      supabase.auth
        .exchangeCodeForSession(url)
        .then(() => {
          if (parsed.kind === 'reset') {
            router.replace('/(onboarding)/reset-password');
          }
          // For 'verify', the existing (onboarding)/_layout.tsx redirect
          // picks up the new session and routes the user.
        })
        .catch(() => {
          router.replace(
            parsed.kind === 'reset'
              ? '/(onboarding)/forgot-password?expired=1'
              : '/(onboarding)/signin?verify_expired=1',
          );
        });
    };

    if (initialUrl) handle(initialUrl);
    const sub = Linking.addEventListener('url', (e) => handle(e.url));
    return () => sub.remove();
  }, [hydrated, initialUrl]);
}
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
npm test -- --watchAll=false src/__tests__/auth/deepLink.test.ts
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/deepLink.ts src/__tests__/auth/deepLink.test.ts
git commit -m "Add useEmailAuthDeepLinks hook for verify + reset URLs"
```

---

## Task 10: Wire `useEmailAuthDeepLinks` into the root layout

**Files:**
- Modify: `src/app/_layout.tsx`

This task has no new tests — the hook itself is tested in Task 9, and root layout has no existing test file.

- [ ] **Step 1: Edit `src/app/_layout.tsx`**

After the existing `useAuthStore` line in `RootLayout`, add the hook call. Final shape of the imports + top of the function:

```ts
import { useEmailAuthDeepLinks } from '@/lib/auth/deepLink';

// …existing imports…

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ /* …existing… */ });

  const [themeHydrated, setThemeHydrated] = useState(useThemeStore.persist.hasHydrated());
  const authHydrated = useAuthStore((s) => s.hydrated);

  useEmailAuthDeepLinks();

  // …rest of function unchanged…
}
```

- [ ] **Step 2: Run the full suite — nothing should break**

```bash
npm test -- --watchAll=false
```

Expected: all green.

- [ ] **Step 3: Commit**

```bash
git add src/app/_layout.tsx
git commit -m "Wire useEmailAuthDeepLinks into root layout"
```

---

## Task 11: Wire SignIn screen to `signInWithEmail`

**Files:**
- Modify: `src/app/(onboarding)/signin.tsx`
- Create: `src/__tests__/signinScreen.test.tsx`

- [ ] **Step 1: Write failing screen tests**

Create `src/__tests__/signinScreen.test.tsx`:

```tsx
import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const mockSignIn = jest.fn();
const mockPush = jest.fn();
let searchParams: Record<string, string> = {};

jest.mock('@/lib/auth/email', () => ({
  __esModule: true,
  signInWithEmail: (...args: unknown[]) => mockSignIn(...args),
}));

jest.mock('@/lib/auth/google', () => ({
  __esModule: true,
  signInWithGoogle: jest.fn(() => Promise.resolve({ ok: false, error: 'cancel' })),
}));

jest.mock('expo-router', () => ({
  __esModule: true,
  router: { push: (p: string) => mockPush(p) },
  useLocalSearchParams: () => searchParams,
}));

jest.mock('@/store/themeStore', () => ({
  __esModule: true,
  useThemeStore: () => ({ paletteKey: 'classic', dark: true }),
}));

import SignIn from '@/app/(onboarding)/signin';

describe('SignIn screen', () => {
  beforeEach(() => {
    mockSignIn.mockReset();
    mockPush.mockReset();
    searchParams = {};
  });

  it('shows inline error on invalid_credentials', async () => {
    mockSignIn.mockResolvedValueOnce({ ok: false, error: 'invalid_credentials' });
    const { getByPlaceholderText, getByText, findByText } = render(<SignIn />);
    fireEvent.changeText(getByPlaceholderText('Email address'), 'a@b.co');
    fireEvent.changeText(getByPlaceholderText('Password'), 'wrong');
    fireEvent.press(getByText('Sign in'));
    await findByText('Email or password is incorrect');
  });

  it('routes to verify-pending on email_not_confirmed', async () => {
    mockSignIn.mockResolvedValueOnce({ ok: false, error: 'email_not_confirmed' });
    const { getByPlaceholderText, getByText } = render(<SignIn />);
    fireEvent.changeText(getByPlaceholderText('Email address'), 'a@b.co');
    fireEvent.changeText(getByPlaceholderText('Password'), 'Secret123');
    fireEvent.press(getByText('Sign in'));
    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith(
        '/(onboarding)/verify-pending?email=a%40b.co',
      ),
    );
  });

  it('navigates to sign-up via footer link', () => {
    const { getByText } = render(<SignIn />);
    fireEvent.press(getByText('Sign up'));
    expect(mockPush).toHaveBeenCalledWith('/(onboarding)/signup');
  });

  it('navigates to forgot-password via link', () => {
    const { getByText } = render(<SignIn />);
    fireEvent.press(getByText('Forgot password?'));
    expect(mockPush).toHaveBeenCalledWith('/(onboarding)/forgot-password');
  });

  it('renders verify-expired banner when query param is set', () => {
    searchParams = { verify_expired: '1' };
    const { getByText } = render(<SignIn />);
    expect(getByText('Verification link expired. Sign in again to resend.')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
npm test -- --watchAll=false src/__tests__/signinScreen.test.tsx
```

Expected: FAIL — most cases fail because the screen still calls `COMING_SOON`.

- [ ] **Step 3: Edit `src/app/(onboarding)/signin.tsx`**

Final shape — replace the file with the following:

```tsx
import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useThemeStore } from '@/store/themeStore';
import { getTheme } from '@/constants/theme';
import { signInWithGoogle } from '@/lib/auth/google';
import { signInWithEmail } from '@/lib/auth/email';
import type { AuthErrorKind } from '@/lib/auth/email';
import { GafferLogo } from '@/components/ui/GafferLogo';
import { PillBtn } from '@/components/ui/PillBtn';
import { Icon } from '@/components/ui/Icon';
import { Field } from '@/components/forms/Field';
import { SocialBtn } from '@/components/forms/SocialBtn';

const COMING_SOON = () =>
  Alert.alert('Coming soon', 'This sign-in option is in a future update.');

function errorMessageFor(kind: AuthErrorKind): string {
  switch (kind) {
    case 'invalid_credentials':
      return 'Email or password is incorrect';
    case 'rate_limited':
      return 'Too many attempts — try again in a few minutes';
    case 'network':
      return "Couldn't reach the server. Check your connection and try again";
    default:
      return 'Something went wrong. Please try again';
  }
}

export default function SignIn() {
  const { paletteKey, dark } = useThemeStore();
  const t = getTheme(paletteKey, dark);
  const params = useLocalSearchParams<{ verify_expired?: string }>();

  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);

  const onGoogle = async () => {
    setGoogleError(null);
    setGoogleSubmitting(true);
    try {
      const result = await signInWithGoogle();
      if (result.ok) return;
      if (result.error === 'cancel' || result.error === 'dismiss') return;
      setGoogleError('Google sign-in failed. Please try again.');
    } finally {
      setGoogleSubmitting(false);
    }
  };

  const onSubmit = async () => {
    if (submitting) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      const r = await signInWithEmail(email.trim().toLowerCase(), pw);
      if (r.ok) return; // (onboarding)/_layout redirects on session change
      if (r.error === 'email_not_confirmed') {
        router.push(
          `/(onboarding)/verify-pending?email=${encodeURIComponent(email.trim().toLowerCase())}`,
        );
        return;
      }
      setSubmitError(errorMessageFor(r.error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: t.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.logoWrap}>
          <GafferLogo size={46} light={dark} variant="wordmark" />
        </View>

        <Text style={[styles.title, { color: t.text }]}>Welcome, Gaffer!</Text>
        <Text style={[styles.subtitle, { color: t.textMuted }]}>
          Sign in to manage your squad
        </Text>

        {params.verify_expired === '1' && (
          <Text style={[styles.banner, { color: t.textMuted }]}>
            Verification link expired. Sign in again to resend.
          </Text>
        )}

        <View style={{ gap: 11 }}>
          <SocialBtn provider="google" onPress={onGoogle} />
          <SocialBtn provider="apple" onPress={COMING_SOON} />
        </View>
        {googleSubmitting && (
          <View style={styles.spinnerWrap}>
            <ActivityIndicator color={t.accent} />
          </View>
        )}
        {googleError && (
          <Text style={[styles.error, { color: '#FF3B5C' }]}>{googleError}</Text>
        )}

        <View style={styles.divider}>
          <View style={[styles.dividerLine, { backgroundColor: t.line }]} />
          <Text style={[styles.dividerText, { color: t.textFaint }]}>OR</Text>
          <View style={[styles.dividerLine, { backgroundColor: t.line }]} />
        </View>

        <View style={{ gap: 11 }}>
          <Field
            icon="mail"
            placeholder="Email address"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoComplete="email"
            surfaceAlt={t.surfaceAlt}
            line={t.line}
            accent={t.accent}
            text={t.text}
            textMuted={t.textMuted}
          />
          <Field
            icon="lock"
            placeholder="Password"
            value={pw}
            onChangeText={setPw}
            secureTextEntry
            autoComplete="password"
            surfaceAlt={t.surfaceAlt}
            line={t.line}
            accent={t.accent}
            text={t.text}
            textMuted={t.textMuted}
          />
        </View>

        {submitError && (
          <Text style={[styles.error, { color: '#FF3B5C' }]}>{submitError}</Text>
        )}

        <View style={styles.forgotWrap}>
          <Pressable
            onPress={() => router.push('/(onboarding)/forgot-password')}
            hitSlop={8}
          >
            <Text style={[styles.forgot, { color: t.accent }]}>Forgot password?</Text>
          </Pressable>
        </View>

        <PillBtn
          variant="accent"
          onPress={onSubmit}
          accentInk={t.accentInk}
          style={styles.signInBtn}
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </PillBtn>

        <View style={styles.faceWrap}>
          <Pressable
            onPress={COMING_SOON}
            style={({ pressed }) => [
              styles.faceBtn,
              { backgroundColor: t.surfaceAlt, borderColor: t.line },
              pressed && { transform: [{ scale: 0.94 }] },
            ]}
          >
            <Icon name="faceid" color={t.accent} size={32} />
          </Pressable>
          <Text style={[styles.faceLabel, { color: t.textMuted }]}>
            Sign in with Face ID
          </Text>
        </View>

        <View style={styles.signUpWrap}>
          <Text style={[styles.signUpHint, { color: t.textMuted }]}>
            Don't have an account?{' '}
          </Text>
          <Pressable onPress={() => router.push('/(onboarding)/signup')} hitSlop={8}>
            <Text style={[styles.signUpLink, { color: t.accent }]}>Sign up</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: 26,
    paddingTop: 64,
    paddingBottom: 32,
  },
  logoWrap: { alignItems: 'center', marginBottom: 26 },
  title: {
    fontFamily: 'Archivo_900Black',
    fontSize: 30,
    letterSpacing: -0.6,
    textAlign: 'center',
    marginBottom: 6,
  },
  subtitle: {
    fontFamily: 'Archivo_500Medium',
    fontSize: 15.5,
    textAlign: 'center',
    marginBottom: 26,
  },
  banner: {
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 14,
  },
  spinnerWrap: { marginTop: 10, alignItems: 'center' },
  error: {
    marginTop: 8,
    textAlign: 'center',
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 13,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginVertical: 22,
  },
  dividerLine: { flex: 1, height: 1 },
  dividerText: {
    fontFamily: 'Archivo_700Bold',
    fontSize: 12.5,
    letterSpacing: 1.25,
  },
  forgotWrap: {
    alignItems: 'flex-end',
    marginTop: 12,
    marginBottom: 18,
  },
  forgot: { fontFamily: 'Archivo_700Bold', fontSize: 14 },
  signInBtn: { width: '100%', height: 54 },
  faceWrap: { alignItems: 'center', gap: 9, marginTop: 22 },
  faceBtn: {
    width: 60,
    height: 60,
    borderRadius: 18,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  faceLabel: { fontFamily: 'Archivo_700Bold', fontSize: 13.5 },
  signUpWrap: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 26,
  },
  signUpHint: { fontFamily: 'Archivo_500Medium', fontSize: 14 },
  signUpLink: { fontFamily: 'Archivo_800ExtraBold', fontSize: 14 },
});
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
npm test -- --watchAll=false src/__tests__/signinScreen.test.tsx
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(onboarding\)/signin.tsx src/__tests__/signinScreen.test.tsx
git commit -m "Wire SignIn email/password fields to signInWithEmail"
```

---

## Task 12: Sign-up screen (`src/app/(onboarding)/signup.tsx`)

**Files:**
- Create: `src/app/(onboarding)/signup.tsx`
- Create: `src/__tests__/signupScreen.test.tsx`

- [ ] **Step 1: Write failing screen tests**

Create `src/__tests__/signupScreen.test.tsx`:

```tsx
import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const mockSignUp = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();

jest.mock('@/lib/auth/email', () => ({
  __esModule: true,
  signUpWithEmail: (...args: unknown[]) => mockSignUp(...args),
}));

jest.mock('expo-router', () => ({
  __esModule: true,
  router: {
    replace: (p: string) => mockReplace(p),
    back: () => mockBack(),
  },
}));

jest.mock('@/store/themeStore', () => ({
  __esModule: true,
  useThemeStore: () => ({ paletteKey: 'classic', dark: true }),
}));

import SignUp from '@/app/(onboarding)/signup';

describe('SignUp screen', () => {
  beforeEach(() => {
    mockSignUp.mockReset();
    mockReplace.mockReset();
    mockBack.mockReset();
  });

  function fill(getByPlaceholderText: ReturnType<typeof render>['getByPlaceholderText'], overrides: Partial<{
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    confirmPassword: string;
  }> = {}) {
    fireEvent.changeText(getByPlaceholderText('First name'), overrides.firstName ?? 'Ada');
    fireEvent.changeText(getByPlaceholderText('Last name'), overrides.lastName ?? 'Lovelace');
    fireEvent.changeText(getByPlaceholderText('Email address'), overrides.email ?? 'ada@example.com');
    fireEvent.changeText(getByPlaceholderText('Password'), overrides.password ?? 'Strong1Pass');
    fireEvent.changeText(getByPlaceholderText('Confirm password'), overrides.confirmPassword ?? 'Strong1Pass');
  }

  it('shows inline error for short password', () => {
    const { getByPlaceholderText, getByText, queryByText } = render(<SignUp />);
    fill(getByPlaceholderText, { password: 'Aa1', confirmPassword: 'Aa1' });
    fireEvent.press(getByText('Create account'));
    expect(queryByText('At least 8 characters')).toBeTruthy();
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it('shows inline error when passwords mismatch', () => {
    const { getByPlaceholderText, getByText, queryByText } = render(<SignUp />);
    fill(getByPlaceholderText, { confirmPassword: 'Different1' });
    fireEvent.press(getByText('Create account'));
    expect(queryByText('Passwords do not match')).toBeTruthy();
  });

  it('calls signUpWithEmail and replaces to verify-pending on success', async () => {
    mockSignUp.mockResolvedValueOnce({ ok: true });
    const { getByPlaceholderText, getByText } = render(<SignUp />);
    fill(getByPlaceholderText);
    fireEvent.press(getByText('Create account'));
    await waitFor(() =>
      expect(mockSignUp).toHaveBeenCalledWith({
        email: 'ada@example.com',
        password: 'Strong1Pass',
        firstName: 'Ada',
        lastName: 'Lovelace',
      }),
    );
    expect(mockReplace).toHaveBeenCalledWith(
      '/(onboarding)/verify-pending?email=ada%40example.com',
    );
  });

  it('replaces to verify-pending on user_already_exists (no enumeration)', async () => {
    mockSignUp.mockResolvedValueOnce({ ok: false, error: 'user_already_exists' });
    const { getByPlaceholderText, getByText } = render(<SignUp />);
    fill(getByPlaceholderText);
    fireEvent.press(getByText('Create account'));
    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith(
        '/(onboarding)/verify-pending?email=ada%40example.com',
      ),
    );
  });

  it('shows weak_password inline on the password field', async () => {
    mockSignUp.mockResolvedValueOnce({ ok: false, error: 'weak_password' });
    const { getByPlaceholderText, getByText, findByText } = render(<SignUp />);
    fill(getByPlaceholderText);
    fireEvent.press(getByText('Create account'));
    await findByText('Please choose a stronger password');
  });

  it('back link calls router.back', () => {
    const { getByText } = render(<SignUp />);
    fireEvent.press(getByText('Sign in'));
    expect(mockBack).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
npm test -- --watchAll=false src/__tests__/signupScreen.test.tsx
```

Expected: FAIL — `Cannot find module '@/app/(onboarding)/signup'`.

- [ ] **Step 3: Implement the screen**

Create `src/app/(onboarding)/signup.tsx`:

```tsx
import React, { useState } from 'react';
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
import { getTheme } from '@/constants/theme';
import { GafferLogo } from '@/components/ui/GafferLogo';
import { PillBtn } from '@/components/ui/PillBtn';
import { Field } from '@/components/forms/Field';
import { signUpSchema } from '@/lib/auth/validation';
import { signUpWithEmail } from '@/lib/auth/email';

type FieldErrors = Partial<Record<
  'firstName' | 'lastName' | 'email' | 'password' | 'confirmPassword' | 'form',
  string
>>;

export default function SignUp() {
  const { paletteKey, dark } = useThemeStore();
  const t = getTheme(paletteKey, dark);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async () => {
    if (submitting) return;
    setErrors({});
    const parsed = signUpSchema.safeParse({
      firstName,
      lastName,
      email,
      password,
      confirmPassword,
    });
    if (!parsed.success) {
      const map: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof FieldErrors;
        if (!map[key]) map[key] = issue.message;
      }
      setErrors(map);
      return;
    }

    setSubmitting(true);
    try {
      const r = await signUpWithEmail(parsed.data);
      const normalisedEmail = parsed.data.email;
      if (r.ok || (!r.ok && r.error === 'user_already_exists')) {
        router.replace(
          `/(onboarding)/verify-pending?email=${encodeURIComponent(normalisedEmail)}`,
        );
        return;
      }
      if (r.error === 'weak_password') {
        setErrors({ password: 'Please choose a stronger password' });
      } else if (r.error === 'rate_limited') {
        setErrors({ form: 'Too many sign-up attempts — try again later' });
      } else if (r.error === 'network') {
        setErrors({ form: "Couldn't reach the server. Check your connection and try again" });
      } else {
        setErrors({ form: 'Something went wrong. Please try again' });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: t.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.logoWrap}>
          <GafferLogo size={46} light={dark} variant="wordmark" />
        </View>

        <Text style={[styles.title, { color: t.text }]}>Create your account</Text>
        <Text style={[styles.subtitle, { color: t.textMuted }]}>
          We'll send a link to verify your email
        </Text>

        <View style={{ gap: 11 }}>
          <Field
            icon="person"
            placeholder="First name"
            value={firstName}
            onChangeText={setFirstName}
            surfaceAlt={t.surfaceAlt}
            line={t.line}
            accent={t.accent}
            text={t.text}
            textMuted={t.textMuted}
          />
          {errors.firstName && (
            <Text style={[styles.fieldError, { color: '#FF3B5C' }]}>{errors.firstName}</Text>
          )}
          <Field
            icon="person"
            placeholder="Last name"
            value={lastName}
            onChangeText={setLastName}
            surfaceAlt={t.surfaceAlt}
            line={t.line}
            accent={t.accent}
            text={t.text}
            textMuted={t.textMuted}
          />
          {errors.lastName && (
            <Text style={[styles.fieldError, { color: '#FF3B5C' }]}>{errors.lastName}</Text>
          )}
          <Field
            icon="mail"
            placeholder="Email address"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoComplete="email"
            surfaceAlt={t.surfaceAlt}
            line={t.line}
            accent={t.accent}
            text={t.text}
            textMuted={t.textMuted}
          />
          {errors.email && (
            <Text style={[styles.fieldError, { color: '#FF3B5C' }]}>{errors.email}</Text>
          )}
          <Field
            icon="lock"
            placeholder="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="password"
            surfaceAlt={t.surfaceAlt}
            line={t.line}
            accent={t.accent}
            text={t.text}
            textMuted={t.textMuted}
          />
          {errors.password && (
            <Text style={[styles.fieldError, { color: '#FF3B5C' }]}>{errors.password}</Text>
          )}
          <Field
            icon="lock"
            placeholder="Confirm password"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            autoComplete="password"
            surfaceAlt={t.surfaceAlt}
            line={t.line}
            accent={t.accent}
            text={t.text}
            textMuted={t.textMuted}
          />
          {errors.confirmPassword && (
            <Text style={[styles.fieldError, { color: '#FF3B5C' }]}>{errors.confirmPassword}</Text>
          )}
        </View>

        {errors.form && (
          <Text style={[styles.formError, { color: '#FF3B5C' }]}>{errors.form}</Text>
        )}

        <PillBtn
          variant="accent"
          onPress={onSubmit}
          accentInk={t.accentInk}
          style={styles.submitBtn}
        >
          {submitting ? 'Creating account…' : 'Create account'}
        </PillBtn>

        <View style={styles.footerWrap}>
          <Text style={[styles.footerHint, { color: t.textMuted }]}>
            Already have an account?{' '}
          </Text>
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <Text style={[styles.footerLink, { color: t.accent }]}>Sign in</Text>
          </Pressable>
        </View>
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
    marginBottom: 6,
  },
  subtitle: {
    fontFamily: 'Archivo_500Medium',
    fontSize: 15.5,
    textAlign: 'center',
    marginBottom: 26,
  },
  fieldError: {
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 12.5,
    marginTop: -4,
    marginLeft: 4,
  },
  formError: {
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 13,
    marginTop: 14,
    textAlign: 'center',
  },
  submitBtn: { width: '100%', height: 54, marginTop: 22 },
  footerWrap: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 22,
  },
  footerHint: { fontFamily: 'Archivo_500Medium', fontSize: 14 },
  footerLink: { fontFamily: 'Archivo_800ExtraBold', fontSize: 14 },
});
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
npm test -- --watchAll=false src/__tests__/signupScreen.test.tsx
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(onboarding\)/signup.tsx src/__tests__/signupScreen.test.tsx
git commit -m "Add sign-up screen with zod validation + verify-pending route"
```

---

## Task 13: Verify-pending screen

**Files:**
- Create: `src/app/(onboarding)/verify-pending.tsx`
- Create: `src/__tests__/verifyPendingScreen.test.tsx`

- [ ] **Step 1: Write failing screen tests**

Create `src/__tests__/verifyPendingScreen.test.tsx`:

```tsx
import React from 'react';
import { fireEvent, render, waitFor, act } from '@testing-library/react-native';

const mockResend = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();

jest.mock('@/lib/auth/email', () => ({
  __esModule: true,
  resendVerification: (...args: unknown[]) => mockResend(...args),
}));

jest.mock('expo-router', () => ({
  __esModule: true,
  router: { replace: (p: string) => mockReplace(p), back: () => mockBack() },
  useLocalSearchParams: () => ({ email: 'ada@example.com' }),
}));

jest.mock('@/store/themeStore', () => ({
  __esModule: true,
  useThemeStore: () => ({ paletteKey: 'classic', dark: true }),
}));

import VerifyPending from '@/app/(onboarding)/verify-pending';

describe('VerifyPending screen', () => {
  beforeEach(() => {
    mockResend.mockReset();
    mockReplace.mockReset();
    mockBack.mockReset();
    jest.useRealTimers();
  });

  it('renders the email from query params', () => {
    const { getByText } = render(<VerifyPending />);
    expect(getByText(/ada@example\.com/)).toBeTruthy();
  });

  it('calls resendVerification and disables the button for 30s', async () => {
    jest.useFakeTimers();
    mockResend.mockResolvedValueOnce({ ok: true });
    const { getByText } = render(<VerifyPending />);
    await act(async () => {
      fireEvent.press(getByText('Resend email'));
    });
    expect(mockResend).toHaveBeenCalledWith('ada@example.com');
    // Press again immediately — should be a no-op.
    await act(async () => {
      fireEvent.press(getByText(/Resend.*\(/));
    });
    expect(mockResend).toHaveBeenCalledTimes(1);
    // Advance 30s.
    await act(async () => {
      jest.advanceTimersByTime(30_000);
    });
    expect(() => getByText('Resend email')).not.toThrow();
  });

  it('shows a friendly error on rate_limited resend', async () => {
    mockResend.mockResolvedValueOnce({ ok: false, error: 'rate_limited' });
    const { getByText, findByText } = render(<VerifyPending />);
    await act(async () => {
      fireEvent.press(getByText('Resend email'));
    });
    await findByText('Already sent — check your inbox or wait a minute');
  });

  it('Already verified link replaces to signin', () => {
    const { getByText } = render(<VerifyPending />);
    fireEvent.press(getByText('Already verified? Sign in'));
    expect(mockReplace).toHaveBeenCalledWith('/(onboarding)/signin');
  });

  it('Wrong email link goes back', () => {
    const { getByText } = render(<VerifyPending />);
    fireEvent.press(getByText('Wrong email? Go back'));
    expect(mockBack).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
npm test -- --watchAll=false src/__tests__/verifyPendingScreen.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the screen**

Create `src/app/(onboarding)/verify-pending.tsx`:

```tsx
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useThemeStore } from '@/store/themeStore';
import { getTheme } from '@/constants/theme';
import { GafferLogo } from '@/components/ui/GafferLogo';
import { PillBtn } from '@/components/ui/PillBtn';
import { resendVerification } from '@/lib/auth/email';

const RESEND_COOLDOWN_MS = 30_000;

export default function VerifyPending() {
  const { paletteKey, dark } = useThemeStore();
  const t = getTheme(paletteKey, dark);
  const params = useLocalSearchParams<{ email?: string }>();
  const email = params.email ?? '';

  const [cooldown, setCooldown] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startCooldown = () => {
    setCooldown(RESEND_COOLDOWN_MS / 1000);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCooldown((c) => {
        if (c <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  };

  const onResend = async () => {
    if (cooldown > 0 || !email) return;
    setErrorMsg(null);
    startCooldown();
    const r = await resendVerification(email);
    if (!r.ok && r.error === 'rate_limited') {
      setErrorMsg('Already sent — check your inbox or wait a minute');
    } else if (!r.ok) {
      setErrorMsg("Couldn't resend right now. Please try again");
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: t.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.logoWrap}>
          <GafferLogo size={46} light={dark} variant="wordmark" />
        </View>

        <Text style={[styles.title, { color: t.text }]}>Check your inbox</Text>
        <Text style={[styles.body, { color: t.textMuted }]}>
          We sent a verification link to <Text style={{ color: t.text }}>{email}</Text>. Tap the
          link in the email to finish signing up.
        </Text>

        <PillBtn
          variant="accent"
          onPress={onResend}
          accentInk={t.accentInk}
          style={styles.resendBtn}
        >
          {cooldown > 0 ? `Resend email (${cooldown}s)` : 'Resend email'}
        </PillBtn>

        {errorMsg && (
          <Text style={[styles.error, { color: '#FF3B5C' }]}>{errorMsg}</Text>
        )}

        <Pressable
          onPress={() => router.replace('/(onboarding)/signin')}
          hitSlop={8}
          style={styles.linkWrap}
        >
          <Text style={[styles.link, { color: t.accent }]}>Already verified? Sign in</Text>
        </Pressable>

        <Pressable onPress={() => router.back()} hitSlop={8} style={styles.linkWrap}>
          <Text style={[styles.link, { color: t.textMuted }]}>Wrong email? Go back</Text>
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
    fontSize: 30,
    letterSpacing: -0.6,
    textAlign: 'center',
    marginBottom: 12,
  },
  body: {
    fontFamily: 'Archivo_500Medium',
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 26,
    lineHeight: 22,
  },
  resendBtn: { width: '100%', height: 54 },
  error: {
    marginTop: 14,
    textAlign: 'center',
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 13,
  },
  linkWrap: { alignItems: 'center', marginTop: 18 },
  link: { fontFamily: 'Archivo_700Bold', fontSize: 14 },
});
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
npm test -- --watchAll=false src/__tests__/verifyPendingScreen.test.tsx
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(onboarding\)/verify-pending.tsx src/__tests__/verifyPendingScreen.test.tsx
git commit -m "Add verify-pending screen with throttled resend"
```

---

## Task 14: Forgot-password screen

**Files:**
- Create: `src/app/(onboarding)/forgot-password.tsx`
- Create: `src/__tests__/forgotPasswordScreen.test.tsx`

- [ ] **Step 1: Write failing screen tests**

Create `src/__tests__/forgotPasswordScreen.test.tsx`:

```tsx
import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const mockSendReset = jest.fn();
const mockReplace = jest.fn();
let searchParams: Record<string, string> = {};

jest.mock('@/lib/auth/email', () => ({
  __esModule: true,
  sendPasswordReset: (...args: unknown[]) => mockSendReset(...args),
}));

jest.mock('expo-router', () => ({
  __esModule: true,
  router: { replace: (p: string) => mockReplace(p) },
  useLocalSearchParams: () => searchParams,
}));

jest.mock('@/store/themeStore', () => ({
  __esModule: true,
  useThemeStore: () => ({ paletteKey: 'classic', dark: true }),
}));

import ForgotPassword from '@/app/(onboarding)/forgot-password';

describe('ForgotPassword screen', () => {
  beforeEach(() => {
    mockSendReset.mockReset();
    mockReplace.mockReset();
    searchParams = {};
  });

  it('shows inline error for invalid email', () => {
    const { getByPlaceholderText, getByText, queryByText } = render(<ForgotPassword />);
    fireEvent.changeText(getByPlaceholderText('Email address'), 'not-an-email');
    fireEvent.press(getByText('Send reset link'));
    expect(queryByText(/valid email/i)).toBeTruthy();
    expect(mockSendReset).not.toHaveBeenCalled();
  });

  it('always shows the success state after submit', async () => {
    mockSendReset.mockResolvedValueOnce({ ok: true });
    const { getByPlaceholderText, getByText, findByText } = render(<ForgotPassword />);
    fireEvent.changeText(getByPlaceholderText('Email address'), 'ada@example.com');
    fireEvent.press(getByText('Send reset link'));
    await findByText(/we've sent a reset link/i);
    expect(mockSendReset).toHaveBeenCalledWith('ada@example.com');
  });

  it('Back to sign in goes to signin', async () => {
    mockSendReset.mockResolvedValueOnce({ ok: true });
    const { getByPlaceholderText, getByText, findByText } = render(<ForgotPassword />);
    fireEvent.changeText(getByPlaceholderText('Email address'), 'ada@example.com');
    fireEvent.press(getByText('Send reset link'));
    await findByText(/we've sent a reset link/i);
    fireEvent.press(getByText('Back to sign in'));
    expect(mockReplace).toHaveBeenCalledWith('/(onboarding)/signin');
  });

  it('renders expired banner when ?expired=1 is set', () => {
    searchParams = { expired: '1' };
    const { getByText } = render(<ForgotPassword />);
    expect(getByText('That reset link has expired — request a new one.')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
npm test -- --watchAll=false src/__tests__/forgotPasswordScreen.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the screen**

Create `src/app/(onboarding)/forgot-password.tsx`:

```tsx
import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useThemeStore } from '@/store/themeStore';
import { getTheme } from '@/constants/theme';
import { GafferLogo } from '@/components/ui/GafferLogo';
import { PillBtn } from '@/components/ui/PillBtn';
import { Field } from '@/components/forms/Field';
import { emailSchema } from '@/lib/auth/validation';
import { sendPasswordReset } from '@/lib/auth/email';

export default function ForgotPassword() {
  const { paletteKey, dark } = useThemeStore();
  const t = getTheme(paletteKey, dark);
  const params = useLocalSearchParams<{ expired?: string }>();

  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [sentEmail, setSentEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async () => {
    if (submitting) return;
    setEmailError(null);
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      setEmailError('Enter a valid email');
      return;
    }
    setSubmitting(true);
    try {
      await sendPasswordReset(parsed.data);
      setSentEmail(parsed.data);
      setSent(true);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: t.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.logoWrap}>
          <GafferLogo size={46} light={dark} variant="wordmark" />
        </View>

        {sent ? (
          <>
            <Text style={[styles.title, { color: t.text }]}>Check your inbox</Text>
            <Text style={[styles.body, { color: t.textMuted }]}>
              If an account exists for <Text style={{ color: t.text }}>{sentEmail}</Text>, we've
              sent a reset link. Check your inbox.
            </Text>
            <PillBtn
              variant="accent"
              onPress={() => router.replace('/(onboarding)/signin')}
              accentInk={t.accentInk}
              style={styles.submitBtn}
            >
              Back to sign in
            </PillBtn>
          </>
        ) : (
          <>
            <Text style={[styles.title, { color: t.text }]}>Reset your password</Text>
            <Text style={[styles.body, { color: t.textMuted }]}>
              Enter your email and we'll send a link to set a new password.
            </Text>

            {params.expired === '1' && (
              <Text style={[styles.banner, { color: t.textMuted }]}>
                That reset link has expired — request a new one.
              </Text>
            )}

            <Field
              icon="mail"
              placeholder="Email address"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoComplete="email"
              surfaceAlt={t.surfaceAlt}
              line={t.line}
              accent={t.accent}
              text={t.text}
              textMuted={t.textMuted}
            />
            {emailError && (
              <Text style={[styles.fieldError, { color: '#FF3B5C' }]}>{emailError}</Text>
            )}

            <PillBtn
              variant="accent"
              onPress={onSubmit}
              accentInk={t.accentInk}
              style={styles.submitBtn}
            >
              {submitting ? 'Sending…' : 'Send reset link'}
            </PillBtn>
          </>
        )}
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
    marginBottom: 12,
  },
  body: {
    fontFamily: 'Archivo_500Medium',
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 22,
    lineHeight: 22,
  },
  banner: {
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 14,
  },
  fieldError: {
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 12.5,
    marginTop: 6,
    marginLeft: 4,
  },
  submitBtn: { width: '100%', height: 54, marginTop: 18 },
});
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
npm test -- --watchAll=false src/__tests__/forgotPasswordScreen.test.tsx
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(onboarding\)/forgot-password.tsx src/__tests__/forgotPasswordScreen.test.tsx
git commit -m "Add forgot-password screen with always-success state"
```

---

## Task 15: Reset-password screen

**Files:**
- Create: `src/app/(onboarding)/reset-password.tsx`
- Create: `src/__tests__/resetPasswordScreen.test.tsx`

- [ ] **Step 1: Write failing screen tests**

Create `src/__tests__/resetPasswordScreen.test.tsx`:

```tsx
import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const mockReset = jest.fn();
const mockReplace = jest.fn();
let mockSession: { user: { id: string } } | null = { user: { id: 'u1' } };

jest.mock('@/lib/auth/email', () => ({
  __esModule: true,
  resetPassword: (...args: unknown[]) => mockReset(...args),
}));

jest.mock('expo-router', () => ({
  __esModule: true,
  router: { replace: (p: string) => mockReplace(p) },
}));

jest.mock('@/store/authStore', () => ({
  __esModule: true,
  useAuthStore: (selector: (s: { session: unknown }) => unknown) =>
    selector({ session: mockSession }),
}));

jest.mock('@/store/themeStore', () => ({
  __esModule: true,
  useThemeStore: () => ({ paletteKey: 'classic', dark: true }),
}));

import ResetPassword from '@/app/(onboarding)/reset-password';

describe('ResetPassword screen', () => {
  beforeEach(() => {
    mockReset.mockReset();
    mockReplace.mockReset();
    mockSession = { user: { id: 'u1' } };
  });

  it('shows expired-link message when there is no session', () => {
    mockSession = null;
    const { getByText } = render(<ResetPassword />);
    expect(getByText(/open the link from your email/i)).toBeTruthy();
    fireEvent.press(getByText('Back to sign in'));
    expect(mockReplace).toHaveBeenCalledWith('/(onboarding)/signin');
  });

  it('rejects weak password inline', () => {
    const { getByPlaceholderText, getByText, queryByText } = render(<ResetPassword />);
    fireEvent.changeText(getByPlaceholderText('New password'), 'short');
    fireEvent.changeText(getByPlaceholderText('Confirm password'), 'short');
    fireEvent.press(getByText('Update password'));
    expect(queryByText('At least 8 characters')).toBeTruthy();
    expect(mockReset).not.toHaveBeenCalled();
  });

  it('calls resetPassword on valid submit', async () => {
    mockReset.mockResolvedValueOnce({ ok: true });
    const { getByPlaceholderText, getByText } = render(<ResetPassword />);
    fireEvent.changeText(getByPlaceholderText('New password'), 'NewStrong1');
    fireEvent.changeText(getByPlaceholderText('Confirm password'), 'NewStrong1');
    fireEvent.press(getByText('Update password'));
    await waitFor(() => expect(mockReset).toHaveBeenCalledWith('NewStrong1'));
  });

  it('shows expired_link error from reset call', async () => {
    mockReset.mockResolvedValueOnce({ ok: false, error: 'expired_link' });
    const { getByPlaceholderText, getByText, findByText } = render(<ResetPassword />);
    fireEvent.changeText(getByPlaceholderText('New password'), 'NewStrong1');
    fireEvent.changeText(getByPlaceholderText('Confirm password'), 'NewStrong1');
    fireEvent.press(getByText('Update password'));
    await findByText(/link has expired/i);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
npm test -- --watchAll=false src/__tests__/resetPasswordScreen.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the screen**

Create `src/app/(onboarding)/reset-password.tsx`:

```tsx
import React, { useState } from 'react';
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
import { getTheme } from '@/constants/theme';
import { GafferLogo } from '@/components/ui/GafferLogo';
import { PillBtn } from '@/components/ui/PillBtn';
import { Field } from '@/components/forms/Field';
import { resetPasswordSchema } from '@/lib/auth/validation';
import { resetPassword } from '@/lib/auth/email';

type FieldErrors = Partial<Record<'password' | 'confirmPassword' | 'form', string>>;

export default function ResetPassword() {
  const { paletteKey, dark } = useThemeStore();
  const t = getTheme(paletteKey, dark);
  const session = useAuthStore((s) => s.session);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);

  if (!session) {
    return (
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.bg }}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.logoWrap}>
            <GafferLogo size={46} light={dark} variant="wordmark" />
          </View>
          <Text style={[styles.title, { color: t.text }]}>Link expired</Text>
          <Text style={[styles.body, { color: t.textMuted }]}>
            Open the link from your email to reset your password.
          </Text>
          <PillBtn
            variant="accent"
            onPress={() => router.replace('/(onboarding)/signin')}
            accentInk={t.accentInk}
            style={styles.submitBtn}
          >
            Back to sign in
          </PillBtn>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  const onSubmit = async () => {
    if (submitting) return;
    setErrors({});
    const parsed = resetPasswordSchema.safeParse({ password, confirmPassword });
    if (!parsed.success) {
      const map: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof FieldErrors;
        if (!map[key]) map[key] = issue.message;
      }
      setErrors(map);
      return;
    }

    setSubmitting(true);
    try {
      const r = await resetPassword(parsed.data.password);
      if (r.ok) {
        // (onboarding)/_layout will redirect now that session exists with the new password.
        return;
      }
      if (r.error === 'weak_password') {
        setErrors({ password: 'Please choose a stronger password' });
      } else if (r.error === 'expired_link') {
        setErrors({ form: 'This reset link has expired — request a new one' });
      } else {
        setErrors({ form: 'Something went wrong. Please try again' });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: t.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.logoWrap}>
          <GafferLogo size={46} light={dark} variant="wordmark" />
        </View>

        <Text style={[styles.title, { color: t.text }]}>Set a new password</Text>
        <Text style={[styles.body, { color: t.textMuted }]}>
          Other devices will be signed out after you update your password.
        </Text>

        <View style={{ gap: 11 }}>
          <Field
            icon="lock"
            placeholder="New password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="password"
            surfaceAlt={t.surfaceAlt}
            line={t.line}
            accent={t.accent}
            text={t.text}
            textMuted={t.textMuted}
          />
          {errors.password && (
            <Text style={[styles.fieldError, { color: '#FF3B5C' }]}>{errors.password}</Text>
          )}
          <Field
            icon="lock"
            placeholder="Confirm password"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            autoComplete="password"
            surfaceAlt={t.surfaceAlt}
            line={t.line}
            accent={t.accent}
            text={t.text}
            textMuted={t.textMuted}
          />
          {errors.confirmPassword && (
            <Text style={[styles.fieldError, { color: '#FF3B5C' }]}>{errors.confirmPassword}</Text>
          )}
        </View>

        {errors.form && (
          <Text style={[styles.formError, { color: '#FF3B5C' }]}>{errors.form}</Text>
        )}

        <PillBtn
          variant="accent"
          onPress={onSubmit}
          accentInk={t.accentInk}
          style={styles.submitBtn}
        >
          {submitting ? 'Updating…' : 'Update password'}
        </PillBtn>
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
    marginBottom: 12,
  },
  body: {
    fontFamily: 'Archivo_500Medium',
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 22,
    lineHeight: 22,
  },
  fieldError: {
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 12.5,
    marginTop: -4,
    marginLeft: 4,
  },
  formError: {
    fontFamily: 'Archivo_600SemiBold',
    fontSize: 13,
    marginTop: 14,
    textAlign: 'center',
  },
  submitBtn: { width: '100%', height: 54, marginTop: 22 },
});
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
npm test -- --watchAll=false src/__tests__/resetPasswordScreen.test.tsx
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(onboarding\)/reset-password.tsx src/__tests__/resetPasswordScreen.test.tsx
git commit -m "Add reset-password screen reached via deep link"
```

---

## Task 16: Runtime docs (`docs/auth-email-password.md`)

**Files:**
- Create: `docs/auth-email-password.md`

No tests for docs.

- [ ] **Step 1: Write the doc**

Create `docs/auth-email-password.md`:

```markdown
# Email/Password Auth

Implements [#15](https://github.com/vigneshashokan/fpl-gaffer-react-native-app/issues/15), [#16](https://github.com/vigneshashokan/fpl-gaffer-react-native-app/issues/16), [#17](https://github.com/vigneshashokan/fpl-gaffer-react-native-app/issues/17). Spec: `docs/superpowers/specs/2026-06-08-auth-email-password-design.md`.

## How it works at runtime

### Sign in

```
User enters email + password on /(onboarding)/signin → taps "Sign in"
  ↓
signInWithEmail() in src/lib/auth/email.ts
  ↓
supabase.auth.signInWithPassword({ email, password })
  ↓ on success: session lands → onAuthStateChange → useAuthStore updates
  ↓ (onboarding)/_layout routes to /(home) or /(onboarding)/complete-profile
  ↓ on email_not_confirmed: route to /(onboarding)/verify-pending?email=…
```

### Sign up

```
User fills sign-up form on /(onboarding)/signup → taps "Create account"
  ↓
signUpWithEmail() in src/lib/auth/email.ts
  ↓
supabase.auth.signUp({ email, password, options: {
  data: { given_name, family_name },
  emailRedirectTo: 'fplgafferreactnativeapp://verify',
} })
  ↓
router.replace('/(onboarding)/verify-pending?email=…')
  ↓ user opens email, taps link
  ↓ link → Supabase verify endpoint → redirect to fplgafferreactnativeapp://verify?code=…
  ↓
useEmailAuthDeepLinks (in src/app/_layout.tsx) catches the URL
  ↓
supabase.auth.exchangeCodeForSession(url) → session lands
  ↓ (onboarding)/_layout routes to /(onboarding)/complete-profile
  ↓ complete-profile reads user_metadata.given_name / family_name and prefills
  ↓ user picks DOB → /(home)
```

### Forgot / reset password

```
User taps "Forgot password?" → /(onboarding)/forgot-password
  ↓ enters email → sendPasswordReset()
  ↓
supabase.auth.resetPasswordForEmail(email, {
  redirectTo: 'fplgafferreactnativeapp://reset-password',
})
  ↓ always shows success state (no enumeration)
  ↓ user opens email, taps link
  ↓ link → fplgafferreactnativeapp://reset-password?code=…
  ↓
useEmailAuthDeepLinks catches the URL → exchangeCodeForSession → router.replace('/(onboarding)/reset-password')
  ↓ user enters new password → resetPassword()
  ↓
supabase.auth.updateUser({ password })
supabase.auth.signOut({ scope: 'others' })   ← invalidates other devices
  ↓ (onboarding)/_layout routes home
```

## Manual setup (one-time per Supabase project)

Same pattern as Google sign-in's manual setup. Required before the flow works end-to-end.

1. **Supabase Dashboard → Authentication → URL Configuration → Redirect URLs:**
   add `fplgafferreactnativeapp://verify` and `fplgafferreactnativeapp://reset-password`
   (alongside the wildcard added during sub-project C).
2. **Authentication → Providers → Email:** confirm "Confirm email" is **on**.
3. **Authentication → Rate Limits:** defaults are acceptable for Phase 1 (5 sign-in attempts /
   15 min per IP, conservative email send caps). Adjust before public launch.
4. **Authentication → Email Templates:** customise "Confirm signup" and "Reset password" to use
   the app's name and brand. Defaults work for dev.

## Files

- `src/lib/auth/email.ts` — wrappers for signInWithEmail, signUpWithEmail, sendPasswordReset,
  resetPassword, resendVerification. Normalises Supabase errors into `AuthErrorKind`.
- `src/lib/auth/deepLink.ts` — `parseAuthDeepLink` + `useEmailAuthDeepLinks` hook (called from
  `src/app/_layout.tsx`).
- `src/lib/auth/validation.ts` — zod schemas for email / password / signup / reset.
- `src/app/(onboarding)/signup.tsx` — sign-up screen.
- `src/app/(onboarding)/verify-pending.tsx` — post-signup "Check your inbox" screen + Resend
  (30 s throttle).
- `src/app/(onboarding)/forgot-password.tsx` — request reset; always shows success state.
- `src/app/(onboarding)/reset-password.tsx` — new-password form reached via deep link.

## Troubleshooting

**Sign-up succeeds but the verify email never arrives**
- Check Supabase Dashboard → Auth → Logs → Emails for sent attempts.
- Check the Supabase project's email rate-limit isn't tripped.

**Verify link opens but stays on signin (or shows "Verification link expired")**
- Confirm `fplgafferreactnativeapp://verify` is in the Redirect URLs allow list.
- The link is one-time-use — opening it twice fails the second time.

**Reset link doesn't open the app**
- Confirm `fplgafferreactnativeapp://reset-password` is in the Redirect URLs allow list.
- Confirm `app.config.ts` still has `scheme: 'fplgafferreactnativeapp'` (unchanged since #10).

**"Invalid login credentials" on a freshly verified account**
- The session from the verify link IS the sign-in. The user shouldn't need to re-enter the
  password — routing should land them in the app. If they do see signin, the verify deep link
  didn't reach `useEmailAuthDeepLinks` (root layout). Confirm the hook is wired.

## Future work

- **Resend rate-limit display:** show the actual server-side cooldown rather than a fixed
  client-side 30 s. Supabase returns the retry-after header but our wrapper doesn't surface it
  yet.
- **Email-change flow:** the current spec only covers sign-up and reset. Changing the address
  on an existing account is a Phase 2 ticket.
- **Server-side audit log:** track failed-login bursts for the security event view (Phase 5).
```

- [ ] **Step 2: Commit**

```bash
git add docs/auth-email-password.md
git commit -m "Document email/password auth runtime + manual setup"
```

---

## Final verification

After all 16 tasks are committed:

- [ ] **Run the full suite**

```bash
npm test -- --watchAll=false
```

Expected: all green; new test count = 7 new files of tests (validation, email, deepLink, signin, signup, verifyPending, forgotPassword, resetPassword) added to the existing suite.

- [ ] **Manual smoke test (against the linked Supabase project, iOS sim)**

Follow the Manual test plan section of the spec (`docs/superpowers/specs/2026-06-08-auth-email-password-design.md`). The plan covers: fresh signup → verify email → home; sign-in; wrong password; duplicate signup (no enumeration); forgot password; reset password; expired-link banner.

- [ ] **Open a PR** that references the three issues in the description:

```
Closes #15
Closes #16
Closes #17
```

---

## Self-review notes

- Spec coverage: every error-handling row in the spec's Error Handling Matrix is exercised in either the wrapper tests (Tasks 3–7) or the screen tests (Tasks 11–15).
- The single-source-of-truth `jest.mock('@/lib/supabase', …)` block in `src/__tests__/auth/email.test.ts` needs to grow over Tasks 3–7. Tasks 4–7 each instruct the engineer to extend that block rather than declare a new mock (which would cause hoisting issues with jest).
- The `complete-profile` screen is untouched because `signUpWithEmail` writes the same `given_name`/`family_name` keys it already reads. If a future Supabase SDK change moves identity data out of `user_metadata` to a different shape, both Google and email flows would need to be updated together — but that's outside this scope.
