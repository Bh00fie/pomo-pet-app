# Step-by-Step Plan to Ship the MVP

Status legend: [ ] not started · [~] in progress · [x] done

Reordered from the original account-first sequence: everything through M6a is built and fully
demoed on your own phone via Expo Go for $0. The $99 Apple Developer Program only gets paid once
you've used the finished app and decided you like it — see the decision gate below.

## Platform lock-in (read before scaffolding)

- **Pin `expo` to `~54.0.0` and never upgrade during the free phase.** The App Store build of
  Expo Go only supports SDK 54; anything newer requires a paid-account dev build to even open.
  Verify `expo --version` resolves to 54.x immediately after scaffolding, and confirm the project
  opens in App Store Expo Go on your phone before writing any feature code (this is M0).
- Animation stack is **Reanimated 4 + Skia** (both ship inside Expo Go) — not Lottie or Rive
  (both require a paid-account dev client) and not Moti (incompatible with Reanimated 4 on SDK 54).
- IAP is built against a **mock entitlement provider** for the whole free phase — full shop/paywall
  UX, no real money, swapped for RevenueCat only after enrollment.

## M0 — Scaffold, gated  [~] built, awaiting the on-device gate

- [x] `npx create-expo-app` (TypeScript template), then pin `expo` to `~54.0.0`, `npx expo install --fix`
- [x] Folder structure: `app/` (Expo Router routes only), `src/{config,features,store,anim,ui,theme}`
- [x] Zustand + AsyncStorage `persist`, versioned schema/migration from commit one
      (`src/store/migrations.ts` — `SCHEMA_VERSION` + migration runner, wired into `persist`)
- [ ] **Gate**: confirm the app opens in App Store Expo Go on your phone before continuing

Verified on 2026-08-02, machine-checkable parts only:

- `node_modules/.bin/expo --version` → `54.0.26`, installed `expo` package → `54.0.36` (both 54.x)
- `npx tsc --noEmit` → clean
- `npx expo-doctor` → 18/18 checks passed
- `npx expo export --platform ios` → succeeds; Hermes bundle **3.81 MB**
  (this is the 2D baseline the 3D spike is measured against)

The remaining gate is the one thing that genuinely needs your phone: scan the QR from
`npx expo start` with App Store Expo Go and confirm the four tabs load. Nothing here can
verify that, so M0 stays `[~]` until you do.

Installed and pinned: `expo-router`, `react-native-reanimated` 4 (+ `react-native-worklets`
babel plugin), `@shopify/react-native-skia`, `zustand`, `@react-native-async-storage/async-storage`,
`expo-notifications`, `expo-haptics`, `react-native-gesture-handler`, `react-native-screens`,
`react-native-safe-area-context`.

## M1 — Timer engine  [~] built and unit-tested, awaiting the on-device demo

- [x] Absolute-timestamp state machine (`endsAt`, not a decrementing counter — JS timers don't
      survive backgrounding) — `src/features/timer/machine.ts`, a pure transition function with
      no React/RN/Expo imports, covering idle→running→paused→completed→abandoned
- [x] Start/pause/reset wired into the Focus screen (`useTimer.ts` + `useTimerStore.ts`), with an
      `AppState` listener that re-reads the wall clock on foreground
- [x] Customizable work/break lengths (MVP feature 1) — mode switch + `+/-` steppers on the Focus
      screen, clamped by `TIMER.minMinutes`/`maxMinutes`, persisted through the settings store
- [~] Local notification scheduled at `endsAt`, cancelled on pause/reset — written and unit-tested
      against a mocked `expo-notifications` (correct DATE trigger, correct cancellations), but
      **actual delivery cannot be verified without a device**, so this stays `[~]`
- [ ] Demo: start a 25-min timer, background the app, return — time is correct, notification fires

Verified on 2026-08-02, machine-checkable parts only:

