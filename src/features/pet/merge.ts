/**
 * Merge mechanic (docs/PLAN.md M3): combining `GROWTH.fishPerMerge` same-stage, same-species
 * fish into one fish of the next stage. Pure — no React/RN/Skia imports — same discipline as
 * `reward.ts` and the timer machine: whether a merge is legal, and what it produces, has to be
 * testable without a mounted store or a renderer.
 *
 * `evaluateMerge` never mutates its input and never throws; every invalid selection comes back
 * as a typed rejection reason instead. The caller (`useAppStore.mergeFish`) is responsible for
 * applying the result atomically — on success this returns the *whole* next collection, never a
 * partial edit, so there is nothing to apply halfway if something goes wrong.
 */
import { GROWTH } from '@/config';
import { isMaxStage, nextStage, type Fish, type Stage } from './model';

export type MergeRejectionReason =
  /** `selectedIds` (after de-duplicating) isn't exactly `GROWTH.fishPerMerge` long. */
  | 'wrong-count'
  /** One or more selected ids don't match any fish in the collection. */
  | 'fish-not-found'
  /** The selected fish aren't all at the same growth stage. */
  | 'mixed-stages'
  /** The selected fish aren't all the same species. */
  | 'mixed-species'
  /** The selected fish are already at the top stage (Elder) — there is nothing above it to
   *  advance to, so merging them is not a valid action. */
  | 'top-stage';

export interface MergeInput {
  fish: Fish[];
  /** Ids of the fish the user selected (e.g. by tapping them in the Aquarium tab). Duplicates
   *  are tolerated and de-duplicated before the count check. */
  selectedIds: string[];
  now: number;
  /** Injected so tests can produce deterministic ids; the store wires the real generator. */
  idFactory: () => string;
}

export interface MergeSuccess {
  ok: true;
  /** Ids removed from the collection — the fish consumed by the merge. */
  removedIds: string[];
  /** The fish created by the merge: one fresh, healthy fish, stage advanced one step. */
  newFish: Fish;
  /** The full resulting collection — `input.fish` minus `removedIds`, plus `newFish`. Apply this
   *  wholesale (or not at all); it is never a partial edit. */
  fish: Fish[];
}

export interface MergeRejection {
  ok: false;
  reason: MergeRejectionReason;
}

export type MergeResult = MergeSuccess | MergeRejection;

/**
 * Evaluates a proposed merge without mutating anything. Rejects cleanly for every invalid
 * selection — wrong count, unknown ids, mixed stages/species, or an attempt to merge fish that
 * are already at the top stage — rather than crashing or silently doing nothing.
 */
export function evaluateMerge(input: MergeInput): MergeResult {
  const { fish, selectedIds, now, idFactory } = input;

  const uniqueIds = Array.from(new Set(selectedIds));
  if (uniqueIds.length !== GROWTH.fishPerMerge) {
    return { ok: false, reason: 'wrong-count' };
  }

  const selected: Fish[] = [];
  for (const id of uniqueIds) {
    const found = fish.find((f) => f.id === id);
    if (!found) return { ok: false, reason: 'fish-not-found' };
    selected.push(found);
  }

  const stage: Stage = selected[0].stage;
  if (!selected.every((f) => f.stage === stage)) {
    return { ok: false, reason: 'mixed-stages' };
  }

  const speciesId = selected[0].speciesId;
  if (!selected.every((f) => f.speciesId === speciesId)) {
    return { ok: false, reason: 'mixed-species' };
  }

  const targetStage = nextStage(stage);
  if (isMaxStage(stage) || !targetStage) {
    return { ok: false, reason: 'top-stage' };
  }

  const newFish: Fish = {
    id: idFactory(),
    speciesId,
    stage: targetStage,
    bornAt: now,
    health: 'healthy',
  };

  const removedIds = uniqueIds;
  const removedSet = new Set(removedIds);
  const remaining = fish.filter((f) => !removedSet.has(f.id));

  return { ok: true, removedIds, newFish, fish: [...remaining, newFish] };
}

/** True if fish at this stage are eligible to be part of a merge selection at all — false for
 *  the top stage (Elder), which has nothing above it to advance to. UI-facing convenience so the
 *  Aquarium screen can reject/ignore Elder taps without re-deriving the rule itself. */
export function isMergeEligibleStage(stage: Stage): boolean {
  return !isMaxStage(stage);
}
