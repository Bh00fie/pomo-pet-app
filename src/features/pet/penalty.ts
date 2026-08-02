/**
 * Leave-early penalty (docs/PLAN.md M4): what happens to the fish collection when a running
 * session is auto-abandoned for staying backgrounded past `ACCOUNTABILITY.backgroundGraceMs`.
 * Pure — no React/RN/store imports — same discipline as `reward.ts` and the timer machine, so
 * the target-selection rule is unit-testable without a mounted store.
 *
 * A session that is merely abandoned already earns no reward on its own — `useSessionReward`
 * only fires on `completed`. The punishment here is additive: actively marking a fish `sick`,
 * not just withholding growth.
 */
import { GROWTH } from '@/config';
import type { Fish } from './model';

export interface PenaltyInput {
  fish: Fish[];
}

export interface PenaltyResult {
  fish: Fish[];
  /** Id of the fish that was marked sick, or `null` if there was nothing to penalize (no fish
   *  yet, or every fish already capped — the same "first fish with room" selection used for
   *  rewards, reused rather than reinvented). Also `null`-free but a no-op when the selected
   *  fish was already sick. */
  sickenedFishId: string | null;
}

/**
 * Marks the same fish a completed session would have grown as `sick` instead. Never mutates its
 * input, never throws. A collection with no growable fish (empty, or every fish already capped)
 * is a valid no-op — there is nothing this session would have grown, so there is nothing to
 * punish by harming instead.
 */
export function applyPenalty(input: PenaltyInput): PenaltyResult {
  const target = input.fish.find((f) => f.xp < GROWTH.xpPerStage);
  if (!target) return { fish: input.fish, sickenedFishId: null };
  if (target.health === 'sick') return { fish: input.fish, sickenedFishId: target.id };

  const fish = input.fish.map((f) => (f.id === target.id ? { ...f, health: 'sick' as const } : f));
  return { fish, sickenedFishId: target.id };
}
