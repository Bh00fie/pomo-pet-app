# Project Context

## Status: M6a complete — **the free-phase MVP (M0–M6a) is feature-complete.** Only the phone gates and the $99 decision remain

Every milestone through M6a is code-complete, unit-tested and independently reviewed. Nothing in
this repo has ever run on a phone. The next action is not more code: it is working through the
**consolidated on-device checklist in `docs/PLAN.md`** (one list covering all six milestones, plus
a step for the debug panel) and then deciding about the Apple Developer $99.

**Do not propose new features before that checklist is done.** The one thing that was blocking it
— that merging (MVP feature 4) and buyable species (feature 8) needed ~6 hours of real focus to
reach — is **resolved twice over**: first with a debug panel, and then properly, by replacing the
XP model outright. **The reward model was rearchitected post-M6a** — every completed session now
hatches one fish immediately, and the session's *duration* decides whether it is a Fry or a
Juvenile. See the reward-rearchitecture section below; it supersedes M3's spawn rule and M4's
overflow decision, and `Fish.xp` no longer exists.

The Expo app exists on `main`, builds, has a working Pomodoro timer, and completed focus sessions
hatch procedurally drawn Skia fish that swim in the Aquarium tab. As of M3 the full core loop
is closed: sessions produce fish and three same-stage, same-species fish can be tapped and
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
  (`src/store/migrations.ts` — now at `SCHEMA_VERSION` **5**, see the M2, M5, M6a and
  reward-rearchitecture notes below).
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
  `reward.ts` (what a completed session hatches, plus the sick-fish cure), all with no
  React/RN/Skia imports, same discipline as the timer machine. `src/features/aquarium/` is the renderer: `Tank.tsx` draws
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
- **Growth + merge (M3): the merge half is real and current, the growth half was replaced.**
  - ~~**Spawn rule (`reward.ts`)**~~ **Superseded by the post-M6a reward rearchitecture** — see its
    section below. There is no grow-or-spawn selection, no stage cap and no `xp` any more; every
    completed session hatches one new fish outright. The M3 rule and its two rejected alternatives
    ("spawn every session", "spawn every N sessions") are history, not live constraints.
  - **Merge rule (`merge.ts`).** `evaluateMerge` combines `GROWTH.fishPerMerge` same-stage,
    same-species fish into one fresh, healthy fish of the next stage. It never mutates and never throws:
    every bad selection returns a typed reason (`wrong-count`, `fish-not-found`, `mixed-stages`,
    `mixed-species`, `top-stage`). Elder merges are rejected, not crashed. It returns the *whole*
    next collection, so `useAppStore.mergeFish` can apply it in a single `set` — one read of
    state, one write, and no write at all on rejection. That is what makes it atomic; keep it.
  - **Same-species is a deliberate defensive default, not a spec requirement.** `docs/MVP.md`
    feature 4 only says "N same-stage fish". Species is added because the merge output has to
    carry exactly one `speciesId` and there is no defined answer for which one when the inputs
    differ — rejecting beats inventing a rule. **No longer unobservable: M6a shipped three
    species and did *not* revisit this, and the post-M6a pass took it to five.** See the M6a flag below — it is now a live product
    question, not a defensive default with no consequences.
  - UI: `Tank.tsx` owns tap-selection (`FishTapTarget` overlays that track each fish's live
    Reanimated position, so selection costs no re-renders) and exposes `mergeSelected` via ref;
    `AquariumScreen.tsx` renders the count/stage readout, Clear, and a Merge button enabled only
    for a complete valid selection. **The store mutation runs synchronously before any
    animation** — `MergeSequence` is purely a visual echo of something already persisted, so a
    kill mid-sequence loses nothing. Under Reduce Motion the sequence is skipped entirely (the
    result fish is simply already at the merge point), rather than hidden and then revealed.
- ~~**Overflow XP carries, it is not discarded (decided at M4).**~~ **Moot post-M6a.**
  `distributeXp` and the whole overflow chain were deleted with the XP model. Nothing here is a
  live constraint; the decision is recorded only so the history reads correctly.
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
  - `applyPenalty` (`src/features/pet/penalty.ts`) is pure and sickens the **most recently
    hatched** fish (ties on `bornAt` go to the later array entry — fish are only ever appended).
    It used to reuse the reward rule's "first fish with room" pick; that pick no longer exists.
    An empty collection is the only no-op left, and it is reachable and correct (a user who
    abandons their first-ever session has nothing to sicken; the abandonment is still counted).
  - **Recovery is `cureOneSickFish` in `reward.ts`, and it must stay out of `hatchFish`.** A
    completed session cures exactly one sick fish, the most recently hatched one — the mirror of
    the penalty, so one abandon costs one fish and one session buys one back. It used to be a
    `health: 'healthy'` write inside `distributeXp`'s grow branch and was **deleted along with it**;
    for one commit nothing in the app could cure a fish at all. It lives in `applySessionReward`
    rather than in the shared `hatchFish` primitive on purpose: the debug panel hatches through
    `hatchFish`, and a debug button must not hand out recovery the user did not earn.
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
  - `settings.activeSpeciesId` chooses which species a **short** session's Fry hatches as (a long
    session ignores it and draws from the whole owned pool — see the rearchitecture section).
    3→4 adds the field, defaulting to the starter, and `awardSessionCompletion` *also* re-validates
    it against `entitlements.unlockedSpeciesIds` on every read — belt and braces, because it is the
    one settings field that depends on entitlements. **`SCHEMA_VERSION` is now 5**; see below.
  - `SpeciesSwatch` draws the real Elder geometry, desaturated via `HEALTH.sickSaturationMultiplier`
    when locked — reusing the M4 sick constant rather than a second desaturation rule. The unlock
    pop reuses `springs.celebrate` from the M3 merge reveal. Both skipped under Reduce Motion.
  - **Cross-species merging is still rejected, and it is observable now.** M3's note said "revisit
    at M6a, when the shop ships more species" — this is that moment, and it was *not* revisited.
    Five species exist now; a user with two Koi Fry and one Tetra Fry simply cannot merge and gets no
    explanation. Still defensible (the merge output carries one `speciesId`), but the rule should
    probably be stated in the UI. Product call, flagged not fixed.
