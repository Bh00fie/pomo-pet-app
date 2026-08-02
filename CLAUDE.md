# Project Context

## Status: M6a complete — **the free-phase MVP (M0–M6a) is feature-complete.** Only the phone gates and the $99 decision remain

Every milestone through M6a is code-complete, unit-tested and independently reviewed. Nothing in
this repo has ever run on a phone. The next action is not more code: it is working through the
**consolidated on-device checklist in `docs/PLAN.md`** (one list covering all six milestones, plus
a step for the debug panel) and then deciding about the Apple Developer $99.

**Do not propose new features before that checklist is done.** The one thing that was blocking it
— that merging (MVP feature 4) and buyable species (feature 8) needed ~6 hours of real focus to
reach — is **resolved**: the user chose a debug panel over retuning pacing, and it is built. See
the M6a debug-panel notes below. `GROWTH` is deliberately unchanged, so the *pacing* question is
still open as a design question; it is just no longer blocking the decision.

The Expo app exists on `main`, builds, has a working Pomodoro timer, and completed focus sessions
hatch/grow procedurally drawn Skia fish that swim in the Aquarium tab. As of M3 the full core loop
is closed: sessions grow fish, capped fish accumulate, and three same-stage fish can be tapped and
merged into one of the next stage with a converge/burst/reveal sequence. M4 adds the retention
half: leaving a running focus session backgrounded past a grace period auto-abandons it and marks
a fish sick, a completed session cures it, and consecutive-day streaks are tracked and shown on
the Focus screen. **M4's logic is done** — its one open product question (whether backgrounding
for the entire session should escape the penalty) was decided and implemented, see below. M5 fills
in everything around that loop: a real Stats screen, a Settings tab, first-launch onboarding, and
a reduce-motion setting that is a genuine two-way override rather than an OS mirror. M6a adds the
shop: an `EntitlementProvider` interface, a store-backed mock behind it, two purchasable species,
and the full buy/fail/restore/set-active UX. **Every screen now shows real data.** Only the
on-device gates remain. `docs/PLAN.md` is the milestone sequence; **M6a is the last MVP
milestone**, and it carries the $99 decision gate.

### Current repo state (2026-08-02)

- `main` — Expo SDK 54 app. `app/` holds Expo Router routes only (thin re-exports); everything
  real is under `src/{config,features,store,anim,ui,theme}`. Zustand + AsyncStorage `persist`
  with `SCHEMA_VERSION` and a migration runner wired in from commit one
  (`src/store/migrations.ts` — now at `SCHEMA_VERSION` **4**, see the M2, M5 and M6a notes below).
  All five tabs — Focus, Aquarium, Stats, Shop, Settings — are real; **there are no placeholder
  screens left**.
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
    `if (useReduceMotion())`: 0.35 is truthy and the check silently inverts. Compare against 1
    when you genuinely need a boolean, as `Tank.tsx` does. As of M5 it also resolves the user's
    tri-state override — see the M5 section below — but it is still **the only** thing any
    consumer reads, which is why the override needed no per-consumer changes.
  - Motion tokens (`src/anim/motion.ts`) are the only source of durations/easings/springs.
    `Ripple` and `ParticleBurst` are wired into the M3 merge reveal (`MergeSequence.tsx`), and
    `springs.penalty` into the M4 healthy→sick wince in `Tank.tsx`. Every token now has a consumer.
- **Growth + merge (M3) is real.** Two rules, both pure, both in `src/features/pet/`:
  - **Spawn rule (`reward.ts`) — the user picked this one, do not change it without asking.** A
    completed session grows the *first* fish that still has room in its stage; a fresh Fry hatches
    **only** when the collection is empty or every fish is already capped. The two alternatives
    considered and rejected were "spawn every session" and "spawn every N sessions". Cap boundary:
    `xp < GROWTH.xpPerStage` is growable, `xp >= xpPerStage` is capped, `addXp` clamps to exactly
    the cap — consistent with `isReadyToMerge`, no off-by-one.
  - **Merge rule (`merge.ts`).** `evaluateMerge` combines `GROWTH.fishPerMerge` same-stage,
    same-species fish into one of the next stage at 0 XP. It never mutates and never throws:
    every bad selection returns a typed reason (`wrong-count`, `fish-not-found`, `mixed-stages`,
    `mixed-species`, `top-stage`). Elder merges are rejected, not crashed. It returns the *whole*
    next collection, so `useAppStore.mergeFish` can apply it in a single `set` — one read of
    state, one write, and no write at all on rejection. That is what makes it atomic; keep it.
  - **Same-species is a deliberate defensive default, not a spec requirement.** `docs/MVP.md`
    feature 4 only says "N same-stage fish". Species is added because the merge output has to
    carry exactly one `speciesId` and there is no defined answer for which one when the inputs
    differ — rejecting beats inventing a rule. **No longer unobservable: M6a shipped three
    species and did *not* revisit this.** See the M6a flag below — it is now a live product
    question, not a defensive default with no consequences.
  - UI: `Tank.tsx` owns tap-selection (`FishTapTarget` overlays that track each fish's live
    Reanimated position, so selection costs no re-renders) and exposes `mergeSelected` via ref;
    `AquariumScreen.tsx` renders the count/stage readout, Clear, and a Merge button enabled only
    for a complete valid selection. **The store mutation runs synchronously before any
    animation** — `MergeSequence` is purely a visual echo of something already persisted, so a
    kill mid-sequence loses nothing. Under Reduce Motion the sequence is skipped entirely (the
    result fish is simply already at the merge point), rather than hidden and then revealed.
