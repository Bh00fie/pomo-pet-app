/**
 * Leave-early penalty (docs/PLAN.md M4): what happens to the fish collection when a running
 * session is auto-abandoned for staying backgrounded past `ACCOUNTABILITY.backgroundGraceMs`.
 * Pure — no React/RN/store imports — same discipline as `reward.ts` and the timer machine, so
 * the target-selection rule is unit-testable without a mounted store.
 *
 * A session that is merely abandoned already earns no reward on its own — `useSessionReward`
 * only fires on `completed`. The punishment here is additive: actively marking a fish `sick`,
 * not just withholding growth.
 *
 * Post-reward-rearchitecture note (see CLAUDE.md): a completed session no longer "grows" any
 * particular existing fish — every completed session always hatches a brand-new one instead
 * (`reward.ts`) — so there is no more "the fish this session would have grown" target to reuse,
 * which is what this rule used to do. The target is now the most recently hatched *healthy* fish
 * in the collection (max `bornAt` among `health === 'healthy'`): the closest surviving analogue,
 * since it is the thing a completed session would most recently have added to. Falls through to
 * the next-most-recent healthy fish, and so on, rather than stopping at the single newest fish —
 * otherwise two abandons in a row would cost only one fish (the first sickens the newest, the
 * second finds it already sick and no-ops) even with other healthy fish sitting right there.
 */
import type { Fish } from './model';

export interface PenaltyInput {
  fish: Fish[];
}

export interface PenaltyResult {
  fish: Fish[];
  /** Id of the fish that was marked sick, or `null` if there was nothing to penalize — no fish yet,
   *  or every fish is already sick. */
  sickenedFishId: string | null;
}

/**
 * Marks the most recently hatched *healthy* fish as `sick`. Never mutates its input, never throws.
 * A no-op only when there is no healthy fish left to sicken (no fish at all, or all already sick).
 */
export function applyPenalty(input: PenaltyInput): PenaltyResult {
  // `>=`, not `>`: two fish can share a `bornAt` (two debug hatches, or a hatch and a merge, in
  // the same millisecond), and fish are only ever appended — so the later entry is the more
  // recent one and `>` would pick the older of the pair. Same tie rule as `cureOneSickFish`.
  let target: Fish | null = null;
  for (const f of input.fish) {
    if (f.health === 'healthy' && (target === null || f.bornAt >= target.bornAt)) target = f;
  }
  if (target === null) return { fish: input.fish, sickenedFishId: null };

  const fish = input.fish.map((f) => (f.id === target.id ? { ...f, health: 'sick' as const } : f));
  return { fish, sickenedFishId: target.id };
}