- **The debug panel (post-M6a, the user's call at the gate) is real — and it is a shortcut through
  the real logic, not a parallel one.** A "⚠ DEBUG — TESTING ONLY" card at the bottom of Settings
  (dashed amber border, distinct on purpose). **Its buttons changed with the reward
  rearchitecture** — Grant XP and Cap all fish stopped meaning anything once XP and stage caps were
  deleted — and there are two now: **Hatch a `<species>` Fry** and **Hatch a Juvenile (random
  species)**. It exists because real pacing made merge and a bought species undemoable before the
  $99 decision.
  - **Each action calls the same function the real path calls, and that is the invariant to keep.**
    `debugHatchFry`/`debugHatchJuvenile` → the same `hatchFish` primitive `applySessionReward`
    calls, with the same `resolveSpawnSpeciesId` / `pickRandomSpeciesId` species resolution. If a
    future change makes either a reimplementation, the panel stops proving anything about the real
    app. Three presses of the Fry button assemble a mergeable trio — the job the old
    "Spawn a fry ×3 then Cap all fish" pair did.
  - **`resolveSpawnSpeciesId` is now the single active-species resolution** — extracted from
    `awardSessionCompletion`, used by it and by `debugHatchFry`, and exported as the
    `selectSpawnSpeciesId` selector so UI that *names* the species reads the same answer. This
    removed a duplication rather than avoiding adding one. Never read `settings.activeSpeciesId`
    directly for this: it is the one settings field that can name a species the user does not own.
  - **No accountability bypass, and it matters more now than it did.** Neither action touches
    `stats`, the streak, or `health`. That last one is the load-bearing part post-rearchitecture:
    a completed session now *cures* a sick fish, so a debug hatch routed through
    `applySessionReward` instead of `hatchFish` would quietly hand out recovery the user did not
    earn. It goes through the primitive precisely so it cannot. Tested from both sides, including
    one that sickens a fish and fires both debug actions to assert it is still sick.
  - **`TODO: remove or gate before EAS build submission` is on both the JSX and the store action
    block.** Hard M6b/M7 blocker. Do not let it ship.
- **The post-M6a species pass (Reef Shark + Clownfish) is real, and its lasting value is three
  extension points on `StageVisualParams`, not the two SKUs.** Not a milestone — a content pass
  that tested whether "a species is a parameter record, not an asset" survives a species that is
  *not* another rounder fish in a new hue. It does, after these three additions. **Build the
  pending stingray on these rather than re-deriving them.**
  - **`finScale` is now `dorsalFinScale` + `pectoralFinScale`.** One shared multiplier could only
    scale a species' fins together, so "large dorsal, modest pectorals" was inexpressible. **Every
    pre-split species carries both fields set to its old `finScale`**, so Coral Tetra / Golden Koi
    / Indigo Betta render identically. Verified against commit `cf513d9^` itself, not against the
    claim — and the nine historical values are now **pinned as literals** in `geometry.test.ts`
    (`PRE_SPLIT_FIN_SCALE`), because the original equivalence test rebuilt geometry from the
    species' *own* params through the *new* builder and so only proved the two fin scales equal
    each other. Moving both of a species' scales together passed it. **Same class of lesson as the
    M4/M5 vacuous DST tests: an equivalence test whose two sides come from the same source proves
    nothing — pin the other side to a value the code cannot re-derive.**
  - **`tailShape?: 'rounded' | 'crescent'`** — omitted runs the pre-existing `buildRoundedTail`
    unchanged; `buildCrescentTail` is purely additive and is a genuinely different control-point
    set (long pointed upper lobe, short lower lobe, deep concave notch), not the same math renamed.
    Hinge, wag transform and draw order are shared.
  - **`pattern?: 'stripes'` → `FishGeometry.stripes: StripeBand[]`**, empty for everything else.
    **`Fish.tsx`/`SpeciesSwatch.tsx` build the body-oval clip path only when `stripes.length > 0`
    and render nothing otherwise — keep that shape.** A patternless species allocates no `SkPath`
    and mounts no `Group`/clip at all, rather than running the stripe code over an empty array.
    Bands are fractions of `bodyRadiusX`, so they scale and stay aligned across all three stages
    for free, and the clip is the *same oval the body is drawn from*, so a band cannot leak past
    the silhouette at any stage. **`buildStripeBands` is deliberately not a pattern system** — a
    second pattern is a second function like it, not a new knob.
  - **Reef Shark ($4.49)**: length-to-height 2.43→2.71 (vs ~1.5–1.8 everywhere else), dorsal
    1.6/pectoral 0.55 → 2.3/0.75, crescent tail, hue 205 at saturation 14. **Clownfish ($3.99)**:
    hue 22, saturation 90, chubbier ~1.45–1.5 body with small fins, stripes doing the work.
  - **Nothing species-count-specific needed changing, and this was read rather than trusted.**
    `ShopScreen` maps over `SPECIES_ORDER`; `priceLabel` already degrades a priceless id to an
    un-buyable row; `model.test.ts` already pinned that every non-starter id has a price; and
    `merge.test.ts`'s cross-pair `it.each` is driven off `SPECIES_ORDER`, so it went from 6 ordered
    pairs to 20 and 3 same-species happy paths to 5 by itself. **That is the payoff for writing
    those off the array at M6a — keep doing it.**
  - **Two extra sellable SKUs, a new tail silhouette and a pattern renderer cost 0 KB of bundle**
    (4.73 MB before and after). The marginal-cost-per-SKU argument for staying 2D, demonstrated a
    second time and this time with real shape variety rather than recolors.
- **The post-M6a reward rearchitecture is real, and it supersedes M3's spawn rule, M4's overflow
  decision and half of `GROWTH`.** Every completed focus session hatches **exactly one brand-new
  fish, immediately**; nothing grows, and `xp` does not exist anywhere in the codebase. The
  session's *duration* is the only input to what you get:
  - **Short** (< `REWARDS.longSessionThresholdMinutes`) → a **Fry** of the active species.
    **Long** (>= the threshold) → a **Juvenile** of a species drawn uniformly at random from
    **every** species the user owns, independent of which is active. That last part is the point:
    it is the only place in the app where owning more species changes what a session pays out.
  - **The threshold is 50 and it is a grid value, not the midpoint.** `TIMER.minMinutes`/`maxMinutes`
    are 5/90 so the true midpoint is 47.5, which the `stepMinutes` (5) stepper cannot produce. 50 is
    the nearest grid value *and* splits the 18 selectable durations exactly 9/9; 45 splits them 8/10.
  - **Why it was replaced rather than retuned:** the XP reward was invisible (four sessions in five
    changed nothing on screen), the first fish took five sessions, and owning a second species
    changed nothing about a session's value — a problem for an app that sells species.
  - **`hatchFish` is the one hatch primitive** and the only thing that appends a fish. Both the real
    path and the debug panel go through it. **`cureOneSickFish` is deliberately *not* in it** — see
    the M4 recovery bullet above; that separation is what keeps the debug panel from handing out a
    recovery the user did not earn.
  - **`SCHEMA_VERSION` is 5.** The 4→5 migration drops the dead `xp` field from every persisted
    fish. Destructuring an absent key is a no-op, so a fish predating the field migrates cleanly.
  - **Merging was untouched, and that was verified rather than assumed.** `evaluateMerge` only ever
    compared stage and species; it never read `xp`. `GROWTH` is down to one constant,
    `fishPerMerge`, still 3.
  - **The Focus screen's pre-session preview and a real session cannot disagree.** Both call
    `classifySessionLength`, and the boundary genuinely lines up: a completed session's `elapsedMs`
    is clamped to exactly `durationMs`, which `syncFromSettings` keeps equal to
    `settings.workMinutes` while the timer is idle — which is the only time the preview renders.
    The long branch deliberately never names a species; it is not decided until the session ends.
- `useSessionReward` is mounted **once**, at `app/_layout.tsx`, so a session finishing on any tab
  awards. It de-dupes on the timer's `endsAt` (stable per session) via a hook-local ref — that
  guard is per hook instance, so **do not mount it a second time** or every session awards twice.
  Note `useTimer()` itself *is* mounted twice (root bridge + `FocusScreen`), so there are two
  `AppState` listeners; that is safe only because `noteBackgrounded`/`resolveForeground` are
  idempotent per excursion. Keep them that way.
- **Tests exist and must stay green**: `npm test` (jest-expo preset), 362 tests across 19 suites.
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
- Verified independently on 2026-08-02, three times — after the M6a build/review (`npm test`
  286/286, 18 suites, 4.72 MB), after the debug panel and its review (308/308, 4.73 MB), and again
  after the Reef Shark/Clownfish species pass and its review (346/346, 19 suites, 4.73 MB Hermes
  bundle; 4.71 MB at M5, 4.7 at M4, 4.69 at M3, 4.67 at M2, 4.02 at M1). M6a cost ~10 KB — a whole
  shop, two species and a Skia swatch renderer, with no new dependency — the debug panel another
  ~10 KB, and the species pass **nothing measurable at all**. Verified a **fourth** time on the
  same day after the reward rearchitecture and its review: **`npm test` 362/362 (19 suites),
  `npx tsc --noEmit` clean, `npx expo-doctor` 18/18** — the rearchitecture is net *negative* code,
  so no bundle re-measure was taken. Verified a **fifth** time on 2026-08-03 after closing the
  three concept-gallery gaps (Session Complete, the mini-tank peek, the rounded font): **`npm test`
  383/383 (23 suites), `npx tsc --noEmit` clean, `npx expo-doctor` 18/18**.
- **Not verified**: anything needing the user's phone, which is now *every remaining MVP item*.
  `docs/PLAN.md` holds the **consolidated nine-step on-device checklist** covering all six
  milestones plus the debug panel and the new hatch tiers, in one pass — use that rather than the six scattered per-milestone gates. In short:
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

- **The reward rearchitecture deleted the sick-fish cure and nothing replaced it** (rearchitecture
  review; the one real bug in those three commits, and the most expensive kind — a *removal* nobody
  wrote down). `docs/MVP.md` feature 5 specifies recovery "on the next completed session", the
  free-phase Definition of Done lists seeing it as a criterion, and on-device checklist step 4 asks
  the user to watch it happen. The cure was one `health: 'healthy'` write inside `distributeXp`'s
  grow branch and went out with the function; afterwards, grepping for a healthy write finds only
  `createFishAtStage` and `merge.ts`, both of which make a *new* fish. So a fish sickened once
  stayed sick forever and the accountability loop only ran one way. Fixed with `cureOneSickFish` in
  `reward.ts`, called from `applySessionReward` (not `hatchFish`), curing exactly one fish — the
  most recently hatched sick one, mirroring `applyPenalty`. Verified against four mutants (drop the
  cure, cure all sick fish, only cure when the newest fish happens to be sick, revert the
  tie-break). **Rule this proves: when a rewrite deletes a function, grep for what else that
  function was doing.** The commit message listed the deletions accurately and still missed this,
  because the cure was a side effect of the grow branch rather than a named feature.
- **Four user-visible strings still promised XP growth** (rearchitecture review). The
  end-of-session notification said "Your fish grew", the Focus screen's completed hint said "your
  fish grew", and onboarding's second card promised "Every completed session grows a fish". On a
  phone that reads as a bug rather than as stale copy. The onboarding card now also says that
  longer sessions hatch bigger fish, which nothing else told a first-launch user.
- **`applyPenalty` broke a `bornAt` tie toward the *older* fish** (rearchitecture review).
  `reduce` with `>` keeps the first match and fish are only ever appended, so two hatches in the
  same millisecond — two debug presses, or a hatch and a merge — sickened the earlier of the pair.
  Now `>=`, matching the new cure rule.
- **`applyPenalty` no-op'd when the newest fish was already sick** (rearchitecture review flag,
  **then fixed** in `a76c7cd`). Two abandons in a row cost one fish, not two, even with healthy fish
  sitting right there. It now walks for the newest **healthy** fish, falling through as needed — a
  cleaner mirror of `cureOneSickFish` (newest *sick*) than the original, since the two now differ
  only in which health they look for. **The tie rule is shared but the health filter is not, and
  that is deliberate**: `selectNewestFish` is a third variant with no filter at all (the newest fish
  full stop, for naming what a session hatched). Do not unify them.
