/**
 * Session-complete reward logic (docs/PLAN.md M2): what happens to the fish collection when a
 * focus session finishes. Pure — no React/RN/Skia/store imports — so the "spawn vs. grow" policy
 * is unit-testable without a renderer or a mounted store. The React-facing side of this is
 * `useSessionReward.ts`, which hooks into the timer engine's `completed` transition and calls
 * into the store, which in turn calls `applySessionReward`.
 */
import { GROWTH } from '@/config';
import { addXp, createFish, STARTER_SPECIES_ID, type Fish, type SpeciesId } from './model';

const MS_PER_MINUTE = 60_000;

/** XP for a completed focus session, straight from `GROWTH.xpPerFocusMinute` — the entire
 *  reward formula lives in config, not here, per the project's "no magic numbers in components"
 *  rule. Partial minutes still count (a 90s session is worth 1.5x the per-minute rate). */
export function xpForFocusMs(focusMs: number): number {
  if (!Number.isFinite(focusMs) || focusMs <= 0) return 0;
  return Math.round((focusMs / MS_PER_MINUTE) * GROWTH.xpPerFocusMinute);
}

export interface SessionRewardInput {
  fish: Fish[];
  /** Ms of focus actually served this session (use `elapsedMs` from the timer machine, not the
   *  configured duration, so an abandoned-but-still-completed edge case never over-awards). */
  focusMs: number;
  now: number;
  /** Injected so tests can produce deterministic ids; the store wires a real generator. */
  idFactory: () => string;
  /**
   * Species a fresh Fry hatches as when nothing existing has room to grow (docs/PLAN.md M6a).
   * Defaults to `STARTER_SPECIES_ID` — before M6a this was the only species that existed, and
   * every existing caller/test that omits this still gets exactly that behaviour. The store is
   * responsible for resolving this to the user's chosen "active" species and for falling back to
   * the starter if that species is somehow no longer unlocked; this function trusts whatever it
   * is given rather than re-deriving ownership itself (this file has no store/entitlements
   * imports, same discipline as everywhere else in `features/pet`).
   */
  spawnSpeciesId?: SpeciesId;
}

export interface SessionRewardResult {
  fish: Fish[];
  /** The fish that received the XP, whether newly spawned or pre-existing. */
  awardedFishId: string;
  xpAwarded: number;
  spawned: boolean;
}

interface DistributeResult {
  fish: Fish[];
  awardedFishId: string;
  spawned: boolean;
}

/**
 * The actual grow-or-spawn rule (docs/PLAN.md M3, extended M4 for overflow), factored out so it
 * can recurse on itself for the leftover XP that would otherwise be clamped away at a stage cap.
 * Growing the selected target never crosses *its own* cap — `addXp` still clamps exactly like
 * before — but the remainder above that cap is not discarded: it is re-fed through this same
 * selection rule (grow the next fish with room, or hatch a fresh Fry once every fish is capped),
 * exactly as if it were the reward for a follow-on session. A fish selected as the grow target
 * also recovers from `sick` here (docs/PLAN.md M4 recovery rule) — being chosen as the thing a
 * completed session grows is what cures it, whether or not this particular call is the one that
 * carries the overflow.
 */
function distributeXp(
  fish: Fish[],
  xp: number,
  now: number,
  idFactory: () => string,
  spawnSpeciesId: SpeciesId,
): DistributeResult {
  const growthTarget = fish.find((f) => f.xp < GROWTH.xpPerStage);

  if (!growthTarget) {
    const hatched = addXp(createFish(spawnSpeciesId, now, idFactory()), xp);
    return { fish: [...fish, hatched], awardedFishId: hatched.id, spawned: true };
  }

  const room = GROWTH.xpPerStage - growthTarget.xp;
  const grown = fish.map((f) => {
    if (f.id !== growthTarget.id) return f;
    return { ...addXp(f, Math.min(xp, room)), health: 'healthy' as const };
  });

  if (xp <= room) {
    return { fish: grown, awardedFishId: growthTarget.id, spawned: false };
  }

  // Overflow: the target is now sitting at exactly its cap (never past it — `addXp` still
  // clamps), and what's left over is handed to the same selection rule again instead of being
  // discarded. `awardedFishId` stays the *primary* target — the fish this session's XP actually
  // landed on first — even when the overflow goes on to grow (or spawn) a different one.
  const overflow = xp - room;
  const rest = distributeXp(grown, overflow, now, idFactory, spawnSpeciesId);
  return { fish: rest.fish, awardedFishId: growthTarget.id, spawned: rest.spawned };
}

/**
 * Applies one session's reward to a fish collection (docs/PLAN.md M3 spawn rule — supersedes
 * M2's "only spawn if zero fish"): grow an existing fish that still has room in its current
 * stage, if one exists. Only spawn a fresh starter Fry when there is nothing to grow — the
 * collection is empty, or every fish is already capped for its stage and growing one further
 * would just be clamped away. This is what makes a second (and third, ...) fish reachable at
 * all; merging (`src/features/pet/merge.ts`) is the only way any of them cross a stage boundary.
 *
 * M4: XP that would push the selected fish past its stage cap is never discarded — the leftover
 * carries into a follow-on grow-or-spawn using `distributeXp` above (a fish at 110/120 that earns
 * 25 XP lands on exactly 120, and the other 15 XP starts a new Fry rather than evaporating).
 *
 * Never mutates its input.
 */
export function applySessionReward(input: SessionRewardInput): SessionRewardResult {
  const xpAwarded = xpForFocusMs(input.focusMs);
  const spawnSpeciesId = input.spawnSpeciesId ?? STARTER_SPECIES_ID;
  const { fish, awardedFishId, spawned } = distributeXp(
    input.fish,
    xpAwarded,
    input.now,
    input.idFactory,
    spawnSpeciesId,
  );
  return { fish, awardedFishId, xpAwarded, spawned };
}
