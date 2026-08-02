# Pomo Pet (placeholder name)

A Pomodoro timer for iOS where completed focus sessions hatch "fish" that merge into bigger fish,
building a personal zoo/aquarium over time. Leave a session early and your pet takes
the hit — that accountability loop (in the spirit of apps like Forest) is the core retention hook.

## Status

✅ **The free-phase MVP (M0–M6a) is feature-complete.** Every screen is real, nothing is a
placeholder, every milestone has been independently reviewed, and every line of it was written
without spending a penny on an Apple Developer account.

**The only thing left is your phone.** Nothing in this repo has ever run on one. The remaining work
is not code — it is an eight-step pass through the **consolidated on-device checklist** in
[`docs/PLAN.md`](docs/PLAN.md), and then deciding whether the app is worth the $99/yr Apple
Developer Program fee. In short, that checklist is:

1. It opens in App Store Expo Go and all five tabs load; onboarding shows once (M0)
2. A session runs, the end-of-session notification fires, pause/resume/reset never drift (M1)
3. A fish appears, swims, reads as a fish, holds 60fps, and survives a force-quit (M2)
4. Backgrounding past 8s sicken a fish; the next completed session cures it; a Control Center
   swipe or a sub-8s lock does **not** trigger it (M3/M4)
5. The merge sequence lands — converge → burst → reveal — and reads as satisfying (M3)
6. Stats and Settings lay out correctly, and Reduce Motion `off` with the iOS setting `on`
   visibly restores full motion (M5)
7. The shop demos end to end, including the 1-in-10 simulated failure, and a bought species is
   actually visible in the tank (M6a)
8. The debug panel is reachable, obviously debug-only, and leaves Stats honest

Steps 5 and 7 used to be the problem: under the original XP-accumulation model they needed roughly
six hours of focus time to reach. That model is gone — see below — and a **testing-only debug
panel** in Settings makes them instant anyway: "Hatch a Fry" and "Hatch a Juvenile" call the exact
same hatch primitive a completed session does, so what you are judging is the real mechanic, not a
mock-up. The panel is marked for removal before any real build.

What that adds up to: start/pause/resume/reset run off an
absolute-timestamp state machine (`endsAt`, never a decrementing counter), with customizable
work/break lengths and a local notification scheduled for the end of the session. **Every completed
focus session hatches exactly one new fish, immediately** — there is no XP and no invisible progress
bar. How long you focused decides what you get: under 50 minutes hatches a **Fry** of whichever
species you have active, 50 minutes or more hatches a **Juvenile** of a species drawn at random from
everything you own, so a long session is worth three short ones *and* is the reason to own more than
one species. The Focus screen shows which of the two the current duration setting will produce,
live, next to the length stepper. Fish are drawn procedurally in Skia — body, tail and fins are
parametric paths, so the three stages are parameter sets rather than separate assets — and the whole
tank animates off a single shared frame clock. Merging is the only way a fish crosses a stage
boundary: tap three of the same stage and species and merge them into one of the next stage, with a
converge → burst → spring-reveal sequence. Leave a focus session backgrounded past an 8-second grace
period — for the whole session or just past the grace period, it makes no difference now — and it is
abandoned and your most recently hatched fish goes grey, desaturated and sluggish, until a completed
session nurses it back. Consecutive days with a completed session build a streak.

M5 fills in everything around that loop: a Stats tab with today's focus time, current streak,
all-time total and a seven-day bar chart (bucketed by *local* calendar day, so it holds up across a
DST transition and near midnight); a Settings tab with notifications, a reset-all-data action
behind a confirm dialog, and a Reduce Motion control that is a genuine two-way override — it can
force **full** motion even when iOS accessibility asks for reduced, not just the other way round;
and a first-launch explainer of the core loop.

M6a adds the shop: an `EntitlementProvider` interface shaped after a real IAP SDK, a mock behind
it that is genuinely async and fails one purchase in ten on purpose, buyable species drawn from the
same procedural system as the starter rather than as assets, a locked/desaturated preview
treatment, an unlock animation, and a toggle for which species short sessions hatch. No real money is
involved anywhere; swapping in RevenueCat at M6b changes one file.

**There are five species now, and they differ in shape, not just hue.** Coral Tetra (starter),
Golden Koi ($1.99), Indigo Betta ($2.99), Reef Shark ($4.49) and Clownfish ($3.99). The shark is an
elongated torpedo body — more than twice as long as it is tall, against roughly 1.5× for the others
— with an oversized dorsal fin, modest pectorals and a forked crescent tail; the clownfish is a
chubbier body carrying the app's first pattern, white bands clipped to its own silhouette. Getting
there needed three small additions to the shared parameter record (independent dorsal/pectoral fin
scales, a tail-shape option, and a pattern option), all of which are additive: every species that
predates them renders byte-for-byte as before, pinned by tests against the original values. Two
more sellable species, a new tail silhouette and a pattern renderer cost **nothing measurable** in
bundle size — which is the concrete version of why this app draws its fish procedurally in 2D
rather than shipping 3D assets.

**Two honest caveats before the decision gate.** "Restore purchases" is close to a no-op — the
mock reads ownership out of the same local store the result is reconciled into, so it cannot change
anything, and the flow exists for M6b rather than for today; a restore that "works" on your phone
is evidence of nothing. And the pacing is now the opposite question to the one it used to be: nine
short sessions get you a Juvenile the slow way, three long ones get you an Elder's worth of
Juveniles, and a first fish arrives on session one instead of after five. Whether that is too
generous is a judgement to make from real use, not from the debug panel. Both are written up in
[`docs/PLAN.md`](docs/PLAN.md).

Everything machine-checkable passes: 362 unit tests across 19 suites, type-check, `expo-doctor`
18/18, and a 4.73 MB iOS bundle export. Everything still open needs a real iPhone.

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
src/config/          tunable constants (timer lengths, hatch threshold, grace periods)
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
  — the three stages, the merge mechanic, the animated aquarium, and all 5 screens. Predates the
  reward rearchitecture, so anything it says about XP is out of date
- [3D vs 2D tank comparison](https://claude.ai/code/artifact/50773e34-7db6-46ac-b803-6a5fb4dffe93)
  — the 3 tank shapes rendered live, plus screens restyled from the real `src/theme/` tokens

## Explorations

`explore/3d-aquarium` is a parked spike (not merged, no PR) that tested whether the aquarium
should be real 3D, Forest-style, instead of the planned 2D Skia fish. It contains a working
`expo-gl` + `three` prototype with three purchasable tank shapes, and `docs/3D_AQUARIUM_REPORT.md`.

Short version: 3D works and does **not** cost Expo Go compatibility, but it is recommended for
deferral to v2 — a new fish species costs hours as a 2D parameter record and days as a rigged 3D
asset, and selling species is the business model. The Reef Shark and Clownfish added since then are
the evidence for that: genuinely different silhouettes, a few dozen lines each, zero bundle cost.
Revisit at the M6a gate.

## Monetization

IAP unlocks for additional pet species/biomes on top of a free base app with one starter species.
Four species are sellable today ($1.99–$4.49), all built as parameter records in the same
procedural renderer — so the marginal cost of the next SKU stays measured in hours, not asset
pipelines.
