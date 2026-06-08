# Persist Theme Store Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `useThemeStore` (paletteKey, dark, pitchStyle) survive cold starts by wrapping it in Zustand's `persist` middleware backed by AsyncStorage, and gate root-layout render on store hydration so no flash of default theme is visible.

**Architecture:** Three small surface changes — wrap the existing Zustand store factory in `persist(...)` with an AsyncStorage adapter and a `partialize` whitelist; extend the existing fonts-load gate in the root layout to also wait for `useThemeStore.persist.onFinishHydration`; add a file-scope AsyncStorage mock to the existing themeStore tests so persist's write-through doesn't error in jest.

**Tech Stack:** Zustand 5.0.14 (with `zustand/middleware` `persist` + `createJSONStorage`), `@react-native-async-storage/async-storage` 2.2.0, Expo Router root layout pattern, Jest + React Testing Library.

**Spec:** `docs/superpowers/specs/2026-06-07-persist-theme-store-design.md`

---

## File Structure

**Modified:**
- `src/store/themeStore.ts` — wrap `create(...)` in `persist(...)` middleware; whitelist persisted fields via `partialize`. Goes from ~22 lines to ~35.
- `src/app/_layout.tsx` — add `themeHydrated` state + `useEffect` subscribing to `useThemeStore.persist.onFinishHydration`; extend the fonts-load gate to require both signals; have the splash-hide effect wait for both.
- `src/__tests__/stores.test.ts` — add file-scope `jest.mock('@react-native-async-storage/async-storage', ...)` above the `describe` blocks. Existing test bodies stay unchanged.

**Created:** none.
**Deleted:** none.

---

## Pre-flight

- Branch `feat/persist-theme-store` should already be checked out (created at the start of brainstorming).
- Working tree has an unrelated stray modification at `src/components/ui/PointPill.tsx` (a linter touch from earlier sessions). DO NOT include it in any commit.

---

### Task 1: Add persist middleware to themeStore + AsyncStorage mock in tests

**Files:**
- Modify: `src/store/themeStore.ts`
- Modify: `src/__tests__/stores.test.ts`

- [ ] **Step 1: Confirm baseline test state**

Run: `npx jest src/__tests__/stores.test.ts 2>&1 | tail -8`
Expected: all tests in this file pass (3 in `themeStore` describe + 4 in `teamStore` describe = 7 total at time of writing — may have grown). Note the exact count; you'll re-check against it after each step.

Run: `npx jest 2>&1 | grep -E "^Tests:"`
Expected: a line like `Tests: N passed, N total`. Note `N` — this is your full-suite baseline.

- [ ] **Step 2: Add the AsyncStorage mock to `stores.test.ts`**

Open `src/__tests__/stores.test.ts`. Insert this block at the very top of the file, BEFORE the existing `import { act } from 'react';` line:

```ts
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(() => Promise.resolve(null)),
    setItem: jest.fn(() => Promise.resolve()),
    removeItem: jest.fn(() => Promise.resolve()),
  },
}));

```

(Note the blank line between the mock and the first import — keeps the file readable.)

- [ ] **Step 3: Confirm tests still pass with the mock alone (no-op so far)**

Run: `npx jest src/__tests__/stores.test.ts 2>&1 | tail -8`
Expected: same passing count as Step 1's baseline. The mock has nothing to mock yet because themeStore doesn't import AsyncStorage — but it's harmless and ready for Step 4.

- [ ] **Step 4: Wrap `useThemeStore` with `persist` middleware**

Overwrite `src/store/themeStore.ts` with EXACTLY this content:

```ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PaletteKey } from '@/constants/theme';

interface ThemeState {
  paletteKey: PaletteKey;
  dark: boolean;
  pitchStyle: 'realistic' | 'flat';
  setPaletteKey: (key: PaletteKey) => void;
  setDark: (dark: boolean) => void;
  setPitchStyle: (style: 'realistic' | 'flat') => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      paletteKey:    'classic',
      dark:          false,
      pitchStyle:    'realistic',
      setPaletteKey: (key)   => set({ paletteKey: key }),
      setDark:       (dark)  => set({ dark }),
      setPitchStyle: (style) => set({ pitchStyle: style }),
    }),
    {
      name: 'fpl-gaffer/theme',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        paletteKey: s.paletteKey,
        dark: s.dark,
        pitchStyle: s.pitchStyle,
      }),
    },
  ),
);
```

The `create<ThemeState>()(...)` double-call form is Zustand 5's TypeScript pattern for middleware composition — without the trailing `()` the inferred types lose access to the `persist` API (`useThemeStore.persist.hasHydrated()` etc.).