- **Overflow XP carries, it is not discarded (decided at M4 — the user's call, do not revert
  without asking).** `distributeXp` in `reward.ts` grows the selected fish to *exactly* its cap
  (`addXp` still clamps) and re-feeds the leftover through the same grow-or-spawn selection, so it
  lands on the next under-cap fish or hatches a Fry. `awardedFishId` stays the *primary* target
  even when the overflow ends up elsewhere. The recursion's base case is the spawn branch, which
  absorbs everything left and cannot recurse again; every other step consumes ≥1 XP *and* removes
  one fish from the under-cap set, so depth is bounded by the fish count — verified, not assumed.
- **Accountability + streaks (M4) are real.**
  - **The penalty decision is a timestamp delta, never a timer.** Same lesson as M1's `endsAt`.
    `useTimer.ts`'s `AppState` listener handles `'background'` and `'active'` **only**;
    `noteBackgrounded` stores an absolute `backgroundedAt` on `useTimerStore`, and
    `resolveForeground` computes `now - backgroundedAt` against `ACCOUNTABILITY.backgroundGraceMs`
    (8s, **inclusive** — exactly 8s is forgiven). **Never add a `setTimeout` to this path.**
  - `'inactive'` has no branch in the listener at all, so a Control Center peek
    (`active → inactive → active`) never opens an excursion. And `noteBackgrounded` refuses to
    overwrite an already-open one, so an `inactive` blip *inside* an excursion
    (`background → inactive → background`) still measures from the real start rather than
    restarting the grace clock. Both directions are tested.
  - **`resolveForeground` checks the excursion length *first*, before any wall-clock reconcile
    (the user's call, decided after the M4 review — do not revert without asking).** Past the
    grace period the session is always abandoned and `lastPenaltyToken` bumped, *regardless* of
    whether `endsAt` also passed while away: a 25-minute session backgrounded for 25 minutes is a
    penalty, not a payout. Only *within* the grace period does it fold the clock in, which is what
    still lets a brief lock-screen glance spanning `endsAt` complete normally.
  - **`tick` is a no-op while `backgroundedAt` is set, and that is load-bearing** — without it the
    priority above is decided by a race, not by the code. `useTimer`'s interval is a second,
    independent path to `completed` (`if (current >= endsAt) tick(current)`), and iOS can deliver
    an overdue timer callback *before* the `AppState` `'active'` listener on resume; the session
    would already be `completed` when `resolveForeground` ran, failing its `status === 'running'`
    check, and the excursion would escape. The guard makes `resolveForeground` the exclusive
    resolver of a backgrounded session — which is what M1 always assumed anyway. It lives in the
    `tick` *action*, not in `dispatch`, because `resolveForeground`'s own within-grace TICK is
    dispatched after it clears `backgroundedAt` and must still complete the session. **Never add
    another caller that can complete a session while an excursion is open.**
  - Backgrounding during a **break** is exempt via a real `timer.mode !== 'focus'` check in
    `noteBackgrounded`, and the manual **"Give up"** button is exempt too. `useLeaveEarlyPenalty`
    keys off `lastPenaltyToken` (a counter bumped only by the auto-abandon path) rather than
    `status === 'abandoned'`, which both paths produce — that indirection is the whole reason
    give-up can be exempt. Mounted **once**, at `app/_layout.tsx`, same rule as `useSessionReward`.
  - `applyPenalty` (`src/features/pet/penalty.ts`) is pure and **reuses the reward rule's target
    selection** — the fish that gets sick is exactly the one the session would have grown. No
    growable fish (empty or all-capped) is a valid no-op. Recovery lives in `reward.ts`: being
    chosen as a grow target cures a fish, at *every* link of an overflow chain.
  - **Streaks (`src/features/streak/streak.ts`) are pure and keyed on a local `YYYY-MM-DD`
    string** — never a UTC timestamp, never a `toISOString()` slice (that shifts the date near
    midnight anywhere west of UTC). Day distance is measured **midnight-to-midnight and rounded**,
    which is what absorbs a 23h/25h DST day; a raw ms division between the two *instants* would
    not. Written in the same `set` as the fish reward so streak and stats cannot drift.
  - Sick visuals: `HEALTH.sickSaturationMultiplier` scales the species' *own* saturation (so the
    hue still reads as that species, just ill — not a flat recolor; `colors.sick` is now unused),
    `HEALTH.sickTailWagMultiplier` slows the tail wag, and `Tank.tsx` plays a damped
    `springs.penalty` wince on the healthy→sick transition, skipped under Reduce Motion.