- `npm test` → **72 tests, 5 suites, all passing** (`jest-expo` preset)
  - `machine.test.ts` (32) — every transition, the `endsAt`/`pausedRemainingMs` arithmetic
    including a 12-cycle pause/resume loop that must not drift a millisecond, completion exactly
    at the boundary, and expiry that happened entirely while backgrounded
  - `FocusScreen.test.tsx` (9) — the screen the user actually taps: Start really starts, the
    clock counts down, Pause holds it, Resume continues from the same remainder
  - plus `notifications` (13), `useTimerStore` (11) and `durations` (7)
- `npx tsc --noEmit` → clean
- `npx expo-doctor` → 18/18 checks passed
- `npx expo export --platform ios` → succeeds; Hermes bundle **4.02 MB** (3.81 MB at M0)

The remaining gate needs your phone: run a real session, lock/background the app, and confirm both
that the time is right on return and that the notification actually fires.

> **A 3D aquarium alternative was explored and is parked.** Prompted by Forest's 3D trees, the
> branch `explore/3d-aquarium` holds a working `expo-gl` + `three` + `react-three-fiber`
> prototype (three tank shapes, up to 40 fish) and the full write-up in
> `docs/3D_AQUARIUM_REPORT.md` (that file lives on the branch, not on `main`).
>
> Headline: **3D is feasible and does not break Expo Go** — `expo-gl` is a bundled Expo Go module
> on SDK 54, so the free M0–M6a plan survives. It is nonetheless **recommended for deferral to
> v2**, because a new fish species costs hours as a 2D parameter record and days as a modelled,
> rigged 3D asset — and selling species is the business model. Secondary costs: +44% JS bundle,
> animation moves from the UI thread to the JS thread, and `expo-gl` rides Apple's deprecated
> OpenGL ES while Skia is on Metal.
>
> **M2 below is unchanged.** Revisit the 3D option at the M6a decision gate.
> Browsable version: https://claude.ai/code/artifact/50773e34-7db6-46ac-b803-6a5fb4dffe93

## M2 — Pet/zoo core + tank rendering  [~] built and unit-tested, awaiting the on-device demo

- [x] Data model: `Species`, `Stage`, `Fish { id, speciesId, stage, xp, bornAt, health }` —
      `src/features/pet/model.ts`, pure TypeScript (no React/RN/Skia imports, same discipline as
      the timer machine). One starter species, Coral Tetra, with Fry/Juvenile/Elder parameter
      sets. `src/store/types.ts` re-exports `Fish` from here rather than keeping a second copy,
      so the persisted shape and the domain model cannot drift
- [x] Shared animation primitives first: single tank clock (`src/anim/useAquariumClock.ts`, one
      `useFrameCallback` per tank — per-fish work is threaded through its `onFrame`, never a
      driver per fish), particle burst, ripple/glow, motion tokens, reduce-motion hook.
      `Ripple`/`ParticleBurst` are built and exported but deliberately not wired into a screen
      yet — their consumers are the M3 merge sequence and the M4 penalty
- [~] Procedural fish renderer (Skia) — body/tail/dorsal/pectoral built from parametric paths
      (`src/features/pet/geometry.ts`, pure and unit-tested; growth stages are parameter sets
      through one builder, never separate assets), wander-toward-target steering as Reanimated
      worklets, all animated values reaching Skia through `useDerivedValue`. **Whether it
      actually looks like a fish swimming, and holds 60fps with several fish, is phone-only** —
      nothing here can verify it, so this stays `[~]`
- [x] Session-complete → reward logic (XP/fish spawn) — `src/features/pet/reward.ts` (pure) plus
      `useSessionReward`, mounted once at the app root so a session that finishes while the user
      is on another tab still awards. Awards once per distinct `endsAt`; break sessions award
      nothing
- [ ] Demo: complete a session, a fish appears and swims; force-quit and reopen, it's still there

Verified on 2026-08-02 by an independent review pass, machine-checkable parts only:

- `npm test` → **114 tests, 11 suites, all passing** (107 after the M2 build commit, plus 7
  migration tests added by the review pass)
  - `model.test.ts`, `reward.test.ts`, `geometry.test.ts`, `color.test.ts` — the pure domain:
    XP clamping at the stage cap, spawn-vs-grow selection, geometry scaling across stages
  - `useAppStore.test.ts` — the store wiring actually spawns/grows through `applySessionReward`
  - `migrations.test.ts` — the v1→v2 entitlements migration described below
