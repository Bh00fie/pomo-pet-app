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
> **Resolved at M4** — you chose to carry the remainder rather than discard it — and then made
> **moot post-M6a**, along with the grow-or-spawn rule it extended. `Fish.xp`, `addXp` and
> `distributeXp` no longer exist; see the reward-rearchitecture section near the end of this file.
> The half of this milestone that survives untouched is the *merge* rule: `evaluateMerge` only ever
> compared stage and species, never XP, so it needed no changes at all.

> **The first bullet above is superseded.** Sessions no longer grow a fish's XP within its stage —
> every completed session hatches one new fish outright, and its *duration* decides whether that is
> a Fry or a Juvenile. Merging is still the only way a fish crosses a stage boundary, so the scope
> ambiguity `MVP.md` raised is resolved the same way, just with "sessions hatch" in place of
> "sessions grow". Everything else recorded in this section — the merge rule, the atomic
> `mergeFish`, the animation sequence, the three teardown fixes — is unchanged and still current.

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
      link of an overflow chain, not just the first.
      **Post-M6a: both halves of this moved.** The penalty now sickens the most recently hatched
      fish (there is no "the fish this session would have grown" any more), and recovery is an
      explicit `cureOneSickFish` in `reward.ts` rather than a side effect of growing — the
      rearchitecture initially dropped the cure altogether, which is the one real bug its review
      caught. See the reward-rearchitecture section near the end of this file
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
- ~~**A user whose fish are all capped cannot be penalized.**~~ **Resolved post-M6a, as a side
  effect rather than deliberately.** Stage caps no longer exist, so "every fish is capped" is not a
  state any more; `applyPenalty` targets the most recently hatched fish and the only no-op left is
  an empty collection. That last case is reachable and correct — a user who abandons their very
  first session has nothing to sicken, and the abandonment is still counted in `stats`.
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

## M6a — Shop UX against the mock provider (free)  [~] built, reviewed, awaiting the gate

**This is the last MVP milestone, and it is now finished — including the post-review debug panel.
Every line of the free-phase MVP is written, reviewed and green.** What is left is the part no
terminal can do: using it on your phone, and then deciding about the $99. The consolidated
checklist below is the whole remaining scope of the free phase.

