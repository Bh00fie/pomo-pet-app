# MVP Definition

> App name is a placeholder ("Pomo Pet") until a real name is picked. Update everywhere once decided.

## Concept

A Pomodoro timer where completed focus sessions hatch "fish" that can be merged into bigger fish,
building a personal zoo/aquarium over time. Leaving the app mid-session harms
the pet (Forest-style accountability), which is the core retention hook.

## Platform & Stack

- iOS only for MVP. Mac already available; **Apple Developer account enrollment is deliberately
  deferred** — the whole MVP is built and demoed for free via Expo Go, and the $99/yr enrollment
  only happens after the free build is used and liked (see the decision gate in `PLAN.md`, M6a)
- React Native + Expo, **pinned to SDK ~54** (the only version the App Store build of Expo Go
  supports — see `PLAN.md`), EAS Build/Submit for iOS packaging and store upload once paid
- Animation: Reanimated 4 + Skia (both ship inside Expo Go). Not Lottie/Rive (need a paid-account
  dev client) and not Moti (incompatible with Reanimated 4 on SDK 54)
- No custom backend — all state stored locally on-device (Zustand + AsyncStorage)

## MVP Feature Set (in scope)

1. **Pomodoro timer** — start/pause/reset, customizable work and break lengths
2. **One starter pet species** (e.g. a single fish type) with 3 growth stages (Fry/Juvenile/Elder)
3. **Session → reward loop** — every completed session hatches exactly one new fish immediately.
   Which one depends only on the session's length: below `REWARDS.longSessionThresholdMinutes` a
   Fry of the active species, at or above it a Juvenile of a species drawn at random from every
   species the user owns. (Superseded the original "session grows a fish's XP within its current
   stage" rule after M6a — XP was invisible, a first fish took five sessions, and owning a second
   species changed nothing about what a session was worth. See CLAUDE.md.)
4. **Merge mechanic** — merging N same-stage fish is the only way to *cross* a stage boundary
   (resolves the growth-vs-merge ambiguity: sessions hatch, merging advances)
5. **Leave-early penalty** — sustained backgrounding (not brief `inactive` states like Control
   Center or a phone call) forfeits the session's reward and marks a fish `sick` — the most
   recently hatched one — desaturated, recovering on the next completed session (which cures
   exactly one sick fish, the mirror of the penalty). The fish itself is never deleted
6. **Streaks** — consecutive days with at least one completed session
7. **Basic local stats** — today's total focus time, current streak, all-time total
8. **Monetization: IAP species unlock, built against a mock provider for the free phase** — full
   shop/paywall UX is part of MVP; real payments are wired in only after Apple Developer enrollment

## Explicitly Out of Scope for MVP

Everything else discussed lives in `FUTURE_FEATURES.md` — Game Center leaderboards, task tagging,
Apple Watch app, widgets, custom backend/regional leaderboards, Health integration, ambient sound,
social sharing, Android port.

## Definition of Done — free phase (M0–M6a, no money spent)

- App runs on a physical device via App Store Expo Go (SDK 54)
- A user can complete the full loop: start timer → finish session → hatch a fish → merge fish → see streak update
- Leaving early visibly penalizes the pet, and recovery on the next session is visible
- Shop/paywall UX is fully demoable against the mock entitlement provider
- **This is the checkpoint to decide whether the app is worth paying to publish**

## Definition of Done — paid phase (M6b–M7, only after the gate above)

- Real IAP wired in and tested in App Store Connect sandbox
- App Store Connect listing is complete (screenshots, description, privacy policy, age rating)
- App passes Apple review and is live on the App Store
