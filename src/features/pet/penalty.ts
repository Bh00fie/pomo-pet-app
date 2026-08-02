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
 * which is what this rule used to do. The target is now the most recently hatched fish in the
 * collection (max `bornAt`): the closest surviving analogue, since it is the thing a completed
 * session would most recently have added to.
 */
import type { Fish } from './model';

export interface PenaltyInput {
  fish: Fish[];
}

export interface PenaltyResult {
  fish: Fish[];
  /** Id of the fish that was marked sick, or `null` if there was nothing to penalize (no fish
   *  yet — an empty collection is the only no-op case now that there is no stage cap to be
   *  "waiting" on). Also non-null but a no-op when the selected fish was already sick. */
  sickenedFishId: string | null;
}

/**
 * Marks the most recently hatched fish as `sick`. Never mutates its input, never throws. An empty
 * collection is a valid no-op — there is nothing to punish.
 */
export function applyPenalty(input: PenaltyInput): PenaltyResult {
  if (input.fish.length === 0) return { fish: input.fish, sickenedFishId: null };

  // `>=`, not `>`: two fish can share a `bornAt` (two debug hatches, or a hatch and a merge, in
  // the same millisecond), and fish are only ever appended — so the later entry is the more
  // recent one and `>` would pick the older of the pair. Same tie rule as `cureOneSickFish`.
  const target = input.fish.reduce((latest, f) => (f.bornAt >= latest.bornAt ? f : latest));
  if (target.health === 'sick') return { fish: input.fish, sickenedFishId: target.id };

  const fish = input.fish.map((f) => (f.id === target.id ? { ...f, health: 'sick' as const } : f));
  return { fish, sickenedFishId: target.id };
}
