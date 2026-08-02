# Pomo Pet (placeholder name)

A Pomodoro timer for iOS where completed focus sessions earn you "fish" that grow and merge into
bigger fish, building a personal zoo/aquarium over time. Leave a session early and your pet takes
the hit — that accountability loop (in the spirit of apps like Forest) is the core retention hook.

## Status

🏗 **M0 scaffolded.** The Expo app exists and builds; feature work (M1 timer engine onward) hasn't
started. See [`docs/PLAN.md`](docs/PLAN.md) for the milestone sequence and what's actually verified.

The one open M0 item is the on-device gate: opening the project in App Store Expo Go on a real
iPhone. Everything else (type-check, `expo-doctor`, iOS bundle export) passes.

## Running it

```sh
npm install
npx expo start   # scan the QR with App Store Expo Go (SDK 54)
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

## Explorations

`explore/3d-aquarium` is a parked spike (not merged, no PR) that tested whether the aquarium
should be real 3D, Forest-style, instead of the planned 2D Skia fish. It contains a working
`expo-gl` + `three` prototype with three purchasable tank shapes, and `docs/3D_AQUARIUM_REPORT.md`.

Short version: 3D works and does **not** cost Expo Go compatibility, but it is recommended for
deferral to v2 — a new fish species costs hours as a 2D parameter record and days as a rigged 3D
asset, and selling species is the business model. Revisit at the M6a gate.

[Browse the visual review →](https://claude.ai/code/artifact/50773e34-7db6-46ac-b803-6a5fb4dffe93)

## Monetization

IAP unlocks for additional pet species/biomes on top of a free base app with one starter species.
