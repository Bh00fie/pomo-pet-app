# Pomo Pet (placeholder name)

A Pomodoro timer for iOS where completed focus sessions earn you "fish" that grow and merge into
bigger fish, building a personal zoo/aquarium over time. Leave a session early and your pet takes
the hit — that accountability loop (in the spirit of apps like Forest) is the core retention hook.

## Status

📋 **Planning phase — no application code yet.** This repo currently holds planning docs only.
See `CLAUDE.md` for the standing instruction not to scaffold code until the plan below is acted on.

## Tech stack (planned)

- React Native + Expo, built/shipped via EAS Build and EAS Submit
- iOS only for v1 (Android is an easy add later via Expo if it comes to that)
- No custom backend for the MVP — all state is local on-device

## Docs

- [`docs/MVP.md`](docs/MVP.md) — what's actually in scope for v1, and the definition of done
- [`docs/PLAN.md`](docs/PLAN.md) — step-by-step build sequence, from Apple Developer account setup
  through TestFlight to App Store launch
- [`docs/FUTURE_FEATURES.md`](docs/FUTURE_FEATURES.md) — everything else discussed (leaderboards,
  Apple Health integration, Watch app, alternate app concepts) — parked until after MVP ships
- [`CLAUDE.md`](CLAUDE.md) — context file for AI-assisted development on this repo

## Monetization

IAP unlocks for additional pet species/biomes on top of a free base app with one starter species.
