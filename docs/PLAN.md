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

## M0 — Scaffold, gated

- [ ] `npx create-expo-app` (TypeScript template), then pin `expo` to `~54.0.0`, `npx expo install --fix`
- [ ] Folder structure: `app/` (Expo Router routes only), `src/{config,features,store,anim,ui,theme}`
- [ ] Zustand + AsyncStorage `persist`, versioned schema/migration from commit one
- [ ] **Gate**: confirm the app opens in App Store Expo Go on your phone before continuing

## M1 — Timer engine

- [ ] Absolute-timestamp state machine (`endsAt`, not a decrementing counter — JS timers don't
      survive backgrounding)
- [ ] Local notification scheduled at `endsAt`, cancelled on pause/reset
- [ ] Demo: start a 25-min timer, background the app, return — time is correct, notification fires

## M2 — Pet/zoo core + tank rendering

- [ ] Data model: `Species`, `Stage`, `Fish { id, speciesId, stage, xp, bornAt, health }`
- [ ] Shared animation primitives first: single tank clock, particle burst, ripple/glow, motion
      tokens, reduce-motion hook (these get reused by every later animation)
- [ ] Procedural fish renderer (Skia) — body/tail/fin params, idle swim loop
- [ ] Session-complete → reward logic (XP/fish spawn)
- [ ] Demo: complete a session, a fish appears and swims; force-quit and reopen, it's still there

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