- **Stats, settings, onboarding (M5) are real.**
  - **`settings.reduceMotion` is a tri-state `'system' | 'on' | 'off'`, not a boolean.**
    `src/anim/useReduceMotion.ts` is the **only** reader — `'system'` defers to
    `AccessibilityInfo`, `'on'` forces reduced motion when the OS setting is off, `'off'` forces
    **full** motion when the OS setting is on. That last direction is the point of the change: the
    old boolean could only ever add reduced motion. All six preference × OS-state combinations are
    tested. Because every animation consumer reads only the hook's number, nothing else changed —
    keep it that way; a consumer that reads `settings.reduceMotion` directly would bypass the OS
    half of the resolution.
  - **`SCHEMA_VERSION` is 3.** The 2→3 migration maps a stored `true` to `'on'` and everything
    else — `false`, missing, corrupt — to `'system'`, **never `'off'`**. v2's `false` meant "no
    override on top of the OS setting"; `'off'` is a new capability that no v2 payload could have
    expressed, and mapping `false` there would silently switch off the accessibility setting for
    every user who has the OS toggle on. Same lesson as the M2 migration: the *meaning* of a
    persisted value is part of its schema.
  - **`src/features/stats/stats.ts` is pure, with an injected `now`** — same discipline as
    `streak.ts` and the timer machine. The 7-day window is built by subtracting from `now`'s local
    **calendar fields** (`new Date(y, m, d - i)`), never by dividing raw ms. `StatsScreen.tsx`
    holds no date math; if you find yourself writing `new Date(dateKey)` in a component, stop —
    that parses a date-only string as *UTC* midnight and reads back the previous local day west of
    UTC, which is why `DayFocus` carries `weekday` rather than letting the caller re-derive it.
  - **The M5 DST tests were vacuous on the first pass, and this is the second time in two
    milestones.** M4's failure was the *mechanism* (`process.env.TZ` set from a test file, silently
    ignored). M5 got the mechanism right — pinned in `jest.config.js`, asserted inside the test —
    and still tested nothing, because both cases used a midday `now`. The DST shift is one hour, so
    from midday even naive ms subtraction lands on the right calendar date; all 16 tests passed
    against a deliberately broken `getWeeklyFocus`. The discriminating inputs are a `now` **within
    an hour of local midnight on a day *after* the transition, looking back across it** — Mar 9
    00:30 (naive arithmetic drops the transition day out of the window) and Nov 2 23:30 (naive
    arithmetic emits it twice). **Rule this proves, extending M4's: pinning the environment is
    necessary but not sufficient — the inputs have to be ones a wrong implementation gets wrong.
    Mutation-test any test whose whole purpose is an edge case.**
  - Settings deliberately does **not** duplicate the Focus screen's work/break steppers — one
    source of truth for `settings.workMinutes`/`shortBreakMinutes`. Verified, not assumed.
  - The reset-data action is gated behind `Alert.alert`: the `cancel` button has no `onPress` and
    the `destructive` button is the only caller of `resetAll`. No path reaches the wipe without a
    second deliberate tap.
  - Onboarding is an overlay from `app/_layout.tsx` gated on `onboardingCompletedAt`, behind
    `hydrated` so it does not flash for a frame on every launch. `onboardingCompletedAt` and
    `completeOnboarding()` were verified present in the **M0** commit (`6940300`) — in `types.ts`,
    `initialPersisted` *and* `partialize` — so the "no migration needed" claim really did hold this
    time. (Checked against history rather than the current file, same as at M4.)
- **Shop + entitlements (M6a) are real.**
  - **The provider never writes to the store, and the call site never skips the write. Both
    halves are load-bearing — do not "simplify" either.** `src/features/shop/EntitlementProvider.ts`
    is shaped after a real IAP SDK (RevenueCat's `getCustomerInfo`/`purchasePackage`/
    `restorePurchases`), deals only in species ids, and **resolves rather than rejects** with a
    typed `cancelled | network | already-owned | unknown` reason. `ShopScreen.tsx` is what applies
    a success via `unlockSpecies`. M6b replaces exactly one file and one import.
  - **The write is the first statement after a successful result and is deliberately *not* behind
    an is-mounted check.** It must survive the screen unmounting mid-await (a tab switch during the
    ~1s round trip); only the `setState` calls after it no-op post-unmount. There is a test that
    unmounts mid-purchase and asserts the store still gets the species — **do not add an
    is-mounted guard**, it is a caught mutant.
  - **The `try` wraps the provider call only.** Widening it back over the store write would report
    a purchase that succeeded *and was applied* as a failure.
  - **A per-species in-flight `useRef` guards Buy, not `disabled={pending}`.** React state does not
    exist yet for a second tap in the same frame. Invisible against the mock; a double
    `purchasePackage` charge at M6b. **Third time this repo has hit "React state is not a lock"**
    (M3 merge, M3 double-tap alert, now this) — reach for a ref first in any money/mutation path.
  - **`MockEntitlementProvider` is backed by `useAppStore`**, not a list of its own, so a mock
    purchase survives a restart. The consequence: **the provider and the store literally cannot
    disagree**, so the divergence risk the write split exists to manage is *unobservable* in the
    free phase. Do not read a clean on-device shop demo as evidence the seam is safe.
  - **"Restore purchases" is close to a no-op and must be described that way.**
    `restorePurchases` resolves with the store's own `unlockedSpeciesIds` and
    `syncUnlockedSpeciesIds` unions it straight back in, so nothing can change. The union's
    never-downgrade property is tested against a provider *forced* to forget a species, because the
    real mock cannot produce that state.
  - **Nothing reconciles entitlements at launch.** `getOwnedSpeciesIds()` is never called on boot.
    Fine now; at M6b this is the gap that turns any lost write into a permanent silent divergence.
    **Add a startup sync in M6b** — it is on the `docs/PLAN.md` M6a limitations list.
  - `settings.activeSpeciesId` chooses which species new fry hatch as. **`SCHEMA_VERSION` is 4**
    (3→4 adds the field, defaulting to the starter), and `awardSessionCompletion` *also*
    re-validates it against `entitlements.unlockedSpeciesIds` on every read — belt and braces,
    because it is the one settings field that depends on entitlements.
  - `SpeciesSwatch` draws the real Elder geometry, desaturated via `HEALTH.sickSaturationMultiplier`
    when locked — reusing the M4 sick constant rather than a second desaturation rule. The unlock
    pop reuses `springs.celebrate` from the M3 merge reveal. Both skipped under Reduce Motion.
  - **Cross-species merging is still rejected, and it is observable now.** M3's note said "revisit
    at M6a, when the shop ships more species" — this is that moment, and it was *not* revisited.
    Three species exist; a user with two Koi Fry and one Tetra Fry simply cannot merge and gets no
    explanation. Still defensible (the merge output carries one `speciesId`), but the rule should
    probably be stated in the UI. Product call, flagged not fixed.
