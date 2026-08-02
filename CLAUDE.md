# Project Context

## Status: M2 (pet/zoo core + tank rendering) built — M3 is next

The Expo app exists on `main`, builds, has a working Pomodoro timer, and completed focus sessions
now hatch/grow a procedurally drawn Skia fish that swims in the Aquarium tab. `docs/PLAN.md` is the
milestone sequence; M3 (growth + merge) is the next thing to write — but read the open question
about spawn cadence below first, it blocks the merge mechanic.

### Current repo state (2026-08-02)

- `main` — Expo SDK 54 app. `app/` holds Expo Router routes only (thin re-exports); everything
  real is under `src/{config,features,store,anim,ui,theme}`. Zustand + AsyncStorage `persist`
  with `SCHEMA_VERSION` and a migration runner wired in from commit one
  (`src/store/migrations.ts` — now at `SCHEMA_VERSION` 2, see the M2 review notes below). The
  Focus and Aquarium screens are real; stats/shop are still labelled placeholders.
- **Timer engine (M1) is real.** `src/features/timer/machine.ts` is a pure transition function
  (no React/RN/Expo imports — keep it that way) over
  `{ status, mode, endsAt, durationMs, pausedRemainingMs }`. Time is always absolute: a running
  session is an `endsAt` timestamp and remaining time is recomputed from `Date.now()` on every
  read. **Never introduce a decrementing counter** — JS intervals die when the app backgrounds.
  `useTimerStore.ts` (transient, unpersisted) applies the machine and owns the notification
  side effects; `useTimer.ts` is the React binding (tick cadence + `AppState` foreground
  re-read); `FocusScreen.tsx` renders it and holds no timing logic of its own.
- **Pet/zoo core + tank rendering (M2) is real.** `src/features/pet/` is the pure domain —
  `model.ts` (Species/Stage/Fish, one starter species), `geometry.ts` (parametric fish shape),
  `reward.ts` (spawn-vs-grow on session completion), all with no React/RN/Skia imports, same
  discipline as the timer machine. `src/features/aquarium/` is the renderer: `Tank.tsx` draws
  every fish on one Skia `Canvas`, `Fish.tsx` builds the paths, `steering.ts` is worklet-only
  wander steering. `src/store/types.ts` re-exports `Fish` from `features/pet/model` rather than
  defining a second copy — keep it that way, a duplicated persisted type is how the two drift.