- **The long-session draw could pick an unlocked-but-uncatalogued species** (rearchitecture review
  flag, **then fixed** in `a76c7cd`). `resolveOwnedCatalogSpeciesIds` filters
  `unlockedSpeciesIds` down to ids still in `SPECIES_ORDER` before it is used as a draw pool, by
  both the real long-session path and the debug panel — the same re-validation discipline
  `resolveSpawnSpeciesId` already applied to the active species. Closes the asymmetry the
  rearchitecture introduced. Unreachable in practice, fixed anyway because the guard is one line and
  the surrounding discipline was already established.
- **The Stats screen did not fill the device** (phone-screenshot polish). Everything on it is
  fixed-height, so on a 6.1" phone ~470pt of content sat in ~698pt of usable height and left ~230pt
  of dead space under the LEFT EARLY card. The 7-day chart now flexes to absorb the slack (bar
  heights became a fraction of the track rather than an absolute pixel count) and the counter card
  is pushed to the bottom. `minHeight` on the chart keeps it out of the "`Screen` does not scroll"
  trap that caught Settings and Shop. Related and shared: **`Screen`'s `paddingBottom` was 0**, so
  anything bottom-anchored sat flush against the tab bar. Now a flat token, deliberately *not*
  `insets.bottom` — the tab navigator already sizes scenes above a tab bar that owns the
  home-indicator inset, so adding it would re-reserve reserved space.
