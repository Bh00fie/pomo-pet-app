# Project Context

## Status: M1 (timer engine) built — M2 is next

The Expo app exists on `main`, builds, and has a working Pomodoro timer. `docs/PLAN.md` is the
milestone sequence; M2 (pet/zoo core + Skia tank rendering) is the next thing to write.

### Current repo state (2026-08-02)

- `main` — Expo SDK 54 app. `app/` holds Expo Router routes only (thin re-exports); everything
  real is under `src/{config,features,store,anim,ui,theme}`. Zustand + AsyncStorage `persist`
  with `SCHEMA_VERSION` and a migration runner wired in from commit one
  (`src/store/migrations.ts`). Aquarium/stats/shop screens are still labelled placeholders.
- **Timer engine (M1) is real.** `src/features/timer/machine.ts` is a pure transition function
  (no React/RN/Expo imports — keep it that way) over
  `{ status, mode, endsAt, durationMs, pausedRemainingMs }`. Time is always absolute: a running
  session is an `endsAt` timestamp and remaining time is recomputed from `Date.now()` on every
  read. **Never introduce a decrementing counter** — JS intervals die when the app backgrounds.
  `useTimerStore.ts` (transient, unpersisted) applies the machine and owns the notification
  side effects; `useTimer.ts` is the React binding (tick cadence + `AppState` foreground
  re-read); `FocusScreen.tsx` renders it and holds no timing logic of its own.
- **Tests exist and must stay green**: `npm test` (jest-expo preset), 72 tests across 5 suites in
  `src/features/timer/__tests__/`. Note `@testing-library/react-native` v14 has an *async* API —
  `render` and `fireEvent` must both be awaited.
- Verified: `npm test` 72/72, `npx tsc --noEmit` clean, `npx expo-doctor` 18/18,
  `npx expo export --platform ios` succeeds (4.02 MB Hermes bundle), `expo --version` → 54.x.
- **Not verified**: anything needing the user's phone — that the app opens in App Store Expo Go
  (the M0 gate), and that the scheduled end-of-session notification actually fires (the M1 gate).
  Do not mark either done until they confirm.
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
