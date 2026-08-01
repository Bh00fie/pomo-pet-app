# MVP Definition

> App name is a placeholder ("Pomo Pet") until a real name is picked. Update everywhere once decided.

## Concept

A Pomodoro timer where completed focus sessions earn the user "fish" that grow and can be merged
into bigger fish, building a personal zoo/aquarium over time. Leaving the app mid-session harms
the pet (Forest-style accountability), which is the core retention hook.

## Platform & Stack

- iOS only for MVP (Apple Developer account + Mac already available)
- React Native + Expo (EAS Build/Submit for iOS packaging and store upload)
- No custom backend — all state stored locally on-device

## MVP Feature Set (in scope)

1. **Pomodoro timer** — start/pause/reset, customizable work and break lengths
2. **One starter pet species** (e.g. a single fish type) with a few growth stages
3. **Session → reward loop** — completing a full session earns currency toward pet growth/new fish
4. **Merge mechanic** — combine N small fish into 1 bigger fish
5. **Leave-early penalty** — exiting the app mid-session sets the pet back (accountability hook)
6. **Streaks** — consecutive days with at least one completed session
7. **Basic local stats** — today's total focus time, current streak, all-time total
8. **Monetization: IAP species unlock** — free app ships with one species; additional species/biomes sold as one-time unlocks

## Explicitly Out of Scope for MVP

Everything else discussed lives in `FUTURE_FEATURES.md` — Game Center leaderboards, task tagging,
Apple Watch app, widgets, custom backend/regional leaderboards, Health integration, ambient sound,
social sharing, Android port.

## Definition of Done

- App builds and runs on a physical device via TestFlight
- A user can complete the full loop: start timer → finish session → earn fish → merge fish → see streak update
- Leaving early visibly penalizes the pet
- At least one IAP unlock is purchasable and tested in sandbox
- App Store Connect listing is complete (screenshots, description, privacy policy, age rating)
- App passes Apple review and is live on the App Store