- **`ShopScreen` could not scroll either, and the species pass grew its list 67%** (species-pass
  review). The debug-panel finding below ends with "`ShopScreen` and `StatsScreen` are the next
  candidates if they gain content" — `ShopScreen` then gained two of five rows. Measured, not
  guessed: header + 5 rows (~77pt each) + Restore ≈ 621pt against ≈ 761pt of usable height on a
  6.1" device, so it still fits *there*, but ≈ 627pt against ≈ 618pt on an SE, where "Restore
  purchases" is the control that goes off-screen. A sixth species overflows everywhere. Fixed with
  the same `ScrollView` treatment Settings and onboarding use; inert while the content fits. The
  burst overlay is still `absoluteFill` *inside* the list `View` that `rowLayoutsRef` measures
  against, so the celebration still tracks its row. **Third screen to hit this — `StatsScreen` is
  now the only one left un-opted-in.**
- **The fin-split equivalence test was near-circular** (species-pass review; the one real test bug
  in that commit). It compared `buildFishGeometry(params)` against a rebuild from those same
  `params`, both through the *new* builder, so it only ever proved a species' two fin scales equal
  each other — moving both of Coral Tetra's Fry scales from 0.7 to 0.8 **together** passed it. Now
  pinned to the nine literal pre-split values read off `cf513d9^`, and mutation-checked in both
  directions. The underlying claim was true (the historical values do match, verified from
  history); the test just was not what proved it.
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
  a "+360 XP" button calling `debugGrantXp(120, …)` type-checks and passes every store test (the
  buttons are hatch actions now, but the gap and the fix generalize unchanged).
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

