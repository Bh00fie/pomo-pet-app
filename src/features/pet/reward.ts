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
 * Applies one session's reward to a fish collection: grows an existing fish's XP, or spawns a
 * fresh starter Fry if the user has none yet. Never mutates its input.
 */
export function applySessionReward(input: SessionRewardInput): SessionRewardResult {
  const xpAwarded = xpForFocusMs(input.focusMs);

  if (input.fish.length === 0) {
    const hatched = addXp(createFish(STARTER_SPECIES_ID, input.now, input.idFactory()), xpAwarded);
    return { fish: [hatched], awardedFishId: hatched.id, xpAwarded, spawned: true };
  }

  const target = pickGrowthTarget(input.fish);
  const fish = input.fish.map((f) => (f.id === target.id ? addXp(f, xpAwarded) : f));
  return { fish, awardedFishId: target.id, xpAwarded, spawned: false };
}

/**
 * Which fish grows: prefer one that still has room in its current stage. If every fish is
 * already capped (all waiting on a merge — M3), the session is still logged against the first
 * fish; `addXp` clamps at the cap rather than losing the XP silently.
 */
function pickGrowthTarget(fish: Fish[]): Fish {
  return fish.find((f) => f.xp < GROWTH.xpPerStage) ?? fish[0];
}