- [x] `EntitlementProvider` interface + `MockEntitlementProvider`.
      `src/features/shop/EntitlementProvider.ts` is shaped after what a real IAP SDK exposes
      (RevenueCat's `getCustomerInfo` / `purchasePackage` / `restorePurchases`), not after this
      app's store — it deals only in species ids and never touches `useAppStore`, so M6b is a
      one-file swap. `purchaseSpecies` **resolves rather than rejects**, with a typed
      `cancelled` / `network` / `already-owned` / `unknown` reason, because a real purchase fails
      for reasons that are not exceptions. The mock is genuinely async (a real timer-backed delay,
      so loading states are exercised for real) and fails `SHOP.mockPurchaseFailureRate` of the
      time on purpose, so the UI has a failure path it must actually render.
- [ ] ~~behind a dev-menu toggle~~ — **deliberately not built, and this bullet is retired rather
      than met.** There is no second provider to toggle *to* until M6b, so the switch would select
      between the mock and nothing. `ShopScreen.tsx` imports the singleton directly, which is the
      one line M6b edits. (If a dev menu does get built, the thing worth putting in it is not a
      provider switch — see the XP-grant note under "the gate is not really decidable yet" below.)
- [x] Two purchasable species alongside the starter — Golden Koi ($1.99) and Indigo Betta ($2.99),
      priced in `SHOP.speciesPriceUsd`. Both are parameter records in the same procedural system
      as the starter (hue/saturation/lightness + per-stage geometry), which is the whole argument
      for staying 2D: a new SKU is a few dozen lines, not a rigged asset. `model.test.ts` pins that
      every non-starter species in `SPECIES` has a price, so one can never ship unsellable by
      omission.
- [x] Locked-species presentation, unlock animation, restore flow. `SpeciesSwatch` draws each
      species' Elder silhouette from the real geometry (not an icon), desaturated via
      `HEALTH.sickSaturationMultiplier` when locked — reusing the M4 sick-fish constant rather than
      inventing a second desaturation rule. A purchase shows a real "Buying…" state, then pops the
      row with `springs.celebrate` (the M3 merge-reveal spring) and fires a `ParticleBurst`, both
      skipped under Reduce Motion. Owned rows get a "Set active" / "Hatching next" toggle that
      chooses which species new fry hatch as (`settings.activeSpeciesId`).
- [x] `SCHEMA_VERSION` 3 → 4 for `settings.activeSpeciesId`, with a real migration defaulting to
      the starter. `awardSessionCompletion` additionally re-validates the id against
      `entitlements.unlockedSpeciesIds` on **every** read, so a stale or corrupt value can never
      reach `reward.ts` — belt and braces, because the field is the one piece of settings that
      depends on entitlements.
- [x] **Debug panel in Settings** (added after the M6a review, at the user's decision — see "The
      debug panel" section below). Not in the original M6a scope; it exists because the review
      found that real pacing made merge and buyable species undemoable, and the user chose a
      testing-only affordance over retuning the pacing.
- [ ] **Decision gate: this is the checkpoint to decide whether the app is worth the $99.**
      Everything through here required no Apple Developer account and no Xcode. See the
      consolidated on-device checklist below — it covers all six milestones, not just this one.

Verified on 2026-08-02 by an independent review pass, machine-checkable parts only:

- `npm test` → **286 tests, 18 suites, all passing** (218 at M5)
  - `MockEntitlementProvider.test.ts` (14) — ownership reads go through the live store, the delay
    is real (the promise is observably pending), the failure roll is driven by the config constant
    rather than a hardcoded threshold, and a purchase survives a simulated app restart via
    `persist.rehydrate()` against a raw AsyncStorage payload
  - `ShopScreen.test.tsx` (10, new at this review) — the write split, described below
  - `useAppStore.test.ts` — `unlockSpecies` idempotence, `syncUnlockedSpeciesIds` as a union,
    `setActiveSpecies` refusing an unowned species, and the spawn-species fallback
  - `migrations.test.ts` — the v3→v4 `activeSpeciesId` step and the full v1→v4 walk
  - `merge.test.ts` — mixed-species rejection now driven off `SPECIES_ORDER` across every ordered
    pair, rather than one hand-written pair that a third species would have quietly bypassed
- `npx tsc --noEmit` → clean
- `npx expo-doctor` → 18/18 checks passed
- `npx expo export --platform ios` → succeeds; Hermes bundle **4.72 MB** (4.71 MB at M5)

Re-verified on 2026-08-02 after the debug panel was added and independently reviewed:

- `npm test` → **308 tests, 19 suites, all passing** (286 at the M6a review). The new suites/blocks
  are `SettingsScreen.test.tsx` (6, added at this review — the debug panel had no component test),
  `useAppStore.test.ts`'s debug-action block (14) and `reward.test.ts`'s `distributeXp` block (2).
- `npx tsc --noEmit` → clean; `npx expo-doctor` → 18/18
- `npx expo export --platform ios` → succeeds; Hermes bundle **4.73 MB**. The whole debug panel
  cost ~10 KB.

Two bugs were found and fixed in that review, both in the panel's UI rather than its logic:

- **The Settings screen could not scroll, and the debug card overflowed it.** `Screen` is a fixed
  `flex: 1` View. Three cards fitted; the debug card adds ~340pt against ~694pt of usable height
  on a 6.1" phone, so its own bottom two buttons — Cap all fish and Spawn a fry, i.e. the exact
  pair that makes merge reachable — were clipped off-screen with no way to reach them. The
  affordance built to unblock on-device testing would have been untappable on device. Fixed with a
  `ScrollView`, the same treatment M5 gave onboarding for the same reason.
- **The Spawn button could name a species it would not spawn.** The label read
  `settings.activeSpeciesId` directly while the action resolved it through
  `resolveSpawnSpeciesId`, which re-validates against `entitlements.unlockedSpeciesIds` — so an
  unowned active id (a corrupt payload, a future refund) produced a button reading "Spawn a Golden
  Koi fry" that handed over a Coral Tetra. Fixed by exporting `selectSpawnSpeciesId` from the store
  so the label and the action share one resolution; verified by mutation.

### The write split, traced — the thing M6b inherits

`MockEntitlementProvider.purchaseSpecies` deliberately never writes to `useAppStore`; it reports
what happened, and `ShopScreen` applies a success via `unlockSpecies`. That is the right division
— RevenueCat has no idea `useAppStore` exists — but it means there is a window where the provider
considers a purchase made and the local store does not know yet. Traced all the ways that write
could be skipped:

- **Unmount mid-await** (a tab switch during the ~1s round trip) — **safe.** The write is the
  first statement after a successful result and is deliberately *not* behind an is-mounted check;
  only the `setState` calls after it no-op post-unmount, which is harmless. Now pinned by a test
  that unmounts the screen mid-purchase and asserts the store still gets the species.
- **A throw after the await resolves** — **safe, and made safer.** Nothing can run before
  `unlockSpecies`, and a zustand `set` does not throw. But the `try` previously wrapped the write
  *and everything after it*, so a throw past the await would have reported a purchase that
  succeeded **and was applied** as a failure. The `try` is now narrowed to the provider call alone.
- **A same-frame double tap** — **this one was open, and is now fixed.** `disabled={pending}` is
  derived from React state, which does not exist yet for a second tap in the same frame; both got
  through and both called the provider. Invisible against the mock (its `isOwned` still reads false
  for the second call, and `unlockSpecies` is idempotent) — which is exactly why it had to be
  closed *now*, because at M6b that line is `purchasePackage` and calling it twice for one product
  is a double charge. Closed with a per-species ref. **Same lesson as the M3 merge double-tap:
  React state is not a lock.**

**Verdict: the call site's half of the contract is now sound. The risk that remains is
structural and belongs to M6b**, spelled out under "known and accepted limitations" below.

### The debug panel — why it exists, and why `GROWTH` was not touched instead

**Added after the M6a review, and it is the thing that makes the two headline mechanics testable
at all.** The review's biggest finding was that `GROWTH.xpPerStage` (120) at
`GROWTH.xpPerFocusMinute` (1) means **two hours of real focus to cap one fish and about six to
reach a merge**, and that a purchased species only becomes visible when a new Fry hatches — which
the M3 spawn rule allows only once every existing fish is capped. So MVP features 4 (merge) and 8
(buyable species) were both unreachable in a demo session, at exactly the moment they are supposed
to justify the $99.

**The user's decision was the debug affordance, not the pacing change.** `GROWTH.xpPerStage`,
`GROWTH.xpPerFocusMinute` and `GROWTH.fishPerMerge` are **deliberately untouched** and still
describe the real intended pacing. Lowering them would have made the demo pleasant and the
shipping product wrong, and would have conflated two numbers that are not the same number: the one
that makes a test session productive, and the one that makes a year of use paced correctly. If the
pacing turns out to be wrong, that is a separate, deliberate decision made *after* using the app —
all three knobs are in `src/config/index.ts` and changing them needs no code change.

A **"⚠ DEBUG — TESTING ONLY, NOT FOR SHIP"** card sits at the bottom of Settings, below the reset
card, styled distinctly on purpose (dashed amber border, tinted background) so it can never be
mistaken for a normal feature.

**Its buttons changed with the reward rearchitecture, and the invariant behind them did not.**
Grant XP and Cap all fish stopped meaning anything the moment XP and stage caps were deleted; the
panel now has two actions, and both call the same `hatchFish` primitive a real completed session
calls, never a simulation of it:

- **Hatch a `<species>` Fry** → `useAppStore.debugHatchFry`, i.e. exactly what a short real session
  produces. The species comes from the shared `resolveSpawnSpeciesId` helper and the *label* reads
  it through the `selectSpawnSpeciesId` selector, so the button can never name a species it would
  not hand over. Press it `GROWTH.fishPerMerge` times for a mergeable trio — the same job the old
  "Spawn a fry ×3 then Cap all fish" pair did, in one button instead of two.
- **Hatch a Juvenile (random species)** → `debugHatchJuvenile`, exactly what a long real session
  produces, through the same `pickRandomSpeciesId` draw over `entitlements.unlockedSpeciesIds`.
  This is now the fastest way to see a bought species in the tank.

**No accountability bypass — and there is one more thing it must not do now.** Neither action
touches `stats`, the streak, or `health`. That last one matters more than it used to: a completed
session cures a sick fish, so a debug hatch that went through `applySessionReward` instead of
`hatchFish` would quietly hand out recovery the user did not earn. It goes through the primitive
precisely so it cannot. The panel can hand you fish, but not a streak, not focus time, and not a
cure. Pinned by tests on both sides, including one that sickens a fish and then fires both debug
actions to assert it is still sick.

**Before EAS build submission this card and the three store actions must be removed or gated.**
There is a `TODO: remove or gate before EAS build submission` on both the JSX and the action block
in `useAppStore.ts`. It is an M6b/M7 task, not an optional one.

### `docs/MVP.md` "Definition of Done — free phase" checked rule by rule

| Rule | Verdict |
| --- | --- |
| App runs on a physical device via App Store Expo Go (SDK 54) | **Not met — needs you.** Everything checkable from here says yes: `expo` resolves to 54.x, `expo-doctor` 18/18, an iOS bundle exports. Nothing has ever been opened on a phone. |
| Full loop: start timer → finish session → earn fish → merge fish → see streak update | **Built, and now fully demoable.** Timer, session reward and streak are reachable in minutes. Merge was the gap — six hours of real focus — and the debug panel closes it: Spawn ×3 then Cap all fish makes a merge legal immediately, through the real `mergeFish`. |
| Leaving early visibly penalizes the pet, and recovery on the next session is visible | **Built; "visibly" is phone-only.** The rule, the 8s grace, the desaturation, the slowed tail wag and the wince are all real and tested. Whether grey-and-sluggish *reads* as "your fish is unwell" is item 4 on the checklist. |
| Shop/paywall UX is fully demoable against the mock entitlement provider | **Met for the UX; one honest caveat left.** Buying, failing, retrying, the locked treatment, the unlock animation and the active-species toggle are all genuinely demoable and persist across a restart. A purchase now *does* have a visible consequence outside the Shop row — Set active, then Spawn a fry in the debug panel, and the bought species appears in the tank. The caveat that remains is restore, which is a no-op against a store-backed mock. |
| This is the checkpoint to decide whether the app is worth paying to publish | **Reached, and now genuinely decidable.** All eight MVP features can be experienced in one sitting; merge and buyable species needed the debug panel to get there, and have it. What is left is your judgement of the app, not a gap in it. |

### Consolidated on-device checklist — everything to test on your phone, all six milestones

This replaces the six per-milestone gates scattered above; they all still stand, but this is the
list to actually work through, in order, in one sitting. Start with `npx expo start` and scan the
QR with **App Store Expo Go**.

**This list is now completable in one sitting.** At the M6a review it was not: steps 5 and 7
needed ~6 hours of real focus time, because merge and a bought species are gated behind real
pacing. The debug panel in Settings (see the section above) closes exactly that gap — it is why
those two steps no longer carry a "you cannot really do this today" caveat. Use it for steps 5 and
7 and **nowhere else**: steps 2, 3 and 4 are testing the real earn/penalty loop, and granting
yourself fish through them would only prove the debug button works.

1. **It opens at all** (M0). All five tabs load: Focus, Aquarium, Stats, Shop, Settings. The
   first-launch onboarding appears, scrolls cleanly on your device, and does **not** come back on
   the next launch.
2. **A session runs and the notification fires** (M1). Start a focus session, lock the phone, wait
   it out. The end-of-session notification arrives, and the time on return is correct. Then a
   second run: pause, resume, reset — the remainder never drifts.
3. **The tank looks right** (M2). Complete a session and watch a fish appear and swim. Does it read
   as a fish? Does it hold 60fps once there are several? Force-quit and reopen — it is still there.
4. **A fish gets sick and recovers** (M3/M4). Start a focus session, background the app for **more
   than 8 seconds**, come back: the session abandons, a fish goes grey and sluggish and flinches.
   Complete the next session and watch it recover. Separately confirm a Control Center swipe-down
   and a quick lock/unlock (under 8s) do **not** trigger it.
5. **The merge sequence lands** (M3). **No longer a 6-hour wait — this is what the debug panel is
   for.** In Settings, tap "Hatch a … Fry" three times. Go to the Aquarium: three Fry, all
   tappable. Select all three and Merge. Watch the converge →
   burst → reveal sequence and judge whether it reads as satisfying — that is the *only* thing
   this step is asking, and the merge itself is the real `mergeFish`, not a debug shortcut. Then
   try an invalid selection (two fish, or a mix of stages) and confirm the Merge button stays
   disabled rather than erroring.
6. **Stats and Settings read correctly** (M5). Stats with a real week of data and with an empty
   history; the five-tab bar is not crowded. Then the one M5 check nothing else can make: set
   Reduce Motion to **off** while the iOS accessibility setting is **on**, and confirm full tank
   motion and the full merge sequence come back.
7. **The shop demos end to end** (M6a). Buy Golden Koi — the "Buying…" state is visible for about a
   second, then the row pops and bursts. Buy repeatedly until you hit the 1-in-10 simulated
   failure and confirm the error reads sensibly and the row recovers. Tap "Set active", then
   force-quit and reopen: both the unlock and the active species survive. Tap "Restore
   purchases" — but see the honest caveat below before reading anything into it.
   **Then actually see what you bought** — this also used to be unreachable. With Golden Koi set
   active, go to Settings and tap "Hatch a Golden Koi Fry" (the button names the species the store
   will really hatch), then open the Aquarium: a gold fish, swimming next to the starter Tetras.
   That is MVP feature 8 demonstrated rather than asserted, and it is the second thing the debug
   panel exists for. Owning a second species also now changes what a *long* session pays out, so
   tap "Hatch a Juvenile (random species)" a few times and confirm the draw really does vary.
8. **The debug panel itself behaves** (post-M6a). Settings scrolls far enough to reach it and both
   of its buttons are tappable — the card is tall, and this is the layout most likely to clip on a
   smaller phone. Confirm it is unmistakably marked as debug-only, and that after using it the
   Stats screen still shows only sessions you actually completed: hatching must never move focus
   time, sessions, or the streak — and must never cure a sick fish.

9. **The pre-session preview and the two hatch tiers agree with reality** (post-M6a reward
   rearchitecture). On Focus, step the length up through 50 minutes and watch the "YOU'LL HATCH"
   line flip from "A Fry — `<your species>`" to "A Juvenile — a random species from your
   collection", and back down again. Then run one short session and one at 50+ and confirm the
   tank gets exactly what the preview promised. This is also the first honest look at the new
   pacing: a fish per session is either the right amount of feedback or too much, and only real
   use answers that.

### Known and accepted limitations at the close of M6a

- **"Restore purchases" is close to a no-op, and should not be read as working.**
  `MockEntitlementProvider.restorePurchases` resolves with `useAppStore`'s own
  `unlockedSpeciesIds` — it reads the same store the result is then unioned back into — so it
  cannot add anything, ever. The only observable effects are the loading state and the alert. The
  button exists because the *flow* is what M6a demos and the call site has to exist for M6b; the
  reconciliation it performs only becomes real behind a provider with its own ledger. A restore
  that "works" on your phone is evidence of nothing. The union logic itself (`syncUnlockedSpeciesIds`
  never downgrades) is tested against a provider forced to forget a species, since the real mock
  cannot produce that state.
- **Nothing reconciles entitlements at launch.** `getOwnedSpeciesIds()` is never called on boot —
  the only paths into `entitlements` are a purchase and the Restore button. Harmless now (the mock
  *is* the store, so they cannot disagree), but at M6b the store and RevenueCat are different
  machines, and any divergence — a lost write, a failed AsyncStorage flush, a reinstall, a second
  device — persists silently until the user happens to find Restore. **The M6b task list needs a
  startup `getOwnedSpeciesIds()` → `syncUnlockedSpeciesIds()` sync**, and it is not worth building
  now against a provider where it is provably a no-op.
- **`persist`'s AsyncStorage writes are fire-and-forget.** There is no `onError`, so a failed disk
  write leaves the unlock in memory for the session and gone on next launch. Self-consistent under
  the mock (the provider forgets too); a real divergence at M6b, and the same startup sync is the
  fix.
- **Concurrent purchases of *different* species are still allowed.** The new in-flight guard is
  per-species, matching the per-row UI. Real IAP SDKs generally reject a second concurrent
  purchase; whether to serialize globally is a real-provider question, not something to invent
  against a mock.
- ~~**The gate is not really decidable yet, and this is the biggest thing on this list.**~~
  **Resolved by the debug panel** — you chose the debug affordance over retuning `GROWTH`, and it
  is built. Merge and buyable species are both reachable in under a minute now (see the debug
  panel section above and checklist steps 5 and 7). The underlying pacing is *unchanged and still
  a live design question*: 120 XP at 1 XP/minute is still two hours of real focus per fish and 45
  completed sessions to an Elder. The debug panel deliberately does not answer that — it only
  stops the pacing from blocking the $99 decision. **Judge the pacing after you have used the app
  for real, not from the debug buttons.**
- **The debug panel must be removed or gated before any EAS build submission.** It is a
  `TODO` in two places (`SettingsScreen.tsx`'s JSX, `useAppStore.ts`'s action block) and it is a
  hard M6b/M7 blocker, not a nice-to-have: three buttons that hand out fish would ship to real
  users otherwise. Gating on `__DEV__` is the cheap version; deleting it is the honest one, since
  by then the pacing question should have been answered on its own terms.
- **Cross-species merging is rejected, and now it is observable.** `evaluateMerge` requires
  same-species, which was a defensive default when there was one species (M3) and is a real
  product question now that there are three: a user with two Koi Fry and one Tetra Fry cannot
  merge, and the UI's species-grouped selection means they get no explanation, just an
  un-tappable third fish. Rejecting is still defensible (the output has to carry exactly one
  `speciesId`), but "you can only merge fish of the same species" is now a rule the app should
  probably *say* somewhere.
- **The Shop has no dedicated paywall screen** — the list *is* the paywall. Fine for five SKUs
  (four sellable); revisit if the catalog grows. The post-M6a species pass is the first time the
  list needed a `ScrollView` to fit, which is the early signal that it will.
- **The give-up wrinkle is half-resolved.** `stats.abandonedSessions` now *does* count a manual
  "Give up" during a focus session (`recordManualAbandon`), and correctly does **not** count one
  during a break — so the "LEFT EARLY" tile no longer under-reports by its own name. What is
  unchanged is the M4 decision itself: a manual give-up still does not sicken a fish, so the
  honest user who taps Give up is still treated better than one who just backgrounds. That was
  always the product question; only the counter was a bug.
- Everything else on M5's list is unchanged and still open: `settings.hapticsEnabled` has no
  consumer, the tank's frame loop runs while other tabs are focused (M6a did not fold this in
  either, despite M5's list calling it cheap to do so), the in-flight session is still not
  persisted, three hardcoded colors remain outside the theme, `resetAll` re-shows onboarding, and
  `StatsScreen` captures `now` at render.

---

## Post-M6a species pass — Reef Shark + Clownfish, and three reusable extension points  [~] built, reviewed

Not a milestone. A content pass on top of M6a that answers the question M6a's own notes left open:
whether the "a new species is a parameter record, not an asset" claim survives a species that is
**not** just another rounder fish in a different hue. It does — but only after adding three small
extension points to `StageVisualParams`, which are the reusable part of this work and the
groundwork the **still-pending stingray** species should be built on rather than re-deriving.

### The three extension points (this is the part that generalizes)

1. **`finScale` split into `dorsalFinScale` + `pectoralFinScale`.** One shared multiplier could
   only ever scale a species' fins together, so "large dorsal, modest pectorals" — the single most
   recognizable silhouette cue on a shark — was inexpressible. **Every species that predates the
   split carries both fields set to its old `finScale` value**, so nothing about Coral Tetra,
   Golden Koi or Indigo Betta changed. Verified against `cf513d9^` itself rather than against the
   claim: the nine historical values are now pinned as literals in `geometry.test.ts`
   (`PRE_SPLIT_FIN_SCALE`), because the equivalence test alone only proved the two fin scales
   equal *each other* and would have passed just as happily if both moved together.
2. **`tailShape?: 'rounded' | 'crescent'`.** Omitted means the pre-existing `buildRoundedTail`
   runs unchanged — the new `buildCrescentTail` is purely additive, a genuinely different set of
   Bézier control points (a long pointed upper lobe, a shorter lower one, and a deep concave notch
   between them) rather than the same math renamed. Nothing else about the fin — hinge, wag
   transform, draw order — differs between the two.
3. **`pattern?: 'stripes'` → `FishGeometry.stripes: StripeBand[]`.** Empty array for every species
   without a pattern. `Fish.tsx` and `SpeciesSwatch.tsx` build a body-oval clip path **only** when
   `stripes.length > 0` and render nothing at all otherwise, so a plain species takes a strictly
   cheaper path — no `Group`, no clip, no allocated `SkPath` — rather than running the stripe code
   over an empty array. Bands are positioned and sized as fractions of `bodyRadiusX`, so they
   scale and stay aligned across Fry/Juvenile/Elder for free, and the clip is the same oval the
   body is drawn from, so a band cannot leak past the silhouette at any stage.

**Deliberately not built: a general pattern system.** `buildStripeBands` is one function with a
fixed band count and spacing. A second pattern is a second function like it, not a new knob.

### The two species

- [x] **Reef Shark ($4.49)** — elongated torpedo body (length-to-height 2.43 → 2.71 across the
      three stages, against ~1.5–1.8 for every other species), `dorsalFinScale` well above
      `pectoralFinScale` at every stage (1.6/0.55 → 2.3/0.75), `tailShape: 'crescent'`, and the
      catalog's coolest low-saturation hue (205, saturation 14). The first species whose *shape*
      rather than its color is the thing you notice.
- [x] **Clownfish ($3.99)** — vivid orange (hue 22, saturation 90), a deliberately chubbier body
      (~1.45–1.5) with small fins on both axes, and the app's first `pattern: 'stripes'`. The
      silhouette stays close to the base fish on purpose: the pattern is what differentiates it.
- [x] Prices in `SHOP.speciesPriceUsd` alongside the existing $1.99/$2.99. No lookup changes were
      needed — `priceLabel` already degrades a priceless id to an un-buyable row, and
      `model.test.ts` already pins that every non-starter id in `SPECIES` has a price, so both new
      ids were covered the moment they were added.
- [x] **`ShopScreen.tsx` genuinely needed no species-count changes** — confirmed by reading it, not
      by trusting the claim: it maps over `SPECIES_ORDER` and every per-row concern (price, owned,
      active, swatch) is derived per id.
- [x] **Same-species merging is untouched.** `merge.test.ts`'s cross-pair `it.each` is driven off
      `SPECIES_ORDER`, so it grew from 6 ordered pairs to 20 and from 3 same-species happy paths to
      5 automatically — the two new species were covered the day they shipped, which is exactly why
      that test was written off the array at M6a. Explicit shark-vs-each-existing-species and
      clownfish-vs-each-existing-species cases were added on top.

Verified independently on 2026-08-02: `npm test` → **346 tests, 19 suites, all passing** (308 after
the debug panel); `npx tsc --noEmit` clean; `npx expo-doctor` 18/18; `npx expo export --platform
ios` succeeds with a Hermes bundle of **4.73 MB — unchanged**. Two more sellable SKUs, a new tail
silhouette and a pattern renderer for no measurable bundle cost. **That is the marginal-cost-per-SKU
argument for staying 2D demonstrated a second time, and this time with real shape variety rather
than recolors** — the 3D report's decisive reason for deferring to v2 gets stronger, not weaker.

### Found in review

- **`ShopScreen` could not scroll, and the list just grew 67%** (fixed). `Screen` is a fixed
  `flex: 1` View — the exact finding the debug-panel review made about Settings, whose note named
  `ShopScreen` as the next candidate "if it gains content". It gained two of five rows. Measured:
  header + 5 rows (~77pt each) + Restore ≈ 621pt against ≈ 761pt of usable height on a 6.1" device,
  so it still fits *there*, but ≈ 627pt against ≈ 618pt on an SE, where "Restore purchases" is what
  goes off-screen. A sixth species overflows everywhere. Fixed with the same `ScrollView` treatment
  Settings and onboarding use; inert while the content fits.
- **The fin-split equivalence test was near-circular** (fixed) — see extension point 1 above. It
  compared `buildFishGeometry(params)` against a rebuild from those same `params`, both through the
  *new* builder. Now pinned to the literal pre-split values, and mutation-checked: moving Coral
  Tetra's Fry fin scales from 0.7 to 0.8 **together** passed the original test and fails the
  pinned one.

### Flagged, not fixed

- **`SpeciesSwatch` clips every species' tail, and the shark is the species that can least afford
  it.** Pre-existing since M6a, not introduced here, which is why it was not changed unilaterally.
  `scale = (size * 0.42) / bodyRadiusX` fits the *body* to 84% of a 44pt canvas, leaving ~3.5pt per
  side; the tail needs ~19pt beyond the hinge. Coral Tetra's tail already renders ~15pt off the
  left edge. It matters more now because the Reef Shark's entire identity is its crescent tail and
  large dorsal, so its $4.49 shop preview is close to a plain grey oval. The fix is to fit the
  species' *full* geometry bounds rather than `bodyRadiusX`, which changes how all five swatches
  are framed — a visual call to make while looking at a screen, ideally in the same sitting as the
  on-device gates.
- **The Reef Shark's dorsal fin sweeps forward to the tip of its nose at Elder.** `point()` scales
  a fin's *offset from its hinge* by the fin scale, so `dorsalFinScale: 2.3` moves the dorsal's
  reference endpoint to body-local x ≈ 37.9 against a body radius of 38. Geometrically consistent
  and within the system's expressiveness, but at that magnitude it reads as a forward-leaning sail
  rather than a dorsal. Judge it on the phone; the fix, if wanted, is either a lower scale or
  splitting position from size in `point()`.
- **Coral Tetra (hue 12) and Clownfish (hue 22) are 10° apart.** `model.test.ts`'s "every species
  has a distinct hue" check passes on strict inequality, but these two are both coral-orange. The
  stripes and the body ratio carry the distinction, which is the pass's whole thesis — worth
  confirming on the phone that they read as different fish at tank scale.
- **Cross-species merging is now observable across five species, not three.** The M6a flag below is
  unchanged and one step more pressing: a user with two Sharks and one Clownfish gets no
  explanation, just a fish that will not select.
- **The `Fish.tsx` sprite still has no component test.** The stripe clip path is exercised at mount
  only through `ShopScreen.test.tsx`'s `SpeciesSwatch` (whose Skia stub now includes `Rect` and
  `addOval`, so all five rows really do build). The tank renderer itself remains untested — a
  pre-existing gap, but the stripe overlay is the first thing in it with non-trivial composition.

## Post-M6a reward rearchitecture — duration-tiered hatch-on-completion  [~] built, reviewed

Not a milestone. A replacement of the M2–M4 reward model, end to end, and the largest behavioural
change since M3. It answers the pacing question the debug panel deliberately did **not** answer:
`GROWTH.xpPerStage` (120) at `GROWTH.xpPerFocusMinute` (1) meant two hours of focus per fish and
45 completed sessions to an Elder, all of it accumulating into a number the app never showed
anyone. Three things were wrong with that at once, and they are the reason this is a rewrite rather
than a retune: **the reward was invisible** (a completed session changed a hidden integer and, four
sessions out of five, nothing on screen); **the first fish took five sessions**, so a new user's
first run paid out nothing at all; and **owning a second species changed nothing about what a
session was worth**, which is a problem for an app whose business model is selling species.

### The rule

Every completed focus session hatches **exactly one brand-new fish, immediately**. Nothing grows,
and XP no longer exists as a concept anywhere in the codebase. Duration alone picks the tier:

- **Short** (below `REWARDS.longSessionThresholdMinutes`) → a **Fry** of the user's active species,
  the M6a `settings.activeSpeciesId`, still entitlement-revalidated on every read.
- **Long** (at or above the threshold — `>=`, the boundary is long) → a **Juvenile** of a species
  drawn uniformly at random from **every** species the user owns, independent of which is active.
  That is the deliberate hook: a long session is worth three short ones *and* is the only place
  owning more species pays out.

**The threshold is 50 minutes, and it is a grid value rather than a computed midpoint.**
`TIMER.minMinutes`/`maxMinutes` are 5/90, so the true midpoint is 47.5 — not a duration the
`stepMinutes` (5) stepper can produce. 50 is the nearest value on the grid and it splits the 18
selectable durations exactly in half: nine short (5–45), nine long (50–90). 45 would have split
them 8/10.

**Merging is untouched, and that was checked rather than assumed.** `evaluateMerge` only ever
compared stage and species — it never read `xp` — so it needed no changes and remains the only way
a fish crosses a stage boundary. `GROWTH.fishPerMerge` is unchanged at 3.

### What was deleted

- [x] `Fish.xp`, `addXp`, `stageProgress`, `isReadyToMerge`, `distributeXp`, `xpForFocusMs`, and
      `GROWTH.xpPerStage` / `GROWTH.xpPerFocusMinute` — none of which had any remaining purpose.
      `GROWTH` now holds one constant.
- [x] **`SCHEMA_VERSION` 4 → 5**, with a migration that drops the dead `xp` field from every
      persisted fish rather than leaving a number in storage that nothing produces or reads.
      Destructuring a key that is already absent is a no-op, so a fish predating the field migrates
      cleanly; non-object entries and a missing `fish` array are both handled.
- [x] **One hatch primitive.** `hatchFish` in `reward.ts` is the only thing in the app that appends
      a fish, and both the real session path and the debug panel go through it. Same invariant the
      debug panel has always had: a shortcut through the real logic, never a parallel copy.
- [x] **`applyPenalty`'s target selection changed of necessity.** It used to reuse the reward
      rule's "first fish with room" pick, which no longer exists. It now sickens the **most
      recently hatched** fish, ties on `bornAt` going to the later array entry since fish are only
      ever appended. Side effect: the close-of-M4 "a user whose fish are all capped cannot be
      penalized" gap is gone, because stage caps are gone.
- [x] **The debug panel's buttons were replaced, not removed** — see the debug-panel section above.
- [x] **A live pre-session preview on the Focus screen**, next to the length stepper: "A Fry —
      `<active species>`" or "A Juvenile — a random species from your collection", updating as the
      stepper moves. It calls the same `classifySessionLength` a real session calls, so it cannot
      disagree with what actually hatches — and the boundary really does agree, because a completed
      session's `elapsedMs` is clamped to exactly `durationMs`, which is synced from
      `settings.workMinutes` while the timer is idle. The long branch deliberately never names a
      species: it genuinely is not decided until the session completes.

### Found in review

- **The sick-fish cure was deleted with `distributeXp`, and nothing replaced it** (fixed; the one
  real bug in the change). `docs/MVP.md` feature 5 specifies that a sick fish "recovers on the next
  completed session", the free-phase Definition of Done lists that recovery as a thing to *see*,
  and on-device checklist step 4 asks the user to watch it happen. The cure was a single
  `health: 'healthy'` write inside `distributeXp`'s grow branch, and it went away with the
  function. Grepping for a healthy write afterwards finds only `createFishAtStage` and `merge.ts`,
  both of which produce a *new* fish — so a fish sickened once stayed grey and sluggish forever and
  the accountability loop was one-way. `applySessionReward` now cures exactly one sick fish per
  completed session, the most recently hatched one, mirroring `applyPenalty` so one abandon costs
  one fish and one session buys one back. It lives in `applySessionReward` and **not** in
  `hatchFish`, so the debug panel cannot hand out a recovery the user did not earn. Verified
  against four mutants (drop the cure, cure every sick fish, only cure when the newest fish happens
  to be sick, revert the tie-break); each is caught by the intended test.
- **Four user-visible strings still promised XP growth** (fixed). The end-of-session notification
  said "Your fish grew", the Focus screen's completed hint said "your fish grew", and onboarding's
  second card promised "Every completed session grows a fish". On a phone that reads as a bug, not
  as stale copy. The onboarding card now also mentions that longer sessions hatch bigger fish,
  which nothing else told a first-launch user.
- **`applyPenalty` broke a `bornAt` tie toward the *older* fish** (fixed). `reduce` with `>` keeps
  the first match, and fish are only ever appended, so two hatches landing in the same millisecond
  — two debug presses, or a hatch and a merge — sickened the earlier of the pair. Now `>=`, matching
  the new cure rule.

### Checked and confirmed sound

- **The random draw is genuinely random and genuinely tested.** `pickRandomSpeciesId` takes an
  injectable `random`, so the tests pin exact indices (0, 0.4, 0.999999 → first, middle, last, with
  the last case covering the run-past-the-end boundary) *and* separately assert that 300 real draws
  across a 3-species pool produce more than one distinct species. An implementation hardcoded to
  index 0 fails the second check immediately.
- **The migration cannot crash on old data.** Destructuring `xp` off a fish that never had it is a
  no-op; a `null` or non-object entry is returned untouched; an absent `fish` array becomes `[]`,
  which is what `persist`'s merge would have produced anyway.
- **Zero fish is a reachable, correct penalty no-op.** A user who abandons their first-ever session
  has nothing to sicken. The abandonment is still counted in `stats.abandonedSessions`.
- **The new tests assert against independently-derived values, not the implementation's own
  formula.** The reward, penalty and migration suites all compare against literal expected fish
  objects and literal species ids rather than re-deriving them — the failure mode the M4/M5 DST
  tests and the species pass's fin-split test each hit in turn.

Verified independently on 2026-08-02 after the review: `npm test` → **362 tests, 19 suites, all
passing** (346 before); `npx tsc --noEmit` clean; `npx expo-doctor` 18/18.

### Flagged, not fixed

- **The pacing swung hard in the other direction, and only real use can judge it.** A fish per
  session, and a Juvenile — worth three Fry — for any session of 50 minutes or more. Three long
  sessions produce three Juveniles, i.e. one merge away from an Elder, against 45 sessions before.
  That is deliberately generous to make the loop legible, but whether it makes the aquarium feel
  earned or free is exactly the question the old numbers got wrong in the opposite direction. It is
  one constant (`REWARDS.longSessionThresholdMinutes`) plus the two stage choices in `reward.ts`.
- **`applyPenalty` is a no-op when the newest fish is already sick, even with healthy fish
  present.** Repeated abandons cost one fish, not many — arguably right, and symmetric with the
  one-cure-per-session rule, but it does mean a user who abandons twice in a row is only charged
  once. Deliberate, and the mirror of the cure; flagging it because it is a behaviour change nobody
  chose explicitly.
- **A long session can draw a species that is unlocked but not in the catalog.** The draw pool is
  `entitlements.unlockedSpeciesIds` verbatim, and the v1→v2 migration deliberately preserves
  unrecognised stored ids. Not reachable today — the only writers are the Shop and the mock
  provider, both of which deal in `SPECIES_ORDER` ids — but the *active*-species path has always
  been re-validated against ownership specifically because a persisted species id is not trusted,
  and this new path widened the same surface without the same guard. A one-line filter to
  catalog-known ids would close it; left alone as unreachable rather than added speculatively.

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
