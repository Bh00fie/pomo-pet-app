# Step-by-Step Plan to Ship the MVP

Status legend: [ ] not started · [~] in progress · [x] done

Reordered from the original account-first sequence: everything through M6a is built and fully
demoed on your own phone via Expo Go for $0. The $99 Apple Developer Program only gets paid once
you've used the finished app and decided you like it — see the decision gate below.

## Platform lock-in (read before scaffolding)

- **Pin `expo` to `~54.0.0` and never upgrade during the free phase.** The App Store build of
  Expo Go only supports SDK 54; anything newer requires a paid-account dev build to even open.
  Verify `expo --version` resolves to 54.x immediately after scaffolding, and confirm the project
  opens in App Store Expo Go on your phone before writing any feature code (this is M0).
- Animation stack is **Reanimated 4 + Skia** (both ship inside Expo Go) — not Lottie or Rive
  (both require a paid-account dev client) and not Moti (incompatible with Reanimated 4 on SDK 54).
- IAP is built against a **mock entitlement provider** for the whole free phase — full shop/paywall
  UX, no real money, swapped for RevenueCat only after enrollment.

## M0 — Scaffold, gated  [~] built, awaiting the on-device gate

- [x] `npx create-expo-app` (TypeScript template), then pin `expo` to `~54.0.0`, `npx expo install --fix`
- [x] Folder structure: `app/` (Expo Router routes only), `src/{config,features,store,anim,ui,theme}`
- [x] Zustand + AsyncStorage `persist`, versioned schema/migration from commit one
      (`src/store/migrations.ts` — `SCHEMA_VERSION` + migration runner, wired into `persist`)
- [ ] **Gate**: confirm the app opens in App Store Expo Go on your phone before continuing

Verified on 2026-08-02, machine-checkable parts only:

- `node_modules/.bin/expo --version` → `54.0.26`, installed `expo` package → `54.0.36` (both 54.x)
- `npx tsc --noEmit` → clean
- `npx expo-doctor` → 18/18 checks passed
- `npx expo export --platform ios` → succeeds; Hermes bundle **3.81 MB**
  (this is the 2D baseline the 3D spike is measured against)

The remaining gate is the one thing that genuinely needs your phone: scan the QR from
`npx expo start` with App Store Expo Go and confirm the four tabs load. Nothing here can
verify that, so M0 stays `[~]` until you do.

Installed and pinned: `expo-router`, `react-native-reanimated` 4 (+ `react-native-worklets`
babel plugin), `@shopify/react-native-skia`, `zustand`, `@react-native-async-storage/async-storage`,
`expo-notifications`, `expo-haptics`, `react-native-gesture-handler`, `react-native-screens`,
`react-native-safe-area-context`.

## M1 — Timer engine  [~] built and unit-tested, awaiting the on-device demo

- [x] Absolute-timestamp state machine (`endsAt`, not a decrementing counter — JS timers don't
      survive backgrounding) — `src/features/timer/machine.ts`, a pure transition function with
      no React/RN/Expo imports, covering idle→running→paused→completed→abandoned
- [x] Start/pause/reset wired into the Focus screen (`useTimer.ts` + `useTimerStore.ts`), with an
      `AppState` listener that re-reads the wall clock on foreground
- [x] Customizable work/break lengths (MVP feature 1) — mode switch + `+/-` steppers on the Focus
      screen, clamped by `TIMER.minMinutes`/`maxMinutes`, persisted through the settings store
- [~] Local notification scheduled at `endsAt`, cancelled on pause/reset — written and unit-tested
      against a mocked `expo-notifications` (correct DATE trigger, correct cancellations), but
      **actual delivery cannot be verified without a device**, so this stays `[~]`
- [ ] Demo: start a 25-min timer, background the app, return — time is correct, notification fires

Verified on 2026-08-02, machine-checkable parts only:

- `npm test` → **72 tests, 5 suites, all passing** (`jest-expo` preset)
  - `machine.test.ts` (32) — every transition, the `endsAt`/`pausedRemainingMs` arithmetic
    including a 12-cycle pause/resume loop that must not drift a millisecond, completion exactly
    at the boundary, and expiry that happened entirely while backgrounded
  - `FocusScreen.test.tsx` (9) — the screen the user actually taps: Start really starts, the
    clock counts down, Pause holds it, Resume continues from the same remainder
  - plus `notifications` (13), `useTimerStore` (11) and `durations` (7)