- **The debug panel (post-M6a, the user's call at the gate) is real — and it is a shortcut through
  the real logic, not a parallel one.** A "⚠ DEBUG — TESTING ONLY" card at the bottom of Settings
  (dashed amber border, distinct on purpose) with Grant XP (+120/+360/+1000), Cap all fish, and
  Spawn a fry. It exists because real pacing made merge and a bought species undemoable before the
  $99 decision; **`GROWTH.xpPerStage`/`xpPerFocusMinute`/`fishPerMerge` are deliberately untouched
  — do not "fix" the pacing by editing them without asking.**
  - **Each action calls the same function the real path calls, and that is the invariant to keep.**
    `debugGrantXp` → `distributeXp` from `reward.ts` (made `export` rather than copied — the
    selection rule, the `addXp` clamp and the M4 overflow recursion are all the real ones);
    `debugCapAllFish` → `addXp(f, GROWTH.xpPerStage)`, not a direct `xp =` write;
    `debugSpawnFish` → the same `createFish` primitive as the M3 spawn branch. If a future change
    makes any of these a reimplementation, the panel stops proving anything about the real app.
  - **`resolveSpawnSpeciesId` is now the single active-species resolution** — extracted from
    `awardSessionCompletion`, used by it and by `debugSpawnFish`, and exported as the
    `selectSpawnSpeciesId` selector so UI that *names* the species reads the same answer. This
    removed a duplication rather than avoiding adding one. Never read `settings.activeSpeciesId`
    directly for this: it is the one settings field that can name a species the user does not own.
  - **No accountability bypass, and this is load-bearing.** None of the three touches `stats`, the
    streak, or `health` — capping a fish deliberately does *not* cure it, which stays exclusive to
    being picked as a real grow target. So the panel can hand you fish but not a streak or focus
    time you did not earn, and Stats stays honest while the user tests. Tested from both sides.
  - **`debugGrantXp` cannot produce more than one new fish**, and the panel's on-screen copy says
    so: `distributeXp`'s spawn branch is the recursion's base case and absorbs *all* remaining XP
    into one Fry, where `addXp` clamps it. +1000 XP on an empty tank is one capped Fry, not eight.
    Three fish is Spawn ×3 then Cap all.
  - **`TODO: remove or gate before EAS build submission` is on both the JSX and the store action
    block.** Hard M6b/M7 blocker. Do not let it ship.
- `useSessionReward` is mounted **once**, at `app/_layout.tsx`, so a session finishing on any tab
  awards. It de-dupes on the timer's `endsAt` (stable per session) via a hook-local ref — that
  guard is per hook instance, so **do not mount it a second time** or every session awards twice.
  Note `useTimer()` itself *is* mounted twice (root bridge + `FocusScreen`), so there are two
  `AppState` listeners; that is safe only because `noteBackgrounded`/`resolveForeground` are
  idempotent per excursion. Keep them that way.
- **Tests exist and must stay green**: `npm test` (jest-expo preset), 308 tests across 19 suites.
  Note `@testing-library/react-native` v14 has an *async* API — `render`, `renderHook` and
  `fireEvent` must all be awaited. **One exception, learned at M6a:** `fireEvent.press` returns
  whatever the handler returns, so awaiting it on an `async` `onPress` blocks until the *whole*
  handler settles — which makes any mid-flight state unobservable. Press inside `act` and discard
  the promise instead (see `ShopScreen.test.tsx`'s `press` helper). Also: Skia ships untransformed
  ESM that `jest-expo` does not cover and its own `jestSetup.js` wants a CanvasKit wasm build, so
  component tests that mount Skia stub the module locally rather than pulling that in. Worklet/`SharedValue` code (`steering.ts`) is deliberately
  untested — there is nothing meaningful to assert without a native runtime; the plain-number math
  it composes with (`geometry.ts`) is tested instead. **`jest.config.js` pins `process.env.TZ` to
  `America/New_York`** — see the M4 review note below for why that has to live there and not in a
  test file.
- Verified independently on 2026-08-02, twice — after the M6a build/review (`npm test` 286/286,
  18 suites, 4.72 MB) and again after the debug panel and its review: **`npm test` 308/308
  (19 suites), `npx tsc --noEmit` clean, `npx expo-doctor` 18/18, `npx expo export --platform ios`
  succeeds (4.73 MB Hermes bundle**; 4.71 MB at M5, 4.7 at M4, 4.69 at M3, 4.67 at M2, 4.02 at M1).
  M6a cost ~10 KB — a whole shop, two species and a Skia swatch renderer, with no new dependency —
  and the debug panel another ~10 KB.
- **Not verified**: anything needing the user's phone, which is now *every remaining MVP item*.
  `docs/PLAN.md` holds the **consolidated eight-step on-device checklist** covering all six
  milestones in one pass — use that rather than the six scattered per-milestone gates. In short:
  the app opens in App Store Expo Go (M0), the end-of-session notification fires (M1), the tank
  looks right and holds 60fps (M2), a sick fish reads as unwell and real iOS `AppState` behaves as
  modelled (M4), the merge sequence reads as satisfying (M3 — **now reachable in a minute via the
  debug panel instead of six hours**), the new screens lay out correctly and Reduce Motion `'off'`
  with the iOS setting **on** visibly restores full motion (M5), the shop demos end to end
  including the 1-in-10 simulated failure *and* a bought species is visible in the tank (M6a), and
  the debug panel itself is reachable and leaves Stats honest. Do not mark any of them done until
  the user confirms. **The checklist is now completable in one sitting** — it was not before the
  debug panel, and that is the single reason the panel exists.

### Open issues found in the M2/M3/M4/M5/M6a reviews (2026-08-02)

Fixed already:

- **The Settings screen could not scroll, and the debug panel overflowed it** (debug-panel review;
  the one real bug in that commit). `Screen` is a fixed `flex: 1` View with no scroll. Three cards
  fitted; the debug card adds ~340pt against ~694pt of usable height on a 6.1" phone, so its own
  bottom two buttons — Cap all fish and Spawn a fry, i.e. **exactly the pair that makes merge
  reachable** — were clipped off-screen with no way to scroll to them. The affordance built to
  unblock on-device testing would have been untappable on device, and it would have looked like a
  store bug. Fixed with a `ScrollView`, the same treatment M5 gave onboarding for the same reason.
  **Rule this proves (again): `Screen` does not scroll — any screen that grows past a viewport has
  to opt in.** `ShopScreen` and `StatsScreen` are the next candidates if they gain content.
- **The Spawn button could name a species it would not spawn** (debug-panel review). The label read
  `settings.activeSpeciesId` directly while the action resolved through `resolveSpawnSpeciesId`,
  which re-validates against `entitlements.unlockedSpeciesIds` — so an unowned active id gave a
  button reading "Spawn a Golden Koi fry" that handed over a Coral Tetra. Fixed by exporting
  `selectSpawnSpeciesId` so label and action share one resolution; caught by a mutation check.
- **The debug panel had no component test** (debug-panel review) — and neither did the Settings
  screen at all, since M5. The store actions were well covered, but nothing pinned the *wiring*:
  a "+360 XP" button calling `debugGrantXp(120, …)` type-checks and passes every store test.
  `SettingsScreen.test.tsx` now covers the three actions' wiring, the species-label agreement, and
  that all three leave `stats` untouched. Same gap and same fix as the M6a "the Shop screen had no
  test at all" finding — **a milestone's headline UI keeps shipping untested here.**
- **The Buy button's `disabled` was not a lock** (M6a review — the one real bug in the write
  split). Two taps in the same frame both reached `purchaseSpecies`, because `disabled={pending}`
  is derived from React state that does not exist yet for the second tap. Against the mock this is
  invisible — its `isOwned` still reads false for the second call and `unlockSpecies` is
  idempotent — which is precisely the argument for fixing it *before* M6b, where that line is
  `purchasePackage` and two calls is two charges. Closed with a per-species `useRef`, released in
  a `finally` so a failed purchase can still be retried. **Third occurrence of "React state is not
  a lock" in this repo.**
- **The purchase `try` was too wide** (M6a review). It wrapped the store write and everything
  after it, so a throw past the await would have shown "The purchase failed" for a purchase that
  succeeded *and was applied* — the one lie the screen must not tell. Narrowed to the provider
  call alone. Related: a row's error message is now suppressed once the species is owned, so it
  can never read "Unlocked" and "The purchase failed" simultaneously.
- **The Shop screen had no test at all** (M6a review), despite being the milestone's entire
  deliverable and the seam real money flows through at M6b. `ShopScreen.test.tsx` now pins the
  call site's half of the write-split contract — which is the *only* half that can be pinned,
  since the mock reads ownership out of the same store it is reconciled against. Verified against
  six mutants (drop the ref guard, never release it, put the write behind an is-mounted check,
  drop the owned-row error suppression, make `syncUnlockedSpeciesIds` a replace, write regardless
  of `result.ok`); each is caught, each by exactly the intended test.
- **The M5 DST stats tests were vacuous too** (M5 review) — the second time in two milestones, and
  a *different* failure mode from M4's, which is why it got through. The mechanism was correct
  (zone pinned in `jest.config.js`, asserted in the test) but both cases used a midday `now`, and a
  one-hour DST shift never moves a midday timestamp across a date boundary — so naive ms
  subtraction produced identical output and all 16 tests passed against a broken `getWeeklyFocus`.
  Verified by mutation, not by reading. Replaced with inputs that discriminate: Mar 9 00:30 (the
  naive version drops 2026-03-08 from the window, silently losing a day of focus time off the
  chart) and Nov 2 23:30 (it emits 2026-11-01 twice, counting one day into two bars). Both assert
  the midnight-to-midnight span first, matching the streak suite, and both were confirmed to fail
  against the naive implementation while nothing else in the file does.
- **`useReduceMotion` had no test at all** (M5 review), despite the tri-state override being the
  headline of the milestone — `src/anim` had no `__tests__` directory. Now covered for all six
  preference × OS-state combinations, live `reduceMotionChanged` events, listener cleanup and a
  malformed persisted value. Written as **transitions on one mounted hook**, not six independent
  renders, because three of the six combinations expect `1` — which is also the hook's value before
  the async OS read resolves, so an isolated assertion would pass even if the OS value never
  arrived. That includes `'off'` + OS-on, the single most important case. Verified against four
  mutants (drop the `'off'` branch, drop the `'on'` branch, ignore the OS value, leak the
  listener); each is caught.
- **The M4 DST tests were vacuous** (M4 review). They claimed to cover spring-forward and
  fall-back and covered neither: `process.env.TZ` assigned inside a `beforeAll` is **silently
  ignored** — the runtime resolves its zone before any test file loads — so they ran in the
  machine's own zone (Europe/London here), and the date pairs were the day *before* each
  transition, which is a plain 24-hour day even in the right zone. The whole streak suite passed
  against a deliberately-broken `Math.floor` implementation. Now the zone is pinned in
  `jest.config.js` (which Jest loads in its parent process, before workers fork — that is the only
  place this works), the dates are the transition days themselves (Mar 8→9 = 23h, Nov 1→2 = 25h,
  Mar 7→9 = 47h), and each test asserts the span it depends on so it cannot silently degrade
  again. **Rule this proves: a test that exercises an environment has to assert that environment.**
  Verified the corrected tests do fail against `Math.floor`.
- Two small M4 correctness additions: `applyCompletedSessionToStreak` now floors the same-day
  branch at 1, so a completed session can never leave the streak on zero; and the grace-period
  boundary (`elapsed === backgroundGraceMs` → forgiven) is now pinned by a test rather than only
  by the two sides of it.

Checked and **confirmed sound**, listed because they were claims worth distrusting:

- **The debug panel really does route through the real logic** (debug-panel review). Checked the
  import, not the comment: `useAppStore.ts` imports `distributeXp` from `@/features/pet/reward` —
  the same module `applySessionReward` lives in, which now calls the *exported* function rather
  than a private copy. There is no second implementation of the selection/overflow rule anywhere.
  `debugCapAllFish` genuinely goes through `addXp`'s clamp, `debugSpawnFish` genuinely through
  `createFish`, and `resolveSpawnSpeciesId` really did replace the inline block in
  `awardSessionCompletion` rather than sitting beside it.
- **No accountability side effects are smuggled into any debug action** (debug-panel review). Read
  all three bodies: each returns only `{ fish }` from its `set`, so `stats`, the streak,
  `lastPenaltyToken` and `health` are untouchable by construction — capping a sick fish leaves it
  sick. Pinned by tests at both the store and screen level.
- **The "identical to a real session" test is real, not vacuous** (debug-panel review). It runs a
  genuine `awardSessionCompletion(25 min)`, resets, runs `debugGrantXp` with the equivalent XP, and
  compares the actual fish objects (`xp`, `speciesId`, `stage`, `bornAt`, `health`) with only the
  random `id` stripped — not two empty arrays. Fair caveat on the word "byte-identical": ids
  necessarily differ, and the case starts from an empty tank, so it exercises the *spawn* branch;
  the grow-target and overflow branches are covered by the sibling tests rather than by this one.
- **The write split's unmount case really is safe** (M6a). Traced, not assumed: `unlockSpecies` is
  the first statement after a successful result, has no is-mounted guard, and a zustand action
  captured at render still works after the component is gone. Now pinned by a test that unmounts
  the screen mid-purchase. The "a store write must survive this screen unmounting" comment in
  `ShopScreen.tsx` is accurate.
- **`unlockSpecies` is genuinely idempotent** (M6a) — it early-returns with no `set` at all when
  the species is already owned, so nothing can produce a duplicate id in `unlockedSpeciesIds`.
- **The v3→v4 `activeSpeciesId` migration is correct**, and the store's independent re-validation
  in `awardSessionCompletion` means even a hand-corrupted persisted value cannot spawn an unowned
  species. Both are tested.
- **The M6a give-up fix did not over-reach.** A manual "Give up" during a **focus** session still
  counts toward `stats.abandonedSessions`; only the *break* case was excluded. So the "LEFT EARLY"
  tile no longer under-reports by its own name — that M4/M5 flag is resolved. What is unchanged is
  the M4 product decision that a give-up does not sicken a fish.
- **The M5 reduce-motion override really does work in both directions.** Traced all six
  combinations against the actual code rather than the "composes transparently" claim, then pinned
  each one with a test: `'off'` genuinely returns `1` while the OS setting is on, `'on'` genuinely
  returns `REDUCED_MOTION_SCALE` while the OS setting is off, and `'system'` is a true passthrough
  including live OS toggles. The "no per-consumer changes needed" claim also holds — every consumer
  (`Ripple`, `ParticleBurst`, `useAquariumClock`, `MergeSequence`, `Tank`) reads only the hook's
  return value; grepped, nothing reads `settings.reduceMotion` directly except the Settings UI.
- **The 2→3 migration is correct and defaults existing users to `'system'`,** not `undefined` and
  not a crash — including when `settings` is absent entirely. Consistent with the M2/M4 pattern,
  and the mapping of `false` → `'system'` rather than `'off'` is the right call for the reason the
  migration comment gives.
- **"`onboardingCompletedAt` already existed since M0" — true.** Verified against commit `6940300`
  itself, not the current file: present in `types.ts`, `initialPersisted` and `partialize`, with
  `completeOnboarding()` alongside it. No payload can be missing it, so no migration was needed.
- **The reset-data confirm dialog has no bypass.** `cancel` has no `onPress`; the `destructive`
  button is the only reference to `resetAll` in the screen. A double-tap queues a second alert
  rather than skipping one, and `resetAll` is idempotent regardless.
- **Settings does not duplicate the Focus screen's duration controls.** Grepped: the only
  `workMinutes`/`shortBreakMinutes` UI in the app is `FocusScreen.tsx`'s steppers.
- **"No `SCHEMA_VERSION` bump needed" — true this time.** Verified against the M0 commit rather
  than the current file: `abandonedSessions`, `currentStreak`, `longestStreak`,
  `lastCompletedLocalDate` and `focusMsByDate` have been in `Stats` *and* in
  `initialPersisted.stats` with these exact zero-value defaults since commit one, so no stored
  payload can be missing them and `persist`'s shallow merge cannot produce an `undefined`. (The
  M2 review caught the opposite of this, so it was re-derived from history, not taken on faith.)