- **Animation architecture (decided at M2, keep it):**
  - **One clock per tank, never one per fish.** `src/anim/useAquariumClock.ts` owns the only
    `useFrameCallback` in the app; anything needing per-frame work threads a worklet through its
    `onFrame`. Adding a second driver is the thing that will cost frames as fish counts grow.
  - **No React state in a per-frame path.** Fish position/velocity/target live in Reanimated
    mutables (`makeMutable`, held in a ref-keyed registry in `Tank.tsx`, because shared values
    can't be created in a variable-length loop of hooks), and reach Skia via `useDerivedValue`.
    The only `useState` in the tank is the `onLayout` size, which changes once.
  - **`useReduceMotion` returns a duration *multiplier* (number), not a boolean.** Changed at M2.
    Multiply a `withTiming` duration — or a per-frame delta — by it. Never write
    `if (useReduceMotion())`: 0.35 is truthy and the check silently inverts.
  - Motion tokens (`src/anim/motion.ts`) are the only source of durations/easings/springs.
    `Ripple` and `ParticleBurst` are built and exported but not wired to a screen yet — they are
    for the M3 merge sequence and the M4 penalty.
- `useSessionReward` is mounted **once**, at `app/_layout.tsx`, so a session finishing on any tab
  awards. It de-dupes on the timer's `endsAt` (stable per session) via a hook-local ref — that
  guard is per hook instance, so **do not mount it a second time** or every session awards twice.
- **Tests exist and must stay green**: `npm test` (jest-expo preset), 114 tests across 11 suites.
  Note `@testing-library/react-native` v14 has an *async* API — `render` and `fireEvent` must both
  be awaited. Worklet/`SharedValue` code (`steering.ts`) is deliberately untested — there is
  nothing meaningful to assert without a native runtime; the plain-number math it composes with
  (`geometry.ts`) is tested instead.
- Verified independently on 2026-08-02 after the M2 build: `npm test` 114/114, `npx tsc --noEmit`
  clean, `npx expo-doctor` 18/18, `npx expo export --platform ios` succeeds (4.67 MB Hermes
  bundle, 4.02 MB at M1), `expo --version` → 54.x.
- **Not verified**: anything needing the user's phone — that the app opens in App Store Expo Go
  (the M0 gate), that the scheduled end-of-session notification actually fires (the M1 gate), and
  that the tank *looks* right and holds 60fps with several fish (the M2 gate). Do not mark any of
  them done until they confirm.

### Open issues found in the M2 review (2026-08-02)

Fixed already:

- **Missed migration.** M2 corrected the `entitlements.unlockedSpeciesIds` default from the dead
  literal `'starter'` to `STARTER_SPECIES_ID` but left `SCHEMA_VERSION` at 1. `persist` merges
  stored state *over* initial state, so a device holding v1 state would keep the dead id forever
  and read the starter species as locked once the shop lands (M6a). Now `SCHEMA_VERSION = 2` with
  a real 1→2 migration + tests. **Rule this proves: changing a persisted default's *meaning* needs
  a migration just as much as changing its shape does.**

Flagged for the user, deliberately not fixed unilaterally:

- **A user can never get a second fish, so merging is unreachable.** `applySessionReward` spawns
  only when the collection is empty and otherwise grows the single existing fish, which caps at
  `GROWTH.xpPerStage` (120 XP ≈ five 25-min sessions) and then does nothing. But
  `GROWTH.fishPerMerge` is 3, and merging is MVP feature 4 and the only way to cross a stage.
  M3 has to pick a spawn cadence — a new fish every session? one per capped fish? every N
  sessions? — and that is a game-feel/economy decision, not a code fix.
- **A completed session is lost if the app is force-quit before it is reopened.** The timer store
  is transient by design (M1), so a session that ends while backgrounded only becomes `completed`
  — and only awards — when the app next comes to the foreground. Force-quitting instead loses the
  reward silently. Fixing it means persisting the in-flight session, which interacts with the M4
  accountability rules; worth deciding alongside them rather than in isolation.
- **The tank's frame loop runs whenever `Tank` is mounted, including while another tab is
  focused.** Expo Router keeps tab screens mounted, so the aquarium animates (and draws battery)
  while the user is on Focus. The fix is to gate `setActive` on navigation focus, but whether it
  resumes cleanly is exactly the kind of thing that needs a device — a good M5 polish item.
- `awardSessionCompletion` updates `fish` only; `stats` (`totalFocusMs`, `completedSessions`,
  `focusMsByDate`, streaks) is still all zeros. That is on-plan — stats land in M4/M5 — but the
  Stats screen will read empty until then.
- `explore/3d-aquarium` — a parallel spike, deliberately **not merged and with no PR open**.
  See "3D exploration" below.

### 3D exploration (parked, pending the user's decision)

Prompted by Forest's 3D trees. The branch holds a working `expo-gl` + `three` +
`@react-three/fiber` prototype — three tank shapes (box / bowl / cylinder) driven by data, closed-
form swim paths, up to 40 fish — plus `docs/3D_AQUARIUM_REPORT.md`.

Conclusion: **3D works and does not cost Expo Go** (`expo-gl` is a bundled Expo Go module on SDK
54, no dev client needed), but it is **recommended for deferral to v2**. The decisive reason is
marginal cost per species SKU — hours as a 2D parameter record, days as a modelled/rigged 3D
asset — in an app that monetises by selling species. Also: +44% JS bundle (3.81 → 5.49 MB),
`react-three-fiber`'s render loop is on the JS thread where Skia + Reanimated worklets are on the
UI thread, and `expo-gl` renders through `EAGLContext`/`CAEAGLLayer` (OpenGL ES, deprecated by
Apple in iOS 12) while Skia is on Metal.

**Do not switch the MVP to 3D.** The committed 2D Skia direction stands; revisit at the M6a gate.

### Visual references

Two published concept galleries exist for this project — check both before doing new UI/design work:

- **Full 2D MVP concept** — https://claude.ai/code/artifact/c92d02ea-29b5-4fbe-aa8c-45d6acc39761
  The primary design reference: the procedural fish system (Fry/Juvenile/Elder growth stages),
  the merge mechanic diagram, the animated aquarium tank, and all 5 app screens (Focus, Session
  Complete, Aquarium, Stats, Shop). Built before M0 existed, so it predates the real theme tokens.
- **3D vs 2D tank comparison** — https://claude.ai/code/artifact/50773e34-7db6-46ac-b803-6a5fb4dffe93
  Narrower: the 3 tank shapes (box/bowl/cylinder) rendered live in 2D canvas, plus the 5 screens
  restyled with the real color/type tokens from `src/theme/`. Built to support the 3D feasibility
  report, not a standalone design reference.

`docs/previews/` (on the `explore/3d-aquarium` branch) holds the source HTML behind the second
gallery — self-contained preview cards, each with a `<!-- @dsCard group="..." -->` first line.
`node docs/previews/build.mjs` rebuilds them from `docs/previews/src/`.

**No Claude Design / DesignSync project was created** — the DesignSync tool was not available in
the environment where that work ran, so the previews were built as portable HTML instead. They are
already shaped for DesignSync (`@dsCard` headers, no external requests) if the tool becomes
available later.

### Commit convention

**Do not add AI/Claude co-author attribution to commits.** No `Co-Authored-By` trailers on this
project — the user has asked for this explicitly.

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
- `docs/3D_AQUARIUM_REPORT.md` — **on the `explore/3d-aquarium` branch only.** The 3D feasibility
  study and its recommendation

## Decided constraints

- iOS only for v1 (Android later is easy via Expo if it comes to that)
- React Native + Expo, EAS Build/Submit — no native Xcode GUI workflow needed for builds
- No custom backend for MVP — Game Center (free, built-in) covers leaderboards later instead of
  building a server
- Local-only data persistence for MVP (Zustand + AsyncStorage, versioned schema from day one)
- **Build order is free-first**: the entire MVP (M0–M6a in `docs/PLAN.md`) is built and demoed via
  App Store Expo Go with zero Apple Developer spend. The $99/yr enrollment happens only after the
  user has used the finished free build and decided they like it — do not suggest enrolling earlier
- **Expo SDK pinned to ~54.x, do not upgrade.** The App Store build of Expo Go only supports SDK
  54; anything newer requires a paid-account dev client and breaks the free-testing plan
- Animation stack: **Reanimated 4 + Skia** (both ship inside Expo Go). Explicitly not Lottie/Rive
  (need a dev client) and not Moti (incompatible with Reanimated 4 on this SDK)
- IAP is built against a `MockEntitlementProvider` for the whole free phase; swapped for
  RevenueCat only in M6b, after enrollment
- Growth vs. merge: sessions grow a fish's XP *within* its current stage; merging N same-stage
  fish is the only way to *cross* a stage boundary

## Tooling reference

https://github.com/rohitg00/awesome-claude-code-toolkit — curated list of Claude Code
plugins/agents/skills. The marketplace is registered locally (`claude plugin marketplace add
rohitg00/awesome-claude-code-toolkit`, marketplace id `claude-code-toolkit`), but as of 2026-08-02
its plugins (`react-native-dev`, `ios-developer`, and others — checked several) cannot actually be
installed: every `plugin.json` in the repo declares a `commands` array field that the current
Claude Code plugin schema rejects (commands are supposed to be auto-discovered from a `commands/`
directory instead, per Anthropic's own official plugin manifests, which omit that field entirely).
This is a manifest bug upstream in that repo, not fixable locally short of patching their source.

Workaround until upstream fixes it: the actual command files are still present locally under
`~/.claude/plugins/marketplaces/claude-code-toolkit/plugins/{react-native-dev,ios-developer}/commands/`
and can be read directly for reference/inspiration when implementation starts, even though they
aren't usable as installed slash commands.

Separately, https://github.com/nextlevelbuilder/ui-ux-pro-max-skill is installed and working
(`ui-ux-pro-max@ui-ux-pro-max-skill`) — design-system generation (styles, palettes, font pairings)
that activates automatically once real UI code is being written.
