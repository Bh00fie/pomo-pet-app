# Pomo Pet (placeholder name)

A Pomodoro timer for iOS where completed focus sessions earn you "fish" that grow and merge into
bigger fish, building a personal zoo/aquarium over time. Leave a session early and your pet takes
the hit — that accountability loop (in the spirit of apps like Forest) is the core retention hook.

## Status

🏗 **M3 built — the core loop is closed: focus, earn a fish, grow it, merge it.** Start/pause/
resume/reset run off an absolute-timestamp state machine (`endsAt`, never a decrementing counter),
with customizable work/break lengths and a local notification scheduled for the end of the
session. Finishing a focus session grows a fish, drawn procedurally in Skia — body, tail and fins
are parametric paths, so the three growth stages are parameter sets rather than separate assets —
and the whole tank animates off a single shared frame clock. Once every fish is capped, the next
session hatches a new one; tap three of the same stage and merge them into one of the next stage,
with a converge → burst → spring-reveal sequence. See [`docs/PLAN.md`](docs/PLAN.md) for the
milestone sequence and what's actually verified.

Open items all need a real iPhone: the M0 gate (the project opens in App Store Expo Go), the M1
gate (the end-of-session notification genuinely fires), the M2 gate (the tank looks right and
stays smooth with several fish) and the M3 gate (the merge sequence reads as satisfying).
Everything machine-checkable — 135 unit tests, type-check, `expo-doctor`, iOS bundle export —
passes.

## Running it

```sh
npm install
npx expo start   # scan the QR with App Store Expo Go (SDK 54)
npm test         # jest-expo — timer engine, pet/reward domain, store migrations, screen tests
npm run typecheck
npm run doctor
```

## Tech stack

- React Native + Expo, **pinned to SDK ~54** — the newest SDK the App Store build of Expo Go
  supports, which is what keeps the whole MVP free to build and test. Do not upgrade.
- Expo Router for navigation; `app/` holds routes only, all real code lives in `src/`
- Reanimated 4 + Skia for animation (both ship inside Expo Go — not Lottie/Rive/Moti)
- Zustand + AsyncStorage with a versioned schema and migration runner from commit one
- iOS only for v1 (Android is an easy add later via Expo if it comes to that)
- No custom backend for the MVP — all state is local on-device
- Shipped via EAS Build / EAS Submit, but only after the M6a decision gate

## Layout

```
app/                 Expo Router routes — thin re-exports only
src/config/          tunable constants (timer lengths, growth curve, grace periods)
src/features/        timer, aquarium, stats, shop — one folder per feature
src/store/           Zustand store, persisted slice, schema version + migrations
src/anim/            motion tokens, reduce-motion hook, shared animation primitives
src/ui/              Screen / Text / Button / Card primitives
src/theme/           colors, spacing, typography tokens
```

## Docs

- [`docs/MVP.md`](docs/MVP.md) — what's actually in scope for v1, and the definition of done
- [`docs/PLAN.md`](docs/PLAN.md) — step-by-step build sequence, from Apple Developer account setup
  through TestFlight to App Store launch
- [`docs/FUTURE_FEATURES.md`](docs/FUTURE_FEATURES.md) — everything else discussed (leaderboards,
  Apple Health integration, Watch app, alternate app concepts) — parked until after MVP ships
- [`CLAUDE.md`](CLAUDE.md) — context file for AI-assisted development on this repo

## Design references

- [Full 2D MVP concept gallery](https://claude.ai/code/artifact/c92d02ea-29b5-4fbe-aa8c-45d6acc39761)
  — growth stages, the merge mechanic, the animated aquarium, and all 5 screens
- [3D vs 2D tank comparison](https://claude.ai/code/artifact/50773e34-7db6-46ac-b803-6a5fb4dffe93)
  — the 3 tank shapes rendered live, plus screens restyled from the real `src/theme/` tokens

## Explorations

`explore/3d-aquarium` is a parked spike (not merged, no PR) that tested whether the aquarium
should be real 3D, Forest-style, instead of the planned 2D Skia fish. It contains a working
`expo-gl` + `three` prototype with three purchasable tank shapes, and `docs/3D_AQUARIUM_REPORT.md`.

Short version: 3D works and does **not** cost Expo Go compatibility, but it is recommended for
deferral to v2 — a new fish species costs hours as a 2D parameter record and days as a rigged 3D
asset, and selling species is the business model. Revisit at the M6a gate.

## Monetization

IAP unlocks for additional pet species/biomes on top of a free base app with one starter species.