- **The break exemption is real**, not just documented: `noteBackgrounded` early-returns on
  `timer.mode !== 'focus'`, so an excursion is never even opened during a break.
- **The overflow recursion cannot run away.** Base case is the spawn branch, which absorbs all
  remaining XP into one Fry and cannot recurse; every other step consumes ≥1 XP and removes one
  fish from the under-cap set. Depth is bounded by the fish count, and a 60-fish chain is now a
  test. Sickness is cured at *every* link, not just the first — also now a test.

- **Three teardown/timing edge cases in the M3 merge reveal** (M3 review). `MergeSequence`
  unmounting before its completion timer fired never ran `onComplete`, stranding the merge result
  frozen at scale 0 — invisible, with tap-selection locked out, until an app restart; `onComplete`
  now also runs from the effect cleanup, guarded so it fires exactly once. Reduce Motion hid the
  new fish (`revealScaleSV = 0`) and only restored it a frame later in an effect, so the payoff
  was a flash of nothing; `Tank` now skips the freeze/hide/sequence entirely when motion is
  reduced. And a same-tick double tap on Merge could surface a bogus "fish could not be found"
  alert (it could never double-merge — the store's `get()` re-read already prevented that) — a
  synchronous in-flight ref closes it. Tap-selection also groups by species now, so the UI cannot
  build a selection `evaluateMerge` will reject. **Rule this proves: React state is not a lock.**
  `pendingMerge` only reflects a merge one render later; anything guarding a synchronous action
  needs a ref.
- **Missed migration.** M2 corrected the `entitlements.unlockedSpeciesIds` default from the dead
  literal `'starter'` to `STARTER_SPECIES_ID` but left `SCHEMA_VERSION` at 1. `persist` merges
  stored state *over* initial state, so a device holding v1 state would keep the dead id forever
  and read the starter species as locked once the shop lands (M6a). Now `SCHEMA_VERSION = 2` with
  a real 1→2 migration + tests. **Rule this proves: changing a persisted default's *meaning* needs
  a migration just as much as changing its shape does.**

Flagged for the user, deliberately not fixed unilaterally:

- ~~**THE BIG ONE AT THE GATE: the two features you're deciding $99 on can't be demoed**~~
  **Resolved** — the user chose the debug-only affordance in Settings over retuning `GROWTH`, and
  it is built and reviewed (see the M6a debug-panel notes above). Merge and a bought species are
  both reachable in under a minute now. **What is explicitly *not* resolved is the pacing itself:**
  `GROWTH.xpPerStage` is still 120 at 1 XP/minute, so two hours of real focus per fish and 45
  completed sessions to an Elder — the older "Reaching Elder takes 45 sessions" flag below is the
  live version of that question, and it should be judged from real use, not from debug buttons.
- **The debug panel must be removed or gated before any EAS build submission** (new). `TODO`s are
  in place on both the JSX and the store action block. A hard M6b/M7 blocker — three buttons that
  hand out fish must not reach real users. `__DEV__` is the cheap gate; deletion is the honest one.
- **The provider/store divergence risk is structural and belongs to M6b** (new, M6a). The call
  site's half is now sound (see the fixes above), but three things only become real once
  RevenueCat is behind the interface, and none can be tested against a store-backed mock:
  (a) **nothing reconciles entitlements at launch** — `getOwnedSpeciesIds()` is never called on
  boot, so any divergence persists until the user finds Restore; (b) **`persist`'s AsyncStorage
  writes are fire-and-forget** with no `onError`, so a failed disk flush loses an unlock silently;
  (c) **concurrent purchases of different species are still allowed** (the guard is per-species,
  matching the per-row UI) where real IAP SDKs reject a second concurrent purchase. All three have
  the same first fix: a startup `getOwnedSpeciesIds()` → `syncUnlockedSpeciesIds()` sync, which is
  **not worth building now** against a provider where it is provably a no-op. **Put it on the M6b
  list.** Do not let a clean on-device shop demo be read as evidence the seam is safe — the mock
  cannot fail this way by construction.
- **`docs/PLAN.md` M6a's "behind a dev-menu toggle" bullet was never built** (new, M6a). Retired
  rather than quietly ticked: there is no second provider to toggle to until M6b, so it would
  select between the mock and nothing. Endorsed. Noted because the *useful* dev affordance turns
  out to be the XP grant above, not a provider switch — **and that one now exists.**
- **Cross-species merging: M3 said "revisit at M6a" and M6a did not** (new, M6a). Three species
  now exist, so `evaluateMerge`'s same-species requirement is observable — two Koi Fry and one
  Tetra Fry cannot merge, and the species-grouped tap selection means the user gets no explanation,
  just a fish that will not select. Still defensible (the output carries exactly one `speciesId`),
  but the rule should probably be stated in the UI, or the shop should warn that species do not
  interbreed. Product call.
- **`settings.hapticsEnabled` is a persisted setting with no consumer anywhere** (new, M5;
  self-flagged by the build agent and confirmed). It has been in the schema since M0, defaults to
  `true`, and nothing reads it — there is no haptics code in the app at all. Correctly left out of
  the Settings screen, since a toggle that does nothing is worse than no toggle. Two clean
  resolutions: wire up `expo-haptics` (session start/complete, merge, penalty) and *then* add the
  switch, or drop the field in the next migration. **Do not add the switch on its own.**
- **The tank's frame loop still runs while another tab is focused** (carried from M4, where it was
  tagged as an M5 polish item — M5 did not do it). Now slightly worse in practice, because there
  are five tabs and four of them are not the Aquarium. The fix is to gate `useAquariumClock` on
  navigation focus; whether it resumes cleanly is device-only, which is the honest reason it was
  not done blind. M5's list called it "cheap to fold into M6a" — **M6a did not do it either.**
  Third milestone carrying it. Worth doing on the phone in the same sitting as the gates, since
  that is the only place it can be validated.