- [ ] **Step 5: Run jest + tsc**

Run: `npx jest src/__tests__/stores.test.ts 2>&1 | tail -8`
Expected: same passing count as Step 1's baseline. Each `setState({...})` call in `beforeEach` now triggers a persist write-through to AsyncStorage; the mock from Step 2 swallows it.

Run: `npx jest 2>&1 | grep -E "^Tests:"`
Expected: same `N passed, N total` as Step 1's full-suite baseline (no new tests, no regressions).

Run: `npx tsc --noEmit 2>&1 | tail -5`
Expected: no output (clean type-check).

- [ ] **Step 6: Commit**

Stage and commit ONLY the two modified files:

```bash
git add src/store/themeStore.ts src/__tests__/stores.test.ts
git commit -m "feat(theme): persist useThemeStore via AsyncStorage; mock storage in tests"
```

Verify the commit only contains these two files (NOT `src/components/ui/PointPill.tsx`):

```bash
git show --stat HEAD
```
Expected: 2 files changed.

---

### Task 2: Gate root layout on store hydration

**Files:**
- Modify: `src/app/_layout.tsx`

- [ ] **Step 1: Read the current `_layout.tsx`**

Run: `cat src/app/_layout.tsx`

The current file imports `useEffect` from `'react'`. It uses `useFonts(...)`, calls `SplashScreen.hideAsync()` in a `useEffect` when `fontsLoaded` becomes true, and gates render with `if (!fontsLoaded) return null;`.

You will:
- Add `useState` to the existing `react` import.
- Add an import for `useThemeStore`.
- Add `themeHydrated` state + a `useEffect` that subscribes to `useThemeStore.persist.onFinishHydration`.
- Change the splash-hide `useEffect` to fire only when BOTH `fontsLoaded` and `themeHydrated` are true.
- Change the early-return gate to require BOTH.

- [ ] **Step 2: Apply the changes**

Overwrite `src/app/_layout.tsx` with EXACTLY this content:

```ts
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  useFonts,
  Archivo_400Regular,
  Archivo_500Medium,
  Archivo_600SemiBold,
  Archivo_700Bold,
  Archivo_800ExtraBold,
  Archivo_900Black,
} from '@expo-google-fonts/archivo';
import {
  JetBrainsMono_500Medium,
  JetBrainsMono_600SemiBold,
  JetBrainsMono_700Bold,
} from '@expo-google-fonts/jetbrains-mono';
import { useEffect, useState } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { useThemeStore } from '@/store/themeStore';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Archivo_400Regular,
    Archivo_500Medium,
    Archivo_600SemiBold,
    Archivo_700Bold,
    Archivo_800ExtraBold,
    Archivo_900Black,
    JetBrainsMono_500Medium,
    JetBrainsMono_600SemiBold,
    JetBrainsMono_700Bold,
  });

  const [themeHydrated, setThemeHydrated] = useState(useThemeStore.persist.hasHydrated());

  useEffect(() => {
    if (themeHydrated) return;
    return useThemeStore.persist.onFinishHydration(() => setThemeHydrated(true));
  }, [themeHydrated]);

  useEffect(() => {
    if (fontsLoaded && themeHydrated) SplashScreen.hideAsync();
  }, [fontsLoaded, themeHydrated]);

  if (!fontsLoaded || !themeHydrated) return null;

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }} />
    </SafeAreaProvider>
  );
}
```

What changed from the original:
- `useEffect` import now also includes `useState`.
- New import: `import { useThemeStore } from '@/store/themeStore';`.
- New: `const [themeHydrated, setThemeHydrated] = useState(useThemeStore.persist.hasHydrated());`
- New: `useEffect` that subscribes to `useThemeStore.persist.onFinishHydration` and unsubscribes via cleanup.
- The existing splash-hide `useEffect` now depends on both flags.
- The early return now requires both flags.

`useThemeStore.persist.hasHydrated()` is checked synchronously on mount — if hydration already finished (e.g. on a Fast Refresh in dev), we render immediately. The `onFinishHydration` listener handles the cold-start path; it returns an unsubscribe function which Reactunwraps as the effect's cleanup.

- [ ] **Step 3: Type-check + tests**

Run: `npx tsc --noEmit 2>&1 | tail -5`
Expected: no output (clean).

Run: `npx jest 2>&1 | grep -E "^Tests:"`
Expected: same passing count as Task 1 Step 5 — no new tests, no regressions.

- [ ] **Step 4: Commit**

```bash
git add src/app/_layout.tsx
git commit -m "feat(layout): wait for themeStore rehydration before rendering"
```

Verify only one file in the commit:

```bash
git show --stat HEAD
```
Expected: 1 file changed (`src/app/_layout.tsx`).

---

### Task 3: Push, open PR, merge, manual verification

**Files:** none (orchestration).

This task pushes the branch, opens the PR, and performs the three acceptance checks from the issue. Steps 5–7 are manual — the engineer (or the user) interacts with the app on a simulator/device.

- [ ] **Step 1: Push the branch**

```bash
git push -u origin feat/persist-theme-store
```

- [ ] **Step 2: Open the PR**

```bash
gh pr create --title "feat: persist theme/palette/pitchStyle via AsyncStorage (issue #12)" --body-file - <<'EOF'
## Summary
Implements [issue #12](https://github.com/vigneshashokan/fpl-gaffer-react-native-app/issues/12) — `useThemeStore` now survives cold starts via Zustand's `persist` middleware backed by AsyncStorage.

Three files touched: `themeStore.ts` (persist wrapper + partialize whitelist), `_layout.tsx` (gate render on both fonts and store hydration so no flash of default theme), `stores.test.ts` (file-scope AsyncStorage mock for the new write-through). No new dependencies — both async-storage and zustand were installed by earlier work.

## Acceptance criteria
- [x] Wrap `useThemeStore` with `persist` middleware.
- [x] Storage key: `fpl-gaffer/theme`.
- [x] Whitelist: `paletteKey`, `dark`, `pitchStyle` (via `partialize`).
- [x] Hydration loading state in root layout (don't render until rehydrated).

## Test plan (manual, post-merge)
- [ ] Open Settings → change palette → kill app → relaunch → palette is preserved.
- [ ] Open AccountMenu → toggle dark mode → kill → relaunch → dark mode preserved.
- [ ] Cold-start with a non-default theme stored → first visible frame already shows the correct theme (no flash).

Closes #12

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
```

- [ ] **Step 3: Merge the PR**

After the PR opens, review the diff in the GitHub UI once, then:

```bash
gh pr merge --squash --delete-branch
```

- [ ] **Step 4: Sync local main**

```bash
git checkout main
git pull --ff-only origin main
```

Issue #12 closes automatically via the `Closes #12` line in the PR body.

- [ ] **Step 5: Manual verify — palette persistence**

Run: `npm start`

In a simulator or device:
1. Open the app, navigate to Settings.
2. Pick a non-default palette (e.g. "Fantasy" or "Pitch") in the Appearance card.
3. Force-quit the app (swipe up on iOS, or stop the Metro process and kill the Expo Go app).
4. Relaunch the app.
5. Open Settings.

Expected: the palette you picked in step 2 is still selected. The whole app reflects that palette from the first frame.

- [ ] **Step 6: Manual verify — dark mode persistence**

Same flow as Step 5, but:
1. Open the AccountMenu (avatar in BrandHeader).
2. Toggle dark mode on.
3. Force-quit and relaunch.

Expected: dark mode is still on. App opens in dark mode from the first frame.

- [ ] **Step 7: Manual verify — no flash**

With a non-default theme already stored from Steps 5 or 6:
1. Force-quit the app.
2. Relaunch and watch the very first frame after the splash screen disappears.

Expected: the first non-splash frame is already rendered in the user's persisted theme. There should be no visible transition from "default classic light" to the user's stored theme.

If you see a flash, the hydration gate isn't working as expected — verify `themeHydrated` is being set correctly and that `if (!fontsLoaded || !themeHydrated) return null;` is in place.

---

## Acceptance Criteria Mapping

From issue #12, each AC mapped to its task:

| Criterion | Task |
|---|---|
| Wrap `useThemeStore` with `persist` middleware | Task 1 Step 4 |
| Storage key: `fpl-gaffer/theme` | Task 1 Step 4 (the `name` field) |
| Whitelist: `paletteKey`, `dark`, `pitchStyle` | Task 1 Step 4 (the `partialize` function) |
| Hydration loading state in root layout (don't render until rehydrated) | Task 2 Steps 1–2 |
| Changing palette in Settings → kill app → relaunch → palette is preserved | Task 3 Step 5 |
| Same for dark mode toggle from AccountMenu | Task 3 Step 6 |
| No flash of wrong theme on cold start | Task 3 Step 7 |

## Out of Scope (Each Has Its Own Issue or Deferral)

- Persisting other stores (`useTeamStore` etc.) — those hold ephemeral state by design.
- Wiring `dark` to system dark mode (`Appearance.getColorScheme()`).
- Migration / versioning of the persisted shape — add when the shape changes incompatibly.
- AsyncStorage encryption — theme prefs are non-sensitive.
