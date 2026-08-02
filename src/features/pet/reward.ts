/**
 * Session-complete reward logic — replaces the M2–M4 XP/grow model entirely (see CLAUDE.md's
 * reward-rearchitecture notes). Pure — no React/RN/Skia/store imports — so the hatch rule is
 * unit-testable without a renderer or a mounted store. The React-facing side of this is
 * `useSessionReward.ts`, which hooks into the timer engine's `completed` transition and calls
 * into the store, which in turn calls `applySessionReward`.
 *
 * The rule: every completed focus session hatches exactly one brand-new fish — never grows an
 * existing one, and XP no longer exists as a concept anywhere in this app. Which fish depends
 * only on how long the session was:
 *   - **Short** (< `REWARDS.longSessionThresholdMinutes`) hatches a **Fry** of the user's active
 *     species (`Settings.activeSpeciesId`, unchanged from M6a).
 *   - **Long** (>= the threshold) hatches a **Juvenile** of a species drawn uniformly at random
 *     from *every* species the user owns (`entitlements.unlockedSpeciesIds`) — independent of
 *     which one is active, so owning more species specifically matters for long sessions.
 * Merging (`merge.ts`) is still the only way any fish crosses a stage boundary from there.
 *
 * The one existing fish a completed session *does* touch is a sick one: `docs/MVP.md` feature 5
 * says the leave-early penalty "recovers on the next completed session", and that recovery used
 * to live inside the deleted `distributeXp` (being picked as a grow target cured a fish). Nothing
 * grows anymore, so the cure is explicit here instead — see `cureOneSickFish`. Without it the
 * accountability loop is one-way: a fish can be made sick and never get better.
 */
import { REWARDS, STAGES } from '@/config';
import { createFishAtStage, STARTER_SPECIES_ID, type Fish, type SpeciesId, type Stage } from './model';

const MS_PER_MINUTE = 60_000;

export type SessionLength = 'short' | 'long';

const SHORT_SESSION_STAGE: Stage = STAGES[0]; // 'fry'
const LONG_SESSION_STAGE: Stage = STAGES[1]; // 'juvenile'

/**
 * Classifies a session by its length in minutes. `>=` the threshold is long — "at or above" per
 * spec. Pure and minutes-based (not ms) so both a real session's elapsed time
 * (`applySessionReward` below) and the Focus screen's live duration *setting* (the pre-session
 * preview, before any session has run — see `FocusScreen.tsx`) share exactly this one rule.
 */
export function classifySessionLength(durationMinutes: number): SessionLength {
  return durationMinutes >= REWARDS.longSessionThresholdMinutes ? 'long' : 'short';
}

/** The stage a session of this length hatches. */
export function stageForSessionLength(length: SessionLength): Stage {
  return length === 'long' ? LONG_SESSION_STAGE : SHORT_SESSION_STAGE;
}

/**
 * Picks one species id uniformly at random from a non-empty pool. `random` is injectable
 * (defaults to `Math.random`) so tests can pin the exact draw instead of asserting only on the
 * statistical shape of many calls.
 */
export function pickRandomSpeciesId(
  pool: readonly SpeciesId[],
  random: () => number = Math.random,
): SpeciesId {
  if (pool.length === 0) {
    // Unreachable in real use — the starter species is always present in
    // `entitlements.unlockedSpeciesIds` — but fail loudly rather than silently hatching an
    // `undefined` species if some future caller ever manages to pass an empty pool.
    throw new Error('pickRandomSpeciesId: pool must not be empty');
  }
  const index = Math.min(Math.floor(random() * pool.length), pool.length - 1);
  return pool[index];
}

export interface HatchResult {
  fish: Fish[];
  hatched: Fish;
}

/**
 * The single hatch primitive: creates one fresh fish at `stage`/`speciesId` and appends it to
 * `fish`. Every hatch in the app — a completed session via `applySessionReward` below, or a
 * debug-panel button (`useAppStore.debugHatchFry`/`debugHatchJuvenile`) — goes through this exact
 * function, never a parallel copy of it. Never mutates its input.
 */