- **Persisting the in-flight session is now unscheduled.** M4's list called it an M5 item and M5
  did not do it, so force-quitting mid-session still both loses a completed reward and escapes the
  penalty. It genuinely does belong with the open M4 penalty decision rather than in a polish
  milestone — but it is now the only MVP-era item with no milestone attached at all.
- **Three hardcoded colors remain outside the theme** (new, M5; self-flagged and confirmed):
  `Ripple`'s `#EAF4FF` and `ParticleBurst`'s `#FFD166` defaults, and the `rgba()` fills in
  `AquariumScreen`'s count pill and `FishTapTarget`'s hit area. Endorsing the decision not to
  paper over it: these are alpha-blended overlays and per-component defaults, and `src/theme` has
  no token shape for either. It is a design-system gap to close deliberately (probably alongside
  M6a's paywall/locked-species styling, which will need overlay tokens anyway), not three more
  literals moved around.
- ~~**"LEFT EARLY" on Stats makes M4's abandoned-session under-count user-visible.**~~
  **Resolved** — `recordManualAbandon` counts a manual "Give up" during a *focus* session, and the
  M6a review fix correctly excludes one during a *break*. The counter now matches its name. The
  underlying M4 product question is untouched: a give-up still does not sicken a fish, so the
  honest user who taps Give up is still treated better than one who just backgrounds.
- **`resetAll` also clears `onboardingCompletedAt`**, so wiping data re-shows onboarding — which
  means the onboarding code's "no way to re-trigger it" comment is not strictly true. Sensible for
  a reset-to-first-launch action; just be aware it is the one re-entry path. It also does not touch
  the transient timer store, so a session left running survives a reset and awards into the fresh
  state. Fine for a testing-only affordance, should not ship as-is.
- **`StatsScreen` captures `now` at render**, so an app left open across local midnight shows a
  stale window until something re-renders it. Harmless in practice, but not handled.
- ~~**A user can never get a second fish, so merging is unreachable.**~~ **Resolved at M3** — you
  chose "grow any under-cap fish; spawn a new Fry only once every fish is capped", over "spawn
  every session" and "spawn every N sessions". Implemented and verified in `reward.ts`.
- ~~**Overflow XP is silently discarded at the stage cap.**~~ **Resolved at M4** — you chose to
  carry the remainder. Implemented in `distributeXp` (`reward.ts`) and verified.
- **Backgrounding for the *entire* session is not penalized — and is still fully rewarded.**
  (New, M4. The biggest thing on this list.) `resolveForeground` folds the wall clock in *before*
  deciding, so if the session's own `endsAt` passed while the app was away it simply `completed`:
  full XP, streak extended, no sick fish. That is deliberate — it preserves M1's "you can lock
  your phone, the notification fires" flow, which is the entire reason the scheduled notification
  exists. But it inverts the incentive the feature is for: the user who leaves for 30 seconds and
  comes back gets punished, while the user who walks away for the full 25 minutes gets the
  maximum reward. `docs/MVP.md` feature 5 says *sustained backgrounding* forfeits growth and
  sickens the fish, and 25 minutes is about as sustained as it gets. The two readings genuinely
  conflict and the resolution is a product call:
  (a) keep it — the timer is a timer, the notification flow matters more;
  (b) penalize any excursion over the grace period regardless of whether the session ended
  meanwhile, which kills the lock-your-phone affordance and makes the end-of-session notification
  nearly pointless;
  (c) something in between (a shorter allowance, a partial reward, or distinguishing a locked
  screen from an app switch — the latter is not reachable from `AppState` alone and probably not
  from Expo Go at all). **Needs the user's decision; do not change it unilaterally.**
- **Force-quitting while backgrounded escapes the penalty entirely** (new, M4). `useTimerStore`
  is transient by design (M1), so `backgroundedAt` and the in-flight session both die with the
  process — relaunching finds an idle timer and nothing to penalize. Same root cause as the
  already-listed "a completed session is lost if force-quit", and the same fix (persisting the
  in-flight session); M4 just raises the stakes, because it is now a way to *avoid* a consequence
  rather than only a way to lose a reward.
- **A user whose fish are all capped cannot be penalized at all** (new, M4). `applyPenalty`
  reuses the reward rule's "first fish with room" selection, so when every fish is waiting on a
  merge there is no target and leaving early is free. Symmetric with the reward side (that user
  earns nothing from a completed session either, they just get a new Fry) and arguably correct,
  but it is a real late-game gap in the accountability loop. Alternatives would be sickening a
  capped fish anyway, or the most recently grown one.
- **The two M4 scope calls, reviewed.** *Break exempt*: sound, endorse it — stepping away is the
  entire point of a break, and `docs/MVP.md` frames the penalty around focus sessions. *Manual
  "Give up" exempt*: defensible on the letter of the spec (the stated trigger is "sustained
  backgrounding", and give-up already forfeits the reward), and the `lastPenaltyToken` indirection
  that implements it is good design. But it means the honest user who taps Give up is treated
  better than one who just backgrounds, which is the opposite of the gradient you probably want —
  worth a deliberate decision rather than inheriting it. Related smaller wrinkle: a manual give-up
  does **not** increment `stats.abandonedSessions` either, so that counter under-reports by its
  own name; left alone because it is part of the same question.
- **The new Focus-screen copy overstates the rule.** "Stepping away for more than a few seconds
  marks a fish sick, even if you come back before the timer ends" is accurate for the case it
  names but implies staying away is punished, when staying away past `endsAt` is in fact rewarded
  (see above). Whatever gets decided about the penalty rule, this string needs to match it.
- **Reaching Elder takes 45 completed sessions.** Falls straight out of the numbers you picked
  rather than being a bug: `xpPerStage` 120 ÷ `xpPerFocusMinute` 1 = 120 min ≈ five 25-min
  sessions to cap one fish, × `fishPerMerge` 3 = 15 sessions per Juvenile, × 3 = 45 per Elder.
  Flagging it only so the pacing is a decision rather than an accident — all three knobs are in
  `GROWTH` (`src/config/index.ts`) and changing them needs no code change.
- **A completed session is lost if the app is force-quit before it is reopened.** The timer store
  is transient by design (M1), so a session that ends while backgrounded only becomes `completed`
  — and only awards — when the app next comes to the foreground. Force-quitting instead loses the
  reward silently. Fixing it means persisting the in-flight session, which interacts with the M4
  accountability rules; worth deciding alongside them rather than in isolation.
- ~~**The tank's frame loop runs whenever `Tank` is mounted, including while another tab is
  focused** — a good M5 polish item.~~ **Still open, and M5 did not do it** — see the M5 entry
  above, which is now the live version of this item.
- ~~`awardSessionCompletion` updates `fish` only; `stats` is still all zeros.~~ **Resolved at
  M4** — `totalFocusMs`, `completedSessions`, `focusMsByDate` and the streak fields are all
  written in the same `set` as the fish reward. The Stats *screen* is still a placeholder reading
  those values; wiring it up is M5.
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

**Do not switch the MVP to 3D.** The committed 2D Skia direction stands. The M6a gate is now
here, and M6a strengthened the case for staying 2D rather than weakening it: Golden Koi and
Indigo Betta were each added as a parameter record plus per-stage geometry — a few dozen lines,
no assets, and `SpeciesSwatch` renders their shop previews from the *same* builder as the tank.
That is the marginal-cost-per-SKU argument demonstrated rather than predicted. Still the user's
call to make at the gate, but the evidence moved one way.

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
