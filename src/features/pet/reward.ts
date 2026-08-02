/**
 * Session-complete reward logic (docs/PLAN.md M2): what happens to the fish collection when a
 * focus session finishes. Pure — no React/RN/Skia/store imports — so the "spawn vs. grow" policy
 * is unit-testable without a renderer or a mounted store. The React-facing side of this is
 * `useSessionReward.ts`, which hooks into the timer engine's `completed` transition and calls
 * into the store, which in turn calls `applySessionReward`.
 */
import { GROWTH } from '@/config';
import { addXp, createFish, STARTER_SPECIES_ID, type Fish } from './model';

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
}

export interface SessionRewardResult {
  fish: Fish[];
  /** The fish that received the XP, whether newly spawned or pre-existing. */
  awardedFishId: string;
  xpAwarded: number;
  spawned: boolean;
}

/**
 * Applies one session's reward to a fish collection (docs/PLAN.md M3 spawn rule — supersedes
 * M2's "only spawn if zero fish"): grow an existing fish that still has room in its current
 * stage, if one exists. Only spawn a fresh starter Fry when there is nothing to grow — the
 * collection is empty, or every fish is already capped for its stage and growing one further
 * would just be clamped away. This is what makes a second (and third, ...) fish reachable at
 * all; merging (`src/features/pet/merge.ts`) is the only way any of them cross a stage boundary.
 * Never mutates its input.
 */
export function applySessionReward(input: SessionRewardInput): SessionRewardResult {
  const xpAwarded = xpForFocusMs(input.focusMs);

  const growthTarget = input.fish.find((f) => f.xp < GROWTH.xpPerStage);

  if (!growthTarget) {
    const hatched = addXp(createFish(STARTER_SPECIES_ID, input.now, input.idFactory()), xpAwarded);
    return { fish: [...input.fish, hatched], awardedFishId: hatched.id, xpAwarded, spawned: true };
  }

  const fish = input.fish.map((f) => (f.id === growthTarget.id ? addXp(f, xpAwarded) : f));
  return { fish, awardedFishId: growthTarget.id, xpAwarded, spawned: false };
}