- **The long-session species draw is genuinely random, and genuinely tested as such**
  (rearchitecture review). `pickRandomSpeciesId` takes an injectable `random`, so tests pin exact
  indices (0, 0.4, 0.999999 → first, middle, last, the last case covering run-past-the-end) *and*
  separately assert that 300 real draws over a 3-species pool yield more than one distinct species.
  An implementation hardcoded to index 0 fails that immediately.
- **The 4→5 migration cannot crash on old data** (rearchitecture review). Destructuring `xp` off a
  fish that never had the field is a no-op; a `null` or non-object entry is returned untouched; an
  absent `fish` array becomes `[]`, which is what `persist`'s merge would produce anyway.
- **The Focus preview's threshold boundary really does match a real session's** (rearchitecture
  review; traced rather than assumed, because they read different values). The preview classifies
  `settings.workMinutes`; a real session classifies `focusMs`, which is `elapsedMs`, which is
  `Math.min(durationMs, …)` and therefore exactly `durationMs` on completion — and `durationMs` is
  kept equal to `settings.workMinutes` by `syncFromSettings` while idle, the only state in which
  the preview renders. Both go through `classifySessionLength`'s single `>=`.
- **The debug hatch buttons do not need a same-tick lock** (rearchitecture review, checked
  specifically because "React state is not a lock" has bitten this repo three times). Two presses
  in one frame produce two fish, which is the *intended* semantic of a button whose whole job is
  "add one fish per press" — unlike the Buy button, where two calls meant two charges. Both actions
  use zustand functional updates, so concurrent appends compose correctly, and `generateFishId`
  mixes six random characters into the timestamp so same-millisecond hatches do not collide. The
  real session path is still ref-guarded on `endsAt` in `useSessionReward`, unchanged.
- **Zero fish is a reachable and correct penalty no-op** (rearchitecture review). A user who
  abandons their very first session has nothing to sicken; the abandonment is still counted in
  `stats.abandonedSessions`.
- **The rewritten reward/penalty/migration tests are not vacuous** (rearchitecture review, checked
  because this repo has shipped self-referential tests three times — M4 DST, M5 DST, the fin-split
  equivalence). They compare against literal expected fish objects and literal species ids rather
  than re-deriving the implementation's own formula, and the boundary cases are pinned to
  `REWARDS.longSessionThresholdMinutes ± 1` on both sides rather than only above it.
- **The three original species really do render identically after the fin split** (species-pass
  review). Checked against `cf513d9^:src/features/pet/model.ts`, not against the test: all nine
  historical `finScale` values (Tetra 0.7/0.9/1.1, Koi 0.76/0.96/1.16, Betta 0.95/1.3/1.7) are
  exactly what both new fields carry, and `bodyLength`/`bodyHeight`/`tailSpan` are untouched.
  `tailShape` and `pattern` are genuinely **absent** on all three, not present-but-defaulted.
- **The crescent tail is a real shape, not a rename** (species-pass review). Read the control
  points: `buildCrescentTail` reaches (-34,-7) and (-30,9) with a cp pulled back to x=-13 between
  them — a deep concave notch — against `buildRoundedTail`'s (-25,±4) with a cp at x=-17, which is
  nearly flat. Different silhouette family, same hinge and wag.
- **The stripe clip cannot leak or drift across stages** (species-pass review — the most novel
  piece, so it was traced rather than compiled). The clip path is the *same* oval, at the same
  body-local origin, that the body `Oval` is drawn from, and the stripe `Group` is nested inside
  the sprite's own transform group — so clip and body share one coordinate space by construction,
  at any stage and any tank position. Band geometry is entirely fractions of `bodyRadiusX`
  (centers at -0.5/0.02/0.56, width 0.26, edge 0.07), so the widest band spans -0.70rx…-0.30rx and
  the rightmost 0.36rx…0.76rx — inside ±rx before the clip even applies, and scale-invariant.
  Vertically the rects deliberately over-run to ±1.1·ry and are cut by the clip.
- **A patternless species really does take the cheaper path** (species-pass review). `bodyClipPath`
  early-returns `null` before allocating an `SkPath`, and `{bodyClipPath && …}` means no `Group`,
  no clip and no `.map` runs at all — it is not the stripe code drawing zero bands.
- **`ShopScreen` genuinely needed no changes** (species-pass review). Read it: it maps over
  `SPECIES_ORDER` and derives price/owned/active/swatch per id. `priceLabel` already returns `null`
  for an unpriced id and the row degrades to a disabled "Unavailable" button rather than crashing.
- **The `SPECIES_ORDER`-driven tests really do scale** (species-pass review). `merge.test.ts`'s
  cross-pair `it.each` is `SPECIES_ORDER.flatMap(...)`, so 3 species gave 6 ordered pairs and 5
  give 20; the same-species happy path went 3 → 5. `model.test.ts`'s price and distinct-hue checks
  are likewise array-driven. That is most of the 308 → 346 delta, and it is automatic.
- **The debug panel really does route through the real logic** (debug-panel review). Checked the
  import, not the comment: `useAppStore.ts` imported `distributeXp` from `@/features/pet/reward` —
  the same module `applySessionReward` lives in — with no second implementation of the
  selection/overflow rule anywhere, and `resolveSpawnSpeciesId` really did replace the inline block
  in `awardSessionCompletion` rather than sitting beside it. **The specific functions are gone with
  the XP model, but the invariant survived the rewrite and was re-checked:** `debugHatchFry` and
  `debugHatchJuvenile` both call the same `hatchFish` primitive `applySessionReward` calls.