- `npx tsc --noEmit` → clean
- `npx expo-doctor` → 18/18 checks passed
- `npx expo export --platform ios` → succeeds; Hermes bundle **4.67 MB** (4.02 MB at M1)

Reviewed and confirmed: one shared clock (only one `useFrameCallback` in the codebase), no
`useState` anywhere in a per-frame path (`Tank.tsx`'s only `useState` is the `onLayout` tank
size), fish steering state held in Reanimated mutables outside React, and `useSessionReward`
mounted exactly once so it cannot double-award.

Fixed by the review pass: M2 corrected the `entitlements.unlockedSpeciesIds` **default** from the
dead literal `'starter'` to the real starter species id but left `SCHEMA_VERSION` at 1. Because
`persist` merges stored state over the initial state, any device that had already written v1
state would have kept the dead id forever. `SCHEMA_VERSION` is now 2 with a real 1→2 migration.

The remaining gate needs your phone: finish a session, watch a fish appear and swim in the
Aquarium tab, then force-quit and reopen to confirm it is still there.

> **Open question for M3 — how does a user ever get a *second* fish?** Today a session spawns a
> fish only when the collection is empty, and otherwise grows the existing one; `fishPerMerge` is
> 3, so the merge mechanic (MVP feature 4) is currently unreachable. M3 has to decide the spawn
> cadence — every session, every capped fish, every N sessions — and that is a game-feel call,
> not a code fix. See CLAUDE.md.

## M3 — Growth + merge

- [ ] Sessions grow a fish's XP *within* its current stage; merging N same-stage fish is the only
      way to *cross* a stage boundary (resolves the growth-vs-merge scope ambiguity from `MVP.md`)
- [ ] Merge selection, gather/converge/burst/reveal animation sequence
- [ ] Demo: earn several fish, merge them, watch the full sequence

## M4 — Accountability + streaks

- [ ] `AppState` listener with a grace period (~5-10s) before penalizing — never penalize on
      `inactive` (Control Center, notification shade, phone call), only sustained `background`
- [ ] Penalty forfeits in-progress growth and marks the fish `sick` (desaturated, recovers on next
      completed session) — **never deletes a fish**
- [ ] Daily streak tracking, local-date based, unit-tested against DST/timezone edge cases
- [ ] Demo: leave mid-session, see the pet react; complete days, see the streak fire

## M5 — Stats, settings, polish

- [ ] Stats screen: today's focus time, current streak, all-time total, weekly bars
- [ ] Onboarding flow, settings, reduce-motion respected everywhere
- [ ] Visual polish pass across all screens

## M6a — Shop UX against the mock provider (free)

- [ ] `EntitlementProvider` interface + `MockEntitlementProvider` behind a dev-menu toggle
- [ ] Full paywall, locked-species presentation, unlock animation, restore-purchases flow —
      demoable end to end with zero real money spent
- [ ] **Decision gate: this is the checkpoint to decide whether the app is worth the $99.**
      Everything through here required no Apple Developer account and no Xcode.

---

## Only past this point does anything cost money

## M6b — Real IAP

- [ ] Enroll in the Apple Developer Program ($99/yr), accept agreements in App Store Connect
- [ ] Install full Xcode from the Mac App Store (not Command Line Tools — needed from here on)
- [ ] `expo prebuild` / custom dev client (leaving Expo Go is expected at this stage)
- [ ] Swap `MockEntitlementProvider` for `RevenueCatEntitlementProvider`, configure products in
      App Store Connect, test in sandbox

## M7 — Store readiness, submission, launch

- [ ] App Store Connect listing: screenshots, description, keywords, privacy policy, age rating
- [ ] EAS Build → TestFlight internal testing, fix issues found
- [ ] Submit for App Store review, respond to any rejection feedback
- [ ] Launch — monitor crash reports and reviews, decide which `FUTURE_FEATURES.md` item to
      tackle next based on real usage
