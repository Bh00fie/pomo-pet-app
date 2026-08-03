export {
  SPECIES,
  SPECIES_ORDER,
  STARTER_SPECIES_ID,
  GOLDEN_KOI_SPECIES_ID,
  INDIGO_BETTA_SPECIES_ID,
  SHARK_SPECIES_ID,
  CLOWNFISH_SPECIES_ID,
  getSpecies,
  createFish,
  createFishAtStage,
  stageIndex,
  isMaxStage,
  nextStage,
  mostRecentFish,
} from './model';
export type { Fish, FishHealth, SpeciesId, Stage, Species, StageVisualParams } from './model';
export { buildFishGeometry } from './geometry';
export type { FishGeometry, FinShape, FinSegment, Point, StripeBand } from './geometry';
export { hslToHex } from './color';
export {
  applySessionReward,
  classifySessionLength,
  cureOneSickFish,
  stageForSessionLength,
  hatchFish,
  pickRandomSpeciesId,
} from './reward';
export type { SessionRewardInput, SessionRewardResult, SessionLength, HatchResult, CureResult } from './reward';
export { evaluateMerge, isMergeEligibleStage } from './merge';
export type { MergeInput, MergeResult, MergeSuccess, MergeRejection, MergeRejectionReason } from './merge';
export { applyPenalty } from './penalty';
export type { PenaltyInput, PenaltyResult } from './penalty';
export { generateFishId } from './id';
export { useSessionReward } from './useSessionReward';
export { useLeaveEarlyPenalty } from './useLeaveEarlyPenalty';
