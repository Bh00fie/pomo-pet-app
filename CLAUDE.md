# Project Context

## Status: PLANNING ONLY — no code has been written yet

This repo currently contains planning documents only. Do not scaffold the Expo project or write
app code until the user explicitly says to start building — see `docs/PLAN.md` for the agreed
sequence.

## What this is

An iOS Pomodoro timer app where completed focus sessions earn the user "fish" that grow and merge
into bigger fish, building a personal zoo/aquarium. Leaving a session early penalizes the pet
(Forest-style accountability). Monetized via IAP species/biome unlocks.

App name is a placeholder ("Pomo Pet") — rename throughout once a real name is chosen.

## Key docs

- `docs/MVP.md` — what's actually in scope for v1, and the definition of done
- `docs/PLAN.md` — step-by-step build sequence, from account setup to App Store launch
- `docs/FUTURE_FEATURES.md` — everything else discussed (leaderboards, Health integration, Watch
  app, alternate app ideas) — parked until after MVP ships

## Decided constraints

- iOS only for v1 (Android later is easy via Expo if it comes to that)
- React Native + Expo, EAS Build/Submit — no native Xcode GUI workflow needed for builds
- No custom backend for MVP — Game Center (free, built-in) covers leaderboards later instead of
  building a server
- Local-only data persistence for MVP

## Tooling reference

https://github.com/rohitg00/awesome-claude-code-toolkit — curated list of Claude Code
plugins/agents/skills. Relevant entries for when implementation starts: a React Native Dev plugin,
a Mobile Developer agent, and a Mobile Development skill. Not installed yet — revisit when
`docs/PLAN.md` step 1 (local dev environment) begins.