- **No accountability side effects are smuggled into any debug action** (debug-panel review,
  re-checked after the rearchitecture). Read the bodies: each returns only `{ fish }` from its
  `set`, so `stats`, the streak, `lastPenaltyToken` and `health` are untouchable by construction —
  a debug hatch beside a sick fish leaves it sick. Pinned by tests at both the store and screen
  level.
- ~~**The "identical to a real session" test is real, not vacuous**~~ (debug-panel review;
  **retired with the XP model**). It compared a real `awardSessionCompletion(25 min)` against
  `debugGrantXp` with the equivalent XP, on real fish objects rather than two empty arrays. Both
  functions are gone. Its replacement is narrower and honest about being so: the debug actions are
  now asserted to produce the right stage and species and to leave `stats`, the streak and `health`
  untouched — with the *health* half newly load-bearing, since a real session cures a fish and a
  debug hatch must not.
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
- ~~**The overflow recursion cannot run away.**~~ **Moot post-M6a** — `distributeXp` and the whole
  overflow chain were deleted with the XP model. Worth knowing only because the "sickness is cured
  at *every* link" half of this entry is exactly what quietly disappeared with it; see the
  rearchitecture review finding above.

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

- **The pacing swung hard the other way, and only real use can judge it** (new, rearchitecture
  review). A fish per session, and a Juvenile — worth three Fry — for anything 50 minutes or up.
  Nine sessions to an Elder the slow way against 45 before, and three long sessions produce three
  Juveniles, one merge from an Elder. Deliberately generous to make the loop legible, but "too
  generous" is the same *kind* of mistake the old numbers made in the other direction. The knobs
  are `REWARDS.longSessionThresholdMinutes` and the two stage choices in `reward.ts`. **Judge it
  from real use on the phone, not from the debug panel.**
- **The Focus screen's timer block pools empty space above and below itself** (phone-screenshot
  polish; **not changed, and now smaller**). The body is `flex: 1` with `justifyContent: 'center'`,
  so the screen *does* reach the bottom — the session-lengths card is bottom-anchored — but slack
  sits between the Start button and that card and again above the status caption. It measured ~120pt
  each side against the old 6pt linear bar; the 200pt `TimerRing` that replaced it absorbs most of
  that, so this is now a much smaller complaint. Still deliberate vertical centering of the app's
  hero element rather than a layout bug, and the one-token fix (`space-evenly`) loosens the whole
  timer stack. Judge it on the phone.
- **`SpeciesSwatch` clips every species' tail, and the Reef Shark can least afford it** (new,
  species-pass review; **pre-existing since M6a**, which is why it was not changed unilaterally).
  `scale = (size * 0.42) / bodyRadiusX` fits the *body* into 84% of a 44pt canvas, leaving ~3.5pt
  per side, while a tail needs ~19pt past its hinge. Coral Tetra's tail already renders ~15pt off
  the left edge; Indigo Betta's ~27pt. It matters more now because the shark's whole identity is
  its crescent tail and big dorsal, so its $4.49 shop preview is close to a plain grey oval — the
  shop is selling shape variety with a swatch that hides it. Fix is to fit the species' **full**
  geometry bounds rather than `bodyRadiusX`, which re-frames all five swatches; a visual call to
  make while looking at a screen, ideally in the same sitting as the on-device gates.
- **The Reef Shark's dorsal fin sweeps forward to the tip of its nose at Elder** (new,
  species-pass review). `point()` scales a fin's *offset from its hinge*, not just its size, so
  `dorsalFinScale: 2.3` puts the dorsal's reference endpoint at body-local x ≈ 37.9 against a body
  radius of 38. Geometrically consistent and within the system, but at that magnitude it likely
  reads as a forward-leaning sail rather than a dorsal. Judge on the phone; the fix is either a
  lower scale or splitting position from size in `point()` — the latter is the more general
  extension point if the stingray needs it.
- **Coral Tetra (hue 12) and Clownfish (hue 22) are 10° apart** (new, species-pass review).
  `model.test.ts`'s "every species has a distinct hue, so the shop and tank never show two
  look-alikes" passes on strict inequality, but both are coral-orange. The stripes and the body
  ratio are meant to carry the distinction — which is the pass's whole thesis — so this is a
  specific thing to check on the phone at tank scale, not a bug.
- **`Fish.tsx` still has no component test** (new, species-pass review). The stripe clip path is
  exercised at mount only indirectly, via `ShopScreen.test.tsx`'s `SpeciesSwatch` (its Skia stub
  now includes `Rect` and `addOval`, so all five rows really do build). The tank sprite itself is
  untested — a pre-existing gap, but the stripe overlay is the first non-trivial *composition* in
  it, as opposed to numbers `geometry.test.ts` already covers.
- ~~**THE BIG ONE AT THE GATE: the two features you're deciding $99 on can't be demoed**~~
  **Resolved** — the user chose the debug-only affordance in Settings over retuning `GROWTH`, and
  it is built and reviewed (see the M6a debug-panel notes above). Merge and a bought species are
  both reachable in under a minute now. **And the pacing itself, explicitly left open at the time,
  was then resolved too** — by the post-M6a reward rearchitecture rather than by tuning `GROWTH`.
  What is open now is the *opposite* question: whether a fish per session is too generous. See the
  rearchitecture section's flagged items.