- `npx tsc --noEmit` → clean
- `npx expo-doctor` → 18/18 checks passed
- `npx expo export --platform ios` → succeeds; Hermes bundle **4.02 MB** (3.81 MB at M0)

The remaining gate needs your phone: run a real session, lock/background the app, and confirm both
that the time is right on return and that the notification actually fires.

> **A 3D aquarium alternative was explored and is parked.** Prompted by Forest's 3D trees, the
> branch `explore/3d-aquarium` holds a working `expo-gl` + `three` + `react-three-fiber`
> prototype (three tank shapes, up to 40 fish) and the full write-up in
> `docs/3D_AQUARIUM_REPORT.md` (that file lives on the branch, not on `main`).
>
> Headline: **3D is feasible and does not break Expo Go** — `expo-gl` is a bundled Expo Go module
> on SDK 54, so the free M0–M6a plan survives. It is nonetheless **recommended for deferral to
> v2**, because a new fish species costs hours as a 2D parameter record and days as a modelled,
> rigged 3D asset — and selling species is the business model. Secondary costs: +44% JS bundle,
> animation moves from the UI thread to the JS thread, and `expo-gl` rides Apple's deprecated
> OpenGL ES while Skia is on Metal.
>
> **M2 below is unchanged.** Revisit the 3D option at the M6a decision gate.
> Browsable version: https://claude.ai/code/artifact/50773e34-7db6-46ac-b803-6a5fb4dffe93

## M2 — Pet/zoo core + tank rendering  [~] built and unit-tested, awaiting the on-device demo

- [x] Data model: `Species`, `Stage`, `Fish { id, speciesId, stage, xp, bornAt, health }` —
      `src/features/pet/model.ts`, pure TypeScript (no React/RN/Skia imports, same discipline as
      the timer machine). One starter species, Coral Tetra, with Fry/Juvenile/Elder parameter
      sets. `src/store/types.ts` re-exports `Fish` from here rather than keeping a second copy,
      so the persisted shape and the domain model cannot drift
- [x] Shared animation primitives first: single tank clock (`src/anim/useAquariumClock.ts`, one
      `useFrameCallback` per tank — per-fish work is threaded through its `onFrame`, never a
      driver per fish), particle burst, ripple/glow, motion tokens, reduce-motion hook.
      `Ripple`/`ParticleBurst` are built and exported but deliberately not wired into a screen
      yet — their consumers are the M3 merge sequence and the M4 penalty
- [~] Procedural fish renderer (Skia) — body/tail/dorsal/pectoral built from parametric paths
      (`src/features/pet/geometry.ts`, pure and unit-tested; growth stages are parameter sets
      through one builder, never separate assets), wander-toward-target steering as Reanimated
      worklets, all animated values reaching Skia through `useDerivedValue`. **Whether it
      actually looks like a fish swimming, and holds 60fps with several fish, is phone-only** —
      nothing here can verify it, so this stays `[~]`
- [x] Session-complete → reward logic (XP/fish spawn) — `src/features/pet/reward.ts` (pure) plus
      `useSessionReward`, mounted once at the app root so a session that finishes while the user
      is on another tab still awards. Awards once per distinct `endsAt`; break sessions award
      nothing
- [ ] Demo: complete a session, a fish appears and swims; force-quit and reopen, it's still there

Verified on 2026-08-02 by an independent review pass, machine-checkable parts only:

- `npm test` → **114 tests, 11 suites, all passing** (107 after the M2 build commit, plus 7
  migration tests added by the review pass)
  - `model.test.ts`, `reward.test.ts`, `geometry.test.ts`, `color.test.ts` — the pure domain:
    XP clamping at the stage cap, spawn-vs-grow selection, geometry scaling across stages
  - `useAppStore.test.ts` — the store wiring actually spawns/grows through `applySessionReward`
  - `migrations.test.ts` — the v1→v2 entitlements migration described below
- `npx tsc --noEmit` → clean
- `npx expo-doctor` → 18/18 checks passed
- `npx expo export --platform ios` → succeeds; Hermes bundle **4.67 MB** (4.02 MB at M1)

