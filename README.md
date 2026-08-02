# Pomo Pet (placeholder name)

A Pomodoro timer for iOS where completed focus sessions earn you "fish" that grow and merge into
bigger fish, building a personal zoo/aquarium over time. Leave a session early and your pet takes
the hit — that accountability loop (in the spirit of apps like Forest) is the core retention hook.

## Status

✅ **The whole free-phase MVP (M0–M6a) is built.** Every screen is real, nothing is a placeholder,
and every line of it was written without spending a penny on an Apple Developer account. What is
left is not code: it is running it on a phone and deciding whether it is worth the $99. See the
**consolidated on-device checklist** in [`docs/PLAN.md`](docs/PLAN.md) — one seven-step pass
covering all six milestones.

What that adds up to: start/pause/resume/reset run off an
absolute-timestamp state machine (`endsAt`, never a decrementing counter), with customizable
work/break lengths and a local notification scheduled for the end of the session. Finishing a
focus session grows a fish, drawn procedurally in Skia — body, tail and fins are parametric paths,
so the three growth stages are parameter sets rather than separate assets — and the whole tank
animates off a single shared frame clock. Once every fish is capped the next session hatches a new
one, and XP past a stage cap spills into the next fish instead of evaporating; tap three of the
same stage and merge them into one of the next stage, with a converge → burst → spring-reveal
sequence. Leave a focus session backgrounded past an 8-second grace period — for the whole session
or just past the grace period, it makes no difference now — and it is abandoned and a fish goes
grey, desaturated and sluggish, until a completed session nurses it back. Consecutive days with a
completed session build a streak.

M5 fills in everything around that loop: a Stats tab with today's focus time, current streak,
all-time total and a seven-day bar chart (bucketed by *local* calendar day, so it holds up across a
DST transition and near midnight); a Settings tab with notifications, a reset-all-data action
behind a confirm dialog, and a Reduce Motion control that is a genuine two-way override — it can
force **full** motion even when iOS accessibility asks for reduced, not just the other way round;
and a first-launch explainer of the core loop.

M6a adds the shop: an `EntitlementProvider` interface shaped after a real IAP SDK, a mock behind
it that is genuinely async and fails one purchase in ten on purpose, two buyable species (Golden
Koi, Indigo Betta) drawn from the same procedural system as the starter rather than as assets, a
locked/desaturated preview treatment, an unlock animation, and a toggle for which species new fry
hatch as. No real money is involved anywhere; swapping in RevenueCat at M6b changes one file.

**Two honest caveats before the decision gate.** "Restore purchases" is close to a no-op — the
mock reads ownership out of the same local store the result is reconciled into, so it cannot
change anything, and the flow exists for M6b rather than for today. And at the shipped growth
curve it takes roughly two hours of real focus to cap a fish and six before a merge is possible,
so the merge mechanic and buyable species — two of the eight MVP features — are hard to actually
experience in a demo. Both are written up in [`docs/PLAN.md`](docs/PLAN.md).

Everything machine-checkable passes: 286 unit tests across 18 suites, type-check, `expo-doctor`
18/18, and an iOS bundle export. Everything still open needs a real iPhone.

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
src/features/        timer, aquarium, stats, settings, onboarding, shop — one folder per feature
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