- **The debug panel must be removed or gated before any EAS build submission** (new). `TODO`s are
  in place on both the JSX and the store action block. A hard M6b/M7 blocker — buttons that
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
  out to be a way to conjure fish, not a provider switch — **and that one now exists**, as the two
  hatch buttons.
- **Cross-species merging: M3 said "revisit at M6a" and M6a did not** (new, M6a; **five species
  now, after the species pass**), so `evaluateMerge`'s same-species requirement is observable — two Koi Fry and one
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
  full reward, streak extended, no sick fish. That is deliberate — it preserves M1's "you can lock
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
- ~~**A user whose fish are all capped cannot be penalized at all** (M4).~~ **Resolved post-M6a**,
  as a side effect rather than deliberately: stage caps no longer exist, so "all capped" is not a
  state, and `applyPenalty` targets the most recently hatched fish. The only no-op left is an empty
  collection, which is reachable and correct. **A new, smaller version of the same asymmetry took
  its place** — see the rearchitecture flags: the penalty is a no-op when the *newest* fish is
  already sick, even with healthy fish present, so two abandons in a row cost one fish, not two.
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
- ~~**Reaching Elder takes 45 completed sessions.**~~ **Resolved post-M6a by the reward
  rearchitecture** — the flag did its job: the pacing became a decision rather than an accident,
  and the decision was to replace the model. It is now nine sessions to an Elder the slow way (nine
  Fry → three Juveniles → one Elder) and as few as nine *long* sessions to three Elders. **The live
  version of this question is now whether that is too generous**, which is the mirror image and is
  flagged in the rearchitecture section.
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

**The post-M6a species pass moved it further, and answered the obvious objection.** The fair
counter to the M6a evidence was that Koi and Betta are recolors of one silhouette, so of course
they were cheap — real shape variety is where a 2D parameter system would start costing what a 3D
asset does. It did not: Reef Shark (elongated body, crescent tail, oversized dorsal) and Clownfish
(stripe pattern) needed three small extension points on `StageVisualParams` and **zero measurable
bundle** (4.73 MB before and after). A modelled, rigged 3D shark and clownfish are days each. The
still-pending stingray is the next test of this and should reuse those extension points.

### Visual references

Two published concept galleries exist for this project — check both before doing new UI/design work:

- **Full 2D MVP concept** — https://claude.ai/code/artifact/c92d02ea-29b5-4fbe-aa8c-45d6acc39761
  The primary design reference: the procedural fish system (Fry/Juvenile/Elder growth stages),
  the merge mechanic diagram, the animated aquarium tank, and all 5 app screens (Focus, Session
  Complete, Aquarium, Stats, Shop). Built before M0 existed, so it predates the real theme tokens.
  **Audited against the built app on 2026-08-03 — see "Concept gallery vs. the built app" below.**
- **Species catalog (2026-08-03)** — https://claude.ai/code/artifact/e3640010-7193-4bdf-ba37-867ab3097a3b
  All five species at all three stages, rendered live from a faithful port of `buildFishGeometry`,
  `hslToHex` and `Fish.tsx`'s draw order/wag constants, each beside its own `stageParams` record.
  Also shows the merge progression at true scale, the healthy/sick states, and the `SpeciesSwatch`
  tail-clipping problem side by side with the full geometry. **Unlike the concept gallery this one
  is generated from the shipped source**, so it stays accurate as long as the ports match — if
  `geometry.ts` changes, this page needs regenerating or it becomes a second source of truth.
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

### Concept gallery vs. the built app (audited 2026-08-03)

Read the concept gallery's actual markup rather than trusting the summary. **Three of the five
screens match structurally and needed nothing**: Aquarium (title + count pill + tank + merge
control), Stats (2×2 tile grid + 7-day bar card) and Shop (thumb + name + price pill rows +
Restore) all landed as drawn. The divergences are all on Focus, plus one whole screen that was
never built:

Closed in `34f1986`:

- **The progress indicator was a linear bar, not a ring.** The concept specifies a circular ring
  (r=66, stroke 10, in a 150 box, coral, round cap, sweeping from twelve) with the clock centred
  inside; M1 shipped a 240×6 linear track. Now `src/features/timer/TimerRing.tsx`, in Skia (already
  a dependency — **not** `react-native-svg`, which is not installed), as one circle path stroked
  twice with the second copy trimmed via `end`. **It owns no frame loop** — `progress` is a plain
  number `useTimer` already recomputes every `TIMER.tickIntervalMs`, so the M2 "one clock, never a
  second frame driver" rule is intact. Ratios (`RADIUS_RATIO`/`STROKE_RATIO`) are kept off the
  concept's own numbers so the ring can be resized without re-tuning its weight.