export function hatchFish(
  fish: Fish[],
  stage: Stage,
  speciesId: SpeciesId,
  now: number,
  idFactory: () => string,
): HatchResult {
  const hatched = createFishAtStage(speciesId, stage, now, idFactory());
  return { fish: [...fish, hatched], hatched };
}

export interface CureResult {
  fish: Fish[];
  /** Id of the fish cured, or `null` if none were sick. */
  curedFishId: string | null;
}

/**
 * Heals exactly one sick fish — the most recently hatched one — and is the mirror image of
 * `penalty.ts`'s `applyPenalty`, which sickens the most recently hatched fish. One abandon makes
 * one fish sick; one completed session makes one fish well again, so the loop is symmetric and a
 * user can always dig themselves back out. Ties on `bornAt` go to the later entry in the array
 * (fish are only ever appended), same rule as `applyPenalty`. Never mutates its input, and
 * returns the same array reference when there is nothing to cure.
 *
 * Deliberately *not* wired into `hatchFish`: the debug panel hatches through that primitive, and
 * a debug button must never hand out a recovery the user did not earn (CLAUDE.md's "no
 * accountability bypass" invariant for the debug actions).
 */
export function cureOneSickFish(fish: Fish[]): CureResult {
  let target: Fish | null = null;
  for (const f of fish) {
    if (f.health === 'sick' && (target === null || f.bornAt >= target.bornAt)) target = f;
  }
  if (target === null) return { fish, curedFishId: null };

  const cured = target;
  return {
    fish: fish.map((f) => (f.id === cured.id ? { ...f, health: 'healthy' as const } : f)),
    curedFishId: cured.id,
  };
}

export interface SessionRewardInput {
  fish: Fish[];
  /** Ms of focus actually served this session (use `elapsedMs` from the timer machine, not the
   *  configured duration, so an abandoned-but-still-completed edge case never over-awards). */
  focusMs: number;
  now: number;
  /** Injected so tests can produce deterministic ids; the store wires a real generator. */
  idFactory: () => string;
  /** Species a short session's Fry hatches as — the user's active species, already
   *  entitlement-revalidated by the caller (`useAppStore`'s `resolveSpawnSpeciesId`). Defaults to
   *  `STARTER_SPECIES_ID` if omitted, so a minimal caller/test still gets deterministic output. */
  activeSpeciesId?: SpeciesId;
  /** Every species a long session's Juvenile can be drawn from — the user's full owned catalog.
   *  Defaults to `[activeSpeciesId]` if omitted/empty, so a minimal caller/test still gets a
   *  valid, non-empty pool rather than having to always pass one. */
  ownedSpeciesIds?: SpeciesId[];
  /** Injectable random source for a long session's species draw — see `pickRandomSpeciesId`. */
  random?: () => number;
}

export interface SessionRewardResult {
  fish: Fish[];
  /** Id of the fish this session hatched. */
  hatchedFishId: string;
  /** Species the hatched fish ended up as. */
  speciesId: SpeciesId;
  length: SessionLength;
  /** Id of the sick fish this session cured, or `null` if none were sick (docs/MVP.md feature 5). */
  curedFishId: string | null;
}

/**
 * Applies one completed focus session's reward. See the file doc comment for the rule. Never
 * mutates its input.
 */
export function applySessionReward(input: SessionRewardInput): SessionRewardResult {
  const durationMinutes = input.focusMs / MS_PER_MINUTE;
  const length = classifySessionLength(durationMinutes);
  const stage = stageForSessionLength(length);
  const activeSpeciesId = input.activeSpeciesId ?? STARTER_SPECIES_ID;
  const ownedSpeciesIds = input.ownedSpeciesIds?.length ? input.ownedSpeciesIds : [activeSpeciesId];

  const speciesId =
    length === 'long' ? pickRandomSpeciesId(ownedSpeciesIds, input.random) : activeSpeciesId;

  // Cure before hatching, over the pre-hatch collection: a freshly hatched fish is always healthy,
  // so it could never be the cure target anyway, but doing it in this order keeps that true by
  // construction rather than by coincidence.
  const cured = cureOneSickFish(input.fish);
  const { fish, hatched } = hatchFish(cured.fish, stage, speciesId, input.now, input.idFactory);
  return { fish, hatchedFishId: hatched.id, speciesId, length, curedFishId: cured.curedFishId };
}
