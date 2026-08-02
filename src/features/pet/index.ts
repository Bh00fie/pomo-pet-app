export {
  SPECIES,
  STARTER_SPECIES_ID,
  getSpecies,
  createFish,
  stageIndex,
  isMaxStage,
  nextStage,
  addXp,
  stageProgress,
  isReadyToMerge,
} from './model';
export type { Fish, FishHealth, SpeciesId, Stage, Species, StageVisualParams } from './model';
export { buildFishGeometry } from './geometry';
export type { FishGeometry, FinShape, FinSegment, Point } from './geometry';
export { hslToHex } from './color';
export { xpForFocusMs, applySessionReward } from './reward';
export type { SessionRewardInput, SessionRewardResult } from './reward';
export { generateFishId } from './id';
export { useSessionReward } from './useSessionReward';