- **The clock had no tabular figures, and that is a real defect rather than a style gap.**
  Proportional digits change width every second, so a centred readout jitters horizontally — much
  more visible now that it sits inside a fixed ring. `fontVariant: ['tabular-nums']` on the clock
  and on the four Stats tiles. **Deliberate deviation kept:** the concept sets the clock in a mono
  face at weight 700; the app keeps the light system face (closer to iOS's own timers) and takes
  only the tabular metric.
- **The streak was a bare line of text**, not the concept's pill chip with the flame. Now a chip.
- **Nothing told the user what they had earned.** The concept's Session Complete screen carries an
  "earned card" reading "+1 Fry earned"; the app's completed state said only "a new fish hatched".
  Now names it — "A Golden Koi Juvenile hatched." — reading the species off the **fish**, not off
  `activeSpeciesId`, because a long session draws at random and the two genuinely disagree. Derived
  through the new `selectNewestFish` rather than recorded: a completed session's hatch *is* the
  newest fish by construction, so a persisted `lastHatchedFishId` would be a second source of truth
  for something already knowable, plus a schema bump. Guarded on `mode === 'focus'` so a finished
  break cannot claim the fish sitting in the store — mutation-checked.

Closed in `37fce6c` (Session Complete + mini-tank peek) and `877797f` (rounded font) — all three
items the user explicitly approved building post-checklist:

- **Session Complete now exists as its own moment.** `src/features/timer/SessionCompleteScreen.tsx`
  takes over the Focus tab's entire tree — badge, "Session complete", the duration, an earned card,
  "See your tank" (`useRouter().navigate('/aquarium')`) and "Start another session" (`timer.reset()`,
  back to the idle Focus state — it does not jump straight into a new session) — exactly when
  `timer.isCompleted && timer.mode === 'focus'`, which `FocusScreen` checks *before* returning its
  normal tree rather than sharing space with it. A completed **break** never reaches this screen
  (the guard is on `mode`, unchanged from the inline-card version). The earned-card copy reuses the
  exact `hatchHeadline` naming logic the old inline card had — pulled out into pure
  `src/features/timer/sessionComplete.ts` (no React import) rather than duplicated, and still reads
  the species off the **fish** (`selectNewestFish`), not off `activeSpeciesId`, for the same reason
  as before: a long session's random draw can disagree with the active species. The badge is two
  flat circles (`colors.sun` behind `colors.coral`), not a real radial gradient — there is no
  gradient dependency in this project, and one felt like too much for a single badge.
- **The Focus screen now has a mini-tank peek.** `src/features/timer/MiniTankPeek.tsx` shows up to
  3 of the user's most recently hatched fish (`pet/model.ts`'s new `mostRecentFish`, newest-first,
  pure and allocation-cheap) below the timer, visible only while idle or running — never on the
  Session Complete screen above (which already has its own earned-fish card) and never while
  paused/abandoned. Deliberately non-interactive: no tap target, no navigation, a peek rather than a
  second aquarium. Reuses `SpeciesSwatch` (the Shop's static single-fish Skia renderer) rather than
  a third copy of the fish-drawing code — `SpeciesSwatch` gained an optional `stage` prop (defaulting
  to `'elder'`, its one prior caller's behavior unchanged) so the peek can draw each fish at its own
  *actual* stage instead of always Elder.
- **The display face is now the rounded system design, and no font file was bundled.** Apple's SF
  Pro Rounded TTF is real but its license restricts it to UI mockups/previews — it may not be
  embedded in a shipped app — so the obvious "just bundle the font" fix was never on the table.
  The fix that *was* available needed real investigation, not a guess: `'ui-rounded'` is one of the
  CSS Fonts Level 4 generic family keywords, and it turns out RN's own iOS text layout manager
  special-cases it. Read straight out of this project's own `node_modules/react-native` (0.81, not
  assumed from a blog post): `RCTFontUtils.mm`'s `RCTGetFontDescriptorSystemDesign` maps the string
  to `UIFontDescriptorSystemDesignRounded`, then asks the system font's own descriptor for that
  design — Apple's own documented, sanctioned API for the rounded face, with iOS resolving it from
  whatever system font is already on the device. Nothing is bundled and nothing needed licensing;
  `expo-font` was never required either. `src/theme/typography.ts`'s `display`/`title`/`heading`
  tokens (the prominent, short-text faces — the clock, headings, screen titles) now carry
  `fontFamily: 'ui-rounded'` on iOS; `body`/`label`/`caption` keep the plain `'System'` face, since a
  bubbly rounded design at 11–15px reads as a legibility cost rather than warmth. **This corrects a
  wrong claim** that was in this file until now — "React Native has no reliable way to reach the
  rounded system face without bundling a font file" was never actually verified against the RN
  source, and it was wrong.

**Still open, and needs the user rather than an agent:**

- **The ground hue is wrong, and it is the first thing anyone notices.** The concept is deep
  **teal** (`#123F3A` / `#0B2E2B`, with seafoam `#6FBFAE` and gold `#E8A93C`); the app shipped deep
  **navy** (`#07131F` / `#04101A`, kelp `#4FD1A5`, sun `#FFD166`). Coral and Mist survived almost
  exactly (`#FF6B4A`→`#FF8A65`, `#EAF3EE`→`#EAF4FF`). Tokens mean the page chrome is a one-file
  change, **but it is not really one file**: all five species hues were authored against navy, and
  Indigo Betta (248) against a green ground and Reef Shark (205 at saturation 14) against teal are
  the two that would need re-tuning. A taste call with a re-tuning tail — do not swap it silently.

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
- Reward vs. merge: **every completed session hatches exactly one new fish**, a Fry or a Juvenile
  depending on the session's length (`REWARDS.longSessionThresholdMinutes`); merging N same-stage,
  same-species fish is the only way any fish *crosses* a stage boundary. Superseded the original
  "sessions grow a fish's XP within its stage" rule post-M6a — see the rearchitecture section

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