Reviewed and confirmed: one shared clock (only one `useFrameCallback` in the codebase), no
`useState` anywhere in a per-frame path (`Tank.tsx`'s only `useState` is the `onLayout` tank
size), fish steering state held in Reanimated mutables outside React, and `useSessionReward`
mounted exactly once so it cannot double-award.

Fixed by the review pass: M2 corrected the `entitlements.unlockedSpeciesIds` **default** from the
dead literal `'starter'` to the real starter species id but left `SCHEMA_VERSION` at 1. Because
`persist` merges stored state over the initial state, any device that had already written v1
state would have kept the dead id forever. `SCHEMA_VERSION` is now 2 with a real 1→2 migration.

The remaining gate needs your phone: finish a session, watch a fish appear and swim in the
Aquarium tab, then force-quit and reopen to confirm it is still there.

> **Open question for M3 — how does a user ever get a *second* fish?** *(Answered at M3: the
> spawn rule is "grow any under-cap fish; spawn a new Fry only once every fish is capped".)*
> Today a session spawns a fish only when the collection is empty, and otherwise grows the
> existing one; `fishPerMerge` is 3, so the merge mechanic (MVP feature 4) is currently
> unreachable. M3 has to decide the spawn cadence — every session, every capped fish, every N
> sessions — and that is a game-feel call, not a code fix. See CLAUDE.md.

## M3 — Growth + merge  [~] built and unit-tested, awaiting the on-device demo

- [x] Sessions grow a fish's XP *within* its current stage; merging N same-stage fish is the only
      way to *cross* a stage boundary (resolves the growth-vs-merge scope ambiguity from `MVP.md`).
      `applySessionReward` (`src/features/pet/reward.ts`) implements the spawn rule you chose:
      grow the first fish that still has room in its stage, and hatch a fresh Fry **only** when
      every existing fish is capped. `evaluateMerge` (`src/features/pet/merge.ts`) is the pure
      merge rule — same discipline as the timer machine, no React/RN/Skia imports — returning a
      typed rejection (`wrong-count` / `fish-not-found` / `mixed-stages` / `mixed-species` /
      `top-stage`) instead of throwing or silently no-op-ing. `useAppStore.mergeFish` applies it
      atomically: one read of state, one `set`, and no `set` at all on rejection
- [~] Merge selection, gather/converge/burst/reveal animation sequence — tap-to-select
      (`FishTapTarget.tsx`, an overlay tracking each fish's live position), a Merge button
      enabled only for a complete same-stage/same-species selection, and `MergeSequence.tsx`
      (converge → `Ripple` + `ParticleBurst` → `springs.celebrate` spring pop-in → settle into
      normal wander steering). The store mutation happens *before* the animation, so the merge is
      durable even if the app dies mid-sequence. **Whether the sequence reads as a satisfying
      merge is phone-only**, so this stays `[~]`
- [ ] Demo: earn several fish, merge them, watch the full sequence

Verified on 2026-08-02 by an independent review pass, machine-checkable parts only:

- `npm test` → **135 tests, 12 suites, all passing** (114 at M2)
  - `merge.test.ts` (14) — all five rejection reasons exercised with real assertions, not just
    existence checks: short/long selections, duplicate ids collapsing below the count, an id not
    in the collection, mixed stages, mixed species, and three Elders. Plus both happy paths
    (Fry→Juvenile, Juvenile→Elder), bystander preservation, and input non-mutation
  - `reward.test.ts` — the new spawn rule: an under-cap fish is preferred over one waiting on a
    merge, and a fresh Fry is hatched only once every fish is capped
  - `useAppStore.test.ts` — `mergeFish` end to end, including that a rejected merge leaves the
    collection byte-identical
- `npx tsc --noEmit` → clean
- `npx expo-doctor` → 18/18 checks passed
- `npx expo export --platform ios` → succeeds; Hermes bundle **4.69 MB** (4.67 MB at M2)

Reviewed and confirmed: the implemented spawn rule is the one you picked (grow-until-capped, then
spawn) and not one of the two alternatives; the cap boundary is consistent everywhere (`xp < cap`
is growable, `xp >= cap` is capped, `addXp` clamps to exactly the cap, so there is no off-by-one);
`evaluateMerge` imports only `@/config` and `./model`; and `mergeFish` is genuinely atomic —
`get()` and `set()` are synchronous with no `await` between them, so nothing can interleave, and a
rapid double-tap cannot double-merge because the second call's ids are already gone from `get()`.

Fixed by the review pass (see the commit "Harden the M3 merge sequence…"): `MergeSequence`
unmounting before its completion timer left the merge result frozen at scale 0 — invisible and
selection-locked until an app restart; Reduce Motion hid the new fish for a frame before restoring
it, so the payoff was a flash of nothing; and a same-tick double tap could raise a bogus
"fish could not be found" alert. Tap-selection now also groups by species, so the UI can never
build a selection the domain rule will reject.

The remaining gate needs your phone: earn enough fish to fill a merge, tap three of them, and
watch the converge/burst/reveal sequence land.

> ~~**Open question carried into M4 — overflow XP is discarded at the stage cap.**~~
> **Resolved at M4** — you chose to carry the remainder rather than discard it. `applySessionReward`
> now grows the target to exactly its cap and re-feeds the leftover through the same
> grow-or-spawn rule, so a fish at 110/120 earning 25 XP lands on 120 and the other 15 starts a
> new Fry. Implemented in `reward.ts` (`distributeXp`) and verified below.

## M4 — Accountability + streaks  [~] complete and unit-tested, awaiting the on-device demo

**The logic is done.** The one open question this milestone carried (backgrounding for the whole
session escaping the penalty) has been resolved by your decision and implemented — see the resolved
note at the end of this section. What is left is phone-only: the two gates below, nothing else.

- [x] `AppState` listener with a grace period before penalizing — never penalize on `inactive`
      (Control Center, notification shade, phone call), only sustained `background`.
      `useTimer.ts` listens for `'background'`/`'active'` *only*; `'inactive'` is ignored on both
      sides, so a Control Center peek (`active → inactive → active`, no `background` in it) can
      never open an excursion. `useTimerStore.noteBackgrounded` records an absolute
      `backgroundedAt` timestamp — the same discipline as M1's `endsAt`, never a `setTimeout`
      trusted to fire while backgrounded — and refuses to overwrite an already-open excursion, so
      a `background → inactive → background` blip mid-excursion still measures from the real
      start. `resolveForeground` computes the decision from `now - backgroundedAt` against
      `ACCOUNTABILITY.backgroundGraceMs` (8s, inclusive: exactly 8s is forgiven, 8s+1ms is not).
      The excursion length is checked **first**, before any wall-clock reconcile, so a session
      whose `endsAt` also passed while away is still abandoned rather than completed — see the
      resolved open question below. `tick` is suppressed entirely while an excursion is open, so
      `resolveForeground` is the *only* path that can resolve a backgrounded session
- [x] Penalty forfeits in-progress growth and marks the fish `sick` (desaturated, recovers on next
      completed session) — **never deletes a fish**. `applyPenalty` (`src/features/pet/penalty.ts`)
      is pure and reuses the reward rule's target selection, so the fish that gets sick is exactly
      the one the session would have grown; `useLeaveEarlyPenalty`, mounted once at the app root
      beside `useSessionReward`, applies it off a `lastPenaltyToken` counter (not
      `status === 'abandoned'`, which a manual "Give up" also produces). Recovery is in
      `reward.ts`: being selected as a completed session's grow target cures a fish, at every
      link of an overflow chain, not just the first
- [x] Daily streak tracking, local-date based, unit-tested against DST/timezone edge cases.
      `src/features/streak/streak.ts` is pure and keyed on a `YYYY-MM-DD` **local** calendar date
      (never a UTC timestamp or a `toISOString()` slice, which shifts the date near midnight west
      of UTC). Day distance is measured midnight-to-midnight and rounded, so a 23h or 25h DST day
      is still exactly one day. Written into the same `set` as the fish reward, alongside
      `totalFocusMs` / `completedSessions` / `focusMsByDate`, so they cannot drift
- [~] Sick fish read as sick: desaturated (`HEALTH.sickSaturationMultiplier` scales the species'
      own saturation, so the hue is still recognizable — ill, not a different fish) and a slower
      tail-wag (`HEALTH.sickTailWagMultiplier`), plus a damped `springs.penalty` "wince" in
      `Tank.tsx` on the healthy→sick transition, skipped under Reduce Motion. **Whether the
      desaturation actually reads as "your fish is unwell" is phone-only**, so this stays `[~]`
- [ ] Demo: leave mid-session, see the pet react; complete days, see the streak fire

Verified on 2026-08-02 by an independent review pass, machine-checkable parts only:

- `npm test` → **189 tests, 14 suites, all passing** (135 at M3; 178 after the M4 build commit,
  plus 6 from the first review pass, 1 from the penalty-priority fix and 4 from its review)
  - `streak.test.ts` (14) — the date math, including the DST cases described below
  - `penalty.test.ts` (5) — target selection matches the reward rule, no-op on an empty or
    fully-capped collection, idempotent when the target is already sick, never mutates its input
  - `useTimerStore.test.ts` — `noteBackgrounded`/`resolveForeground`: idle and paused are not
    tracked, a break is not tracked, an already-open excursion is not overwritten, both sides of
    the grace boundary *and* the boundary itself, no double-penalty on repeated foreground events,
    a full-duration background still abandons, and `tick` is suppressed mid-excursion but not
    during a break
  - `FocusScreen.test.tsx` — the same rules through the real screen and real `AppState` events,
    including an interval tick delivered *before* the foreground event (still abandons) and a
    within-grace excursion spanning `endsAt` (still completes)
  - `reward.test.ts` — overflow carries rather than evaporating, spills into a second under-cap
    fish before spawning, chains across capped fish, cures every fish the chain grows, and
    conserves XP exactly over a 60-fish chain without unbounded recursion
- `npx tsc --noEmit` → clean
- `npx expo-doctor` → 18/18 checks passed
- `npx expo export --platform ios` → succeeds; Hermes bundle **4.7 MB** (4.69 MB at M3)

Reviewed and confirmed: the penalty decision is genuinely a timestamp delta computed on
foreground, with no timer trusted to survive backgrounding anywhere in the path; `'inactive'`
cannot reach `noteBackgrounded` (the listener has no branch for it) and cannot corrupt an open
excursion (the `backgroundedAt !== null` guard); the break exemption is a real `timer.mode`
check, not just a claim; the overflow recursion's base case is the spawn branch, which absorbs
all remaining XP and cannot recurse further, and every other step both consumes ≥1 XP and removes
one fish from the under-cap set, so depth is bounded by the fish count. The "no `SCHEMA_VERSION`
bump needed" claim was checked against the M0 commit rather than taken on faith and **holds** —
`abandonedSessions`, `currentStreak`, `longestStreak`, `lastCompletedLocalDate` and
`focusMsByDate` have all been in `Stats` and in `initialPersisted.stats` with these exact
zero-value defaults since commit one, so no stored payload can be missing them.

Fixed by the review pass: **the DST tests were vacuous** — they were passing in the machine's own
timezone, not a DST-observing one. `process.env.TZ` assigned inside a test is silently ignored
(the runtime has already resolved its zone), and the chosen date pairs were the day *before* each
transition, which is an ordinary 24-hour day even in the right zone. The whole suite passed
against a deliberately-broken `Math.floor` implementation. The zone is now pinned in
`jest.config.js` before Jest forks its workers, the dates are the transition days themselves
(Mar 8→9 = 23h, Nov 1→2 = 25h, Mar 7→9 = 47h), and each test asserts the span it depends on so it
cannot quietly degrade again. Also added: a `Math.max(1, …)` floor so a completed session can
never leave the streak on zero, and the grace-period boundary is now pinned by a test.

The remaining gate needs your phone: start a focus session, background the app for more than 8
seconds, come back and watch a fish go grey and flinch — then complete a session and watch it
recover, and complete sessions on consecutive days to see the streak line climb.

> ~~**Open question carried into M5 — backgrounding for the *whole* session is not penalized, and
> is still fully rewarded.**~~ **Resolved after the M4 review** — you chose (b): sustained
> backgrounding past the grace period **always** penalizes, and "the timer would also have
> finished while I was away" is not an escape hatch. `resolveForeground` now checks the excursion
> length *before* folding the wall clock in, so a 25-minute session backgrounded for 25 minutes
> abandons and sickens a fish instead of paying out in full. Within the grace period nothing
> changed: a brief excursion that happens to span `endsAt` still completes normally, so the M1
> "glance at your lock screen" affordance survives — it is now measured in seconds rather than
> being open-ended. The scheduled end-of-session notification still fires either way; what it no
> longer implies is that walking away for the whole session is rewarded.

**Second review pass, 2026-08-02** (`aae6029`). Re-ran everything independently: 189 tests / 14
suites green, `tsc --noEmit` clean, `expo-doctor` 18/18, `expo export --platform ios` succeeds at
4.7 MB. The new check order is correct — traced against the code, not the report — and the
boundary is unchanged and consistent (`elapsed > grace` penalizes, so exactly 8s is still forgiven,
matching the convention pinned at the first review pass).

One real bug found and fixed: **the check order alone did not actually close the hole, because
`resolveForeground` was not the only path to `completed`.** `useTimer`'s interval independently
calls `tick()` once the wall clock passes `endsAt`, and iOS can deliver an overdue timer callback
*before* the `AppState` `'active'` listener on resume. The session was then already `completed`
when `resolveForeground` ran, failing its `status === 'running'` check — so a full-session
background escaped the penalty again, via a race this time instead of via the check order, and
whether the user was penalized depended on JS timer delivery order. `tick` is now a no-op while
`backgroundedAt` is set, making `resolveForeground` the exclusive resolver of a backgrounded
session — which is also what M1 always assumed (a backgrounded session is reconciled on return,
not by an interval the OS has suspended). **Rule this proves: changing the priority of a decision
is only sound once you have found every writer that can pre-empt it.**

### Known and accepted limitations at the close of M4

Deliberate, decided, and *not* bugs to be silently fixed later — revisit each on its own merits:

- **A manual "Give up" is still exempt from the penalty.** Reviewed and left as-is: the spec's
  stated trigger is sustained backgrounding, and give-up already forfeits the reward. It does mean
  the honest user who taps Give up is treated better than one who just backgrounds. Related:
  a manual give-up does not increment `stats.abandonedSessions` either, so that counter
  under-reports by its own name. Both are part of the same question; change them together or not
  at all.
- **A user whose fish are all capped cannot be penalized.** `applyPenalty` reuses the reward
  rule's "first fish with room" selection, so when every fish is waiting on a merge there is no
  target and leaving early is free. Symmetric with the reward side (that user earns nothing from a
  completed session either), but a real late-game gap. Fixing it means sickening a capped fish
  anyway, or the most recently grown one.
- **Force-quitting while backgrounded escapes the penalty entirely.** `useTimerStore` is transient
  by design (M1), so `backgroundedAt` and the in-flight session die with the process; relaunching
  finds an idle timer and nothing to penalize. Same root cause as "a completed session is lost if
  force-quit", and the same fix — persisting the in-flight session — which was pencilled in as an
  M5 item. **M5 did not do it**; see the close-of-M5 list, where it is now unscheduled pending the
  open penalty decision. M4 only raises the stakes, by making it a way to dodge a consequence
  rather than only a way to lose a reward.
- **A background excursion that starts within seconds of `endsAt` is penalized in full.** Falls
  straight out of your decision rather than being an oversight: the rule measures the excursion,
  not its overlap with the session, so backgrounding at 24:57 of a 25:00 session and returning an
  hour later abandons it. Deterministic (that is what the `tick` guard buys), and arguably right
  under "leaving the app is what's punished" — but if it ever feels too harsh, the one-line change
  is to clamp the excursion to `min(now, endsAt) - backgroundedAt`.

## M5 — Stats, settings, polish  [~] built and unit-tested, awaiting the on-device demo

Every screen in the MVP now shows real data — there are no placeholder screens left except the
Shop, which is M6a's job. What remains is phone-only: the layout gate below.

- [x] Stats screen: today's focus time, current streak, all-time total, weekly bars.
      `src/features/stats/stats.ts` is the pure, injected-`now` date-bucketing layer —
      `getTodayFocusMs` and `getWeeklyFocus` over the existing `stats.focusMsByDate` — with no
      React/store imports, same discipline as `features/streak/streak.ts` and the timer machine.
      `StatsScreen.tsx` does **no date math of its own**; it renders four tiles, a 7-bar weekly
      chart and the abandoned-session count, and nothing else. The window is built by subtracting
      from `now`'s own local **calendar fields** (`new Date(y, m, d - i)`) rather than dividing raw
      milliseconds, which is what survives a DST transition inside the 7 days.
- [x] **The "last 7 days" boundary is tested for real, including across both DST transitions.**
      Worth spelling out because the first version of these tests repeated the M4 failure in a
      subtler form: the *mechanism* was right (zone pinned in `jest.config.js`, asserted inside the
      test) but the date pairs did not discriminate — both used a midday `now`, and since the DST
      shift is only an hour, naive ms subtraction still lands on the correct calendar date from
      midday. All 16 tests passed against a deliberately broken implementation. The discriminating
      shape is a `now` **within an hour of local midnight on a day after the transition, looking
      back across it**: Mar 9 00:30 (naive arithmetic drops 2026-03-08 out of the window entirely —
      a day of focus time vanishing from the chart) and Nov 2 23:30 (naive arithmetic emits
      2026-11-01 twice and drops 2026-10-27 — one day counted into two bars). Both now assert the
      midnight-to-midnight span first, and both were verified to fail against the naive version.
      **Rule this proves, extending M4's: pinning the environment is necessary but not sufficient —
      the *inputs* have to be ones a wrong implementation gets wrong.**
- [x] Reduce motion respected everywhere, and now a real user override rather than an OS mirror.
      `settings.reduceMotion` is a tri-state `'system' | 'on' | 'off'`, resolved in
      `src/anim/useReduceMotion.ts` — the only place that reads it. `'system'` defers to
      `AccessibilityInfo`, `'on'` forces reduced motion when the OS setting is off, `'off'` forces
      **full** motion when the OS setting is on. Every animation consumer (`Ripple`,
      `ParticleBurst`, `useAquariumClock`, `MergeSequence`, `Tank`'s penalty wince) reads only this
      hook's number and needed no change. All six preference × OS-state combinations are tested,
      plus live `reduceMotionChanged` events and listener cleanup — written as transitions on one
      mounted hook, because three of the six expect `1`, which is also the value before the async
      OS read resolves, so isolated assertions would pass without the OS value ever arriving.
- [x] `SCHEMA_VERSION` 2 → 3 for the tri-state, with a real migration. A stored `true` becomes
      `'on'`; `false`, missing, or corrupt becomes `'system'` — deliberately never `'off'`, since
      v2's `false` only ever meant "no extra override on top of the OS setting" and `'off'` is a
      new capability no v2 payload could have expressed. Mapping it there would silently disable
      the accessibility setting for anyone who had the OS toggle on. Tested including the full
      v1 → v3 walk.
- [x] Settings tab: the reduce-motion segmented control, the notifications toggle (already read by
      `useTimerStore` since M1, previously with no UI), and a reset-all-data action.
      **Work/break length is deliberately not duplicated here** — it lives on the Focus screen and
      repeating it would be a second source of truth for the same field. Verified: the only
      `workMinutes`/`shortBreakMinutes` controls in the app are `FocusScreen.tsx`'s.
- [x] The destructive reset is genuinely gated. `Alert.alert` with a `cancel` button that has no
      `onPress` and a separate `destructive` button that is the *only* caller of `resetAll` —
      there is no path to the wipe without tapping the second button, and a double-tap can only
      queue a second alert, not skip one. `resetAll` is idempotent anyway.
- [x] First-launch onboarding: a four-step explainer of the core loop, rendered as an overlay from
      `app/_layout.tsx` while `onboardingCompletedAt` is `null`, gated behind `hydrated` so a
      returning user's real value is read instead of flashing the screen for a frame every launch.
      Confirmed against the M0 commit rather than taken on faith: `onboardingCompletedAt` and
      `completeOnboarding()` have both been in `types.ts` / `initialPersisted` / `partialize` since
      commit `6940300`, so no stored payload can be missing the field and no migration was needed
      for it. Scrollable rather than fixed-height, so nothing can clip on a small device.
- [~] Visual polish pass across all screens. Partly done — `radius.pill` and `spacing.lg` replaced
      three ad-hoc literals, `colors.danger` finally has a consumer, and `Card`'s `style` prop
      widened to `StyleProp<ViewStyle>` so styles can be composed. But this is the one item here
      that cannot be signed off from a terminal, and three known gaps are listed below.

### On-device gate for M5

- [ ] **On a real iPhone: the new screens lay out correctly and the reduce-motion override
      actually changes what you see.** Specifically — Stats reads correctly with a real week of
      data and with an empty history; the five-tab bar is not crowded; onboarding fits (or scrolls
      cleanly) on the smallest target device and never reappears after dismissal; and setting
      Reduce Motion to `off` with the iOS accessibility setting **on** visibly restores full tank
      motion and the full merge sequence. That last one is the whole point of the tri-state and is
      the only way to confirm it end to end.

### Known and accepted limitations at the close of M5

- **`settings.hapticsEnabled` is persisted but has no consumer anywhere.** It has been in the
  schema since M0, defaults to `true`, and nothing reads it — there is no haptics code in the app
  at all. Deliberately *not* surfaced in Settings, because a toggle that does nothing is worse than
  no toggle. Either wire up `expo-haptics` (session start/complete, merge, penalty) and then add
  the toggle, or drop the field in the next migration. Do not add the switch on its own.
- **Three hardcoded colors remain outside the theme**: `Ripple`'s `#EAF4FF` and `ParticleBurst`'s
  `#FFD166` defaults, and the `rgba()` fills in `AquariumScreen`'s count pill and
  `FishTapTarget`'s hit area. These are alpha-blended overlays and per-component defaults, and the
  theme has no token shape for either — a design-system gap, not an oversight to patch over with
  more literals. (`Fish.tsx`'s `#ffffff` eye highlight is plain white and fine as a literal.)
- **The tank's frame loop still runs while another tab is focused.** Carried over from M4's list,
  where it was tagged as an M5 polish item; not done. Expo Router keeps tab screens mounted, so
  `useAquariumClock`'s `useFrameCallback` animates and draws battery while the user sits on Focus,
  Stats or Settings. The fix is to gate it on navigation focus, but whether it resumes cleanly is
  device-only — hence deferred rather than done blind, and now cheap to fold into M6a's UI work.
- **Persisting the in-flight session is still not done.** M4's list called it an M5 item; M5 did
  not do it, so force-quitting mid-session still both loses a completed reward and escapes the
  penalty. Unchanged in substance, just no longer scheduled — it needs its own decision alongside
  the open M4 penalty question rather than being slipped into a polish milestone.
- **`resetAll` also clears `onboardingCompletedAt`**, so wiping data re-shows onboarding. Sensible
  for a "reset to first launch" action, but it does mean the onboarding code's claim that there is
  "no way to re-trigger it" is not strictly true — Settings → Reset all data is one. It also does
  not touch the transient timer store, so a session left running survives a reset and will still
  award into the fresh state. Both are acceptable for a testing-only affordance; neither should
  survive into a shipped build unchanged.
- **Stats' `now` is captured at render.** `StatsScreen` calls `new Date()` in the render body, so
  an app left open across local midnight keeps showing the previous day's window until something
  re-renders it. Harmless in practice (any store write or tab switch refreshes it) and the fix is a
  focus-effect tick, but it is not currently handled.
- **"LEFT EARLY" on Stats inherits M4's under-count.** `stats.abandonedSessions` is incremented
  only by the auto-abandon path, never by a manual "Give up" — an accepted M4 limitation that M5
  has now made *user-visible* on a labelled tile. Whatever gets decided about the give-up
  exemption now has a UI consequence too.

## M6a — Shop UX against the mock provider (free)

- [ ] `EntitlementProvider` interface + `MockEntitlementProvider` behind a dev-menu toggle
- [ ] Full paywall, locked-species presentation, unlock animation, restore-purchases flow —
      demoable end to end with zero real money spent
- [ ] **Decision gate: this is the checkpoint to decide whether the app is worth the $99.**
      Everything through here required no Apple Developer account and no Xcode.

---

## Only past this point does anything cost money

## M6b — Real IAP

- [ ] Enroll in the Apple Developer Program ($99/yr), accept agreements in App Store Connect
- [ ] Install full Xcode from the Mac App Store (not Command Line Tools — needed from here on)
- [ ] `expo prebuild` / custom dev client (leaving Expo Go is expected at this stage)
- [ ] Swap `MockEntitlementProvider` for `RevenueCatEntitlementProvider`, configure products in
      App Store Connect, test in sandbox

## M7 — Store readiness, submission, launch

- [ ] App Store Connect listing: screenshots, description, keywords, privacy policy, age rating
- [ ] EAS Build → TestFlight internal testing, fix issues found
- [ ] Submit for App Store review, respond to any rejection feedback
- [ ] Launch — monitor crash reports and reviews, decide which `FUTURE_FEATURES.md` item to
      tackle next based on real usage
